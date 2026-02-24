import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { MissionCalloutComponent } from '../../../components/mission-callout/mission-callout.component';
import { NetworkDiagramComponent } from '../../../components/network-diagram/network-diagram.component';
import { AiHordeService } from '../../../services/ai-horde.service';
import { GlossaryService } from '../../../services/glossary.service';
import { HordePerformance } from '../../../types/horde-performance';

@Component({
  selector: 'app-workers',
  imports: [
    TranslocoPipe,
    RouterLink,
    DecimalPipe,
    MissionCalloutComponent,
    NetworkDiagramComponent,
  ],
  templateUrl: './workers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(click)': 'onHostClick($event)',
  },
})
export class WorkersComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly glossary = inject(GlossaryService);

  public stats = signal<HordePerformance | null>(null);

  public imageNeedsHelp = computed(() => {
    const s = this.stats();
    return s != null && (s.worker_count < 20 || s.queued_requests > 200);
  });

  public textNeedsHelp = computed(() => {
    const s = this.stats();
    return (
      s != null && (s.text_worker_count < 10 || s.queued_text_requests > 100)
    );
  });

  public alchemyNeedsHelp = computed(() => {
    const s = this.stats();
    return s != null && (s.interrogator_count < 5 || s.queued_forms > 50);
  });

  public anyNeedsHelp = computed(() => {
    return (
      this.imageNeedsHelp() || this.textNeedsHelp() || this.alchemyNeedsHelp()
    );
  });

  constructor() {
    afterNextRender(() => {
      this.aiHorde.performance
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((perf) => this.stats.set(perf));
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
