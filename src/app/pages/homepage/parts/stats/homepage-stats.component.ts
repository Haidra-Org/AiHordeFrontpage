import {
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UpperCasePipe } from '@angular/common';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { CutPipe } from '../../../../pipes/cut.pipe';
import { FormatNumberPipe } from '../../../../pipes/format-number.pipe';
import { InlineSvgComponent } from '../../../../components/inline-svg/inline-svg.component';
import { ShiftDecimalsLeftPipe } from '../../../../pipes/shift-decimals-left.pipe';
import { SiPrefixPipe } from '../../../../pipes/si-prefix.pipe';
import { HordePerformance } from '../../../../types/horde-performance';
import { SingleImageStatPoint } from '../../../../types/single-image-stat-point';
import { SingleTextStatPoint } from '../../../../types/single-text-stat-point';
import { AiHordeService } from '../../../../services/ai-horde.service';
import { SingleInterrogationStatPoint } from '../../../../types/single-interrogation-stat-point';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-homepage-stats',
  standalone: true,
  imports: [
    CutPipe,
    FormatNumberPipe,
    InlineSvgComponent,
    ShiftDecimalsLeftPipe,
    SiPrefixPipe,
    TranslocoPipe,
    TranslocoModule,
    UpperCasePipe,
  ],
  templateUrl: './homepage-stats.component.html',
  styleUrl: './homepage-stats.component.scss',
})
export class HomepageStatsComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);

  public stats = signal<HordePerformance | null>(null);
  public imageStats = signal<SingleImageStatPoint | null>(null);
  public textStats = signal<SingleTextStatPoint | null>(null);
  public interrogationStats = signal<SingleInterrogationStatPoint | null>(null);

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
