import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { debounceTime, zip } from 'rxjs';
import { AiHordeService } from '../../services/ai-horde.service';
import { GenerationQueueService } from '../../services/generation-queue.service';
import { ToastService } from '../../services/toast.service';
import { DatabaseService } from '../../services/database.service';
import { TranslatorService } from '../../services/translator.service';
import {
  AppliedStyle,
  HordeStylePreset,
  HordeStylesService,
  StyleForcedParams,
  applyStyle,
} from '../../services/horde-styles.service';
import { setPageTitle } from '../../helper/page-title';
import { ActiveModel } from '../../types/active-model';
import { EnqueueSourceImage } from '../../types/generation-job';
import { blobToBase64 } from '../../helper/blob-base64';
import {
  GenerateFormComponent,
  StylePickerGroup,
} from './generate-form/generate-form.component';
import { GenerateResultsPanelComponent } from './generate-results-panel/generate-results-panel.component';
import {
  GenerateSourceImageComponent,
  GenerateSourceState,
} from './generate-source-image/generate-source-image.component';
import {
  GenerateFormValue,
  buildStyledImageRequest,
  coerceFormValue,
  createGenerateForm,
  simpleModeValue,
} from './generate-form.model';

const DEFAULT_SOURCE_STATE: GenerateSourceState = {
  mode: 'none',
  sourceBlob: null,
  maskBlob: null,
  valid: true,
};

const STORAGE_KEY = 'aihorde.generate.form';
const KUDOS_DEBOUNCE_MS = 1000;

/**
 * The `/generate` page. Owns the request form, drives a debounced dry-run kudos
 * estimate, persists the last-used form values, and hands built requests to the
 * root generation queue. Rendering happens client-side only (RenderMode.Client);
 * all queue and estimate traffic is guarded behind a browser check.
 */
