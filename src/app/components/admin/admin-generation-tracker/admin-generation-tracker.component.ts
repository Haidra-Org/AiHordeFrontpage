import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  NgZone,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap, EMPTY, tap } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiHordeService } from '../../../services/ai-horde.service';
import { highlightJson } from '../../../helper/json-formatter';
import {
  TrackedGeneration,
  GenerationType,
  GenerationOutput,
  GenerationMetadataStable,
  GenerationStatusResponse,
  TextGenerationStatusResponse,
  AlchemyStatusResponse,
  GENERATION_NOT_FOUND,
} from '../../../types/generation';

@Component({
  selector: 'app-admin-generation-tracker',
  imports: [TranslocoPipe],
  templateUrl: './admin-generation-tracker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminGenerationTrackerComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);

  private static readonly CHECK_POLL_MS = 10_000;

  private checkPollTimer: ReturnType<typeof setInterval> | null = null;
  private pollingStarted = false;

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

  public readonly hasTrackedGenerations = computed(
    () => this.trackedGenerations().length > 0,
  );

  public readonly loadingResults = signal<Set<string>>(new Set());
  public readonly expandedResponse = signal<Set<string>>(new Set());

  public trackGeneration(id: string, type: GenerationType): void {
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
      },
      ...existing,
    ]);

    this.ensurePolling();
    // Immediately poll for this new generation
    this.pollSingleGeneration(id, type);
  }

  public isTracked(id: string): boolean {
    return this.trackedGenerations().some((g) => g.id === id);
  }

  public removeTrackedGeneration(id: string): void {
    this.trackedGenerations.update((gens) => gens.filter((g) => g.id !== id));
  }

  public clearAll(): void {
    this.trackedGenerations.set([]);
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

  public isLoadingResult(id: string): boolean {
    return this.loadingResults().has(id);
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
      (_key: string, value: unknown) => {
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

  public getResponseJsonHighlighted(gen: TrackedGeneration): string {
    return highlightJson(this.getResponseJson(gen));
  }

  public getGenerationOutputs(gen: TrackedGeneration): GenerationOutput[] {
    if (!gen.result || gen.type !== 'image') return [];
    return (gen.result as GenerationStatusResponse).generations ?? [];
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

  public formatWaitTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }

  private updateGeneration(
    id: string,
    update: Partial<TrackedGeneration>,
  ): void {
    this.trackedGenerations.update((gens) =>
      gens.map((g) => (g.id === id ? { ...g, ...update } : g)),
    );
  }

  public retryGeneration(id: string): void {
    this.updateGeneration(id, { notFound: false });
  }

  private pollSingleGeneration(id: string, type: GenerationType): void {
    if (type === 'image') {
      this.aiHorde
        .checkImageGeneration(id)
        .pipe(
          tap((check) => {
            if (check === GENERATION_NOT_FOUND) {
              this.updateGeneration(id, { notFound: true });
              return;
            }
            if (!check) return;
            this.updateGeneration(id, {
              check,
              done: check.done,
              faulted: check.faulted,
            });
          }),
          concatMap((check) => {
            if (check !== GENERATION_NOT_FOUND && check && check.done) {
              return this.aiHorde.getImageGenerationStatus(id);
            }
            return EMPTY;
          }),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((status) => {
          if (status === GENERATION_NOT_FOUND) {
            this.updateGeneration(id, { notFound: true });
            return;
          }
          if (!status) return;
          this.updateGeneration(id, {
            result: status,
            done: status.done,
            faulted: status.faulted,
          });
        });
    } else if (type === 'text') {
      this.aiHorde
        .getTextGenerationStatus(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((status) => {
          if (status === GENERATION_NOT_FOUND) {
            this.updateGeneration(id, { notFound: true });
            return;
          }
          if (!status) return;
          this.updateGeneration(id, {
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
            result: status.done ? status : null,
            done: status.done,
            faulted: status.faulted,
          });
        });
    } else if (type === 'alchemy') {
      this.aiHorde
        .getAlchemyStatus(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((status) => {
          if (status === GENERATION_NOT_FOUND) {
            this.updateGeneration(id, { notFound: true });
            return;
          }
          if (!status) return;
          const isDone = status.state === 'done';
          const isFaulted = status.state === 'faulted';
          this.updateGeneration(id, {
            result: isDone ? status : null,
            done: isDone,
            faulted: isFaulted,
          });
        });
    }
  }

  private pollGenerationChecks(): void {
    const pending = this.trackedGenerations().filter(
      (g) => !g.done && !g.faulted && !g.notFound,
    );

    for (const gen of pending) {
      this.pollSingleGeneration(gen.id, gen.type);
    }
  }

  private ensurePolling(): void {
    if (this.pollingStarted || !isPlatformBrowser(this.platformId)) return;
    this.pollingStarted = true;

    this.ngZone.runOutsideAngular(() => {
      this.checkPollTimer = setInterval(() => {
        this.ngZone.run(() => this.pollGenerationChecks());
      }, AdminGenerationTrackerComponent.CHECK_POLL_MS);
    });

    this.destroyRef.onDestroy(() => {
      if (this.checkPollTimer != null) {
        clearInterval(this.checkPollTimer);
      }
    });
  }
}
