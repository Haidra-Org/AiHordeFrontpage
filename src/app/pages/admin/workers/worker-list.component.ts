import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  output,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { ScrollFadeComponent } from '../../../helper/scroll-fade.component';
import { StickyHeaderDirective } from '../../../helper/sticky-header.directive';
import { TranslatorService } from '../../../services/translator.service';
import { AuthService } from '../../../services/auth.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { NetworkStatusService } from '../../../services/network-status.service';
import { TeamService } from '../../../services/team.service';
import {
  HordeWorker,
  WorkerChatDeclaration,
  WorkerType,
} from '../../../types/horde-worker';
import {
  chatHasJsonSchema,
  chatHasTools,
  chatReadsImages,
} from './chat-features';
import { Team } from '../../../types/team';
import { WorkerCardComponent } from './worker-card.component';
import { WorkerRowComponent } from './worker-row.component';
import { WorkerDetailModalComponent } from './worker-detail-modal.component';
import { InfoTooltipComponent } from '../../../components/info-tooltip/info-tooltip.component';
import {
  UnitConversionService,
  SynthesizedUnit,
} from '../../../services/unit-conversion.service';
import { UnitTooltipComponent } from '../../../components/unit-tooltip/unit-tooltip.component';
import { IconComponent } from '../../../components/icon/icon.component';
import { setPageTitle } from '../../../helper/page-title';
import { finalize } from 'rxjs';
import { extractUserId } from '../../../helper/user-parser';
import { extractApiError } from '../../../helper/extract-api-error';
import { GlossaryService } from '../../../services/glossary.service';
import { WORKERS_GLOSSARY_CONTEXT } from './worker-icons';

type SortKey =
  | 'name'
  | 'performance'
  | 'bridge_agent'
  | 'uptime'
  | 'megapixelsteps_generated';
type SortOrder = 'asc' | 'desc';

/** The number of listed workers with one capability, and their speed. */
interface CapabilityStat {
  name: string;
  /**
   * Shown in place of `name` when the capability does not have a short API
   * name.
   */
  labelKey?: string;
  totalPerformance: number;
  workerCount: number;
}

function stat(name: string, labelKey: string): CapabilityStat {
  return { name, labelKey, totalPerformance: 0, workerCount: 0 };
}

/** Used for a chat worker when the horde did not send a declaration. */
const EMPTY_CHAT_DECLARATION: WorkerChatDeclaration = {
  model_id: '',
  features: [],
  limits: { max_context_length: 0, max_length: 0, tools_max_temperature: null },
  image_transports: [],
};

const WORKER_VIEW_MODE_STORAGE_KEY = 'workers.view_mode';

/** Storage key for the folded text sections in this browser, as a JSON list. */
const TEXT_SECTIONS_FOLDED_STORAGE_KEY = 'workers.text_sections_folded';

/** The two groups of workers on the text tab. */
export type TextSectionId = 'chat' | 'plain';

const TEXT_SECTION_IDS: readonly TextSectionId[] = ['chat', 'plain'];

/**
 * A group of listed workers. `id` is null when the tab shows a single list
 * without a heading.
 */
export interface WorkerSection {
  id: TextSectionId | null;
  headingKey: string | null;
  workers: HordeWorker[];
}

