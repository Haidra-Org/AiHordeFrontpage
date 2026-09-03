import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { AlchemyResultComponent } from '../alchemy-result/alchemy-result.component';
import { IconComponent } from '../../icon/icon.component';
import {
  AlchemyJob,
  formStatusView,
  formsProgressLabel,
  isJobSettled,
  jobAge,
  jobDoneResults,
  jobFormRows,
  jobHasResults,
  jobStateView,
} from '../../../helper/alchemy-job-view';

/**
 * Presentational results browser for the alchemy studio. Renders every tracked
 * request as a source-image thumbnail — a vertical rail beside a detail pane on
 * desktop, a sticky horizontal carousel above an inline detail block on mobile —
 * plus a full-pane tiled gallery. All job state is owned by `AlchemyComponent`;
 * this component only reflects inputs and emits intent.
 */
@Component({
  selector: 'app-alchemy-results-browser',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    AlchemyResultComponent,
    IconComponent,
  ],
  templateUrl: './alchemy-results-browser.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlchemyResultsBrowserComponent {
  public readonly jobs = input.required<AlchemyJob[]>();
  public readonly selectedJobId = input<string | null>(null);
  public readonly viewMode = input<'detail' | 'gallery'>('detail');
  public readonly galleryColumns = input<number>(4);
  public readonly selectMode = input<boolean>(false);
  public readonly selectedJobIds = input<ReadonlySet<string>>(new Set());
  public readonly isNarrow = input<boolean>(false);
  public readonly justAddedJobId = input<string | null>(null);
  public readonly downloadingJobId = input<string | null>(null);
  /**
   * Object URLs for stored result images, keyed `${localId}::${resultKey}`,
   * where the result key carries the detector for a control map. Composite so
   * the detail block can be rendered for more than one job without the keys
   * colliding.
   */
  public readonly resultImageUrls = input<ReadonlyMap<string, string>>(
    new Map(),
  );

  /** The locally held copy of a form's result image, if there is one. */
  public storedImageUrl(job: AlchemyJob, resultKey: string): string | null {
    return this.resultImageUrls().get(`${job.localId}::${resultKey}`) ?? null;
  }

  /** Activate a request (rail thumb or gallery tile) to view its results. */
  public readonly activateJob = output<string>();
  /** Mark/unmark a request while in select-to-delete mode. */
  public readonly toggleSelected = output<string>();
  public readonly download = output<AlchemyJob>();
  public readonly cancelRequest = output<string>();
  /** Carry one result image over to the image studio as its source. */
  public readonly useResultInStudio = output<{
    job: AlchemyJob;
    key: string;
  }>();

  /** Pure view helpers exposed for the template (see `alchemy-job-view`). */
  protected readonly stateView = jobStateView;
  protected readonly age = jobAge;
  protected readonly progress = formsProgressLabel;
  protected readonly formRows = jobFormRows;
  protected readonly statusView = formStatusView;
  protected readonly settled = isJobSettled;
  protected readonly hasResults = jobHasResults;
  protected readonly doneResults = jobDoneResults;

  protected readonly selectedJob = computed(
    () => this.jobs().find((j) => j.id === this.selectedJobId()) ?? null,
  );

  /**
   * The largest image available for a big surface (gallery tile): the session's
   * full source when it is still in memory, else the small persisted thumbnail,
   * else nothing (the caller renders a placeholder).
   */
  protected tileImage(job: AlchemyJob): string | null {
    return job.sourceFull ?? job.sourceThumb;
  }

  protected isMarked(id: string): boolean {
    return this.selectedJobIds().has(id);
  }

  /** Whether this thumb is the single tab stop for the rail's roving focus. */
  protected isTabStop(job: AlchemyJob, index: number): boolean {
    const selected = this.selectedJobId();
    if (selected !== null) return job.id === selected;
    return index === 0;
  }

  protected activate(job: AlchemyJob): void {
    if (this.selectMode()) {
      this.toggleSelected.emit(job.id);
    } else {
      this.activateJob.emit(job.id);
    }
  }

  /**
   * Roving keyboard navigation across the rail. Arrow/Home/End move DOM focus
   * only, leaving selection explicit; Enter/Space activate the focused thumb.
   */
  protected onThumbKeydown(event: KeyboardEvent, index: number): void {
    const jobs = this.jobs();
    const count = jobs.length;
    if (count === 0) return;

    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.activate(jobs[index]);
        return;
      default:
        return;
    }
    event.preventDefault();
    next = (next + count) % count;
    const rail = (event.currentTarget as HTMLElement).closest('.gs-rail');
    const buttons = rail?.querySelectorAll<HTMLElement>('.gs-rail-thumb');
    buttons?.[next]?.focus();
  }
}
