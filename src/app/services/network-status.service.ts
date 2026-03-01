import {
  Injectable,
  PLATFORM_ID,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
  Signal,
  NgZone,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AiHordeService } from './ai-horde.service';
import { HordePerformance } from '../types/horde-performance';

/**
 * Centralises AI Horde network performance data so every consumer
 * (tiny nav bar, workers sidebar, mobile compact view) shares a
 * single HTTP fetch rather than each triggering its own request.
 *
 * Data is fetched once on first browser render. Consumers can call
 * `refresh()` to re-fetch. After two minutes without a refresh the
 * `isStale` signal flips to `true` so the UI can hint that the
 * numbers may be outdated.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly aiHorde = inject(AiHordeService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);

  private static readonly STALE_THRESHOLD_MS = 120_000; // 2 minutes

  private readonly _performance = signal<HordePerformance | null>(null);
  private readonly _lastUpdated = signal<Date | null>(null);

  // Ticks every STALE_THRESHOLD_MS so `isStale` recomputes reactively
  private readonly _now = signal<number>(Date.now());
  private staleTimerId: ReturnType<typeof setInterval> | null = null;

  public readonly performance: Signal<HordePerformance | null> =
    this._performance.asReadonly();
  public readonly lastUpdated: Signal<Date | null> =
    this._lastUpdated.asReadonly();

  public readonly isStale = computed(() => {
    const updated = this._lastUpdated();
    if (updated == null) return false;
    return (
      this._now() - updated.getTime() >
      NetworkStatusService.STALE_THRESHOLD_MS
    );
  });

  // ── Needs-help computed signals (same thresholds as the old workers component) ──

  public readonly imageNeedsHelp = computed(() => {
    const s = this._performance();
    return s != null && (s.worker_count < 20 || s.queued_requests > 200);
  });

  public readonly textNeedsHelp = computed(() => {
    const s = this._performance();
    return (
      s != null && (s.text_worker_count < 10 || s.queued_text_requests > 100)
    );
  });

  public readonly alchemyNeedsHelp = computed(() => {
    const s = this._performance();
    return s != null && (s.interrogator_count < 5 || s.queued_forms > 50);
  });

  public readonly anyNeedsHelp = computed(() => {
    return (
      this.imageNeedsHelp() || this.textNeedsHelp() || this.alchemyNeedsHelp()
    );
  });

  constructor() {
    afterNextRender(() => {
      this.refresh();
      this.startStaleTicker();
    });
  }

  /** Trigger a fresh fetch of performance data from the API. */
  public refresh(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.aiHorde.performance
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((perf) => {
        this._performance.set(perf);
        this._lastUpdated.set(new Date());
        this._now.set(Date.now());
      });
  }

  private startStaleTicker(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Run outside Angular to avoid triggering change detection every tick
    this.ngZone.runOutsideAngular(() => {
      this.staleTimerId = setInterval(() => {
        this.ngZone.run(() => this._now.set(Date.now()));
      }, NetworkStatusService.STALE_THRESHOLD_MS);
    });

    this.destroyRef.onDestroy(() => {
      if (this.staleTimerId != null) {
        clearInterval(this.staleTimerId);
      }
    });
  }
}
