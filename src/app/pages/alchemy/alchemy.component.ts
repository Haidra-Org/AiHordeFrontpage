import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  NgZone,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  DecimalPipe,
  NgTemplateOutlet,
  isPlatformBrowser,
} from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../services/auth.service';
import { DatabaseService } from '../../services/database.service';
import { NetworkStatusService } from '../../services/network-status.service';
import { AlchemyQueueService } from '../../services/alchemy-queue.service';
import { ToastService } from '../../services/toast.service';
import { TranslatorService } from '../../services/translator.service';
import { setPageTitle } from '../../helper/page-title';
import {
  ALCHEMY_DATA_FORMS,
  ALCHEMY_POST_PROCESSOR_FORMS,
  AlchemyFormName,
  InterrogationRequest,
} from '../../types/generation';
import { AlchemyImageInputComponent } from '../../components/alchemy/alchemy-image-input/alchemy-image-input.component';
import { GsHelpComponent } from '../../components/gs-help/gs-help.component';
import { GsParamEntryComponent } from '../../components/gs-param-entry/gs-param-entry.component';
import { GsSheetComponent } from '../../components/gs-sheet/gs-sheet.component';
import { GsHelpDockService } from '../../services/gs-help-dock.service';
import { GlossaryService } from '../../services/glossary.service';
import { SECTION_IDENTITIES } from '../../content/sections';
import { alchemyTopic, referenceTopic } from '../../content/reference-topics';
import {
  ALCHEMY_ANALYSIS_FORMS,
  ALCHEMY_BACKGROUND_FORMS,
  ALCHEMY_ENLARGE_FORMS,
  ALCHEMY_FACE_FIXER_FORMS,
  ALCHEMY_UPSCALER_FORMS,
  alchemyUseCaseForGroup,
} from '../../content/alchemy-usecases';
import { StudioHandoffService } from '../../services/studio-handoff.service';
import { AlchemyResultsBrowserComponent } from '../../components/alchemy/alchemy-results-browser/alchemy-results-browser.component';
import { IconComponent } from '../../components/icon/icon.component';
import { buildAlchemyJobArchive } from '../../helper/alchemy-archive';
import { AlchemyJob, isJobSettled } from '../../helper/alchemy-job-view';
import { StudioImageDropDirective } from '../../helper/studio-image-drop.directive';
import { PanelSize, cyclePanelSize } from '../generate/generate-form.model';

/** The key the developer surface documents an anonymous call with. */
const ANONYMOUS_API_KEY = '0000000000';

/** Gallery density (columns per row), persisted so it sticks across sessions. */
const GALLERY_PER_ROW_OPTIONS = [2, 3, 4, 5, 6] as const;
const GALLERY_PER_ROW_KEY = 'aihorde.alchemy.gallery.perRow';
const GALLERY_DEFAULT_PER_ROW = 4;

/** Results presentation (thumb rail + detail, or tiled gallery), persisted. */
const VIEW_MODE_OPTIONS = ['detail', 'gallery'] as const;
const VIEW_MODE_KEY = 'aihorde.alchemy.view';
const VIEW_MODE_DEFAULT: AlchemyViewMode = 'detail';

type AlchemyViewMode = (typeof VIEW_MODE_OPTIONS)[number];

/** The two surfaces of the page: the tool itself, and the API documentation. */
type AlchemyTab = 'tool' | 'developers';

/** Public base URL of the Horde REST API, as quoted in the developer surface. */
const API_BASE_URL = 'https://aihorde.net/api/v2';

/** What the encoded source image stands as in the documented request. */
const BASE64_PLACEHOLDER = '{base64}';

/**
 * How much of the encoded source the full-request modal shows. The picker
 * accepts up to four megabytes, and a string that long in a `<pre>` stalls the
 * page as the modal opens; the head of it is enough to recognise, and the copy
 * button carries the rest.
 */
const SOURCE_PREVIEW_CHARS = 2_000;

/**
 * The reference topic a panel operation group's `?` opens. Empty for a group
 * the registry does not document, which the card renders no glyph for: an
 * unanswerable question is worse than none.
 */
function helpTopicForGroup(groupId: string): string {
  const useCase = alchemyUseCaseForGroup(groupId);
  return useCase ? alchemyTopic(useCase.id) : '';
}

/** A labelled slice of a group's forms, for use-case sub-grouping. */
interface AlchemyOperationSubGroup {
  labelKey: string;
  forms: readonly AlchemyFormName[];
}

