import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiHordeService } from '../../../../services/ai-horde.service';
import { NetworkStatusService } from '../../../../services/network-status.service';
import {
  SynthesizedUnit,
  UnitConversionService,
} from '../../../../services/unit-conversion.service';
import { UnitTooltipComponent } from '../../../../components/unit-tooltip/unit-tooltip.component';
import { injectHostElement } from '../../../../helper/inject-host-element';
import { ScrollRevealDirective } from '../../../../directives/scroll-reveal.directive';

/** How long the numbers take to reach their value the first time they are read. */
const COUNT_IN_MS = 400;

/**
 * What the horde is doing right now, a column per domain: who is on it, what is
 * waiting, and how fast it is going, then what the day has made.
 *
 * The three domains are read side by side because they are three separate
 * services sharing one network: a reader who came for text learns nothing from
 * the image queue, and the shape of the band is what says so. Nothing here is
 * fetched on the server: the prerendered page carries the rows with their
 * placeholder, and the values arrive in the browser.
 */
@Component({
  selector: 'app-homepage-live-band',
  imports: [
    DecimalPipe,
    RouterLink,
    TranslocoPipe,
    UnitTooltipComponent,
    ScrollRevealDirective,
  ],
  templateUrl: './homepage-live-band.component.html',
  styleUrl: './homepage-live-band.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomepageLiveBandComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly units = inject(UnitConversionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = injectHostElement();

  private readonly perf = this.networkStatus.performance;
  private readonly imagesToday = signal<number | null>(null);
  private readonly textsToday = signal<number | null>(null);

  /** 0 while the numbers are still arriving at their value, 1 once they are there. */
  private readonly progress = signal(0);

  /** True once the band has been on screen, which is when the count may run. */
  private readonly seen = signal(false);
  private counting = false;

  // --- Workers ------------------------------------------------------------

  public readonly imageWorkers = computed(() =>
    this.counted(this.perf()?.worker_count ?? null),
  );
  public readonly imageThreads = computed(() =>
    this.counted(this.perf()?.thread_count ?? null),
  );
  public readonly textWorkers = computed(() =>
    this.counted(this.perf()?.text_worker_count ?? null),
  );
  public readonly textThreads = computed(() =>
    this.counted(this.perf()?.text_thread_count ?? null),
  );
  public readonly alchemyWorkers = computed(() =>
    this.counted(this.perf()?.interrogator_count ?? null),
  );
  public readonly alchemyThreads = computed(() =>
    this.counted(this.perf()?.interrogator_thread_count ?? null),
  );

  // --- Queue --------------------------------------------------------------

  public readonly imageQueue = computed(() =>
    this.counted(this.perf()?.queued_requests ?? null),
  );
  public readonly textQueue = computed(() =>
    this.counted(this.perf()?.queued_text_requests ?? null),
  );
  public readonly alchemyQueue = computed(() =>
    this.counted(this.perf()?.queued_forms ?? null),
  );

  /** What the image queue amounts to, in the reader's unit rather than in work. */
  public readonly queuedImageWork = computed<SynthesizedUnit | null>(() => {
    const perf = this.perf();
    return perf
      ? this.units.formatQueuedImageWork(perf.queued_megapixelsteps)
      : null;
  });

  public readonly queuedTextWork = computed<SynthesizedUnit | null>(() => {
    const perf = this.perf();
    return perf ? this.units.formatQueuedTextWork(perf.queued_tokens) : null;
  });

  // --- Throughput ---------------------------------------------------------

  public readonly imageRate = computed<SynthesizedUnit | null>(() => {
    const perf = this.perf();
    return perf
      ? this.units.formatImagePerformanceRate(perf.past_minute_megapixelsteps)
      : null;
  });

  public readonly textRate = computed<SynthesizedUnit | null>(() => {
    const perf = this.perf();
    return perf
      ? this.units.formatTextPerformanceRate(perf.past_minute_tokens)
      : null;
  });

  // --- Today --------------------------------------------------------------

  public readonly picturesToday = computed(() =>
    this.counted(this.imagesToday()),
  );
  public readonly textsTodayShown = computed(() =>
    this.counted(this.textsToday()),
  );

  /** True once a day's figure has arrived, which is what the line needs. */
  public readonly hasToday = computed(
    () => this.imagesToday() !== null || this.textsToday() !== null,
  );

  constructor() {
    // The count belongs to the numbers arriving, not to the page loading: the
    // first values land after the band has been on screen as often as before.
    effect(() => {
      const ready = this.perf() !== null || this.hasToday();
      if (!this.seen() || !ready || this.counting) return;
      this.counting = true;
      this.runCount();
    });

    afterNextRender(() => {
      this.aiHorde.imageStats
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (stats) => this.imagesToday.set(stats.day.images),
          error: () => this.imagesToday.set(null),
        });

      this.aiHorde.textStats
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (stats) => this.textsToday.set(stats.day.requests),
          error: () => this.textsToday.set(null),
        });

      this.startCountIn();
    });
  }

  private counted(value: number | null): number | null {
    if (value === null) return null;
    return Math.round(value * this.progress());
  }

  /**
   * Watch for the band being read. A count that runs off-screen has finished
   * before anybody sees it, which is the same as not having one.
   */
  private startCountIn(): void {
    if (this.reducedMotion() || typeof IntersectionObserver === 'undefined') {
      this.progress.set(1);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      this.seen.set(true);
    });
    observer.observe(this.host);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private runCount(): void {
    const started = performance.now();
    let frame = 0;
    const step = () => {
      const elapsed = performance.now() - started;
      const ratio = Math.min(1, elapsed / COUNT_IN_MS);
      this.progress.set(ratio);
      if (ratio < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    this.destroyRef.onDestroy(() => cancelAnimationFrame(frame));
  }

  private reducedMotion(): boolean {
    return (
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ===
      true
    );
  }
}
