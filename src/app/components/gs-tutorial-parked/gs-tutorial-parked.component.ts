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
 * The way back to a tutorial the reader left for the results.
 *
 * Leaving parks the flow rather than ending it, so a reader can look at what
 * they made, or at the whole gallery, and pick the walkthrough up at the same
 * step. This strip says which tutorial is waiting and where it was, offers the
 * return, and offers the end for a reader who is done. It renders nothing while
 * no flow is parked, so a host can mount it unconditionally.
 */
@Component({
  selector: 'app-gs-tutorial-parked',
  imports: [TranslocoPipe, IconComponent],
  template: `
    @if (parked()) {
      <div class="gs-parked" role="status">
        <span class="gs-parked-mark" aria-hidden="true">
          <app-icon name="document-text" class="gs-ico-sm" />
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

  public resume(): void {
    this.engine.resume();
  }

  public end(): void {
    this.engine.stop();
  }
}
