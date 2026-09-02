import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  TutorialEngineService,
  canonicalFlowId,
} from '../../services/tutorial-engine.service';
import { isConceptFlow } from '../../content/flows';
import { IconComponent } from '../icon/icon.component';

/**
 * The way back to a tutorial the reader stepped away from.
 *
 * Two things put a tutorial here and the reader cannot tell them apart, which
 * is the point: leaving the steps for the results parks the flow rather than
 * ending it, and a reload finds the step it was left on written down. Either
 * way the strip says which tutorial is waiting and where it was, offers the way
 * back and offers the end. It renders nothing while neither holds, so a host can
 * mount it unconditionally.
 */
@Component({
  selector: 'app-gs-tutorial-parked',
  imports: [TranslocoPipe, IconComponent],
  template: `
    @if (parked()) {
      <div class="gs-parked" role="status">
        <span class="gs-tut-mark" aria-hidden="true">
          <app-icon name="academic-cap" />
        </span>
        <span class="gs-parked-text">
          <span class="gs-parked-title">{{ taskKey() | transloco }}</span>
          <span class="gs-parked-where">{{
            'generate.learn.parked_where'
              | transloco: { n: stepNumber(), total: total() }
          }}</span>
        </span>
        <button type="button" class="gs-parked-return" (click)="resume()">
          <app-icon name="arrow-right" class="gs-ico-sm" />
          {{ 'generate.learn.return' | transloco }}
        </button>
        <button
          type="button"
          class="gs-parked-end"
          [attr.aria-label]="'generate.learn.end' | transloco"
          (click)="end()"
        >
          <app-icon name="x-mark" class="gs-ico-sm" />
        </button>
      </div>
    } @else if (resumeOffered()) {
      <!-- A reload does not end a tutorial, and it does not carry on with one
           either: the reader is told where they were and picks. Leaving here
           is only the tutorial; the settings it put away are offered back in
           the results pane, whichever way this goes. -->
      <div class="gs-parked gs-parked--resume" role="status">
        <span class="gs-tut-mark" aria-hidden="true">
          <app-icon name="academic-cap" />
        </span>
        <span class="gs-parked-text">
          <span class="gs-parked-title">{{
            'generate.learn.resume_where'
              | transloco
                : {
                    n: resumeStep(),
                    total: resumeTotal(),
                    tutorial: resumeTaskKey() | transloco,
                  }
          }}</span>
        </span>
        <button type="button" class="gs-parked-return" (click)="continued()">
          <app-icon name="arrow-right" class="gs-ico-sm" />
          {{ 'generate.learn.resume_continue' | transloco }}
        </button>
        <button
          type="button"
          class="gs-parked-end"
          [attr.aria-label]="'generate.learn.end' | transloco"
          (click)="leave()"
        >
          <app-icon name="x-mark" class="gs-ico-sm" />
        </button>
      </div>
    }
  `,
  host: { class: 'gs-tutorial-parked' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsTutorialParkedComponent {
  private readonly engine = inject(TutorialEngineService);

  public readonly parked = this.engine.parked;
  public readonly total = this.engine.total;
  public readonly stepNumber = computed(() => this.engine.stepIndex() + 1);
  public readonly taskKey = computed(() => {
    const id = this.engine.activeFlowId();
    if (!id) {
      return '';
    }
    return isConceptFlow(id)
      ? `generate.learn.flows.${id}.task_name`
      : `generate.tutorials.flows.${canonicalFlowId(id)}.task_name`;
  });

  public readonly resumeOffered = this.engine.resumeOffered;
  public readonly resumeStep = this.engine.resumableStep;
  public readonly resumeTotal = this.engine.resumableTotal;

  /** What the offered tutorial makes, named the way every other surface names it. */
  public readonly resumeTaskKey = computed(() => {
    const id = this.engine.resumableFlowId();
    return id
      ? `generate.tutorials.flows.${canonicalFlowId(id)}.task_name`
      : '';
  });

  public resume(): void {
    this.engine.resume();
  }

  public end(): void {
    this.engine.stop();
  }

  /** Pick the offered tutorial up at the step it was left on. */
  public continued(): void {
    void this.engine.continueSession();
  }

  /** Turn the offer down; the tutorial is not offered again. */
  public leave(): void {
    this.engine.leaveSession();
  }
}
