import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AlchemyResultComponent } from '../alchemy-result/alchemy-result.component';
import {
  AlchemyFoldPin,
  AlchemyPicture,
  AlchemyPicturesComponent,
} from '../alchemy-pictures/alchemy-pictures.component';
import { PromptDraftCardComponent } from '../../prompt-draft/prompt-draft-card.component';
import { ALCHEMY_DATA_FORMS } from '../../../types/generation';
import {
  isLikelyImageFileLink,
  toRenderableImageSource,
} from '../../../helper/generation-image';
import { IconComponent } from '../../icon/icon.component';
import { GsSheetComponent } from '../../gs-sheet/gs-sheet.component';
import {
  AlchemyFormCard,
  AlchemyJob,
  AlchemyJobProgress,
  AlchemyLeadPreview,
  AlchemySeriesCell,
  AlchemySeriesColumn,
  AlchemySeriesSort,
  formStatusView,
  isJobSettled,
  jobAge,
  jobFormCards,
  jobHasResults,
  jobLeadPreview,
  jobProgress,
  jobStateView,
  resultPromptText,
  seriesCell,
  seriesColumns,
  sharesOperations,
  sortSeries,
  toCsv,
} from '../../../helper/alchemy-job-view';

/** Jobs with this many forms or fewer open every result at once. */
const OPEN_ALL_UP_TO = 3;

