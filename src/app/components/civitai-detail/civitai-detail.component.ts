import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsShotViewerComponent } from '../gs-shot-viewer/gs-shot-viewer.component';
import {
  CivitaiModel,
  CivitaiModelVersion,
  CivitaiService,
} from '../../services/civitai.service';
import { CivitaiCacheService } from '../../services/civitai-cache.service';
import { civitaiBaseModelMatchesBaseline } from '../../services/civitai-base-models';
import {
  DEFAULT_LORA_STRENGTH,
  INJECT_TRIGGER_ANY,
  MAX_INJECT_TRIGGER_LENGTH,
  MAX_LORA_STRENGTH,
  MIN_LORA_STRENGTH,
  TI_INJECT_TARGETS,
  pickDefaultVersion,
  type CivitaiAssetKind,
  type LoraSelection,
  type TiInjectTarget,
  type TiSelection,
} from '../../types/civitai-asset';

/** Which asset the panel is about, in the terms a caller already holds. */
export interface CivitaiDetailTarget {
  kind: CivitaiAssetKind;
  modelId: number | null;
  /** A version to start on; null asks for the one that would be pinned. */
  versionId: number | null;
}

/** CivitAI's tamest maturity rating; anything above it is covered until asked. */
const SAFE_NSFW_LEVEL = 1;

/**
 * How long the confirmation on "put it in my prompt" stands.
 *
 * The prompt box is behind this panel and the picker over it, so the press has
 * no visible result anywhere the reader can see. The button says what happened
 * itself, and long enough to be read rather than glimpsed.
 */
const PROMPT_CONFIRM_MS = 2600;

/**
 * Everything known about one CivitAI asset, and the controls for the copy of it
 * a request will carry.
 *
 * Mounted by both the picker and the selected list, so neither host has to keep
 * its own overlay bookkeeping, and so an asset reads the same either way.
 */
