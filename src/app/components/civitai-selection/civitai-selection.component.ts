import type { AssetPrompts, PromptEdit } from '../../types/ti-prompt';
import {
  findPromptWords,
  insertPromptReference,
  type PromptInsertion,
  removePromptEntry,
  removePromptWord,
  setTiWeight,
  type TiWeightSite,
  tiWeightSites,
} from '../../types/ti-prompt';
import type { TiInjectTarget } from '../../types/civitai-asset';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  CivitaiDetailComponent,
  type CivitaiDetailTarget,
} from '../civitai-detail/civitai-detail.component';
import { PromptReviewService } from '../../services/prompt-review.service';
import { CivitaiResolverService } from '../../services/civitai-resolver.service';
import {
  HORDE_MAX_LORAS,
  HORDE_MAX_TIS,
  MAX_LORA_STRENGTH,
  MIN_LORA_STRENGTH,
  activeLoras,
  activeTis,
  isNumericAssetId,
  type CivitaiAssetKind,
  type LoraSelection,
  type TiSelection,
} from '../../types/civitai-asset';
import { rangeFillPercent } from '../../pages/generate/generate-form.model';

/** A row as the template draws it: the entry plus where it sits. */
interface SelectionRow<T> {
  entry: T;
  index: number;
  /** False once the row is past the cap, so it will not be sent. */
  active: boolean;
}

type ManualWeight =
  | { state: 'missing' | 'multiple' | 'both' }
  | { state: 'single'; target: TiInjectTarget; site: TiWeightSite };

/**
 * The chosen LoRAs and embeddings, with their strengths and their order.
 *
 * Shared by the generate studio and the style editor, so it takes and emits
 * plain values rather than reaching into a form: what "dirty" means belongs to
 * whichever form is hosting it.
 *
 * Selections past the horde's cap are kept rather than refused. They are drawn
 * as inactive and can be moved up into the sent set, which is the whole reason
 * the list is reorderable.
 */