/** The last path segment of a result link, without its query. */
function imageFileName(url: string): string {
  const path = url.split('?', 1).at(0) ?? '';
  return path.slice(path.lastIndexOf('/') + 1) || url;
}

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
    DatePipe,
    NgTemplateOutlet,
    TranslocoPipe,
    AlchemyResultComponent,
    AlchemyPicturesComponent,
    PromptDraftCardComponent,
    IconComponent,
    GsSheetComponent,
    A11yModule,
  ],
  templateUrl: './alchemy-results-browser.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlchemyResultsBrowserComponent {
  public readonly jobs = input.required<AlchemyJob[]>();
  public readonly selectedJobId = input<string | null>(null);
  public readonly viewMode = input<'detail' | 'gallery' | 'table'>('detail');
  public readonly galleryColumns = input<number>(4);
  public readonly selectMode = input<boolean>(false);
  public readonly selectedJobIds = input<ReadonlySet<string>>(new Set());
  public readonly isNarrow = input<boolean>(false);
  public readonly justAddedJobId = input<string | null>(null);
  public readonly downloadingJobId = input<string | null>(null);
  /**
   * Whether the gallery is showing the selected job over its tiles. Owned by
   * the page with the selection, so a tile pick and a close are one state.
   */
  public readonly paneOpen = input<boolean>(false);
  /**
   * The request whose prompt draft the reader asked for before running it.
   * Its card unfolds as soon as there is a caption or tags to write from,
   * instead of being one more thing to go looking for.
   */
  public readonly openDraftForJobId = input<string | null>(null);
  /**
   * What the page wants read after the results, wherever they scroll: the
   * retention note and the volunteer door. A template rather than projected
   * content because the detail pane and the gallery are two scroll regions
   * and only one is on screen at a time.
   */
  public readonly foot = input<TemplateRef<unknown> | null>(null);
  /**
   * Object URLs for stored result images, keyed `${localId}::${resultKey}`,
   * where the result key carries the detector for a control map. Composite so
   * the detail block can be rendered for more than one job without the keys
   * colliding.
   */
  public readonly resultImageUrls = input<ReadonlyMap<string, string>>(
    new Map(),
  );

  /**
   * Small copies of every job's result images, keyed as `resultImageUrls`
   * is. Held for the whole history, so a tile or a cell has a picture for
   * any job, where the full copies are only resolved for the shown one.
   */
  public readonly resultThumbUrls = input<ReadonlyMap<string, string>>(
    new Map(),
  );

  /** The locally held copy of a form's result image, if there is one. */
  public storedImageUrl(job: AlchemyJob, resultKey: string): string | null {
    return this.resultImageUrls().get(`${job.localId}::${resultKey}`) ?? null;
  }

  /** The best picture of a result a small surface can show: full, else small. */
  protected resultPreviewUrl(
    job: AlchemyJob,
    resultKey: string,
  ): string | null {
    return (
      this.storedImageUrl(job, resultKey) ??
      this.resultThumbUrls().get(`${job.localId}::${resultKey}`) ??
      null
    );
  }

  /** Activate a request (rail thumb or gallery tile) to view its results. */
  public readonly activateJob = output<string>();
  /** Mark/unmark a request while in select-to-delete mode. */
  public readonly toggleSelected = output<string>();
  public readonly download = output<AlchemyJob>();
  public readonly cancelRequest = output<string>();
  /** The gallery's job panel or sheet was dismissed. */
  public readonly closePane = output<void>();
  /** The series table as shown, as a CSV document to save. */
  public readonly exportCsv = output<{ fileName: string; text: string }>();
  /** The shown rows with their pictures, as one zip, the table inside it. */
  public readonly exportZip = output<{
    jobs: AlchemyJob[];
    csv: { fileName: string; text: string };
  }>();
  /** Whether the page is building a series zip, so the button waits. */
  public readonly zipBusy = input<boolean>(false);
  /** Asks the page to set the form up as this request was, for another image. */
  public readonly repeatRequest = output<AlchemyJob>();
  /** Asks the page to make one result picture the source of the next request. */
  public readonly useResultAsSource = output<{
    job: AlchemyJob;
    key: string;
  }>();
  /** Words from a result, for the image studio's prompt box. */
  public readonly sendToPrompt = output<string>();

  // --- the series table ----------------------------------------------------

  private readonly transloco = inject(TranslocoService);

  /** Which column orders the table; null is age order. Not persisted. */
  protected readonly seriesSort = signal<AlchemySeriesSort | null>(null);
  /** Only requests that ran the selected request's operations. */
  protected readonly sameOpsOnly = signal(false);

  /**
   * The columns are the operations the shown rows ran, so narrowing the rows
   * drops the columns none of them fill, and a lone request's table is that
   * request's operations and no more.
   */
  protected readonly columns = computed(() => seriesColumns(this.seriesPool()));

  /**
   * The rows the table is about, in the age order the history keeps them in.
   * The columns are read from here rather than from the sorted rows, since
   * their order is the order the requests first asked for each operation: a
   * sort is about the rows, and must not move a column out from under the
   * reader.
   */
  private readonly seriesPool = computed(() => {
    const selected = this.selectedJob();
    return this.sameOpsOnly() && selected
      ? this.jobs().filter((job) => sharesOperations(job, selected))
      : this.jobs();
  });

  protected readonly seriesJobs = computed(() =>
    sortSeries(this.seriesPool(), this.seriesSort()),
  );

  protected readonly cell = seriesCell;

  protected sortBy(key: string): void {
    this.seriesSort.update((current) => {
      if (current?.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  }

  protected sortState(key: string): 'ascending' | 'descending' | 'none' {
    const sort = this.seriesSort();
    if (sort?.key !== key) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(key: string): string {
    switch (this.sortState(key)) {
      case 'ascending':
        return 'chevron-up';
      case 'descending':
        return 'chevron-down';
      default:
        return 'arrows-up-down';
    }
  }

  protected toggleSameOps(): void {
    this.sameOpsOnly.update((on) => !on);
  }

  /** A processed image the table can show: the local copy, or nothing. */
  protected cellImage(job: AlchemyJob, cell: AlchemySeriesCell): string | null {
    return cell.imageKey ? this.resultPreviewUrl(job, cell.imageKey) : null;
  }

  /**
   * The table as shown, under the column names the reader sees. Images are
   * carried as the file name of the horde's link, since the bytes stay in
   * the per-request zip.
   */
  protected requestExport(): void {
    this.exportCsv.emit(this.seriesCsv());
  }

  protected requestZip(): void {
    this.exportZip.emit({ jobs: this.seriesJobs(), csv: this.seriesCsv() });
  }

  private seriesCsv(): { fileName: string; text: string } {
    const columns = this.columns();
    const labels = columns.map((column) =>
      [this.transloco.translate(this.columnLabelKey(column)), column.detector]
        .filter(Boolean)
        .join(' '),
    );
    const header = ['request', 'age_minutes', ...labels];
    const rows = this.seriesJobs().map((job) => [
      job.id,
      `${Math.floor((Date.now() - job.firstSeenAt) / 60_000)}`,
      ...columns.map((column) => {
        const cell = this.cell(job, column.key);
        return cell.kind === 'image' ? imageFileName(cell.text) : cell.text;
      }),
    ]);
    return {
      fileName: `alchemy-series-${new Date().toISOString().slice(0, 10)}.csv`,
      text: toCsv([header, ...rows]),
    };
  }

  protected columnLabelKey(column: AlchemySeriesColumn): string {
    return `alchemy.form_names.${column.form}`;
  }
  /** Carry one result image over to the image studio as its source. */
  public readonly useResultInStudio = output<{
    job: AlchemyJob;
    key: string;
  }>();

  /** Pure view helpers exposed for the template (see `alchemy-job-view`). */
  protected readonly stateView = jobStateView;
  protected readonly age = jobAge;
  protected readonly progress = jobProgress;
  protected readonly formCards = jobFormCards;
  protected readonly statusView = formStatusView;
  protected readonly settled = isJobSettled;
  protected readonly hasResults = jobHasResults;
  protected readonly leadPreview = jobLeadPreview;

  /**
   * The words a job's results offer a prompt: its caption and its strongest
   * tags, each once the form is done. Null when there is nothing yet, which
   * is when the draft card has nothing to write from and stays away.
   */
  protected promptMaterial(
    cards: AlchemyFormCard[],
  ): { caption: string | null; tags: string | null } | null {
    let caption: string | null = null;
    let tags: string | null = null;
    for (const card of cards) {
      if (!card.view) continue;
      const text = resultPromptText(card.view.form);
      if (!text) continue;
      if (card.form === 'caption') caption = text;
      if (card.form === 'interrogation') tags = text;
    }
    return caption || tags ? { caption, tags } : null;
  }

  // --- pictures and folding -------------------------------------------------

  /** Whether a form's result is a processed picture rather than text or data. */
  protected isPictureCard(card: AlchemyFormCard): boolean {
    return (
      card.view !== null &&
      !(ALCHEMY_DATA_FORMS as readonly string[]).includes(card.form)
    );
  }

  /**
   * The request's processed pictures, in request order, each with the local
   * copy when this browser holds one and the horde's link while it does not.
   * A form whose link is not a picture is left out rather than drawn broken.
   */
  protected jobPictures(
    job: AlchemyJob,
    cards: AlchemyFormCard[],
  ): AlchemyPicture[] {
    const pictures: AlchemyPicture[] = [];
    for (const card of cards) {
      if (!this.isPictureCard(card) || !card.view) continue;
      const link = card.view.form.result?.[card.form];
      const stored = this.storedImageUrl(job, card.key);
      const remote =
        typeof link === 'string' && isLikelyImageFileLink(link)
          ? toRenderableImageSource(link)
          : null;
      const url = stored ?? remote;
      if (!url) continue;
      const extension =
        typeof link === 'string'
          ? /\.([a-z0-9]{3,4})(?:\?|$)/i.exec(link)?.[1]
          : null;
      pictures.push({
        key: card.key,
        form: card.form,
        detector: card.detector,
        url,
        stored: stored !== null,
        downloadName: `${card.key}.${extension ?? 'webp'}`,
      });
    }
    return pictures;
  }

  /** The largest source the page has resolved for a request, for the wipe. */
  protected sourceFor(job: AlchemyJob): string | null {
    return job.sourceFull ?? job.sourceThumb;
  }

  /** The last "Fold all" / "Open all" press per request. */
  private readonly foldPins = signal<ReadonlyMap<string, AlchemyFoldPin>>(
    new Map(),
  );

  protected foldPinFor(jobId: string): AlchemyFoldPin | null {
    return this.foldPins().get(jobId) ?? null;
  }

  /**
   * The pin that unfolds a named request's draft card. Stamped as the name
   * changes, since a card only reacts to a stamp it has not seen: another
   * request asked for from the quick pick opens its own card again.
   */
  private readonly draftPin = computed<{
    jobId: string;
    pin: AlchemyFoldPin;
  } | null>(() => {
    const jobId = this.openDraftForJobId();
    return jobId === null
      ? null
      : { jobId, pin: { open: true, stamp: Date.now() } };
  });

  /** The draft card follows the later of the fold-all press and that pin. */
  protected draftPinFor(jobId: string): AlchemyFoldPin | null {
    const folded = this.foldPinFor(jobId);
    const asked = this.draftPin();
    if (asked?.jobId !== jobId) return folded;
    return folded && folded.stamp > asked.pin.stamp ? folded : asked.pin;
  }

  /** The head button folds everything unless the last press folded already. */
  protected foldAllOpens(jobId: string): boolean {
    return this.foldPinFor(jobId)?.open === false;
  }

  protected toggleFoldAll(jobId: string): void {
    const open = this.foldAllOpens(jobId);
    this.foldPins.update((pins) => {
      const next = new Map(pins);
      next.set(jobId, { open, stamp: Date.now() });
      return next;
    });
  }

  /** The done share of a request as a CSS percentage, for its ring and bar. */
  protected ringShare(p: AlchemyJobProgress): string {
    const share = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
    return `${share}%`;
  }

  /**
   * A small request reads whole; a large one opens its short results and
   * folds the tall ones, which the card decides for itself when given no
   * preset.
   */
  protected openPreset(formCount: number): boolean | null {
    return formCount <= OPEN_ALL_UP_TO ? true : null;
  }

  protected leadText(lead: AlchemyLeadPreview): string {
    if (lead?.kind === 'text') return lead.text;
    if (lead?.kind === 'score') return lead.score.toFixed(1);
    return '';
  }

  protected leadCount(lead: AlchemyLeadPreview): number {
    return lead?.kind === 'tags' ? lead.count : 0;
  }

  protected leadFlag(lead: AlchemyLeadPreview): boolean {
    return lead?.kind === 'nsfw' ? lead.nsfw : false;
  }

  protected leadColors(lead: AlchemyLeadPreview): string[] {
    return lead?.kind === 'palette' ? lead.colors.slice(0, 6) : [];
  }

  protected readonly selectedJob = computed(
    () => this.jobs().find((j) => j.id === this.selectedJobId()) ?? null,
  );

  /**
   * What a gallery tile shows: a processed image held locally when that is
   * the job's lead result, else the largest source available (the session's
   * full source while it is in memory, then the small persisted thumbnail),
   * else nothing (the caller renders a placeholder).
   */
  protected tileImage(
    job: AlchemyJob,
    lead: AlchemyLeadPreview,
  ): string | null {
    if (lead?.kind === 'image') {
      const preview = this.resultPreviewUrl(job, lead.key);
      if (preview) return preview;
    }
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