@Component({
  selector: 'app-civitai-detail',
  imports: [TranslocoPipe, DecimalPipe, GsShotViewerComponent],
  templateUrl: './civitai-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CivitaiDetailComponent {
  private readonly civitai = inject(CivitaiService);
  private readonly cache = inject(CivitaiCacheService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly target = input.required<CivitaiDetailTarget>();
  public readonly baseline = input<string | null>(null);
  /** The entry already chosen, when opened from the selected list. */
  public readonly current = input<LoraSelection | TiSelection | null>(null);
  /** A style may pin a file hash; a generation never does. */
  public readonly allowSha256 = input(false);

  public readonly apply = output<LoraSelection | TiSelection>();
  public readonly remove = output<void>();
  public readonly appendToPrompt = output<string>();
  public readonly closed = output<void>();

  public readonly model = signal<CivitaiModel | null>(null);
  public readonly loading = signal(false);
  public readonly errored = signal(false);
  public readonly selectedVersionId = signal<number | null>(null);
  public readonly revealed = signal<ReadonlySet<string>>(new Set());
  /** The preview being shown whole, or null when the strip is as large as it gets. */
  public readonly enlarged = signal<string | null>(null);
  /** The word most recently written into the prompt, while its notice stands. */
  public readonly promptedWord = signal<string | null>(null);

  private promptConfirmTimer: ReturnType<typeof setTimeout> | null = null;

  public readonly minStrength = MIN_LORA_STRENGTH;
  public readonly maxStrength = MAX_LORA_STRENGTH;
  public readonly injectTargets = TI_INJECT_TARGETS;
  public readonly injectAny = INJECT_TRIGGER_ANY;

  // The editable copy, seeded from the entry that was opened.
  public readonly modelStrength = signal(DEFAULT_LORA_STRENGTH);
  public readonly clipStrength = signal(DEFAULT_LORA_STRENGTH);
  public readonly tiStrength = signal(DEFAULT_LORA_STRENGTH);
  public readonly injectTrigger = signal<string | null>(null);
  public readonly injectTi = signal<TiInjectTarget | null>(null);
  public readonly sha256 = signal('');

  public readonly isLora = computed(() => this.target().kind === 'lora');

  public readonly versions = computed<CivitaiModelVersion[]>(
    () => this.model()?.versions ?? [],
  );

  public readonly selectedVersion = computed<CivitaiModelVersion | null>(() => {
    const id = this.selectedVersionId();
    return this.versions().find((version) => version.id === id) ?? null;
  });

  /** Trigger words of the version in view, which is what a request would use. */
  public readonly triggerWords = computed<readonly string[]>(
    () => this.selectedVersion()?.trainedWords ?? [],
  );

  public readonly isEditing = computed(() => this.current() !== null);

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.promptConfirmTimer !== null) {
        clearTimeout(this.promptConfirmTimer);
      }
    });

    effect(() => {
      const target = this.target();
      this.selectedVersionId.set(target.versionId);
      void this.load(target);
    });

    effect(() => {
      const entry = this.current();
      if (!entry) {
        return;
      }
      if ('clip' in entry) {
        this.modelStrength.set(entry.model);
        this.clipStrength.set(entry.clip);
        this.injectTrigger.set(entry.inject_trigger ?? null);
        this.sha256.set(entry.sha256 ?? '');
      } else {
        this.tiStrength.set(entry.strength);
        this.injectTi.set(entry.inject_ti ?? null);
      }
    });
  }

  private async load(target: CivitaiDetailTarget): Promise<void> {
    if (target.modelId === null) {
      // A hand-entered asset has no catalogue page to show.
      this.model.set(null);
      return;
    }
    this.loading.set(true);
    this.errored.set(false);

    const cached = await this.cache.getModel(target.modelId);
    if (cached) {
      this.adopt(cached.data);
    }
    if (cached && !cached.stale) {
      this.loading.set(false);
      return;
    }

    this.civitai.fetchModel(target.modelId).subscribe((model) => {
      this.loading.set(false);
      if (model) {
        void this.cache.putSearchResult(model);
        this.adopt(model);
      } else if (!cached) {
        this.errored.set(true);
      }
    });
  }

  private adopt(model: CivitaiModel): void {
    this.model.set(model);
    if (this.selectedVersionId() === null) {
      this.selectedVersionId.set(this.defaultVersion(model)?.id ?? null);
    }
  }

  private defaultVersion(model: CivitaiModel): CivitaiModelVersion | null {
    return pickDefaultVersion(model.versions, (baseModel) =>
      civitaiBaseModelMatchesBaseline(baseModel, this.baseline()),
    );
  }

  public selectVersion(id: number): void {
    this.selectedVersionId.set(id);
  }

  /**
   * Whether a version suits the model in the studio, for the row's mark.
   *
   * With no model chosen the match test answers true for everything, which is
   * the right answer for picking a default and the wrong one for a mark: a row
   * would claim to fit a model the reader has not named.
   */
  public suitsBaseline(version: CivitaiModelVersion): boolean {
    return (
      this.baseline() !== null &&
      civitaiBaseModelMatchesBaseline(version.baseModel, this.baseline())
    );
  }

  /** A worker cannot download an early-access or paid file at all. */
  public isFetchable(version: CivitaiModelVersion): boolean {
    return (
      !version.paidAccess &&
      (version.availability === null || version.availability === 'Public')
    );
  }

  public isCovered(url: string, level: number): boolean {
    return level > SAFE_NSFW_LEVEL && !this.revealed().has(url);
  }

  public reveal(url: string): void {
    this.revealed.update((current) => new Set(current).add(url));
  }

  /**
   * Whether a trigger can be handed to the horde to insert. Longer words are
   * refused by the payload's own bound, so those are offered as something to
   * put in the prompt instead of a promise that would be rejected.
   */
  public canInject(word: string): boolean {
    return word.length <= MAX_INJECT_TRIGGER_LENGTH;
  }

  public setTrigger(word: string | null): void {
    this.injectTrigger.set(word);
  }

  public setInjectTi(target: TiInjectTarget | null): void {
    this.injectTi.set(target);
  }

  /**
   * Hand the word to the host's prompt, and say so on the button.
   *
   * Saying so is the point: the prompt is two layers below this panel, so
   * without it the press looks like it did nothing.
   */
  public onAppendTrigger(word: string): void {
    this.appendToPrompt.emit(word);
    this.promptedWord.set(word);
    if (this.promptConfirmTimer !== null) {
      clearTimeout(this.promptConfirmTimer);
    }
    this.promptConfirmTimer = setTimeout(
      () => this.promptedWord.set(null),
      PROMPT_CONFIRM_MS,
    );
  }

  public enlarge(url: string): void {
    this.enlarged.set(url);
  }

  public closeEnlarged(): void {
    this.enlarged.set(null);
  }

  /** What the enlarged preview is called, for its title band. */
  public enlargedLabel(): string {
    return this.model()?.name ?? '';
  }

  public numberValue(event: Event): number {
    return +(event.target as HTMLInputElement).value;
  }

  public textValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  public civitaiUrl(): string | null {
    const model = this.model();
    if (!model) {
      return null;
    }
    const version = this.selectedVersionId();
    const base = `https://civitai.com/models/${model.id}`;
    return version === null ? base : `${base}?modelVersionId=${version}`;
  }

  /**
   * Hand back the selection this panel describes.
   *
   * A LoRA is pinned to the version in view and named by it, so a saved request
   * keeps meaning the same thing after the author publishes an update. An
   * embedding is named by its model page instead: the horde's payload has no
   * field to carry a version for one.
   */
  public onApply(): void {
    const model = this.model();
    const version = this.selectedVersion();

    if (this.isLora()) {
      const pinned = version !== null;
      const entry: LoraSelection = {
        name: pinned ? String(version.id) : (this.current()?.name ?? ''),
        model: this.modelStrength(),
        clip: this.clipStrength(),
        label: model?.name,
        versionLabel: version?.name,
        baseModel: version?.baseModel,
        thumbnailUrl: model?.preview?.url,
        modelId: model?.id,
        triggerWords: version?.trainedWords,
      };
      if (pinned) {
        entry.is_version = true;
      }
      const trigger = this.injectTrigger();
      if (trigger) {
        entry.inject_trigger = trigger;
      }
      const hash = this.sha256().trim();
      if (this.allowSha256() && hash) {
        entry.sha256 = hash;
      }
      this.apply.emit(entry);
      return;
    }

    const entry: TiSelection = {
      name: model ? String(model.id) : (this.current()?.name ?? ''),
      strength: this.tiStrength(),
      label: model?.name,
      baseModel: version?.baseModel,
      thumbnailUrl: model?.preview?.url,
      modelId: model?.id,
      triggerWords: version?.trainedWords,
    };
    const target = this.injectTi();
    if (target) {
      entry.inject_ti = target;
    }
    this.apply.emit(entry);
  }

  public onRemove(): void {
    this.remove.emit();
  }

  public onClose(): void {
    this.closed.emit();
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }
}
