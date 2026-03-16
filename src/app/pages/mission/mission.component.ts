import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { combineLatest, map } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../components/icon/icon.component';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { AiHordeService } from '../../services/ai-horde.service';
import { UnitConversionService } from '../../services/unit-conversion.service';
import { SingleImageStatPoint } from '../../types/single-image-stat-point';
import { SingleTextStatPoint } from '../../types/single-text-stat-point';
import { HordePerformance } from '../../types/horde-performance';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-mission',
  imports: [TranslocoPipe, RouterLink, DecimalPipe, IconComponent],
  templateUrl: './mission.component.html',
  styleUrl: './mission.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly units = inject(UnitConversionService);

  public imageStats = signal<SingleImageStatPoint | null>(null);
  public textStats = signal<SingleTextStatPoint | null>(null);
  public performance = signal<HordePerformance | null>(null);

  constructor() {
    afterNextRender(() => {
      forkJoin({
        imageStats: this.aiHorde.imageStats,
        textStats: this.aiHorde.textStats,
        performance: this.aiHorde.performance,
      })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((responses) => {
          this.imageStats.set(responses.imageStats.total);
          this.textStats.set(responses.textStats.total);
          this.performance.set(responses.performance);
        });
    });
  }

  ngOnInit(): void {
    this.footerColor.setDarkMode(true);

    combineLatest([
      this.translator.get('mission.page_title'),
      this.translator.get('app_title'),
    ])
      .pipe(map(([page, app]) => `${page} — ${app}`))
      .subscribe((title) => this.title.setTitle(title));
  }
}
