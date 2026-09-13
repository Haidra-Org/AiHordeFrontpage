import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  DatePipe,
  NgTemplateOutlet,
  formatDate,
  isPlatformBrowser,
} from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { TranslocoPipe } from '@jsverse/transloco';
import { useScrollLock } from '../../helper/scroll-lock';
import { copyToClipboard } from '../../helper/copy-to-clipboard';
import { IconComponent } from '../icon/icon.component';
import {
  GsIndexRailComponent,
  GsIndexRailEntry,
} from '../gs-index-rail/gs-index-rail.component';
import {
  PromptDraftDbService,
  StoredPromptDraft,
} from '../../services/prompt-draft-db.service';
import {
  PromptHistoryDbService,
  StoredSentPrompt,
} from '../../services/prompt-history-db.service';
import { ToastService } from '../../services/toast.service';
import {
  PROMPT_LIBRARY_PAGE_SIZE,
  PromptLibraryDay,
  PromptLibraryEntry,
  PromptLibraryFailedRequest,
  PromptLibraryLiveRequest,
  PromptLibraryOriginFilter,
  PromptLibraryTab,
  PromptLibraryUse,
  draftEntry,
  entryUse,
  filterEntries,
  groupByDay,
  modelsOf,
  sentEntry,
  takeOf,
  withStar,
} from './prompt-library.model';

/** How long a delete can be taken back. */
const UNDO_MS = 10_000;

/** One day heading as the list and the day rail both read it. */
export interface PromptLibraryDayView extends PromptLibraryDay {
  id: string;
  /** Set for today and yesterday, which have words. */
  labelKey: string | null;
  /** Set for every earlier day, which is a date. */
  label: string | null;
}

/**
 * Every prompt this browser keeps, drafts a text model wrote and prompts sent
 * to image generation, as one full-screen list with the chosen entry read in
 * full beside it (over it, on a phone).
 *
 * It reads, stars and deletes. Choosing a prompt is announced through `use`, and
 * the page that opened the library decides what writing it into a box means.
 */
