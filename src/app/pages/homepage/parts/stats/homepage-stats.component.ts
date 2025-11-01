import { Component, DestroyRef, Inject, inject, NgZone, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser, UpperCasePipe } from "@angular/common";
import { TranslocoPipe, TranslocoModule } from "@jsverse/transloco";
import { CutPipe } from "../../../../pipes/cut.pipe";
import { FormatNumberPipe } from "../../../../pipes/format-number.pipe";
import { InlineSvgComponent } from "../../../../components/inline-svg/inline-svg.component";
import { ShiftDecimalsLeftPipe } from "../../../../pipes/shift-decimals-left.pipe";
import { SiPrefixPipe } from "../../../../pipes/si-prefix.pipe";
import { HordePerformance } from "../../../../types/horde-performance";
import { SingleImageStatPoint } from "../../../../types/single-image-stat-point";
import { SingleTextStatPoint } from "../../../../types/single-text-stat-point";
import { AiHordeService } from "../../../../services/ai-horde.service";
import { SingleInterrogationStatPoint } from "../../../../types/single-interrogation-stat-point";
import { forkJoin } from "rxjs";

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
    UpperCasePipe
  ],
  templateUrl: './homepage-stats.component.html',
  styleUrl: './homepage-stats.component.scss'
})
export class HomepageStatsComponent implements OnInit {
  private readonly isBrowser: boolean;
  private readonly aiHorde = inject(AiHordeService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  public stats = signal<HordePerformance | null>(null);
  public imageStats = signal<SingleImageStatPoint | null>(null);
  public textStats = signal<SingleTextStatPoint | null>(null);
  public interrogationStats = signal<SingleInterrogationStatPoint | null>(null);
  private timeoutId: number | null = null;

  constructor(
    @Inject(PLATFORM_ID) platformId: string,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.updateStats();

    // Only schedule timeout in browser environment (not during SSR)
    if (this.isBrowser) {
      this.zone.runOutsideAngular(() => {
        this.timeoutId = window.setTimeout(() => {
          this.zone.run(() => this.updateStats());
        }, 300);
      });
      
      // Cleanup timeout on destroy
      this.destroyRef.onDestroy(() => {
        if (this.timeoutId !== null) {
          clearTimeout(this.timeoutId);
        }
      });
    }

    // I don't think we need to update the stats after the initial load,
    // as its unlikely to add any value to the user experience.
    // They can always refresh the page to get the latest stats or go to the grafana
    // via the link.
    //
    // this.zone.runOutsideAngular(() => {
    //   interval(60_000).pipe(
    //     startWith(0),
    //     takeUntilDestroyed(this.destroyRef)
    //   ).subscribe(() => {
    //     this.zone.run(() => this.updateStats());
    //   });
    // });
  }

  private updateStats(): void {
    forkJoin({
      performance: this.aiHorde.performance,
      imageStats: this.aiHorde.imageStats,
      textStats: this.aiHorde.textStats,
      interrogationStats: this.aiHorde.interrogationStats,
    }).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(responses => {
      this.stats.set(responses.performance);
      this.imageStats.set(responses.imageStats.total);
      this.textStats.set(responses.textStats.total);
      this.interrogationStats.set(responses.interrogationStats);
    });
  }
}
