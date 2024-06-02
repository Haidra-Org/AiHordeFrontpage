import {Component, Inject, OnInit, PLATFORM_ID, signal} from '@angular/core';
import {CutPipe} from "../../../../pipes/cut.pipe";
import {FormatNumberPipe} from "../../../../pipes/format-number.pipe";
import {InlineSvgComponent} from "../../../../components/inline-svg/inline-svg.component";
import {ShiftDecimalsLeftPipe} from "../../../../pipes/shift-decimals-left.pipe";
import {SiPrefixPipe} from "../../../../pipes/si-prefix.pipe";
import {TranslocoMarkupComponent} from "ngx-transloco-markup";
import {TranslocoPipe} from "@jsverse/transloco";
import {isPlatformBrowser, UpperCasePipe} from "@angular/common";
import {HordePerformance} from "../../../../types/horde-performance";
import {SingleImageStatPoint} from "../../../../types/single-image-stat-point";
import {SingleTextStatPoint} from "../../../../types/single-text-stat-point";
import {AiHordeService} from "../../../../services/ai-horde.service";
import {toPromise} from "../../../../types/resolvable";
import {combineLatest, combineLatestWith, interval, startWith, zip} from "rxjs";

@Component({
  selector: 'app-homepage-stats',
  standalone: true,
  imports: [
    CutPipe,
    FormatNumberPipe,
    InlineSvgComponent,
    ShiftDecimalsLeftPipe,
    SiPrefixPipe,
    TranslocoMarkupComponent,
    TranslocoPipe,
    UpperCasePipe
  ],
  templateUrl: './homepage-stats.component.html',
  styleUrl: './homepage-stats.component.scss'
})
export class HomepageStatsComponent implements OnInit {
  private readonly isBrowser: boolean;

  public stats = signal<HordePerformance | null>(null);
  public imageStats = signal<SingleImageStatPoint | null>(null);
  public textStats = signal<SingleTextStatPoint | null>(null);

  constructor(
    private readonly aiHorde: AiHordeService,
    @Inject(PLATFORM_ID) platformId: string,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  public async ngOnInit(): Promise<void> {
    if (this.isBrowser) {
      interval(60_000).pipe(
        startWith(0),
        combineLatestWith(this.aiHorde.performance, this.aiHorde.imageStats, this.aiHorde.textStats)
      ).subscribe(value => {
        console.log(value);
        this.stats.set(value[1]);
        this.imageStats.set(value[2].total);
        this.textStats.set(value[3].total);
      });
    } else {
      this.stats.set(await toPromise(this.aiHorde.performance));
      this.imageStats.set((await toPromise(this.aiHorde.imageStats)).total);
      this.textStats.set((await toPromise(this.aiHorde.textStats)).total);
    }
  }
}