@Component({
  selector: 'app-worker-list',
  imports: [
    TranslocoPipe,
    TranslocoModule,
    FormsModule,
    WorkerCardComponent,
    WorkerRowComponent,
    WorkerDetailModalComponent,
    DecimalPipe,
    InfoTooltipComponent,
    UnitTooltipComponent,
    IconComponent,
    ScrollFadeComponent,
    StickyHeaderDirective,
  ],
  templateUrl: './worker-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkerListComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workerService = inject(AdminWorkerService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly teamService = inject(TeamService);
  private readonly platformId = inject(PLATFORM_ID);
  public readonly auth = inject(AuthService);
  public readonly units = inject(UnitConversionService);
  private readonly glossary = inject(GlossaryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  public viewMode = input<'admin' | 'public'>('admin');
  public titleKey = input<string>('admin.workers.title');
  public setPageTitle = input<boolean>(true);

  /** Initial worker type to display (from route). */
  public initialWorkerType = input<WorkerType | null>(null);

  /** Worker ID to highlight and scroll to (from route). */
  public highlightWorkerId = input<string | null>(null);

  /**
   * The worker named by `?worker=` in the address, so a link from the review
   * can open this page on one worker's card, where pausing lives.
   */
  private readonly queryWorkerId = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('worker'))),
    { initialValue: null },
  );

  /** The worker to highlight: the one the route names, else the one the address names. */
  private readonly highlightedId = computed(
    () => this.highlightWorkerId() ?? this.queryWorkerId(),
  );

  /** Owner ID to filter by (from route). */
  public filterOwnerId = input<string | null>(null);

  /** Emits when the worker type tab changes. */
  public workerTypeChanged = output<WorkerType>();

  /** Emits when the user wants to clear the owner filter. */
  public ownerFilterCleared = output<void>();

  /** Emits when the user wants to clear the highlighted worker. */
  public highlightCleared = output<void>();

  // State
  public workers = signal<HordeWorker[]>([]);
  public teams = signal<Team[]>([]);
  public loading = signal<boolean>(true);
  public errorMessage = signal<string | null>(null);
  public filterText = signal<string>('');
  /** The text sections the viewer has folded. Both start open. */
  public foldedTextSections = signal<ReadonlySet<TextSectionId>>(new Set());
  public workerType = signal<WorkerType>('image');
  public sortKey = signal<SortKey>('name');
  public sortOrder = signal<SortOrder>('asc');
  public workerVersionsExpanded = signal<boolean>(false);
  public statisticsCollapsed = signal<boolean>(true);
  public deletionSuccessMessage = signal<boolean>(false);
  public readonly performanceStats = this.networkStatus.performance;

  // View mode (card | row)
  public workerViewMode = signal<'card' | 'row'>('card');

  // Modal state for row-click detail view
  public selectedWorker = signal<HordeWorker | null>(null);
  public detailModalOpen = signal<boolean>(false);

  /** Track whether initial type has been applied. */
  private initialTypeApplied = false;

  /** Track whether we need to scroll to highlighted worker. */
  private pendingScrollToWorker = false;

  constructor() {
    this.workerViewMode.set(this.loadWorkerViewModePreference());
    this.foldedTextSections.set(this.loadFoldedTextSections());

    effect(() => {
      this.storeWorkerViewModePreference(this.workerViewMode());
    });

    // Effect to apply initial worker type from route
    effect(() => {
      const initialType = this.initialWorkerType();
      if (initialType && !this.initialTypeApplied) {
        this.workerType.set(initialType);
        this.initialTypeApplied = true;
      }
    });

    // Effect to detect worker type and scroll to highlighted worker
    effect(() => {
      const workerId = this.highlightedId();
      const workers = this.workers();

      if (workerId && workers.length > 0 && !this.initialTypeApplied) {
        // Find the worker and determine its type
        const worker = workers.find((w) => w.id === workerId);
        if (worker) {
          this.workerType.set(worker.type);
          this.initialTypeApplied = true;
          this.pendingScrollToWorker = true;
        }
      }
    });

    // Once the highlighted worker's card is drawn, bring it into view.
    effect(() => {
      const workerId = this.highlightedId();
      if (!isPlatformBrowser(this.platformId)) return;
      if (!workerId || !this.pendingScrollToWorker) return;
      const section = this.workerSections().find((s) =>
        s.workers.some((w) => w.id === workerId),
      );
      if (!section) return;
      // When the address points at a worker in a folded section, that
      // section opens so the card can be shown. The stored choice does not
      // change.
      if (section.id && !this.isTextSectionOpen(section.id)) {
        const folded = new Set(this.foldedTextSections());
        folded.delete(section.id);
        this.foldedTextSections.set(folded);
      }
      this.pendingScrollToWorker = false;
      setTimeout(() =>
        document
          .querySelector(`[data-worker-id="${CSS.escape(workerId)}"]`)
          ?.scrollIntoView({ block: 'start' }),
      );
    });

    // Fetch workers only in the browser after rendering completes.
    // This prevents stale prerendered data from appearing during static builds.
    afterNextRender(() => {
      this.loadWorkers();
      this.loadTeams();
    });

    this.glossary.registerPageContext(WORKERS_GLOSSARY_CONTEXT);

    this.destroyRef.onDestroy(() => {
      this.glossary.clearPageContext('workers');
    });
  }

  public setWorkerType(type: WorkerType): void {
    if (this.workerType() === type) return;
    this.workerType.set(type);
    this.filterText.set('');
    // Reset sort key if MPS generated is selected but not available for this type
    if (type !== 'image' && this.sortKey() === 'megapixelsteps_generated') {
      this.sortKey.set('name');
    }
    // Emit the change
    this.workerTypeChanged.emit(type);
  }

  // Computed filtered and sorted workers
  public filteredWorkers = computed(() => {
    let result = this.workers().filter((w) => w.type === this.workerType());

    // Filter by owner ID if specified
    const ownerId = this.filterOwnerId();
    if (ownerId) {
      result = result.filter((w) => {
        // Extract the numeric ID from the owner's username (format: "alias#id")
        const ownerUserId = extractUserId(w.owner);
        return ownerUserId !== null && ownerUserId.toString() === ownerId;
      });
    }

    // Apply text filter (includes team name)
    const filter = this.filterText().toLowerCase();
    if (filter) {
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(filter) ||
          (w.owner ?? '').toLowerCase().includes(filter) ||
          w.id.toLowerCase().includes(filter) ||
          (w.bridge_agent ?? '').toLowerCase().includes(filter) ||
          (w.team?.name ?? '').toLowerCase().includes(filter),
      );
    }

    // Sort - if there's a highlighted worker, put it first
    const highlightId = this.highlightedId();
    const key = this.sortKey();
    const order = this.sortOrder();

    result = [...result].sort((a, b) => {
      // Always put highlighted worker first
      if (highlightId) {
        if (a.id === highlightId) return -1;
        if (b.id === highlightId) return 1;
      }

      let aVal: string | number = a[key] as string | number;
      let bVal: string | number = b[key] as string | number;

      // Handle performance as number
      if (key === 'performance') {
        aVal = this.units.parseWorkerPerformance(a.performance);
        bVal = this.units.parseWorkerPerformance(b.performance);
      }

      // Handle optional fields
      if (key === 'megapixelsteps_generated') {
        aVal = a.megapixelsteps_generated ?? 0;
        bVal = b.megapixelsteps_generated ?? 0;
      }

      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
        return order === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // Number comparison
      return order === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return result;
  });

  /**
   * The listed workers in display order, split on the text tab into chat
   * workers and the rest. When the horde does not send `accepts_chat_jobs`
   * for any text worker, the text tab shows one list. The check uses every
   * text worker, including filtered-out ones, so typing in the search box
   * does not switch the layout.
   */
  public readonly workerSections = computed((): WorkerSection[] => {
    const workers = this.filteredWorkers();
    const single: WorkerSection[] = [{ id: null, headingKey: null, workers }];
    if (this.workerType() !== 'text') return single;
    const hordeSendsChatField = this.workers().some(
      (w) => w.type === 'text' && w.accepts_chat_jobs !== undefined,
    );
    if (!hordeSendsChatField) return single;

    const sections: WorkerSection[] = [
      {
        id: 'chat',
        headingKey: 'admin.workers.sections.chat',
        workers: workers.filter((w) => w.accepts_chat_jobs === true),
      },
      {
        id: 'plain',
        headingKey: 'admin.workers.sections.plain',
        workers: workers.filter((w) => w.accepts_chat_jobs !== true),
      },
    ];
    return sections.filter((section) => section.workers.length > 0);
  });

  public isTextSectionOpen(id: TextSectionId): boolean {
    return !this.foldedTextSections().has(id);
  }

  public toggleTextSection(id: TextSectionId): void {
    const folded = new Set(this.foldedTextSections());
    if (folded.has(id)) {
      folded.delete(id);
    } else {
      folded.add(id);
    }
    this.foldedTextSections.set(folded);
    this.storeFoldedTextSections(folded);
  }

  /** Computed: whether the owner filter returned no results across all worker types */
  public readonly ownerNotFound = computed(() => {
    const ownerId = this.filterOwnerId();
    if (!ownerId) return false;
    // Check if we have workers loaded but none match the owner filter across ALL types
    const allWorkers = this.workers();
    if (this.loading() || allWorkers.length === 0) return false;

    // Check if any worker matches the owner ID (regardless of type)
    const hasAnyMatch = allWorkers.some((w) => {
      const ownerUserId = extractUserId(w.owner);
      return ownerUserId !== null && ownerUserId.toString() === ownerId;
    });
    return !hasAnyMatch;
  });

  /** Check if a worker is highlighted (for styling). */
  public isWorkerHighlighted(workerId: string): boolean {
    return this.highlightedId() === workerId;
  }

  /** Open the detail modal for a given worker (row click). */
  public openWorkerDetail(worker: HordeWorker): void {
    this.selectedWorker.set(worker);
    this.detailModalOpen.set(true);
  }

  /** Close the detail modal. */
  public closeWorkerDetail(): void {
    this.detailModalOpen.set(false);
    this.selectedWorker.set(null);
  }

  // Statistics computed signals
  public totalWorkers = computed(() => this.filteredWorkers().length);

  public totalThreads = computed(() =>
    this.filteredWorkers().reduce((sum, w) => sum + w.threads, 0),
  );

  public totalPerformance = computed(() => {
    const workers = this.filteredWorkers();
    if (workers.length === 0) return 0;

    const total = workers.reduce(
      (sum, w) => sum + this.units.parseWorkerPerformance(w.performance),
      0,
    );

    // For interrogation workers, return mean average
    if (this.workerType() === 'interrogation') {
      return total / workers.length;
    }

    // For image and text workers, return total
    return total;
  });

  public totalPerformanceUnit = computed(() => {
    return this.units.formatAggregateWorkerPerformance(
      this.totalPerformance(),
      this.workerType(),
    );
  });

  public recentThroughputUnit = computed((): SynthesizedUnit | null => {
    const stats = this.performanceStats();
    if (!stats) return null;
    const type = this.workerType();
    if (type === 'image') {
      return this.units.formatImagePerformanceRate(
        stats.past_minute_megapixelsteps,
      );
    }
    if (type === 'text') {
      return this.units.formatTextPerformanceRate(stats.past_minute_tokens);
    }
    return null;
  });

  public performanceLabel = computed(() => {
    if (this.workerType() === 'interrogation') {
      return 'seconds per form';
    }
    return this.workerType() === 'image' ? 'MPS/S' : 'tokens/s';
  });

  public workerVersions = computed(() => {
    const versions = new Map<string, number>();
    this.filteredWorkers().forEach((w) => {
      const agent = w.bridge_agent || 'Unknown';
      versions.set(agent, (versions.get(agent) || 0) + 1);
    });
    return Array.from(versions.entries())
      .map(([version, count]) => {
        const parsed = this.parseWorkerVersion(version);
        return { version, count, parsed };
      })
      .sort((a, b) => b.count - a.count);
  });

  private parseWorkerVersion(versionString: string): {
    displayName: string;
    url: string | null;
  } {
    // Split on first two colons: "Worker Name:Version:URL"
    const parts = versionString.split(':');

    if (parts.length >= 3) {
      const name = parts.at(0)?.trim() ?? '';
      const version = parts.at(1)?.trim() ?? '';
      const url = parts.slice(2).join(':').trim(); // Rejoin in case URL has colons

      return {
        displayName: `${name} v${version}`,
        url: url || null,
      };
    } else if (parts.length === 2) {
      const name = parts.at(0)?.trim() ?? '';
      const version = parts.at(1)?.trim() ?? '';
      return {
        displayName: `${name} v${version}`,
        url: null,
      };
    }

    // Fallback for strings that don't match the pattern
    return {
      displayName: versionString,
      url: null,
    };
  }

  public capabilityStats = computed((): CapabilityStat[] => {
    const workers = this.filteredWorkers();
    const capabilities: CapabilityStat[] = [];

    if (this.workerType() === 'text') {
      // The text counterpart of the image capabilities: the chat job kind
      // and the chat features most often used to filter workers. A worker
      // without a stored declaration counts only as a chat worker.
      const textCapabilities: {
        stat: CapabilityStat;
        has: (worker: HordeWorker, chat: WorkerChatDeclaration) => boolean;
      }[] = [
        {
          stat: stat('chat', 'admin.workers.text.chat_jobs'),
          has: () => true,
        },
        {
          stat: stat('chat_only', 'admin.workers.stats.chat_only'),
          has: (worker) => worker.accepts_prompt_jobs === false,
        },
        {
          stat: stat('reads_images', 'admin.workers.text.reads_images'),
          has: (_, chat) => chatReadsImages(chat),
        },
        {
          stat: stat('tools', 'admin.workers.chat.feature.tools.title'),
          has: (_, chat) => chatHasTools(chat),
        },
        {
          stat: stat(
            'json_schema',
            'admin.workers.chat.feature.json_schema.title',
          ),
          has: (_, chat) => chatHasJsonSchema(chat),
        },
      ];
      workers.forEach((w) => {
        if (!w.accepts_chat_jobs) return;
        const chat = w.chat ?? EMPTY_CHAT_DECLARATION;
        const performance = this.units.parseWorkerPerformance(w.performance);
        textCapabilities.forEach((entry) => {
          if (!entry.has(w, chat)) return;
          entry.stat.totalPerformance += performance;
          entry.stat.workerCount++;
        });
      });
      return textCapabilities
        .map((entry) => entry.stat)
        .filter((c) => c.workerCount > 0);
    }

    if (this.workerType() === 'image') {
      const img2img = { name: 'img2img', totalPerformance: 0, workerCount: 0 };
      const painting = {
        name: 'painting',
        totalPerformance: 0,
        workerCount: 0,
      };
      const postProcessing = {
        name: 'post-processing',
        totalPerformance: 0,
        workerCount: 0,
      };
      const lora = { name: 'lora', totalPerformance: 0, workerCount: 0 };
      const controlnet = {
        name: 'controlnet',
        totalPerformance: 0,
        workerCount: 0,
      };
      const sdxlControlnet = {
        name: 'sdxl_controlnet',
        totalPerformance: 0,
        workerCount: 0,
      };

      workers.forEach((w) => {
        const performance = this.units.parseWorkerPerformance(w.performance);
        if (w.img2img) {
          img2img.totalPerformance += performance;
          img2img.workerCount++;
        }
        if (w.painting) {
          painting.totalPerformance += performance;
          painting.workerCount++;
        }
        if (w['post-processing']) {
          postProcessing.totalPerformance += performance;
          postProcessing.workerCount++;
        }
        if (w.lora) {
          lora.totalPerformance += performance;
          lora.workerCount++;
        }
        if (w.controlnet) {
          controlnet.totalPerformance += performance;
          controlnet.workerCount++;
        }
        if (w.sdxl_controlnet) {
          sdxlControlnet.totalPerformance += performance;
          sdxlControlnet.workerCount++;
        }
      });

      return [
        img2img,
        painting,
        postProcessing,
        lora,
        controlnet,
        sdxlControlnet,
      ].filter((c) => c.workerCount > 0);
    }

    return capabilities;
  });

  ngOnInit(): void {
    if (this.setPageTitle()) {
      setPageTitle(
        this.translator,
        this.title,
        this.destroyRef,
        this.titleKey(),
      );
    }
  }

  private loadWorkers(): void {
    this.errorMessage.set(null);
    this.loading.set(true);
    this.workerService
      .getWorkers()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (workers) => {
          this.workers.set(workers);
          this.addHighlightedWorker(workers);
        },
        error: (err: unknown) => {
          this.errorMessage.set(
            extractApiError(err, 'Failed to load workers.'),
          );
          this.workers.set([]);
        },
      });
  }

  /**
   * The horde lists only workers that checked in lately, so a worker named
   * in the address can be missing from the list; it is read on its own and
   * added, so the link still opens on its card.
   */
  private addHighlightedWorker(workers: HordeWorker[]): void {
    const workerId = this.highlightedId();
    if (!workerId || workers.some((w) => w.id === workerId)) return;
    this.workerService
      .getWorker(workerId)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((worker) => {
        if (worker && !this.workers().some((w) => w.id === worker.id)) {
          this.workers.update((list) => [...list, worker]);
        }
      });
  }

  private loadTeams(): void {
    this.teamService
      .getTeams()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (teams) => {
          this.teams.set(teams);
        },
        error: () => {
          // Silently fail - teams are optional for display
          this.teams.set([]);
        },
      });
  }

  public refreshWorkers(): void {
    this.loadWorkers();
  }

  public onFilterChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filterText.set(target.value);
  }

  public onSortKeyChange(key: SortKey): void {
    this.sortKey.set(key);
  }

  public toggleSortOrder(): void {
    this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
  }

  public onWorkerUpdated(): void {
    this.loadWorkers();
  }

  public onWorkerDeleted(workerId: string): void {
    // Remove worker from the list immediately
    this.workers.update((workers) => workers.filter((w) => w.id !== workerId));
    // Show success toast
    this.deletionSuccessMessage.set(true);
    setTimeout(() => this.deletionSuccessMessage.set(false), 5000);
  }

  /**
   * Handle clearing the highlighted worker.
   * Scrolls to top and emits event for parent to handle navigation.
   */
  public onHighlightCleared(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (this.queryWorkerId() !== null && this.highlightWorkerId() === null) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { worker: null },
        queryParamsHandling: 'merge',
      });
    }
    this.highlightCleared.emit();
  }

  public toggleWorkerVersions(): void {
    this.workerVersionsExpanded.set(!this.workerVersionsExpanded());
  }

  public toggleStatistics(): void {
    this.statisticsCollapsed.set(!this.statisticsCollapsed());
  }

  public clearError(): void {
    this.errorMessage.set(null);
  }

  private loadWorkerViewModePreference(): 'card' | 'row' {
    if (!isPlatformBrowser(this.platformId)) return 'card';

    try {
      const stored = localStorage.getItem(WORKER_VIEW_MODE_STORAGE_KEY);
      return stored === 'row' ? 'row' : 'card';
    } catch {
      return 'card';
    }
  }

  private storeWorkerViewModePreference(mode: 'card' | 'row'): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      localStorage.setItem(WORKER_VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // localStorage may be unavailable
    }
  }

  /** Any storage problem leaves both sections open, so the workers stay in view. */
  private loadFoldedTextSections(): ReadonlySet<TextSectionId> {
    if (!isPlatformBrowser(this.platformId)) return new Set();

    try {
      const stored = localStorage.getItem(TEXT_SECTIONS_FOLDED_STORAGE_KEY);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(parsed)) return new Set();
      const list: unknown[] = parsed;
      return new Set(TEXT_SECTION_IDS.filter((id) => list.includes(id)));
    } catch {
      return new Set();
    }
  }

  private storeFoldedTextSections(folded: ReadonlySet<TextSectionId>): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      localStorage.setItem(
        TEXT_SECTIONS_FOLDED_STORAGE_KEY,
        JSON.stringify([...folded]),
      );
    } catch {
      // localStorage may be unavailable
    }
  }
}
