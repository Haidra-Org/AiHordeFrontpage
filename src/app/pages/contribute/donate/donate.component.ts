import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { MissionCalloutComponent } from '../../../components/mission-callout/mission-callout.component';
import { ThemeService } from '../../../services/theme.service';

@Component({
  selector: 'app-donate',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    MissionCalloutComponent,
    NgOptimizedImage,
  ],
  templateUrl: './donate.component.html',
  styleUrl: './donate.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonateComponent {
  protected readonly themeService = inject(ThemeService);
}
