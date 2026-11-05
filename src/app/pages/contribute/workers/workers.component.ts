import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  afterNextRender,
  PLATFORM_ID,
} from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsProseComponent } from '../../../components/gs-prose/gs-prose.component';
import { NetworkStatusService } from '../../../services/network-status.service';
import { ScrollRevealDirective } from '../../../directives/scroll-reveal.directive';

@Component({
  selector: 'app-workers',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    GsProseComponent,
    ScrollRevealDirective,
    DecimalPipe,
  ],
  templateUrl: './workers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkersComponent {
  private readonly platformId = inject(PLATFORM_ID);
  public readonly ns = inject(NetworkStatusService);

  /** Brief flash animation on needs-help sections when arriving from the notification. */
  public readonly arrivalHighlight = signal(false);

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      // Show arrival highlight if the navigation came from the notification system
      const nav = performance.getEntriesByType('navigation')[0] as
        PerformanceNavigationTiming | undefined;
      const isSpaNav = nav?.type === 'navigate' || nav?.type === 'reload';
      if (isSpaNav || document.referrer === '') {
        this.arrivalHighlight.set(true);
        setTimeout(() => this.arrivalHighlight.set(false), 2000);
      }
    });
  }
}
