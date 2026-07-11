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
import { debounceTime } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiHordeService } from '../../services/ai-horde.service';
import { GenerationQueueService } from '../../services/generation-queue.service';
import { ToastService } from '../../services/toast.service';
import { DatabaseService } from '../../services/database.service';
import { TranslatorService } from '../../services/translator.service';
import { setPageTitle } from '../../helper/page-title';
import { ActiveModel } from '../../types/active-model';
import { EnqueueSourceImage } from '../../types/generation-job';
import { blobToBase64 } from '../../helper/blob-base64';
import { GenerateFormComponent } from './generate-form/generate-form.component';
import { GenerateResultsPanelComponent } from './generate-results-panel/generate-results-panel.component';
import {
  GenerateSourceImageComponent,
  GenerateSourceState,
} from './generate-source-image/generate-source-image.component';
import {
  buildImageRequest,
  coerceFormValue,
  createGenerateForm,
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
    TranslocoPipe,
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
      this.form.valueChanges
        .pipe(
          debounceTime(KUDOS_DEBOUNCE_MS),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          this.persist();
          void this.updateKudos();
        });
      void this.updateKudos();
    }
  }

  public async onCreate(): Promise<void> {
    const promptControl = this.form.controls.prompt;
    if (promptControl.value.trim().length === 0) {
      promptControl.markAsTouched();
      return;
    }
    const state = this.sourceState();
    if (!state.valid) {
      this.sourceValidationVisible.set(true);
      return;
    }
    const hasSourceImage = state.sourceBlob !== null;
    const request = buildImageRequest(this.form.getRawValue(), {
      hasSourceImage,
    });
    const sourceImages = this.buildEnqueueSources(state);
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

  private persist(): void {
    this.db.store(STORAGE_KEY, this.form.getRawValue());
  }

  private async updateKudos(): Promise<void> {
    const raw = this.form.getRawValue();
    const hasSourceImage = this.sourceBase64 !== null;
    // The horde rejects an empty prompt even for a dry run, so estimate against
    // a placeholder while leaving the actual form untouched.
    const request = buildImageRequest(
      { ...raw, prompt: raw.prompt.trim() || '_' },
      { hasSourceImage },
    );
    // Attach the source image (but never the mask) so controlnet/img2img cost
    // differences are reflected in the estimate.
    if (this.sourceBase64 !== null) {
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