interface AlchemyOperationGroup {
  id: string;
  icon: string;
  /**
   * The reference topic the card's `?` opens: the use case this group of forms
   * is the tool's half of. Taken from the registry rather than written here, so
   * a card cannot come to offer a note about something else.
   */
  helpTopic: string;
  titleKey: string;
  outputKey: string;
  blurbKey: string;
  forms: readonly AlchemyFormName[];
  /**
   * When set, the group renders these labelled sub-groups (full-width, one form
   * per line) instead of the flat two-column grid — used for the upscalers,
   * whose long names don't fit two-up and read better split by use case.
   */
  subGroups?: readonly AlchemyOperationSubGroup[];
}

@Component({
  selector: 'app-alchemy',
  imports: [
    TranslocoPipe,
    DecimalPipe,
    NgTemplateOutlet,
    RouterLink,
    AlchemyImageInputComponent,
    AlchemyResultsBrowserComponent,
    StudioImageDropDirective,
    IconComponent,
    GsHelpComponent,
    GsParamEntryComponent,
    GsSheetComponent,
  ],
  templateUrl: './alchemy.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlchemyComponent {
  private readonly auth = inject(AuthService);
  public readonly ns = inject(NetworkStatusService);
  private readonly queue = inject(AlchemyQueueService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly translator = inject(TranslatorService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly db = inject(DatabaseService);
  private readonly handoff = inject(StudioHandoffService);

  /** The source picker, so an image handed over from /generate can be applied. */
  private readonly imageInput = viewChild(AlchemyImageInputComponent);
  /* The two ends of the trip into the documentation: each hands the focus to
     the other, so the way back is never something to go hunting for. */
  private readonly apiButton =
    viewChild<ElementRef<HTMLButtonElement>>('apiButton');
  private readonly devBackButton =
    viewChild<ElementRef<HTMLButtonElement>>('devBackButton');

  public readonly dataForms = ALCHEMY_DATA_FORMS;
  public readonly postProcessorForms = ALCHEMY_POST_PROCESSOR_FORMS;

  /**
   * The forms split into the groups shown in the builder, so each fieldset can
   * carry its own explanation of what its options do instead of one
   * undifferentiated "enhance" bucket. The lists are the use-case registry's
   * operable ones, which is also what the documentation pages are built from:
   * the tool and the book cannot come to disagree about which forms enlarge a
   * picture, and a form the registry documents but the studio cannot submit
   * never reaches a checkbox. `dataForms` and `postProcessorForms` above are
   * kept as-is for the developers tab's plain form-name reference.
   */
  public readonly analysisForms = ALCHEMY_ANALYSIS_FORMS;
  public readonly enlargeForms = ALCHEMY_ENLARGE_FORMS;
  public readonly faceFixerForms = ALCHEMY_FACE_FIXER_FORMS;
  public readonly backgroundForms = ALCHEMY_BACKGROUND_FORMS;

  /** Enlargers split by use case, so their long names get a full line each. */
  private readonly enlargeSubGroups: readonly AlchemyOperationSubGroup[] = [
    {
      labelKey: 'alchemy.forms.upscale_photo',
      forms: [
        'RealESRGAN_x4plus',
        'RealESRGAN_x2plus',
        '4xNomosWebPhoto_RealPLKSR',
        '4xNomos2_realplksr_dysample',
        'NMKD_Siax',
      ],
    },
    {
      labelKey: 'alchemy.forms.upscale_anime',
      forms: [
        'RealESRGAN_x4plus_anime_6B',
        '4x_AnimeSharp',
        '2xModernSpanimationV1',
      ],
    },
    {
      labelKey: 'alchemy.forms.upscale_general',
      forms: ['4xLSDIRplus', '4xNomos8kSC', '4xNomos2_hq_dat2'],
    },
    {
      // Not an upscaler, but the same wish: an SVG has no resolution to run out
      // of. It gets its own row so nobody reads it as a four-times model.
      labelKey: 'alchemy.forms.upscale_vector',
      forms: ['vectorize'],
    },
  ];

  public readonly operationGroups: readonly AlchemyOperationGroup[] = [
    {
      id: 'analyze',
      icon: 'document-text',
      helpTopic: helpTopicForGroup('analyze'),
      titleKey: 'alchemy.forms.analyze_title',
      outputKey: 'alchemy.forms.analyze_output',
      blurbKey: 'alchemy.forms.analyze_blurb',
      forms: this.analysisForms,
    },
    {
      id: 'upscale',
      icon: 'photo',
      helpTopic: helpTopicForGroup('upscale'),
      titleKey: 'alchemy.forms.upscale_title',
      outputKey: 'alchemy.forms.upscale_output',
      blurbKey: 'alchemy.forms.upscale_blurb',
      forms: this.enlargeForms,
      subGroups: this.enlargeSubGroups,
    },
    {
      id: 'facefix',
      icon: 'paintbrush',
      helpTopic: helpTopicForGroup('facefix'),
      titleKey: 'alchemy.forms.facefix_title',
      outputKey: 'alchemy.forms.facefix_output',
      blurbKey: 'alchemy.forms.facefix_blurb',
      forms: this.faceFixerForms,
    },
    {
      id: 'background',
      icon: 'cube-transparent',
      helpTopic: helpTopicForGroup('background'),
      titleKey: 'alchemy.forms.background_title',
      outputKey: 'alchemy.forms.background_output',
      blurbKey: 'alchemy.forms.background_blurb',
      forms: this.backgroundForms,
    },
  ];

  /**
   * The reference entry the panel is showing, docked beside the results on a
   * wide screen and in the sheet on a phone. The same service the image studio
   * uses: at most one entry is open page-wide either way, and the topic it
   * holds is the one both mountings read.
   */
  public readonly helpDock = inject(GsHelpDockService);
  /* Below 1024px the tool switcher is a bottom bar and carries nothing but the
     tools, so this header is the studio's top line and the place the glossary
     is reached from. The shell's copy takes over from 1024px up. */
  public readonly glossary = inject(GlossaryService);

  /** The title the sheet's bar carries, asked of whichever registry owns it. */
  public readonly helpDockTitleKey = computed(
    () => referenceTopic(this.helpDock.topic() ?? '')?.titleKey ?? '',
  );

  /** The studio's own mark and hue, worn by every operation card. */
  public readonly identity = SECTION_IDENTITIES.alchemy;

  /** The modal holding the request body with nothing stood in for. */
  public readonly fullPayloadOpen = signal(false);
  public readonly activeOperation = signal<AlchemyFormName>('caption');

  /**
   * The operation whose info modal is open, or null. On mobile there is no
   * hover and the description dock is off-screen, so each operation row's (i)
   * button opens its description + example here instead.
   */
  public readonly infoForm = signal<AlchemyFormName | null>(null);

  public openInfo(form: AlchemyFormName, event: Event): void {
    // The (i) lives inside the operation's <label>; stop the click from also
    // toggling that operation's checkbox.
    event.preventDefault();
    event.stopPropagation();
    this.infoForm.set(form);
  }

  public closeInfo(): void {
    this.infoForm.set(null);
  }

  /** Close the info modal only when its backdrop (not the panel) is clicked. */
  public onInfoBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeInfo();
    }
  }

  public openFullPayload(): void {
    this.fullPayloadOpen.set(true);
  }

  public closeFullPayload(): void {
    this.fullPayloadOpen.set(false);
  }

  /** Close the request modal only when its backdrop is clicked. */
  public onFullPayloadBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeFullPayload();
    }
  }

  /** How wide the control panel is expanded (normal/double/full). UI-only. */
  public readonly panelSize = signal<PanelSize>('normal');

  /**
   * Step the panel one width wider, wrapping `full` back to `normal`. Backs the
   * single expand/collapse toggle in the header.
   */
  public cyclePanel(): void {
    this.panelSize.update((size) => cyclePanelSize(size));
  }

  /** Operation groups the user has collapsed. Empty = all expanded (default). */
  public readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());

  public isGroupCollapsed(id: string): boolean {
    return this.collapsedGroups().has(id);
  }

  public toggleGroup(id: string): void {
    this.collapsedGroups.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  public readonly allGroupsCollapsed = computed(
    () => this.collapsedGroups().size === this.operationGroups.length,
  );

  /** Fold every family shut, or, once they all are, open them all again. */
  public toggleAllGroups(): void {
    this.collapsedGroups.set(
      this.allGroupsCollapsed()
        ? new Set()
        : new Set(this.operationGroups.map((group) => group.id)),
    );
  }

  /**
   * Which surface is on screen. The docs are a reference detour taken while a
   * request may still be running, so the tool is hidden rather than torn down,
   * and the choice is not persisted or reflected in the URL: the studio's own
   * tabs are routes, and this page has no query-parameter state of its own.
   * The header's API button is the only way in and the crumb the only way out,
   * so the documentation costs the tool no standing row of screen.
   */
  public readonly activeTab = signal<AlchemyTab>('tool');

  public readonly apiBaseUrl = API_BASE_URL;
  public readonly submitEndpointUrl = `${API_BASE_URL}/interrogate/async`;

  public setTab(tab: AlchemyTab): void {
    this.activeTab.set(tab);
  }

  /**
   * Static API status sample for the request-preview modal. Kept as a component
   * string because its JSON braces would otherwise collide with Angular's
   * control-flow block syntax in the template.
   */
  public readonly statusSample = `{
  "state": "done",
  "forms": [
    { "form": "caption", "state": "done",
      "result": { "caption": "a black dog sitting on the ground" } },
    { "form": "RealESRGAN_x4plus", "state": "done",
      "result": { "RealESRGAN_x4plus": "https://...r2...webp?X-Amz-Expires=1800" } }
  ]
}`;

  public readonly sourceImage = signal<string | null>(null);
  public readonly selectedForms = signal<Set<AlchemyFormName>>(new Set());
  public readonly slowWorkers = signal(true);

  public readonly isSubmitting = signal(false);
  /**
   * Tracked requests come from the queue service rather than this page, so a
   * job keeps advancing (and its result images keep being captured before their
   * links expire) while the reader is somewhere else in the app.
   */
  public readonly jobs = computed<AlchemyJob[]>(() => {
    const thumbs = this.thumbUrls();
    const full = this.sourceFullUrl();
    const selected = this.selectedJobId();
    return this.queue.jobs().map((job) => ({
      ...job,
      sourceThumb: thumbs.get(job.localId) ?? job.sourceThumb,
      sourceFull:
        job.id === selected ? (full ?? job.sourceFull) : job.sourceFull,
    }));
  });

  /**
   * Renderable source images: object URLs over the stored blobs, so they belong
   * to this page and are revoked when it goes away. Thumbnails are held for
   * every job (a few kilobytes each); the full-size source only for the job on
   * screen, since holding one per job would pin the whole history in memory.
   */
  private readonly thumbUrls = signal<ReadonlyMap<string, string>>(new Map());
  private readonly sourceFullUrl = signal<string | null>(null);
  private readonly loadedThumbs = new Set<string>();
  public readonly downloadingJobId = signal<string | null>(null);

  /**
   * The job whose results are shown in the detail region. Distinct from
   * `selectedJobIds` below (the delete set): this is a single "which job am I
   * looking at", that one is "which jobs are marked for removal".
   */
  public readonly selectedJobId = signal<string | null>(null);
  public readonly selectedJob = computed(
    () => this.jobs().find((j) => j.id === this.selectedJobId()) ?? null,
  );

  /**
   * How the results pane presents jobs: `detail` is the source-thumbnail rail
   * (vertical desktop / sticky carousel mobile) beside the selected job's
   * results; `gallery` is a full-pane tile grid of every request. Persisted
   * across sessions.
   */
  public readonly viewMode = signal<AlchemyViewMode>(this.loadViewMode());

  /** Gallery density (columns per row), persisted across sessions. */
  public readonly galleryPerRowOptions = GALLERY_PER_ROW_OPTIONS;
  public readonly galleryColumns = signal<number>(this.loadGalleryColumns());
  public readonly galleryGridColumns = computed(
    () => `repeat(${this.galleryColumns()}, minmax(0, 1fr))`,
  );

  /**
   * Select-to-delete for tracked job cards, mirroring the image results grid.
   * Deleting a card just stops tracking it (results are server-side and expire
   * on their own), but it is still gated behind an explicit select + confirm so
   * a stray tap can't wipe the list.
   */
  public readonly selectMode = signal(false);
  public readonly selectedJobIds = signal<ReadonlySet<string>>(new Set());
  public readonly selectedJobCount = computed(() => this.selectedJobIds().size);
  private readonly pendingDelete = signal<readonly string[]>([]);
  public readonly confirmDeleteOpen = computed(
    () => this.pendingDelete().length > 0,
  );
  public readonly pendingDeleteCount = computed(
    () => this.pendingDelete().length,
  );

  /**
   * The job a submission just added, so its card can pulse into view instead
   * of silently appearing at the top of a list the user may not be looking
   * at. Cleared a couple seconds after it's set.
   */
  public readonly justAddedJobId = signal<string | null>(null);

  /** Jobs still in flight, for the flow connector's live status line. */
  public readonly pendingJobsCount = computed(
    () => this.jobs().filter((j) => !isJobSettled(j)).length,
  );

  public readonly hasAnyJobs = computed(() => this.jobs().length > 0);

  /**
   * True below the studio's tablet breakpoint. Drives the responsive split
   * between the desktop rail beside a detail pane and the mobile sticky carousel
   * above an inline detail block. Kept in sync with a media query.
   */
  public readonly isNarrow = signal(false);

  public readonly isLoggedIn = this.auth.isLoggedIn;

  public readonly hasSource = computed(() => this.sourceImage() !== null);
  public readonly selectedCount = computed(() => this.selectedForms().size);

  public readonly canSubmit = computed(
    () =>
      !this.isSubmitting() &&
      this.sourceImage() !== null &&
      this.selectedForms().size > 0,
  );

  /** A backed-up queue (>50) is the trigger above this line. */
  private static readonly QUEUE_BACKLOG_THRESHOLD = 20;

  /**
   * Why the alchemy pool needs help, so the nudge can name the real cause:
   * a thin worker pool (which can happen with an empty queue) reads as a
   * worker shortage, not a backlog. Only call it a backlog when the queue
   * is actually deep.
   */
  public readonly alchemyHelpReason = computed<'workers' | 'queue' | null>(
    () => {
      if (!this.ns.alchemyNeedsHelp()) return null;
      const perf = this.ns.performance();
      if (!perf) return null;
      return perf.queued_forms < AlchemyComponent.QUEUE_BACKLOG_THRESHOLD
        ? 'workers'
        : 'queue';
    },
  );

  constructor() {
    // Thumbnails for every job, so the rail and gallery are populated as soon
    // as the queue hands over a restored history.
    effect(() => {
      for (const job of this.queue.jobs()) {
        if (!this.loadedThumbs.has(job.localId)) {
          this.loadedThumbs.add(job.localId);
          void this.loadThumbnail(job.localId);
        }
      }
      this.revokeDepartedThumbs();
    });

    // The full-size source, for the one job whose detail view can show it.
    effect(() => void this.loadSelectedSource(this.selectedJob()?.localId));

    this.destroyRef.onDestroy(() => this.revokeAllSourceUrls());

    // The dock is page-wide state and the image studio mounts it too, so an
    // entry left open here would follow the reader across the tab bar.
    this.destroyRef.onDestroy(() => this.helpDock.close());

    afterNextRender(() => {
      setPageTitle(
        this.translator,
        this.title,
        this.destroyRef,
        'alchemy.title',
      );
      void this.selectNewestJob();
      this.watchViewport();
      void this.consumeHandoff();
    });
  }

  /** Track the narrow-viewport breakpoint (matches the CSS mobile breakpoint)
      so signal-driven trimming stays in sync as the window is resized. */
  private watchViewport(): void {
    const mq = globalThis.matchMedia?.('(max-width: 1023.98px)');
    if (!mq) return;
    this.isNarrow.set(mq.matches);
    const onChange = (event: MediaQueryListEvent): void =>
      this.isNarrow.set(event.matches);
    mq.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => mq.removeEventListener('change', onChange));
  }

  /**
   * Show the developer surface, and give it the focus so the way back is the
   * next thing a keyboard reaches.
   */
  public openApi(): void {
    this.setTab('developers');
    afterNextRender(() => this.devBackButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /** Back to the tool, with the focus returned to the button that left it. */
  public closeApi(): void {
    // The request modal belongs to the surface being left, so it goes with it
    // rather than standing over the tool with nothing behind it.
    this.closeFullPayload();
    this.setTab('tool');
    afterNextRender(() => this.apiButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /**
   * The `/interrogate/async` body the current source and selected operations
   * would submit. One builder for the documentation and for `submit()`, so the
   * example on screen cannot drift away from what the tool sends.
   */
  private requestBody(source: string): InterrogationRequest {
    const forms = [...this.selectedForms()];
    return {
      forms: (forms.length > 0 ? forms : ['caption' as AlchemyFormName]).map(
        (name) => ({ name }),
      ),
      source_image: source,
      slow_workers: this.slowWorkers(),
    };
  }

  /**
   * A URL source is a short string worth reading; anything else is the encoded
   * image, which the picker hands over as bare base64 rather than a data URL.
   * The distinction has to be made this way round: a test for a `data:` prefix
   * never matches, and the whole encoded image lands in the example.
   */
  private isUrlSource(source: string): boolean {
    return /^https?:\/\//i.test(source);
  }

  /**
   * The request as the documentation shows it: the image stands as a
   * placeholder rather than the megabytes it really is, which no reader can
   * take anything from and which a `<pre>` lays out one glyph at a time.
   */
  public readonly apiPayload = computed(() => {
    const source = this.sourceImage();
    return JSON.stringify(
      {
        ...this.requestBody(source ?? ''),
        source_image:
          source && this.isUrlSource(source) ? source : BASE64_PLACEHOLDER,
      },
      null,
      2,
    );
  });

  /** The same request with nothing stood in for: what a caller would send. */
  public readonly apiPayloadFull = computed(() =>
    JSON.stringify(this.requestBody(this.sourceImage() ?? ''), null, 2),
  );

  /** How long the real body is, for the note under the shortened preview. */
  public readonly apiPayloadLength = computed(
    () => this.apiPayloadFull().length,
  );

  /** Whether the preview below is standing in for a longer body. */
  public readonly apiPayloadTruncated = computed(
    () => (this.sourceImage() ?? '').length > SOURCE_PREVIEW_CHARS,
  );

  /**
   * The real body with a long source cut short for display. The encoded image
   * runs to four megabytes at the picker's limit, and a string that size in a
   * `<pre>` stalls the page as it opens, so the modal reads a head of it and
   * the copy button is what carries the whole thing.
   */
  public readonly apiPayloadPreview = computed(() => {
    const source = this.sourceImage();
    if (!source || !this.apiPayloadTruncated()) {
      return this.apiPayloadFull();
    }
    return JSON.stringify(
      {
        ...this.requestBody(source),
        source_image: `${source.slice(0, SOURCE_PREVIEW_CHARS)}…`,
      },
      null,
      2,
    );
  });

  /**
   * The documented request for the developer surface: the shown body under the
   * two headers a caller has to send.
   */
  public readonly devRequestSample = computed(
    () =>
      `apikey: ${ANONYMOUS_API_KEY}\nContent-Type: application/json\n\n${this.apiPayload()}`,
  );

  /** Put the whole request body, image and all, on the clipboard. */
  public async copyApiPayload(): Promise<void> {
    if (
      !isPlatformBrowser(this.platformId) ||
      typeof navigator === 'undefined' ||
      !navigator.clipboard
    ) {
      return;
    }
    try {
      await navigator.clipboard.writeText(this.apiPayloadFull());
      this.toast.success('alchemy.api.copied', { transloco: true });
    } catch {
      this.toast.error('alchemy.api.copy_failed', { transloco: true });
    }
  }

  /**
   * Pick up an image sent here from the image studio, if one is waiting. It is
   * consumed unconditionally so a later visit never re-applies a stale image.
   */
  private async consumeHandoff(): Promise<void> {
    const pending = this.handoff.consume();
    const input = this.imageInput();
    if (!pending || !input) {
      return;
    }
    await input.applyBlob(pending.blob, pending.mimeType);
  }

  public onSourceImage(value: string | null): void {
    this.sourceImage.set(value);
  }

  /**
   * Adopt an image pasted onto the page or dropped on the workspace as the
   * source, through the picker's own encode path so the size guard and its own
   * error messaging apply exactly as for a picked file.
   */
  public async onDroppedImage(file: File): Promise<void> {
    const input = this.imageInput();
    if (!input) {
      return;
    }
    await input.applyBlob(file, file.type);
  }

  /** A paste or drop carried files, but no image among them. */
  public onRejectedImage(): void {
    this.toast.error('alchemy.image_input.not_an_image', { transloco: true });
  }

  public isFormSelected(form: AlchemyFormName): boolean {
    return this.selectedForms().has(form);
  }

  public toggleForm(form: AlchemyFormName): void {
    this.activeOperation.set(form);
    this.selectedForms.update((current) => {
      const next = new Set(current);
      if (next.has(form)) {
        next.delete(form);
      } else {
        next.add(form);
      }
      return next;
    });
  }

  public previewForm(form: AlchemyFormName): void {
    this.activeOperation.set(form);
  }

  public hasExample(form: AlchemyFormName): boolean {
    // strip_background is the only form without an example entry
    return form !== 'strip_background';
  }

  /** True for the forms that carry a scale badge, which vectorize does not. */
  public isUpscalerForm(form: AlchemyFormName): boolean {
    return ALCHEMY_UPSCALER_FORMS.includes(form);
  }

  public toggleSlowWorkers(): void {
    this.slowWorkers.update((v) => !v);
  }

  public submit(): void {
    const source = this.sourceImage();
    const forms = [...this.selectedForms()];
    if (!source || forms.length === 0 || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    void this.queue
      .submit({ forms, slowWorkers: this.slowWorkers(), source })
      .then((id) => {
        this.isSubmitting.set(false);
        if (!id) {
          this.toast.error('alchemy.submit.error', { transloco: true });
          return;
        }
        this.announceNewJob(id);
        this.toast.success('alchemy.submit.success', { transloco: true });
      });
  }

  /** Rail/carousel/tile activation: show the picked job's results. */
  public selectJob(id: string): void {
    this.selectedJobId.set(id);
    if (this.viewMode() === 'gallery') {
      // The gallery has no results area of its own, so a tile tap has to drop
      // back to the detail view or the pick would appear to do nothing.
      this.setViewMode('detail');
    }
  }

  public setViewMode(mode: AlchemyViewMode): void {
    this.viewMode.set(mode);
    this.db.store(VIEW_MODE_KEY, mode);
  }

  private loadViewMode(): AlchemyViewMode {
    const stored = this.db.get(VIEW_MODE_KEY);
    for (const mode of VIEW_MODE_OPTIONS) {
      if (stored === mode) return mode;
    }
    return VIEW_MODE_DEFAULT;
  }

  public setGalleryColumns(count: number): void {
    const min = GALLERY_PER_ROW_OPTIONS[0];
    const max = GALLERY_PER_ROW_OPTIONS[GALLERY_PER_ROW_OPTIONS.length - 1];
    const clamped = Math.min(max, Math.max(min, count));
    this.galleryColumns.set(clamped);
    this.db.store(GALLERY_PER_ROW_KEY, clamped);
  }

  private loadGalleryColumns(): number {
    const stored = this.db.get(GALLERY_PER_ROW_KEY);
    if (
      typeof stored === 'number' &&
      (GALLERY_PER_ROW_OPTIONS as readonly number[]).includes(stored)
    ) {
      return stored;
    }
    if (typeof window === 'undefined') return GALLERY_DEFAULT_PER_ROW;
    const width = window.innerWidth;
    if (width < 640) return 2;
    if (width < 1024) return 3;
    return GALLERY_DEFAULT_PER_ROW;
  }

  /**
   * The connector link between the builder and the results below it. Used
   * both for the static "results will appear below" hint and, once jobs
   * exist, the live "jump to results" affordance.
   */
  public scrollToResultsSection(event?: Event): void {
    event?.preventDefault();
    this.focusElementById('alchemy-results');
  }

  public cancelJob(id: string): void {
    const localId = this.localIdFor(id);
    if (localId) void this.queue.cancel(localId);
  }

  public async downloadJobResults(job: AlchemyJob): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const status = job.status;
    if (!status || this.downloadingJobId() !== null) return;

    this.downloadingJobId.set(job.id);
    try {
      const { bytes, imageCount, failedImages } = await buildAlchemyJobArchive(
        job.id,
        status,
      );
      this.triggerZipDownload(bytes, `alchemy-${job.id}.zip`);

      if (imageCount === 0 && failedImages > 0) {
        this.toast.error('alchemy.jobs.download_images_failed', {
          transloco: true,
        });
      } else if (failedImages > 0) {
        this.toast.warning('alchemy.jobs.download_partial', {
          transloco: true,
        });
      }
    } catch {
      this.toast.error('alchemy.jobs.download_error', { transloco: true });
    } finally {
      this.downloadingJobId.set(null);
    }
  }

  private triggerZipDownload(bytes: Uint8Array, fileName: string): void {
    const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = fileName;
    globalThis.document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /** Enter/leave select mode, dropping any marks when leaving. */
  public toggleSelectMode(): void {
    const next = !this.selectMode();
    this.selectMode.set(next);
    if (!next) {
      this.selectedJobIds.set(new Set());
    }
  }

  public isJobSelected(id: string): boolean {
    return this.selectedJobIds().has(id);
  }

  public toggleJobSelected(id: string): void {
    this.selectedJobIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /** Open the confirmation dialog for a specific set of tracked jobs. */
  public requestDeleteJobs(ids: readonly string[]): void {
    const filtered = ids.filter((id) => id.length > 0);
    if (filtered.length > 0) {
      this.pendingDelete.set(filtered);
    }
  }

  public requestDeleteSelected(): void {
    this.requestDeleteJobs([...this.selectedJobIds()]);
  }

  public cancelDelete(): void {
    this.pendingDelete.set([]);
  }

  /** Close the confirm dialog only when its backdrop (not the panel) is clicked. */
  public onConfirmBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancelDelete();
    }
  }

  /** Stop tracking the confirmed jobs, then leave select mode. */
  public confirmDelete(): void {
    const ids = new Set(this.pendingDelete());
    this.pendingDelete.set([]);
    if (ids.size === 0) {
      return;
    }
    void this.queue.deleteJobs(
      [...ids].map((id) => this.localIdFor(id)).filter((id) => id !== null),
    );
    this.reconcileSelectedJob();
    this.selectedJobIds.set(new Set());
    this.selectMode.set(false);
  }

  /**
   * Keep `selectedJobId` pointing at a job that still exists: after a delete or
   * prune, fall back to the newest remaining job (or nothing).
   */
  private reconcileSelectedJob(): void {
    const current = this.selectedJobId();
    if (current !== null && this.jobs().some((j) => j.id === current)) return;
    this.selectedJobId.set(this.jobs()[0]?.id ?? null);
  }

  /**
   * Bring the newest request forward: it becomes the shown job, is flagged for
   * the arrival highlight, and takes the focus so its results are what the next
   * keyboard step reaches.
   */
  private announceNewJob(id: string): void {
    this.selectedJobId.set(id);
    this.justAddedJobId.set(id);
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        if (this.justAddedJobId() === id) this.justAddedJobId.set(null);
      }, 2500);
    }
    this.focusElementById(`alchemy-rail-${id}`);
  }

  /** Show the newest restored request once the queue has loaded its history. */
  private async selectNewestJob(): Promise<void> {
    await this.queue.whenReady();
    if (this.selectedJobId() === null) {
      this.selectedJobId.set(this.jobs()[0]?.id ?? null);
    }
  }

  private localIdFor(id: string): string | null {
    return this.jobs().find((job) => job.id === id)?.localId ?? null;
  }

  /**
   * Scrolls an element into view and moves accessibility focus to it. Runs on
   * a macrotask so the DOM node exists after the triggering signal update has
   * rendered, and respects the reduced-motion preference for the scroll.
   */
  private focusElementById(id: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      const el = globalThis.document.getElementById(id);
      if (!el) return;
      const reduceMotion = globalThis.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      el.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      el.focus({ preventScroll: true });
    }, 0);
  }

  // --- Stored source images ------------------------------------------------

  private async loadThumbnail(localId: string): Promise<void> {
    const stored = await this.queue.getThumbnail(localId);
    if (!stored) return;
    const url = URL.createObjectURL(stored.blob);
    this.thumbUrls.update((map) => new Map(map).set(localId, url));
  }

  /** Release thumbnails for jobs that have left the list. */
  private revokeDepartedThumbs(): void {
    const live = new Set(this.queue.jobs().map((job) => job.localId));
    const current = this.thumbUrls();
    const departed = [...current.keys()].filter((id) => !live.has(id));
    for (const id of departed) {
      this.loadedThumbs.delete(id);
    }
    if (departed.length === 0) return;
    this.thumbUrls.update((map) => {
      const next = new Map(map);
      for (const id of departed) {
        URL.revokeObjectURL(next.get(id) as string);
        next.delete(id);
      }
      return next;
    });
  }

  private async loadSelectedSource(localId: string | undefined): Promise<void> {
    const previous = this.sourceFullUrl();
    if (previous) URL.revokeObjectURL(previous);
    this.sourceFullUrl.set(null);
    if (!localId) return;

    const stored = await this.queue.getSourceImage(localId);
    // The selection can move while the read is in flight; a URL for a job no
    // longer on screen would leak, so it is dropped rather than published.
    if (!stored || this.selectedJob()?.localId !== localId) return;
    this.sourceFullUrl.set(URL.createObjectURL(stored.blob));
  }

  private revokeAllSourceUrls(): void {
    for (const url of this.thumbUrls().values()) {
      URL.revokeObjectURL(url);
    }
    const full = this.sourceFullUrl();
    if (full) URL.revokeObjectURL(full);
  }
}
