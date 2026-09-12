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
import { StatusService } from '../../../../services/status.service';
import { UnitConversionService } from '../../../../services/unit-conversion.service';
import { PublicHistoryDay } from '../../../../types/status';
import { UptimeSparklineComponent } from '../../../../components/uptime-sparkline/uptime-sparkline.component';
import { injectHostElement } from '../../../../helper/inject-host-element';
import { ScrollRevealDirective } from '../../../../directives/scroll-reveal.directive';

/** The status page's id for the generation API, whose uptime the band shows. */
const API_COMPONENT = 'api';

/** How long the numbers take to reach their value the first time they are read. */
const COUNT_IN_MS = 400;

/**
 * What the horde is doing right now: how many machines are on it, what is
 * waiting, how fast it is going, and how much it made today.
 *
 * The numbers are the site's evidence that the service is alive, so they are
 * read where a reader lands rather than on a page they have to find. Nothing
 * here is fetched on the server: the prerendered page carries the tiles with
 * their placeholder, and the values arrive in the browser without moving
 * anything but the one line they sit on.
 */
@Component({
  selector: 'app-homepage-live-band',
  imports: [
    DecimalPipe,
    RouterLink,
    TranslocoPipe,
    UptimeSparklineComponent,
    ScrollRevealDirective,
  ],
  templateUrl: './homepage-live-band.component.html',
  styleUrl: './homepage-live-band.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomepageLiveBandComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly status = inject(StatusService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly units = inject(UnitConversionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = injectHostElement();

  private readonly perf = this.networkStatus.performance;
  private readonly imagesToday = signal<number | null>(null);
  public readonly apiHistory = signal<readonly PublicHistoryDay[]>([]);

  /** 0 while the numbers are still arriving at their value, 1 once they are there. */
  private readonly progress = signal(0);

  /** True once the band has been on screen, which is when the count may run. */
  private readonly seen = signal(false);
  private counting = false;

  public readonly imageWorkers = computed(
    () => this.perf()?.worker_count ?? null,
  );
  public readonly textWorkers = computed(
    () => this.perf()?.text_worker_count ?? null,
  );
  public readonly imageQueue = computed(
    () => this.perf()?.queued_requests ?? null,
  );
  public readonly textQueue = computed(
    () => this.perf()?.queued_text_requests ?? null,
  );

  public readonly workers = computed(() =>
    this.sum(this.imageWorkers(), this.textWorkers()),
  );
  public readonly queue = computed(() =>
    this.sum(this.imageQueue(), this.textQueue()),
  );

  /** Standard images a second, the same reading the statistics page publishes. */
  public readonly throughput = computed(() => {
    const perf = this.perf();
    if (!perf) return null;
    return this.units.formatImagePerformanceRate(
      perf.past_minute_megapixelsteps,
    ).primary.value;
  });

  public readonly pictures = computed(() => this.imagesToday());

  /** Each tile's value as it is being read, which is its own once counted in. */
  public readonly shownWorkers = computed(() => this.counted(this.workers()));
  public readonly shownQueue = computed(() => this.counted(this.queue()));
  public readonly shownThroughput = computed(() =>
    this.counted(this.throughput()),
  );
  public readonly shownPictures = computed(() => this.counted(this.pictures()));

  constructor() {
    // The count belongs to the numbers arriving, not to the page loading: the
    // first values land after the band has been on screen as often as before.
    effect(() => {
      const ready = this.workers() !== null || this.pictures() !== null;
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

      this.status
        .getHistory(API_COMPONENT)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((response) => {
          if (response) this.apiHistory.set(response.buckets);
        });

      this.startCountIn();
    });
  }

  private sum(first: number | null, second: number | null): number | null {
    if (first === null && second === null) return null;
    return (first ?? 0) + (second ?? 0);
  }

  private counted(value: number | null): number | null {
    if (value === null) return null;
    return value * this.progress();
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
