import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { ThemeService } from '../../../services/theme.service';
import { ScrollRevealDirective } from '../../../directives/scroll-reveal.directive';

@Component({
  selector: 'app-donate',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    NgOptimizedImage,
    ScrollRevealDirective,
  ],
  templateUrl: './donate.component.html',
  styleUrl: './donate.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonateComponent {
  protected readonly themeService = inject(ThemeService);
}