@Component({
  selector: 'app-prompt-library',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    TranslocoPipe,
    IconComponent,
    GsIndexRailComponent,
    A11yModule,
  ],
  templateUrl: './prompt-library.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromptLibraryComponent implements OnInit, OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly locale = inject(LOCALE_ID);
  private readonly draftDb = inject(PromptDraftDbService);
  private readonly sentDb = inject(PromptHistoryDbService);
  private readonly toast = inject(ToastService);

  /** The list the library opens on. */
  public readonly initialTab = input<PromptLibraryTab>('drafts');
  /** Text requests still under way, listed ahead of the drafts. */
  public readonly liveRequests = input<readonly PromptLibraryLiveRequest[]>([]);
  /** Text requests that ended with nothing to use, listed under a fold. */
  public readonly failedRequests = input<readonly PromptLibraryFailedRequest[]>(
    [],
  );
  /**
   * What the Use press says. The page decides, because using a prompt means
   * something different where it opened: writing it into the studio's boxes, or
   * carrying it over to the studio from somewhere else.
   */
  public readonly useLabelKey = input('prompt_library.use');

  public readonly use = output<PromptLibraryUse>();
  public readonly closed = output<void>();
  /** Read everything one listed request was sent with and came back with. */
  public readonly requestDetails = output<string>();
  /** Send one listed request again, as it was asked. */
  public readonly requestRetry = output<string>();
  /** Take one listed request off the list, or all of them. */
  public readonly requestDismiss = output<string>();
  public readonly requestClear = output<void>();

  /** Whether the requests that did not finish are showing. */
  public readonly failedOpen = signal(false);

  public toggleFailed(): void {
    this.failedOpen.update((open) => !open);
  }

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly listColumn =
    viewChild<ElementRef<HTMLElement>>('listColumn');
  private readonly backButton =
    viewChild<ElementRef<HTMLButtonElement>>('backButton');

  /**
   * The page behind stops scrolling while the library is open; it covers the
   * whole screen on a phone, where a drag on its header would otherwise move
   * the form underneath. Released when the component is destroyed.
   */
  private readonly scrollLock = useScrollLock();

  private previousActiveElement: HTMLElement | null = null;
  /** The row that opened the entry being read, refocused on the way back. */
  private detailOpenedFrom: HTMLElement | null = null;

  public readonly tab = signal<PromptLibraryTab>('drafts');
  public readonly query = signal('');
  public readonly originFilter = signal<PromptLibraryOriginFilter>('all');
  public readonly modelFilter = signal('');
  public readonly starredOnly = signal(false);
  /** How many pages of the filtered list are drawn. */
  public readonly pages = signal(1);
  public readonly selectedId = signal<string | null>(null);
  public readonly selectMode = signal(false);
  public readonly marked = signal<ReadonlySet<string>>(new Set<string>());

  public readonly drafts = signal<StoredPromptDraft[]>([]);
  public readonly sent = signal<StoredSentPrompt[]>([]);
  public readonly loaded = signal(false);
  public readonly loadFailed = signal(false);

  /** Read once per open, so "Today" does not drift while the list is up. */
  private readonly now = Date.now();

  private readonly sourceEntries = computed<PromptLibraryEntry[]>(() =>
    this.tab() === 'drafts'
      ? this.drafts().map(draftEntry)
      : this.sent().map(sentEntry),
  );

  public readonly modelOptions = computed(() => modelsOf(this.sourceEntries()));

  public readonly filtered = computed(() =>
    filterEntries(this.sourceEntries(), {
      query: this.query(),
      origin: this.tab() === 'drafts' ? this.originFilter() : 'all',
      model: this.modelFilter(),
      starredOnly: this.starredOnly(),
    }),
  );

  public readonly shown = computed(() =>
    this.filtered().slice(0, this.pages() * PROMPT_LIBRARY_PAGE_SIZE),
  );

  public readonly hasMore = computed(
    () => this.shown().length < this.filtered().length,
  );

  public readonly days = computed<PromptLibraryDayView[]>(() =>
    groupByDay(this.shown(), this.now).map((day) => ({
      ...day,
      id: `gs-pl-day-${this.tab()}-${day.start}`,
      labelKey:
        day.kind === 'today'
          ? 'prompt_library.day_today'
          : day.kind === 'yesterday'
            ? 'prompt_library.day_yesterday'
            : null,
      label:
        day.kind === 'earlier'
          ? formatDate(day.start, 'mediumDate', this.locale)
          : null,
    })),
  );

  public readonly railEntries = computed<GsIndexRailEntry[]>(() =>
    this.days().map((day) =>
      day.labelKey === null
        ? { id: day.id, targetId: day.id, label: day.label ?? '' }
        : { id: day.id, targetId: day.id, labelKey: day.labelKey },
    ),
  );

  /** The entry read in full, looked up across every page rather than the shown one. */
  public readonly detail = computed<PromptLibraryEntry | null>(() => {
    const id = this.selectedId();
    return id === null
      ? null
      : (this.sourceEntries().find((entry) => entry.id === id) ?? null);
  });

  public readonly detailTake = computed(() => {
    const entry = this.detail();
    return entry?.source === 'draft'
      ? takeOf(entry.record, this.drafts())
      : null;
  });

  public readonly markedCount = computed(() => this.marked().size);

  /** Whether the library holds nothing at all on this tab, before any filter. */
  public readonly sourceEmpty = computed(
    () => this.sourceEntries().length === 0,
  );

  public ngOnInit(): void {
    this.tab.set(this.initialTab());
    void this.load();
    if (!this.isBrowser) {
      return;
    }
    this.scrollLock.enable();
    const active = document.activeElement;
    this.previousActiveElement = active instanceof HTMLElement ? active : null;
    // The panel renders in this same pass, so focus moves on the next tick. The
    // search field is the target: the reader came to find a prompt.
    setTimeout(() => {
      const field = this.searchInput()?.nativeElement;
      (field ?? this.panel()?.nativeElement)?.focus();
    }, 0);
  }

  public ngOnDestroy(): void {
    // Using a prompt moves focus into the box it was written to; handing focus
    // back to the opening press then would take the reader out of that box.
    const active = this.isBrowser ? document.activeElement : null;
    const panel = this.panel()?.nativeElement;
    const focusLeftBehind =
      active === null ||
      active === document.body ||
      (panel !== undefined && panel.contains(active));
    if (focusLeftBehind) {
      this.previousActiveElement?.focus();
    }
    this.previousActiveElement = null;
  }

  private async load(): Promise<void> {
    try {
      const [drafts, sent] = await Promise.all([
        this.draftDb.listAll(),
        this.sentDb.listAll(),
      ]);
      this.drafts.set(drafts);
      this.sent.set(sent);
    } catch (error) {
      console.warn('Failed to read saved prompts:', error);
      this.loadFailed.set(true);
    }
    this.loaded.set(true);
  }

  // --- Tabs, search and filters ---------------------------------------------

  /** Each tab has filters of its own, so switching starts them over. */
  public setTab(tab: PromptLibraryTab): void {
    if (this.tab() === tab) {
      return;
    }
    this.tab.set(tab);
    this.originFilter.set('all');
    this.modelFilter.set('');
    this.starredOnly.set(false);
    this.resetView();
  }

  public setQuery(value: string): void {
    this.query.set(value);
    this.pages.set(1);
  }

  public setOriginFilter(origin: PromptLibraryOriginFilter): void {
    this.originFilter.set(origin);
    this.pages.set(1);
  }

  public setModelFilter(model: string): void {
    this.modelFilter.set(model);
    this.pages.set(1);
  }

  public toggleStarredOnly(): void {
    this.starredOnly.update((on) => !on);
    this.pages.set(1);
  }

  public showMore(): void {
    this.pages.update((pages) => pages + 1);
  }

  private resetView(): void {
    this.pages.set(1);
    this.selectedId.set(null);
    this.selectMode.set(false);
    this.marked.set(new Set<string>());
  }

  // --- Reading one entry ------------------------------------------------------

  public open(entry: PromptLibraryEntry, event?: Event): void {
    const target = event?.currentTarget;
    this.detailOpenedFrom = target instanceof HTMLElement ? target : null;
    this.selectedId.set(entry.id);
    if (!this.isBrowser) {
      return;
    }
    // Where the entry opens over the list, the list is hidden and focus would
    // be left on a row nobody can see; beside the list it stays on the row.
    setTimeout(() => {
      if (this.listColumn()?.nativeElement.offsetParent === null) {
        this.backButton()?.nativeElement.focus();
      }
    }, 0);
  }

  public closeDetail(): void {
    this.selectedId.set(null);
    const from = this.detailOpenedFrom;
    this.detailOpenedFrom = null;
    if (from && this.isBrowser) {
      setTimeout(() => from.focus(), 0);
    }
  }

  public useEntry(entry: PromptLibraryEntry): void {
    this.use.emit(entryUse(entry));
  }

  public async copyEntry(entry: PromptLibraryEntry): Promise<void> {
    const copied = await copyToClipboard(entry.prompt);
    if (copied) {
      this.toast.success('prompt_library.copied', { transloco: true });
    } else {
      this.toast.error('prompt_library.copy_failed', { transloco: true });
    }
  }

  public async deleteEntry(entry: PromptLibraryEntry): Promise<void> {
    await this.deleteEntries([entry]);
  }

  // --- Starring ---------------------------------------------------------------

  /** The star moves at once; a write that fails puts it back and says so. */
  public async toggleStar(entry: PromptLibraryEntry): Promise<void> {
    const starred = !entry.starred;
    this.applyStar(entry, starred);
    try {
      if (entry.source === 'draft') {
        await this.draftDb.setStarred(entry.id, starred);
      } else {
        await this.sentDb.setStarred(entry.id, starred);
      }
    } catch (error) {
      console.warn('Failed to save a star:', error);
      this.applyStar(entry, !starred);
      this.toast.error('prompt_library.star_failed', { transloco: true });
    }
  }

  private applyStar(entry: PromptLibraryEntry, starred: boolean): void {
    if (entry.source === 'draft') {
      this.drafts.update((current) =>
        current.map((draft) =>
          draft.id === entry.id ? withStar(draft, starred) : draft,
        ),
      );
    } else {
      this.sent.update((current) =>
        current.map((record) =>
          record.key === entry.id ? withStar(record, starred) : record,
        ),
      );
    }
  }

  // --- Select mode ------------------------------------------------------------

  public toggleSelectMode(): void {
    this.selectMode.update((on) => !on);
    this.marked.set(new Set<string>());
  }

  public isMarked(id: string): boolean {
    return this.marked().has(id);
  }

  public toggleMarked(id: string): void {
    this.marked.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /**
   * Starred rows are left out, so a sweep of the list never takes a prompt the
   * reader chose to keep; ticking one by hand still marks it.
   */
  public markAllShown(): void {
    const unstarred = this.shown()
      .filter((entry) => !entry.starred)
      .map((entry) => entry.id);
    this.marked.update((current) => new Set([...current, ...unstarred]));
  }

  public async deleteMarked(): Promise<void> {
    const marked = this.marked();
    const entries = this.sourceEntries().filter((entry) =>
      marked.has(entry.id),
    );
    if (entries.length === 0) {
      return;
    }
    await this.deleteEntries(entries);
    this.selectMode.set(false);
    this.marked.set(new Set<string>());
  }

  // --- Deleting ----------------------------------------------------------------

  /**
   * Take entries out of the list and the store at once, and offer them back.
   * The Undo keeps its own copy of every record, so it restores exactly what
   * went even after the library has been closed.
   */
  private async deleteEntries(
    entries: readonly PromptLibraryEntry[],
  ): Promise<void> {
    const drafts = entries.flatMap((entry) =>
      entry.source === 'draft' ? [entry.record] : [],
    );
    const sent = entries.flatMap((entry) =>
      entry.source === 'sent' ? [entry.record] : [],
    );
    const ids = new Set(entries.map((entry) => entry.id));
    const selected = this.selectedId();
    if (selected !== null && ids.has(selected)) {
      this.selectedId.set(null);
    }
    this.drafts.update((current) =>
      current.filter((draft) => !ids.has(draft.id)),
    );
    this.sent.update((current) =>
      current.filter((record) => !ids.has(record.key)),
    );
    try {
      await Promise.all([
        this.draftDb.removeMany(drafts.map((draft) => draft.id)),
        this.sentDb.removeMany(sent.map((record) => record.key)),
      ]);
    } catch (error) {
      console.warn('Failed to delete saved prompts:', error);
      this.restore(drafts, sent);
      this.toast.error('prompt_library.delete_failed', { transloco: true });
      return;
    }
    const count = entries.length;
    this.toast.success(
      count === 1
        ? 'prompt_library.deleted_one'
        : 'prompt_library.deleted_other',
      {
        transloco: true,
        messageParams: { count },
        autoDismissMs: UNDO_MS,
        action: {
          label: 'prompt_library.undo',
          run: () => {
            void this.undoDelete(drafts, sent);
          },
        },
      },
    );
  }

  private async undoDelete(
    drafts: readonly StoredPromptDraft[],
    sent: readonly StoredSentPrompt[],
  ): Promise<void> {
    try {
      await Promise.all([
        this.draftDb.putMany(drafts),
        this.sentDb.putMany(sent),
      ]);
      this.restore(drafts, sent);
    } catch (error) {
      console.warn('Failed to restore deleted prompts:', error);
      this.toast.error('prompt_library.restore_failed', { transloco: true });
    }
  }

  private restore(
    drafts: readonly StoredPromptDraft[],
    sent: readonly StoredSentPrompt[],
  ): void {
    const draftIds = new Set(drafts.map((draft) => draft.id));
    const sentKeys = new Set(sent.map((record) => record.key));
    this.drafts.update((current) =>
      [...current.filter((draft) => !draftIds.has(draft.id)), ...drafts].sort(
        (a, b) => b.createdAt - a.createdAt,
      ),
    );
    this.sent.update((current) =>
      [...current.filter((record) => !sentKeys.has(record.key)), ...sent].sort(
        (a, b) => b.lastSentAt - a.lastSentAt,
      ),
    );
  }

  // --- Closing ------------------------------------------------------------------

  public onClose(): void {
    this.closed.emit();
  }

  /** Close only when the backdrop itself is pressed, not the panel within it. */
  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  /** The start of a prompt, for a button's spoken name. */
  public preview(text: string): string {
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  }
}
