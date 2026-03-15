import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  NgZone,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AiHordeService } from '../../services/ai-horde.service';
import {
  TrackedGeneration,
  GenerationType,
  ImageGenerationRequest,
  GenerationOutput,
  GenerationMetadataStable,
  GenerationStatusResponse,
  TextGenerationStatusResponse,
  AlchemyStatusResponse,
  GENERATION_NOT_FOUND,
} from '../../types/generation';
import { ActiveModel } from '../../types/active-model';
import { ModelAutocompleteComponent } from '../model-autocomplete/model-autocomplete.component';
import {
  JsonInspectorComponent,
  JsonInspectorSection,
} from '../json-inspector/json-inspector.component';
import { JsonInspectorTriggerComponent } from '../json-inspector-trigger/json-inspector-trigger.component';

@Component({
  selector: 'app-generations-tab',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    RouterLink,
    ModelAutocompleteComponent,
    JsonInspectorComponent,
    JsonInspectorTriggerComponent,
  ],
  templateUrl: './generations-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerationsTabComponent {
  private readonly auth = inject(AuthService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);

  private static readonly USER_POLL_MS = 60_000;
  private static readonly CHECK_POLL_MS = 10_000;

  private userPollTimer: ReturnType<typeof setInterval> | null = null;
  private checkPollTimer: ReturnType<typeof setInterval> | null = null;

  public readonly trackedGenerations = signal<TrackedGeneration[]>([]);

  public readonly imageGenerations = computed(() =>
    this.trackedGenerations().filter((g) => g.type === 'image'),
  );

  public readonly textGenerations = computed(() =>
    this.trackedGenerations().filter((g) => g.type === 'text'),
  );

  public readonly alchemyGenerations = computed(() =>
    this.trackedGenerations().filter((g) => g.type === 'alchemy'),
  );

  public readonly userAutoRefresh = signal(true);
  public readonly refreshingGenerations = signal(false);

  public readonly isSubmitting = signal(false);
  public readonly submitError = signal<string | null>(null);
  public readonly submitSuccess = signal<string | null>(null);
  public readonly requestorExpanded = signal(false);
  public readonly loadingResults = signal<Set<string>>(new Set());
  public readonly availableModels = signal<ActiveModel[]>([]);
  public readonly jsonMode = signal(false);
  public readonly jsonText = signal('');
  public readonly jsonError = signal<string | null>(null);
  public readonly expandedRequest = signal<Set<string>>(new Set());
  public readonly expandedResponse = signal<Set<string>>(new Set());
  public readonly rawJsonOpen = signal(false);
  public readonly rawJsonGeneration = signal<TrackedGeneration | null>(null);

  public readonly rawJsonSections = computed<readonly JsonInspectorSection[]>(
    () => {
      const generation = this.rawJsonGeneration();
      if (!generation) {
        return [];
      }

      const sections: JsonInspectorSection[] = [
        {
          id: 'summary',
          label: 'Summary',
          value: {
            id: generation.id,
            type: generation.type,
            done: generation.done,
            faulted: generation.faulted,
            notFound: generation.notFound ?? false,
            firstSeenAt: generation.firstSeenAt,
          },
        },
      ];

      if (generation.sentRequest) {
        sections.push({
          id: 'request',
          label: 'Request',
          value: generation.sentRequest,
        });
      }

      if (generation.check) {
        sections.push({
          id: 'check',
          label: 'Check Response',
          value: this.sanitizeResponsePayload(generation.check),
        });
      }

      if (generation.result) {
        sections.push({
          id: 'result',
          label: 'Final Response',
          value: this.sanitizeResponsePayload(generation.result),
        });
      }

      return sections;
    },
  );

  public readonly form = new FormGroup({
    prompt: new FormControl<string>('', [Validators.required]),
    steps: new FormControl<number>(25),
    model: new FormControl<string>(''),
    cfg_scale: new FormControl<number>(7.5),
    nsfw: new FormControl<boolean>(false),
    clip_skip: new FormControl<number>(1),
    width: new FormControl<number>(512),
    height: new FormControl<number>(512),
  });

  constructor() {
    afterNextRender(() => {
      this.refreshUserGenerations();
      this.startPolling();
      this.fetchModels();
    });
  }

  public refreshUserGenerations(): void {
    this.refreshingGenerations.set(true);
    this.pollUserGenerations(() => this.refreshingGenerations.set(false));
  }

  public toggleUserAutoRefresh(): void {
    const next = !this.userAutoRefresh();
    this.userAutoRefresh.set(next);

    if (next) {
      this.startUserPollTimer();
    } else {
      this.stopUserPollTimer();
    }
  }

  public toggleRequestor(): void {
    this.requestorExpanded.set(!this.requestorExpanded());
  }

  public toggleJsonMode(): void {
    const entering = !this.jsonMode();
    if (entering) {
      this.jsonText.set(JSON.stringify(this.buildRequest(), null, 2));
      this.jsonError.set(null);
    } else {
      this.applyJsonToForm();
    }
    this.jsonMode.set(entering);
  }

  public onJsonInput(value: string): void {
    this.jsonText.set(value);
    try {
      JSON.parse(value);
      this.jsonError.set(null);
    } catch {
      this.jsonError.set('Invalid JSON');
    }
  }

  public toggleSentRequest(id: string): void {
    this.expandedRequest.update((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  public isSentRequestExpanded(id: string): boolean {
    return this.expandedRequest().has(id);
  }

  public getSentRequestJson(gen: TrackedGeneration): string {
    return gen.sentRequest ? JSON.stringify(gen.sentRequest, null, 2) : '';
  }

  public getGenerationOutputs(gen: TrackedGeneration): GenerationOutput[] {
    if (!gen.result || gen.type !== 'image') return [];
    return (gen.result as GenerationStatusResponse).generations ?? [];
  }

  public toggleResponseJson(id: string): void {
    this.expandedResponse.update((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  public isResponseExpanded(id: string): boolean {
    return this.expandedResponse().has(id);
  }

  public getResponseJson(gen: TrackedGeneration): string {
    const data = gen.result ?? gen.check;
    if (!data) return '';
    return JSON.stringify(
      data,
      (_key, value) => {
        if (
          typeof value === 'string' &&
          value.length > 256 &&
          /^[A-Za-z0-9+/=]/.test(value)
        ) {
          return '[base64 data omitted]';
        }
        return value;
      },
      2,
    );
  }

  public openGenerationJson(gen: TrackedGeneration): void {
    this.rawJsonGeneration.set(gen);
    this.rawJsonOpen.set(true);
  }

  public closeGenerationJson(): void {
    this.rawJsonOpen.set(false);
    this.rawJsonGeneration.set(null);
  }

  public getMetadataLabel(meta: GenerationMetadataStable): string {
    const labels: Record<string, string> = {
      download_failed: 'Download Failed',
      parse_failed: 'Parse Failed',
      baseline_mismatch: 'Baseline Mismatch',
      csam: 'CSAM Detected',
      nsfw: 'NSFW Detected',
      see_ref: 'See Reference',
    };
    return labels[meta.value] ?? meta.value;
  }

  public isMetadataWarning(meta: GenerationMetadataStable): boolean {
    return ['download_failed', 'parse_failed', 'baseline_mismatch'].includes(
      meta.value,
    );
  }

  public isMetadataDanger(meta: GenerationMetadataStable): boolean {
    return ['csam', 'nsfw'].includes(meta.value);
  }

  public submitGeneration(): void {
    if (this.jsonMode()) {
      this.applyJsonToForm();
      if (this.jsonError()) return;
    }
    if (!this.form.valid) return;

    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) return;

    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    const request = this.buildRequest();

    this.aiHorde
      .submitImageGeneration(apiKey, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        this.isSubmitting.set(false);
        if (!response) {
          this.submitError.set('Failed to submit generation request.');
          return;
        }
        this.submitSuccess.set(
          `Generation submitted! Kudos cost: ${response.kudos}`,
        );
        this.addTrackedGeneration(response.id, 'image', request);
      });
  }

  public generationDownloadPrefix(): string {
    const generation = this.rawJsonGeneration();
    return generation ? `generation-${generation.id}` : 'generation';
  }

  public viewImageResult(gen: TrackedGeneration): void {
    if (gen.type !== 'image' || gen.result) return;

    const loading = new Set(this.loadingResults());
    loading.add(gen.id);
    this.loadingResults.set(loading);

    this.aiHorde
      .getImageGenerationStatus(gen.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => {
        const l = new Set(this.loadingResults());
        l.delete(gen.id);
        this.loadingResults.set(l);

        if (status === GENERATION_NOT_FOUND) {
          this.updateGeneration(gen.id, { notFound: true });
          return;
        }
        if (!status) return;
        this.updateGeneration(gen.id, {
          result: status,
          done: status.done,
          faulted: status.faulted,
        });
      });
  }

  public getImageUrls(gen: TrackedGeneration): string[] {
    if (!gen.result || gen.type !== 'image') return [];
    const status = gen.result as GenerationStatusResponse;
    return (
      status.generations
        ?.filter((g) => g.state === 'ok' && g.img)
        .map((g) => g.img) ?? []
    );
  }

  private sanitizeResponsePayload(value: unknown): unknown {
    try {
      const sanitized = JSON.stringify(value, (_key, currentValue) => {
        if (
          typeof currentValue === 'string' &&
          currentValue.length > 256 &&
          /^[A-Za-z0-9+/=]/.test(currentValue)
        ) {
          return '[base64 data omitted]';
        }
        return currentValue;
      });

      return sanitized ? (JSON.parse(sanitized) as unknown) : value;
    } catch {
      return value;
    }
  }

  public getTextOutputs(gen: TrackedGeneration): string[] {
    if (!gen.result || gen.type !== 'text') return [];
    const status = gen.result as TextGenerationStatusResponse;
    return status.generations?.map((g) => g.text) ?? [];
  }

  public getAlchemyForms(
    gen: TrackedGeneration,
  ): { form: string; state: string }[] {
    if (!gen.result || gen.type !== 'alchemy') return [];
    const status = gen.result as AlchemyStatusResponse;
    return status.forms ?? [];
  }

  public isLoadingResult(id: string): boolean {
    return this.loadingResults().has(id);
  }

  public formatWaitTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }

  private addTrackedGeneration(
    id: string,
    type: GenerationType,
    sentRequest?: ImageGenerationRequest,
  ): void {
    const existing = this.trackedGenerations();
    if (existing.some((g) => g.id === id)) return;

    this.trackedGenerations.set([
      {
        id,
        type,
        check: null,
        result: null,
        done: false,
        faulted: false,
        firstSeenAt: Date.now(),
        sentRequest,
      },
      ...existing,
    ]);
  }

  private updateGeneration(
    id: string,
    update: Partial<TrackedGeneration>,
  ): void {
    this.trackedGenerations.update((gens) =>
      gens.map((g) => (g.id === id ? { ...g, ...update } : g)),
    );
  }

  private buildRequest(): ImageGenerationRequest {
    const v = this.form.value;
    const models = this.parseModels(v.model);

    const request: ImageGenerationRequest = {
      prompt: v.prompt!,
      params: {
        steps: v.steps ?? 25,
        cfg_scale: v.cfg_scale ?? 7.5,
        clip_skip: v.clip_skip ?? 1,
        width: v.width ?? 512,
        height: v.height ?? 512,
      },
      nsfw: v.nsfw ?? false,
      censor_nsfw: !(v.nsfw ?? false),
      r2: true,
    };

    if (models.length > 0) {
      request.models = models;
    }

    return request;
  }

  private parseModels(rawValue: string | null | undefined): string[] {
    if (!rawValue || !rawValue.trim()) {
      return [];
    }

    return rawValue
      .split(',')
      .map((model) => model.trim())
      .filter((model) => model.length > 0);
  }

  private applyJsonToForm(): void {
    try {
      const parsed = JSON.parse(this.jsonText());
      if (typeof parsed !== 'object' || parsed === null || !parsed.prompt) {
        this.jsonError.set(
          'JSON must be an object with at least a "prompt" field',
        );
        return;
      }
      this.jsonError.set(null);
      this.form.patchValue({
        prompt: parsed.prompt ?? '',
        model: parsed.models?.join(', ') ?? 'stable_diffusion',
        steps: parsed.params?.steps ?? 25,
        cfg_scale: parsed.params?.cfg_scale ?? 7.5,
        clip_skip: parsed.params?.clip_skip ?? 1,
        width: parsed.params?.width ?? 512,
        height: parsed.params?.height ?? 512,
        nsfw: parsed.nsfw ?? false,
      });
    } catch {
      this.jsonError.set('Invalid JSON');
    }
  }

  private fetchModels(): void {
    this.aiHorde
      .getImageModels('all')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((models) => {
        this.availableModels.set(
          models.sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
        );
      });
  }

  private pollUserGenerations(onComplete?: () => void): void {
    const user = this.auth.currentUser();
    if (!user) {
      onComplete?.();
      return;
    }

    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      onComplete?.();
      return;
    }

    this.aiHorde
      .getSelfUserByApiKeyUncached(apiKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (refreshedUser) => {
          this.auth.updateCurrentUserActiveGenerations(
            refreshedUser?.active_generations,
          );

          if (!refreshedUser?.active_generations) {
            return;
          }
          const ag = refreshedUser.active_generations;

          for (const id of ag.image ?? []) {
            this.addTrackedGeneration(id, 'image');
          }
          for (const id of ag.text ?? []) {
            this.addTrackedGeneration(id, 'text');
          }
          for (const id of ag.alchemy ?? []) {
            this.addTrackedGeneration(id, 'alchemy');
          }
        },
        complete: () => onComplete?.(),
      });
  }

  public retryGeneration(id: string): void {
    this.updateGeneration(id, { notFound: false });
  }

  private pollGenerationChecks(): void {
    const pending = this.trackedGenerations().filter(
      (g) => !g.done && !g.faulted && !g.notFound,
    );

    for (const gen of pending) {
      if (gen.type === 'image') {
        this.aiHorde
          .checkImageGeneration(gen.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((check) => {
            if (check === GENERATION_NOT_FOUND) {
              this.updateGeneration(gen.id, { notFound: true });
              return;
            }
            if (!check) return;
            this.updateGeneration(gen.id, {
              check,
              done: check.done,
              faulted: check.faulted,
            });
            if (check.done && !gen.result) {
              this.aiHorde
                .getImageGenerationStatus(gen.id)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe((status) => {
                  if (status === GENERATION_NOT_FOUND) {
                    this.updateGeneration(gen.id, { notFound: true });
                    return;
                  }
                  if (!status) return;
                  this.updateGeneration(gen.id, {
                    result: status,
                    done: status.done,
                    faulted: status.faulted,
                  });
                });
            }
          });
      } else if (gen.type === 'text') {
        this.aiHorde
          .getTextGenerationStatus(gen.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((status) => {
            if (status === GENERATION_NOT_FOUND) {
              this.updateGeneration(gen.id, { notFound: true });
              return;
            }
            if (!status) return;
            this.updateGeneration(gen.id, {
              check: {
                finished: status.finished,
                processing: status.processing,
                restarted: status.restarted,
                waiting: status.waiting,
                done: status.done,
                faulted: status.faulted,
                wait_time: status.wait_time,
                queue_position: status.queue_position,
                kudos: status.kudos,
                is_possible: status.is_possible,
              },
              result: status.done ? status : gen.result,
              done: status.done,
              faulted: status.faulted,
            });
          });
      } else if (gen.type === 'alchemy') {
        this.aiHorde
          .getAlchemyStatus(gen.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((status) => {
            if (status === GENERATION_NOT_FOUND) {
              this.updateGeneration(gen.id, { notFound: true });
              return;
            }
            if (!status) return;
            const isDone = status.state === 'done';
            const isFaulted = status.state === 'faulted';
            this.updateGeneration(gen.id, {
              result: isDone ? status : gen.result,
              done: isDone,
              faulted: isFaulted,
            });
          });
      }
    }
  }

  private startUserPollTimer(): void {
    this.stopUserPollTimer();
    if (!isPlatformBrowser(this.platformId)) return;

    this.ngZone.runOutsideAngular(() => {
      this.userPollTimer = setInterval(() => {
        this.ngZone.run(() => this.pollUserGenerations());
      }, GenerationsTabComponent.USER_POLL_MS);
    });
  }

  private stopUserPollTimer(): void {
    if (this.userPollTimer != null) {
      clearInterval(this.userPollTimer);
      this.userPollTimer = null;
    }
  }

  private startPolling(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.userAutoRefresh()) {
      this.startUserPollTimer();
    }

    this.ngZone.runOutsideAngular(() => {
      this.checkPollTimer = setInterval(() => {
        this.ngZone.run(() => this.pollGenerationChecks());
      }, GenerationsTabComponent.CHECK_POLL_MS);
    });

    this.destroyRef.onDestroy(() => {
      this.stopUserPollTimer();
      if (this.checkPollTimer != null) {
        clearInterval(this.checkPollTimer);
      }
    });
  }
}
