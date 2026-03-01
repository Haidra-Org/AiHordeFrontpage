import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NetworkStatusComponent } from '../../../components/network-status/network-status.component';
import { NetworkStatusService } from '../../../services/network-status.service';
import { GlossaryService } from '../../../services/glossary.service';

@Component({
  selector: 'app-workers',
  imports: [
    TranslocoPipe,
    RouterLink,
    NetworkStatusComponent,
  ],
  templateUrl: './workers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(click)': 'onHostClick($event)',
  },
})
export class WorkersComponent {
  private readonly glossary = inject(GlossaryService);
  public readonly ns = inject(NetworkStatusService);

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
