import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  afterNextRender,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NetworkStatusComponent } from '../../../components/network-status/network-status.component';
import { NetworkStatusService } from '../../../services/network-status.service';
import { GlossaryService } from '../../../services/glossary.service';

@Component({
  selector: 'app-workers',
  imports: [TranslocoPipe, RouterLink, NetworkStatusComponent],
  templateUrl: './workers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(click)': 'onHostClick($event)',
  },
})
export class WorkersComponent {
  private readonly glossary = inject(GlossaryService);
  private readonly platformId = inject(PLATFORM_ID);
  public readonly ns = inject(NetworkStatusService);

  /** Brief flash animation on needs-help sections when arriving from the notification. */
  public readonly arrivalHighlight = signal(false);

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      // Show arrival highlight if the navigation came from the notification system
      const nav = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      const isSpaNav = nav?.type === 'navigate' || nav?.type === 'reload';
      if (isSpaNav || document.referrer === '') {
        this.arrivalHighlight.set(true);
        setTimeout(() => this.arrivalHighlight.set(false), 2000);
      }
    });
  }

  /** Intercept clicks on glossary links rendered via innerHTML */
  public onHostClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'A' && target.classList.contains('glossary-link')) {
      event.preventDefault();
      const termClass = Array.from(target.classList).find((c) =>
        c.startsWith('gl-'),
      );
      if (termClass) {
        this.glossary.open(termClass.substring(3));
      }
    }
  }
}
