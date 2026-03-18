import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { InlineSvgComponent } from '../../../../components/inline-svg/inline-svg.component';
import { UnitTooltipComponent } from '../../../../components/unit-tooltip/unit-tooltip.component';
import { InfoTooltipComponent } from '../../../../components/info-tooltip/info-tooltip.component';
import { SingleImageStatPoint } from '../../../../types/single-image-stat-point';
import { SingleTextStatPoint } from '../../../../types/single-text-stat-point';
import { AiHordeService } from '../../../../services/ai-horde.service';
import { NetworkStatusService } from '../../../../services/network-status.service';
import { UnitConversionService } from '../../../../services/unit-conversion.service';
import { SingleInterrogationStatPoint } from '../../../../types/single-interrogation-stat-point';
import { ScrollRevealDirective } from '../../../../directives/scroll-reveal.directive';

@Component({
  selector: 'app-homepage-stats',
  imports: [
    DecimalPipe,
    InlineSvgComponent,
    TranslocoPipe,
    TranslocoModule,
    UnitTooltipComponent,
    InfoTooltipComponent,
    ScrollRevealDirective,
  ],
  templateUrl: './homepage-stats.component.html',
  styleUrl: './homepage-stats.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomepageStatsComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly units = inject(UnitConversionService);

  public readonly stats = this.networkStatus.performance;
  public imageStats = signal<SingleImageStatPoint | null>(null);
  public textStats = signal<SingleTextStatPoint | null>(null);
  public interrogationStats = signal<SingleInterrogationStatPoint | null>(null);

  // Computed synthesized units for real-time performance
  public readonly imagePerformanceRate = computed(() => {
    const s = this.stats();
    if (!s) return null;
    return this.units.formatImagePerformanceRate(s.past_minute_megapixelsteps);
  });

  public readonly textPerformanceRate = computed(() => {
    const s = this.stats();
    if (!s) return null;
    return this.units.formatTextPerformanceRate(s.past_minute_tokens);
  });

  // Computed synthesized units for queued work
  public readonly queuedImageWork = computed(() => {
    const s = this.stats();
    if (!s) return null;
    return this.units.formatQueuedImageWork(s.queued_megapixelsteps);
  });

  public readonly queuedTextWork = computed(() => {
    const s = this.stats();
    if (!s) return null;
    return this.units.formatQueuedTextWork(s.queued_tokens);
  });

  // Computed synthesized units for totals
  public readonly totalPixelsteps = computed(() => {
    const s = this.imageStats();
    if (!s) return null;
    return this.units.formatTotalPixelsteps(s.ps);
  });

  public readonly totalTokens = computed(() => {
    const s = this.textStats();
    if (!s) return null;
    return this.units.formatTotalTokens(s.tokens);
  });

  constructor() {
    // Fetch stats only in the browser after rendering completes.
    // This prevents stale prerendered data from appearing during static builds.
    afterNextRender(() => {
      this.updateStats();
    });
  }

  private updateStats(): void {
    this.aiHorde.imageStats
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((img) => this.imageStats.set(img.total));

    this.aiHorde.textStats
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((txt) => this.textStats.set(txt.total));

    this.aiHorde.interrogationStats
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((interr) => this.interrogationStats.set(interr));
  }
}
