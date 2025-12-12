import {
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
import { HordePerformance } from '../../../../types/horde-performance';
import { SingleImageStatPoint } from '../../../../types/single-image-stat-point';
import { SingleTextStatPoint } from '../../../../types/single-text-stat-point';
import { AiHordeService } from '../../../../services/ai-horde.service';
import { UnitConversionService } from '../../../../services/unit-conversion.service';
import { SingleInterrogationStatPoint } from '../../../../types/single-interrogation-stat-point';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-homepage-stats',
  imports: [
    DecimalPipe,
    InlineSvgComponent,
    TranslocoPipe,
    TranslocoModule,
    UnitTooltipComponent,
  ],
  templateUrl: './homepage-stats.component.html',
  styleUrl: './homepage-stats.component.css',
})
export class HomepageStatsComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly units = inject(UnitConversionService);

  public stats = signal<HordePerformance | null>(null);
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
    forkJoin({
      performance: this.aiHorde.performance,
      imageStats: this.aiHorde.imageStats,
      textStats: this.aiHorde.textStats,
      interrogationStats: this.aiHorde.interrogationStats,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((responses) => {
        this.stats.set(responses.performance);
        this.imageStats.set(responses.imageStats.total);
        this.textStats.set(responses.textStats.total);
        this.interrogationStats.set(responses.interrogationStats);
      });
  }
}