@Component({
  selector: 'app-civitai-selection',
  imports: [TranslocoPipe, DecimalPipe, CivitaiDetailComponent],
  templateUrl: './civitai-selection.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CivitaiSelectionComponent {
  private readonly resolver = inject(CivitaiResolverService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  public readonly loras = input<readonly LoraSelection[]>([]);
  public readonly tis = input<readonly TiSelection[]>([]);
  /** Null where the host does not enforce a cap, as the style editor does not. */
  public readonly maxLoras = input<number | null>(HORDE_MAX_LORAS);
  public readonly maxTis = input<number | null>(HORDE_MAX_TIS);
  /** Whether to draw the cap at all; a style is a document, not a submission. */
  public readonly showCap = input(true);
  /** The host model's baseline, for the detail panel's compatibility marks. */
  public readonly baseline = input<string | null>(null);
  /** A style may pin a file hash; a generation never does. */
  public readonly allowSha256 = input(false);

  public readonly lorasChange = output<LoraSelection[]>();
  public readonly tisChange = output<TiSelection[]>();
  /** Raw trigger text for the host to put wherever it keeps a prompt. */
  public readonly prompts = input<AssetPrompts | null>(null);
  public readonly promptEdit = output<PromptEdit>();
  public readonly appendToPrompt = output<PromptInsertion>();
  /** Which row's details are open, so an edit can be put back in place. */
  public readonly openRow = signal<{
    kind: CivitaiAssetKind;
    index: number;
    target: CivitaiDetailTarget;
  } | null>(null);

  public readonly minStrength = MIN_LORA_STRENGTH;
  public readonly maxStrength = MAX_LORA_STRENGTH;

  /** Announced when a row moves, because only a sighted reader sees it move. */
  public readonly announcement = signal('');

  public readonly loraRows = computed<SelectionRow<LoraSelection>[]>(() => {
    const sent = new Set(activeLoras(this.loras()));
    return this.loras().map((entry, index) => ({
      entry,
      index,
      active: !this.cappedLoras() || sent.has(entry),
    }));
  });

  public readonly tiRows = computed<SelectionRow<TiSelection>[]>(() => {
    const sent = new Set(activeTis(this.tis()));
    return this.tis().map((entry, index) => ({
      entry,
      index,
      active: !this.cappedTis() || sent.has(entry),
    }));
  });

  public readonly loraCount = computed(() => this.loras().length);
  public readonly sentLoraCount = computed(
    () => activeLoras(this.loras()).length,
  );
  public readonly tiCount = computed(() => this.tis().length);
  public readonly sentTiCount = computed(() => activeTis(this.tis()).length);

  public readonly lorasOverCap = computed(
    () => this.cappedLoras() && this.loraCount() > this.sentLoraCount(),
  );
  public readonly tisOverCap = computed(
    () => this.cappedTis() && this.tiCount() > this.sentTiCount(),
  );

  public readonly isEmpty = computed(
    () => this.loras().length === 0 && this.tis().length === 0,
  );

  /**
   * Ask the catalogue about any row that arrived without a name. Rows loaded
   * from history are the only ones that need it: a freshly picked one already
   * knows what it is called.
   */
  private readonly nameLookups = effect(() => {
    const entries: (LoraSelection | TiSelection)[] = [
      ...this.loras(),
      ...this.tis(),
    ];
    this.resolver.requestAll(
      entries
        .filter((entry) => !entry.label)
        .map((entry) => ({
          id: entry.name,
          isVersion: this.isLora(entry) && entry.is_version === true,
        })),
    );
  });

  private cappedLoras(): boolean {
    return this.showCap() && this.maxLoras() !== null;
  }

  private cappedTis(): boolean {
    return this.showCap() && this.maxTis() !== null;
  }

  /**
   * What a row is called: the name chosen with it, then whatever the catalogue
   * could supply, and null when only an identifier is known so the template can
   * word it rather than print a bare number.
   */
  public rowName(entry: LoraSelection | TiSelection): string | null {
    if (entry.label) {
      return entry.label;
    }
    const resolved = this.resolver.metaFor({
      id: entry.name,
      isVersion: this.isLora(entry) && entry.is_version === true,
    })?.label;
    return resolved ?? (isNumericAssetId(entry.name) ? null : entry.name);
  }

  public isLora(entry: LoraSelection | TiSelection): entry is LoraSelection {
    return 'clip' in entry;
  }

  /** Deterministic chip colour, cycled by position so rows stay tellable apart. */
  public gradient(index: number): string {
    const grads = [
      'linear-gradient(135deg,#c7d2fe,#a5b4fc)',
      'linear-gradient(135deg,#e9d5ff,#c4b5fd)',
      'linear-gradient(135deg,#bfdbfe,#93c5fd)',
      'linear-gradient(135deg,#fbcfe8,#f0abfc)',
    ] as const;
    return grads[index % grads.length] ?? grads[0];
  }

  public fill(value: number): number {
    return rangeFillPercent(value, MIN_LORA_STRENGTH, MAX_LORA_STRENGTH);
  }

  public rangeValue(event: Event): number {
    return +(event.target as HTMLInputElement).value;
  }

  public setLoraStrength(
    index: number,
    field: 'model' | 'clip',
    value: number,
  ): void {
    const next = this.loras().map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry,
    );
    this.lorasChange.emit(next);
  }

  public setTiStrength(index: number, value: number): void {
    this.tisChange.emit(
      this.tis().map((entry, i) =>
        i === index ? { ...entry, strength: value } : entry,
      ),
    );
  }

  public remove(kind: CivitaiAssetKind, index: number): void {
    if (kind === 'lora') {
      this.lorasChange.emit(this.loras().filter((_, i) => i !== index));
    } else {
      this.tisChange.emit(this.tis().filter((_, i) => i !== index));
    }
  }

  public canMove(
    kind: CivitaiAssetKind,
    index: number,
    delta: -1 | 1,
  ): boolean {
    const length = kind === 'lora' ? this.loras().length : this.tis().length;
    const target = index + delta;
    return target >= 0 && target < length;
  }

  /**
   * Move a row one place, and say so.
   *
   * Focus is put back on the same button afterwards: the list re-renders around
   * the moved row, and without this the first press would throw focus away and
   * a second press would need the reader to find the button again. That would
   * make the keyboard path unusable, which is the path this exists for.
   */
  public move(kind: CivitaiAssetKind, index: number, delta: -1 | 1): void {
    if (!this.canMove(kind, index, delta)) {
      return;
    }
    const target = index + delta;
    const swap = <T>(list: readonly T[]): { next: T[]; moved: T } | null => {
      const next = [...list];
      const moved = next.at(index);
      const displaced = next.at(target);
      if (moved === undefined || displaced === undefined) {
        return null;
      }
      next[index] = displaced;
      next[target] = moved;
      return { next, moved };
    };

    if (kind === 'lora') {
      const swapped = swap(this.loras());
      if (!swapped) return;
      const { next, moved } = swapped;
      this.lorasChange.emit(next);
      this.announce(moved, target, next.length, activeLoras(next).length);
    } else {
      const swapped = swap(this.tis());
      if (!swapped) return;
      const { next, moved } = swapped;
      this.tisChange.emit(next);
      this.announce(moved, target, next.length, activeTis(next).length);
    }
    this.restoreFocus(kind, target, delta);
  }

  private announce(
    entry: LoraSelection | TiSelection,
    index: number,
    total: number,
    sent: number,
  ): void {
    this.announcement.set(
      JSON.stringify({
        name: this.rowName(entry) ?? entry.name,
        position: index + 1,
        total,
        sent,
      }),
    );
  }

  /** The announcement's parts, for the live region's own sentence. */
  public announcementParts(): Record<string, string | number> | null {
    const raw = this.announcement();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Record<string, string | number>;
  }

  private restoreFocus(
    kind: CivitaiAssetKind,
    index: number,
    delta: -1 | 1,
  ): void {
    afterNextRender(
      () => {
        const selector = `[data-move="${kind}-${index}-${delta}"]`;
        const button =
          this.host.nativeElement.querySelector<HTMLButtonElement>(selector);
        // At the end of the list that button is now disabled, so focus lands on
        // the row's other move button rather than being dropped.
        const fallback =
          this.host.nativeElement.querySelector<HTMLButtonElement>(
            `[data-move="${kind}-${index}-${-delta as -1 | 1}"]`,
          );
        (button?.disabled ? fallback : button)?.focus();
      },
      { injector: this.injector },
    );
  }

  /**
   * Open the panel on one chosen row.
   *
   * An entry added by hand has no catalogue page, and the panel answers that
   * with its reduced form rather than failing, so no row is unopenable.
   */
  public onDetails(entry: LoraSelection | TiSelection, index: number): void {
    const kind: CivitaiAssetKind = this.isLora(entry) ? 'lora' : 'ti';
    this.openRow.set({
      kind,
      index,
      target: {
        kind,
        modelId:
          entry.modelId ??
          (!(this.isLora(entry) && entry.is_version === true) &&
          isNumericAssetId(entry.name)
            ? Number(entry.name)
            : null),
        versionId:
          this.isLora(entry) && entry.is_version === true
            ? Number(entry.name)
            : null,
      },
    });
  }

  public closeDetails(): void {
    this.openRow.set(null);
  }

  /** The entry the open panel is editing, for it to seed itself from. */
  public openEntry(): LoraSelection | TiSelection | null {
    const open = this.openRow();
    if (!open) {
      return null;
    }
    return open.kind === 'lora'
      ? (this.loras()[open.index] ?? null)
      : (this.tis()[open.index] ?? null);
  }

  /**
   * Put an edited entry back where it was.
   *
   * By position rather than by name: re-pinning to another version changes the
   * name, so matching on it would append a second row instead of replacing one.
   */
  public onDetailApply(entry: LoraSelection | TiSelection): void {
    const open = this.openRow();
    if (!open) {
      return;
    }
    if (open.kind === 'lora') {
      this.lorasChange.emit(
        this.loras().map((row, i) =>
          i === open.index ? (entry as LoraSelection) : row,
        ),
      );
    } else {
      this.tisChange.emit(
        this.tis().map((row, i) =>
          i === open.index ? (entry as TiSelection) : row,
        ),
      );
    }
    this.closeDetails();
  }

  public onDetailRemove(): void {
    const open = this.openRow();
    if (!open) {
      return;
    }
    this.remove(open.kind, open.index);
    this.closeDetails();
  }

  /** Placements where the worker adds the trigger during generation. */
  public readonly autoPlacements = ['prompt', 'negprompt'] as const;

  /** The weight being dragged on a Manual row, written to the prompt on release. */
  public readonly draggedWeight = signal<{
    index: number;
    value: number;
  } | null>(null);

  /**
   * Where a Manual TI's trigger is written. The worker ignores `strength` for
   * a Manual TI and applies the weight written in the prompt, so the row's
   * slider edits that weight when there is exactly one written use. Null when
   * the host does not pass its prompts.
   */
  public manualWeight(name: string): ManualWeight | null {
    const prompts = this.prompts();
    if (!prompts) return null;
    const positive = tiWeightSites(prompts.prompt, name);
    const negative = tiWeightSites(prompts.negativePrompt, name);
    if (positive.length > 0 && negative.length > 0) return { state: 'both' };
    if (positive.length + negative.length > 1) return { state: 'multiple' };
    const [inPositive] = positive;
    const [inNegative] = negative;
    if (inPositive)
      return { state: 'single', target: 'prompt', site: inPositive };
    if (inNegative)
      return { state: 'single', target: 'negprompt', site: inNegative };
    return { state: 'missing' };
  }

  public manualStatusKey(manual: ManualWeight | null): string {
    if (manual?.state === 'single')
      return `generate.civitai.ti_manual_found_${manual.target}`;
    if (manual?.state === 'both') return 'generate.civitai.ti_manual_both';
    if (manual?.state === 'multiple')
      return 'generate.civitai.ti_manual_multiple';
    return 'generate.civitai.ti_manual_weight';
  }

  public tiSliderValue(index: number, entry: TiSelection): number {
    const dragged = this.draggedWeight();
    if (dragged?.index === index) return dragged.value;
    const manual = entry.inject_ti ? null : this.manualWeight(entry.name);
    return manual?.state === 'single' ? manual.site.weight : entry.strength;
  }

  public onTiSlide(index: number, entry: TiSelection, value: number): void {
    const manual = entry.inject_ti ? null : this.manualWeight(entry.name);
    if (manual?.state === 'single') this.draggedWeight.set({ index, value });
    else this.setTiStrength(index, value);
  }

  /** One prompt edit per drag, so the prompt history is not one entry per step. */
  public onTiRelease(index: number, entry: TiSelection, value: number): void {
    this.draggedWeight.set(null);
    const manual = entry.inject_ti ? null : this.manualWeight(entry.name);
    const prompts = this.prompts();
    if (manual?.state !== 'single' || !prompts) return;
    const text =
      manual.target === 'prompt' ? prompts.prompt : prompts.negativePrompt;
    this.promptEdit.emit({
      target: manual.target,
      text: setTiWeight(text, entry.name, manual.site, value),
    });
    this.setTiStrength(index, Number(value.toFixed(2)));
  }

  public setPlacement(index: number, value: string): void {
    this.tisChange.emit(
      this.tis().map((ti, i) => {
        if (i !== index) return ti;
        const next = { ...ti };
        if (value === 'prompt' || value === 'negprompt') next.inject_ti = value;
        else delete next.inject_ti;
        return next;
      }),
    );
  }
  public onAppendTrigger(trigger: string): void {
    this.appendToPrompt.emit(trigger);
  }

  public readonly triggerAnnouncement = signal<{
    action: 'added' | 'removed' | 'removed_left_one' | 'removed_left_many';
    word: string;
    count?: number;
  } | null>(null);

  /**
   * Trigger entries added by a chip, keyed by LoRA and word. A chip removes
   * only its own entry without asking. Text written by the user is removed
   * after a confirmation. Kept in memory, so after a reload every written
   * trigger counts as the user's.
   */
  private readonly chipEntries = new Set<string>();
  /** The trigger waiting for the user to confirm its removal. */
  public readonly pendingRemoval = signal<{
    index: number;
    word: string;
  } | null>(null);
  /**
   * Provided by the form that owns the prompt field. Without it, the warning
   * does not offer to show the matches.
   */
  public readonly reviews = inject(PromptReviewService, { optional: true });

  private chipKey(index: number, word: string): string {
    return `${this.loras()[index]?.name ?? ''}\u0000${word.toLowerCase()}`;
  }

  /**
   * How many times the word is written in the prompt. Null when the host does
   * not pass its prompts, so the count is unknown.
   */
  public triggerCount(word: string): number | null {
    const prompts = this.prompts();
    return prompts ? findPromptWords(prompts.prompt, word).length : null;
  }

  /**
   * Adds or removes a trigger word in the positive prompt. Adding also turns
   * off the row's automatic trigger, because the worker adds it even when the
   * word is already written, which would apply it twice.
   */
  public onTrigger(index: number, word: string): void {
    const prompts = this.prompts();
    const count = this.triggerCount(word);
    if (!prompts || count === null) {
      this.onAppendTrigger(word);
      return;
    }
    const key = this.chipKey(index, word);
    if (count > 0) {
      const withoutEntry = this.chipEntries.has(key)
        ? removePromptEntry(prompts.prompt, word)
        : null;
      this.chipEntries.delete(key);
      if (withoutEntry === null) {
        this.pendingRemoval.set({ index, word });
        // Cancel takes focus so a repeated Enter does not delete written text.
        afterNextRender(
          () =>
            this.host.nativeElement
              .querySelector<HTMLElement>('[data-confirm-cancel]')
              ?.focus(),
          { injector: this.injector },
        );
        return;
      }
      this.promptEdit.emit({ target: 'prompt', text: withoutEntry });
      // Other uses of a common word can stay, so the chip stays pressed and
      // the announcement says why.
      const left = findPromptWords(withoutEntry, word).length;
      this.triggerAnnouncement.set(
        left === 0
          ? { action: 'removed', word }
          : {
              action: left === 1 ? 'removed_left_one' : 'removed_left_many',
              word,
              count: left,
            },
      );
      return;
    }
    this.pendingRemoval.set(null);
    this.chipEntries.add(key);
    this.promptEdit.emit({
      target: 'prompt',
      text: insertPromptReference(prompts.prompt, word),
    });
    if (this.loras()[index]?.inject_trigger !== undefined) {
      this.lorasChange.emit(
        this.loras().map((lora, i) => {
          if (i !== index) return lora;
          const next = { ...lora };
          delete next.inject_trigger;
          return next;
        }),
      );
    }
    this.triggerAnnouncement.set({ action: 'added', word });
  }

  public confirmRemoval(): void {
    const pending = this.pendingRemoval();
    const prompts = this.prompts();
    if (!pending || !prompts) return;
    this.promptEdit.emit({
      target: 'prompt',
      text: removePromptWord(prompts.prompt, pending.word),
    });
    this.triggerAnnouncement.set({ action: 'removed', word: pending.word });
    this.closeRemoval();
  }

  /**
   * Selects the next match in the prompt field. The form also shows the same
   * control under the field, with a way back to this warning.
   */
  public showInPrompt(): void {
    const pending = this.pendingRemoval();
    const prompts = this.prompts();
    if (!pending || !prompts || !this.reviews) return;
    this.reviews.start(pending.word, 'prompt', () => this.returnToWarning());
    this.reviews.showNext(prompts.prompt);
  }

  private returnToWarning(): void {
    const warning =
      this.host.nativeElement.querySelector<HTMLElement>('.gs-cvsel-confirm');
    if (!warning) return;
    warning.scrollIntoView({ block: 'center', behavior: 'smooth' });
    warning
      .querySelector<HTMLElement>('[data-confirm-show]')
      ?.focus({ preventScroll: true });
  }

  /** Closes the warning and puts focus back on the chip that opened it. */
  public closeRemoval(): void {
    const pending = this.pendingRemoval();
    this.pendingRemoval.set(null);
    this.reviews?.end();
    if (!pending) return;
    const key = `${pending.index}:${pending.word}`;
    [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-trigger]')]
      .find((chip) => chip.dataset['trigger'] === key)
      ?.focus();
  }
}