@Component({
  selector: 'app-generate',
  imports: [
    GenerateFormComponent,
    GenerateSourceImageComponent,
    GenerateResultsPanelComponent,
  ],
  templateUrl: './generate.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly queue = inject(GenerationQueueService);
  private readonly toast = inject(ToastService);
  private readonly db = inject(DatabaseService);
  private readonly translator = inject(TranslatorService);
  private readonly styles = inject(HordeStylesService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * When true the page's own intro/title block is suppressed and the component
   * does not claim the document title, so it can be hosted inside another page's
   * shell (e.g. the profile generations tab) without duplicating chrome.
   */
  public readonly embedded = input(false);

  public readonly form = createGenerateForm(
    coerceFormValue(this.db.get(STORAGE_KEY)),
  );
  public readonly models = signal<ActiveModel[]>([]);
  public readonly kudos = signal<number | null>(null);
  public readonly estimating = signal(false);

  /** Curated style presets grouped by category, for the styles picker. */
  public readonly styleGroups = signal<StylePickerGroup[]>([]);
  /** `styleName` -> preset, so a picked style can be resolved and applied. */
  private readonly stylePresets = signal<Map<string, HordeStylePreset>>(
    new Map(),
  );
  /** Params the currently-selected style forces, for "set by style" hints. */
  public readonly forcedParams = signal<StyleForcedParams | null>(null);

  public readonly sourceState =
    signal<GenerateSourceState>(DEFAULT_SOURCE_STATE);
  /** Whether the source section's validation hint should be shown. */
  public readonly sourceValidationVisible = signal(false);

  /** Monotonic guard so a slow estimate cannot overwrite a newer one. */
  private estimateSeq = 0;

  /** Base64 of the current source blob, recomputed only when the blob changes. */
  private sourceBase64: string | null = null;
  private cachedSourceBlob: Blob | null = null;

  constructor() {
    afterNextRender(() => {
      if (!this.embedded()) {
        setPageTitle(
          this.translator,
          this.title,
          this.destroyRef,
          'generate.title',
        );
      }
    });

    if (this.isBrowser) {
      this.fetchModels();
      this.fetchStyles();
      this.form.valueChanges
        .pipe(
          debounceTime(KUDOS_DEBOUNCE_MS),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          this.persist();
          void this.updateKudos();
        });
      // The "set by style" hints and the source reset on leaving advanced must
      // react immediately, so track raw form changes without the kudos debounce.
      this.form.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.onFormChanged());
      this.refreshForcedParams();
      void this.updateKudos();
    }
  }

  /**
   * React to any form change: refresh the style hints, and when the user leaves
   * advanced mode drop any lingering source-image state so a simple-mode request
   * can never carry a source the (now-hidden) source section still remembers.
   */
  private onFormChanged(): void {
    this.refreshForcedParams();
    if (
      this.form.controls.mode.value === 'simple' &&
      this.sourceState().mode !== 'none'
    ) {
      this.sourceState.set(DEFAULT_SOURCE_STATE);
      this.cachedSourceBlob = null;
      this.sourceBase64 = null;
    }
  }

  private refreshForcedParams(): void {
    const applied = this.resolveApplied(this.form.getRawValue());
    this.forcedParams.set(applied?.forcedParams ?? null);
  }

  /**
   * Resolve the style the form currently selects into an {@link AppliedStyle},
   * or null when no style is selected (or its preset is not loaded yet). The
   * style's prompt/params are merged on top of the form's own at build time.
   */
  private resolveApplied(value: GenerateFormValue): AppliedStyle | null {
    if (!value.styleName) {
      return null;
    }
    const preset = this.stylePresets().get(value.styleName);
    if (!preset) {
      return null;
    }
    return applyStyle(preset, value.prompt, value.negativePrompt);
  }

  /**
   * The form value to actually submit/estimate. Advanced mode submits the form
   * as-is; simple mode strips advanced-only fields back to their defaults (see
   * {@link simpleModeValue}) so a simple request is clean and predictable.
   */
  private effectiveValue(): GenerateFormValue {
    const raw = this.form.getRawValue();
    return raw.mode === 'simple' ? simpleModeValue(raw) : raw;
  }

  public async onCreate(): Promise<void> {
    const promptControl = this.form.controls.prompt;
    if (promptControl.value.trim().length === 0) {
      promptControl.markAsTouched();
      return;
    }
    const effective = this.effectiveValue();
    const usesSource = effective.sourceMode !== 'none';
    const state = this.sourceState();
    if (usesSource && !state.valid) {
      this.sourceValidationVisible.set(true);
      return;
    }
    const hasSourceImage = usesSource && state.sourceBlob !== null;
    const request = buildStyledImageRequest(
      effective,
      this.resolveApplied(effective),
      { hasSourceImage },
    );
    const sourceImages = usesSource ? this.buildEnqueueSources(state) : [];
    try {
      await this.queue.enqueue(
        request,
        sourceImages.length > 0 ? sourceImages : undefined,
      );
      this.toast.success('generate.form.enqueued', { transloco: true });
    } catch (error) {
      console.error('Failed to enqueue generation:', error);
      this.toast.error('generate.form.enqueue_error', {
        transloco: true,
        details:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
      });
    }
  }

  /**
   * Adopt the latest source-section snapshot. Refreshes the cached source
   * base64 (used by the kudos dry run) only when the underlying blob changes,
   * hides the validation hint once the section is valid again, and re-estimates
   * so a controlnet/img2img cost difference shows without a form edit.
   */
  public onSourceState(state: GenerateSourceState): void {
    this.sourceState.set(state);
    if (state.valid) {
      this.sourceValidationVisible.set(false);
    }
    if (state.sourceBlob !== this.cachedSourceBlob) {
      this.cachedSourceBlob = state.sourceBlob;
      if (!this.isBrowser || state.sourceBlob === null) {
        this.sourceBase64 = null;
        void this.updateKudos();
      } else {
        void this.refreshSourceBase64(state.sourceBlob);
      }
    }
  }

  private async refreshSourceBase64(blob: Blob): Promise<void> {
    const encoded = await blobToBase64(blob);
    // A newer blob may have arrived while this one encoded; only keep ours.
    if (blob === this.cachedSourceBlob) {
      this.sourceBase64 = encoded;
      void this.updateKudos();
    }
  }

  private buildEnqueueSources(
    state: GenerateSourceState,
  ): EnqueueSourceImage[] {
    const sources: EnqueueSourceImage[] = [];
    if (state.sourceBlob) {
      sources.push({
        kind: 'source',
        blob: state.sourceBlob,
        mimeType: state.sourceBlob.type || 'image/webp',
      });
    }
    if (state.maskBlob) {
      sources.push({
        kind: 'mask',
        blob: state.maskBlob,
        mimeType: state.maskBlob.type || 'image/png',
      });
    }
    return sources;
  }

  private fetchModels(): void {
    this.aiHorde
      .getImageModels('all')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((models) =>
        this.models.set([...models].sort((a, b) => b.count - a.count)),
      );
  }

  private fetchStyles(): void {
    zip(this.styles.getStyles(), this.styles.getCategoryGroups())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([summaries, groups]) => {
        this.stylePresets.set(
          new Map(summaries.map((summary) => [summary.name, summary.preset])),
        );
        this.styleGroups.set(
          groups.map((group) => ({
            category: group.category,
            names: group.styleNames,
          })),
        );
        // A style may already be selected from persisted state; surface its hints.
        this.refreshForcedParams();
      });
  }

  private persist(): void {
    this.db.store(STORAGE_KEY, this.form.getRawValue());
  }

  private async updateKudos(): Promise<void> {
    const effective = this.effectiveValue();
    const usesSource = effective.sourceMode !== 'none';
    const hasSourceImage = usesSource && this.sourceBase64 !== null;
    // The horde rejects an empty prompt even for a dry run, so estimate against
    // a placeholder while leaving the actual form untouched. The styled request
    // is what the user will actually submit, so the estimate must reflect it.
    const base: GenerateFormValue = {
      ...effective,
      prompt: effective.prompt.trim() || '_',
    };
    const request = buildStyledImageRequest(base, this.resolveApplied(base), {
      hasSourceImage,
    });
    // Attach the source image (but never the mask) so controlnet/img2img cost
    // differences are reflected in the estimate.
    if (hasSourceImage && this.sourceBase64 !== null) {
      request.source_image = this.sourceBase64;
    }
    const seq = ++this.estimateSeq;
    this.estimating.set(true);
    try {
      const kudos = await this.queue.estimateKudos(request);
      if (seq === this.estimateSeq) {
        this.kudos.set(kudos);
      }
    } catch {
      if (seq === this.estimateSeq) {
        this.kudos.set(null);
      }
    } finally {
      if (seq === this.estimateSeq) {
        this.estimating.set(false);
      }
    }
  }
}
