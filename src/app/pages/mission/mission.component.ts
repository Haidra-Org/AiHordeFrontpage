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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../components/icon/icon.component';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { AiHordeService } from '../../services/ai-horde.service';
import { NetworkStatusService } from '../../services/network-status.service';
import { UnitConversionService } from '../../services/unit-conversion.service';
import { SingleImageStatPoint } from '../../types/single-image-stat-point';
import { SingleTextStatPoint } from '../../types/single-text-stat-point';
import { setPageTitle } from '../../helper/page-title';

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
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly units = inject(UnitConversionService);

  public imageStats = signal<SingleImageStatPoint | null>(null);
  public textStats = signal<SingleTextStatPoint | null>(null);
  public readonly performance = this.networkStatus.performance;

  constructor() {
    afterNextRender(() => {
      this.aiHorde.imageStats
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((img) => this.imageStats.set(img.total));

      this.aiHorde.textStats
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((txt) => this.textStats.set(txt.total));
    });
  }

  ngOnInit(): void {
    this.footerColor.setDarkMode(true);
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'mission.page_title',
      ' — ',
    );
  }
}
