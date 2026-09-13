import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import {
  PromptDraftChange,
  PromptDraftInput,
  PromptDraftModelPick,
  PromptDraftOrigin,
  PromptDraftService,
  PromptDraftShape,
  TextRequestSizing,
  TextWorkerLimits,
  curatedRank,
  modelCostTier,
  pickTextModel,
} from '../../services/prompt-draft.service';
import { PromptDraftDbService } from '../../services/prompt-draft-db.service';
import {
  TextGenerationQueueService,
  isLiveTextRequest,
} from '../../services/text-generation-queue.service';
import type {
  StoredTextRequest,
  TextRequestContext,
  TextRequestTake,
} from '../../services/text-generation-db.service';
import { PromptLibraryComponent } from '../prompt-library/prompt-library.component';
import type {
  PromptLibraryFailedRequest,
  PromptLibraryLiveRequest,
  PromptLibraryUse,
} from '../prompt-library/prompt-library.model';
import {
  GenerationWaitInsightsService,
  QueueTrend,
} from '../../services/generation-wait-insights.service';
import {
  TextRequestProgressComponent,
  TextRequestRepick,
  emptyReasonKey,
  settledStateKey,
} from './text-request-progress.component';
import { AuthService } from '../../services/auth.service';
import {
  DescribeOrigin,
  PreparedPicture,
  StudioDescribeService,
} from '../../services/studio-describe.service';
import { ToastService } from '../../services/toast.service';
import { UnitConversionService } from '../../services/unit-conversion.service';
import { API_BASE_URL } from '../../services/api-config';
import { ActiveModel } from '../../types/active-model';
import { ImagePromptStyle, imagePromptStyleLabel } from '../../types/style';
import { copyToClipboard } from '../../helper/copy-to-clipboard';
import { stringifyAsJson } from '../../helper/json-formatter';
import { JsonInspectorComponent } from '../json-inspector/json-inspector.component';
import type { JsonInspectorSection } from '../json-inspector/json-inspector.component';
import type { AlchemyFoldPin } from '../alchemy/alchemy-pictures/alchemy-pictures.component';
import { GsPixelBadgeComponent } from '../gs-pixel-badge/gs-pixel-badge.component';

/** How the override select names its choice. */
type PickValue = 'auto' | 'quality' | 'any' | `model:${string}`;

/**
 * Which of the two ways into a prompt the card is showing. Only the studio
 * offers both; under an alchemy job the card improves nothing and the tabs
 * are not drawn.
 */
export type PromptHelpTab = 'improve' | 'picture';

/** Where the anonymous choice is remembered between visits. */
const ANONYMOUS_STORAGE_KEY = 'aihorde.prompt-draft.anonymous';

/** Where the settings fold's state is remembered between visits. */
const OPTIONS_STORAGE_KEY = 'aihorde.prompt-draft.options';

/**
 * Where the chosen way into a prompt is remembered. The card is built and torn
 * down with the studio it sits in, so a reader who switches studios and comes
 * back would otherwise land on the other tab.
 */
const TAB_STORAGE_KEY = 'aihorde.prompt-draft.tab';

/**
 * The price above which a draft is flagged. Writing one line is short work for
 * any model that follows an instruction, so a draft costing more than this is
 * almost always paying for a model's size rather than for a better prompt.
 */
const COSTLY_DRAFT_KUDOS = 25;

/** Long enough that a typed note is priced once, not on every keystroke. */
const ESTIMATE_DEBOUNCE_MS = 600;

/**
 * The line each request still under way wears in the list of drafts. Only a
 * request the horde may still change is listed there: one that has ended
 * without an answer is listed under its own heading, and one that ended with
 * answers is its takes, which are drafts already.
 */
function liveRequestStateKey(request: StoredTextRequest): string | null {
  switch (request.state) {
    case 'sending':
      return 'prompt_draft.queue.sending';
    case 'queued':
      return 'prompt_draft.queue.queued_plain';
    case 'writing':
      return 'prompt_draft.library_open_writing';
    default:
      return null;
  }
}

/** Which endings leave the reader with nothing to use and something to redo. */
function isUnfinished(request: StoredTextRequest): boolean {
  return (
    request.state === 'expired' ||
    request.state === 'empty' ||
    request.state === 'faulted' ||
    request.state === 'cancelled'
  );
}

/** Enough of what was asked for to tell one request from another. */
function liveRequestPreview(request: StoredTextRequest): string {
  const { prompt, caption, note, tags } = request.input;
  return (
    prompt?.trim() || caption?.trim() || note?.trim() || tags?.trim() || ''
  );
}

/** The range of answers one request may ask for. */
const MIN_TAKES = 1;
const MAX_TAKES = 5;

/** The key stands in for the reader's own, which is never put on a page. */
const KEY_PLACEHOLDER = '<your key>';

/** The shared key every anonymous request goes out on. */
const ANONYMOUS_API_KEY = '0000000000';

/**
 * A prompt written by one of the horde's text models. Under an alchemy job it
 * writes from what alchemy found in a picture: the caption, the strongest
 * tags, and a note from the reader. Under the image studio's prompt box it
 * improves what is already written, and offers the other way in as a second
 * tab: a picture handed over to be read for its caption and tags. Either way
 * the draft is shown, not applied: it goes to the prompt box or the clipboard
 * on a press.
 *
 * Only the note, the button and the price are on show. Everything that steers
 * the request sits behind a fold, so a reader who wants one better prompt
 * meets one field and one button.
 *
 * The model is picked from a curated list by default, and the pick can be
 * overridden with any model online, or no preference at all, for a reader
 * who knows what they want.
 *
 * The price is asked for before the reader commits to it, and a request that
 * would cost more kudos than the account holds goes out anonymously instead of
 * failing at the horde.
 */
@Component({
  selector: 'app-prompt-draft-card',
  imports: [
    TranslocoPipe,
    IconComponent,
    RouterLink,
    JsonInspectorComponent,
    GsPixelBadgeComponent,
    TextRequestProgressComponent,
    PromptLibraryComponent,
  ],
  templateUrl: './prompt-draft-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-size]': '"tall"',
  },
})
export class PromptDraftCardComponent {
  private readonly drafts = inject(PromptDraftService);
  private readonly store = inject(PromptDraftDbService);
  private readonly queue = inject(TextGenerationQueueService);
  private readonly waitInsights = inject(GenerationWaitInsightsService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly units = inject(UnitConversionService);
  /**
   * What the studio has read out of a picture. Held by a root service because
   * the reading is asked for from the source card and from a result tile as
   * well as from here, and shown wherever the words are used.
   */
  public readonly describe = inject(StudioDescribeService);
  private readonly apiBase = inject(API_BASE_URL);
  private readonly transloco = inject(TranslocoService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  public readonly caption = input<string | null>(null);
  public readonly tags = input<string | null>(null);
  /** The prompt as written, when the card is there to improve one. */
  public readonly seed = input<string | null>(null);
  /**
   * Words the picture's rendering style already contributes, so the draft can
   * be asked for the subject and the scene alone.
   */
  public readonly styleWords = input<string | null>(null);
  public readonly defaultOpen = input<boolean | null>(null);
  public readonly foldPin = input<AlchemyFoldPin | null>(null);
  /**
   * Which surface the card sits on, for the history. Left unset it follows the
   * job the card has, so a caller that has nothing to add need say nothing.
   */
  public readonly origin = input<PromptDraftOrigin | null>(null);
  /**
   * Whether this card can also read a picture. The studio can, because it has
   * a prompt box to put the words in and a source picture to offer; under an
   * alchemy job the picture has already been read and the findings arrive as
   * the caption and tags.
   */
  public readonly picture = input(false);
  /**
   * The alchemy job the card sits under, when it sits under one. Each job's
   * card follows its own requests; without a job the card is the studio's.
   */
  public readonly jobId = input<string | null>(null);
  /**
   * A prompt chosen for the box it was written for: a take, the caption a
   * picture was read for, or an entry picked from the list of prompts. The
   * list also holds prompts already sent, which say so, because a sent prompt
   * brings its negative back as it was rather than adding to the box.
   */
  public readonly use = output<PromptLibraryUse>();

  /** Which job the card has: writing from findings, or improving a prompt. */
  public readonly mode = computed<'draft' | 'improve'>(() =>
    this.seed() !== null ? 'improve' : 'draft',
  );

  private readonly openOverride = signal<boolean | null>(null);
  public readonly note = signal('');
  public readonly pick = signal<PickValue>('auto');
  public readonly models = signal<ActiveModel[] | null>(null);
  /** Whether a send is on its way to the queue, so a second press waits for it. */
  public readonly busy = signal(false);
  /**
   * Set when a press would send while a request is still waiting, so the card
   * asks before cancelling that one.
   */
  public readonly confirmReplace = signal(false);
  /** Which take was last put on the clipboard, so only its button says so. */
  public readonly copiedTake = signal<number | null>(null);
  /** The styles this card can be asked on, or null before they are fetched. */
  public readonly styles = signal<ImagePromptStyle[] | null>(null);
  /** The chosen style's id; null is the built-in instruction. */
  public readonly styleId = signal<string | null>(null);
  /** How many answers one request asks for. */
  public readonly takes = signal(MIN_TAKES);
  public readonly previewOpen = signal(false);
  /** Which way into a prompt is showing, where both are offered. */
  private readonly chosenTab = signal<PromptHelpTab>('improve');
  /** Whether the settings fold is showing. */
  public readonly optionsOpen = signal(false);
  /** The fold is opened for the reader once, not on every price. */
  private optionsForcedOpen = false;
  /** Whether a picture is being dragged over the card. */
  public readonly describeDragging = signal(false);

  /**
   * The picture waiting to be read. It is shrunk as soon as it is chosen, so
   * the size beside the thumbnail is the size that goes to the horde and a
   * picture too big to send is refused while the reader is still looking at it.
   */
  public readonly stagedPicture = signal<PreparedPicture | null>(null);
  /** The thumbnail's address, revoked whenever the picture behind it goes. */
  public readonly stagedUrl = signal<string | null>(null);
  /** The file's own name, where the picture came from one. */
  private readonly stagedName = signal<string | null>(null);
  private readonly stagedOrigin = signal<DescribeOrigin>('picked');
  /** Why the staged picture cannot be read, shown before the button. */
  public readonly stagedError = signal<string | null>(null);
  /** Whether the chosen picture is still being shrunk. */
  public readonly staging = signal(false);
  /** Newer picks win, so a slow shrink cannot overwrite the picture on screen. */
  private stageToken = 0;

  public readonly minTakes = MIN_TAKES;
  public readonly maxTakes = MAX_TAKES;

  /** The reader's own choice, remembered; the auto flip does not overwrite it. */
  private readonly chosenAnonymous = signal(false);
  /** Set when the price outgrew the balance and the card flipped the switch. */
  public readonly flippedForCost = signal(false);
  private flipSpent = false;

  public readonly estimatedKudos = signal<number | null>(null);
  public readonly estimating = signal(false);
  private estimateTimer: ReturnType<typeof setTimeout> | null = null;
  private estimateToken = 0;
  /** Estimates run one after another so a slow answer cannot outrank a newer one. */
  private estimateChain: Promise<void> = Promise.resolve();

  /** Whether the two sizes and their overrides are showing. */
  public readonly advancedOpen = signal(false);
  /** Whether the note saying what held a size down is showing. */
  public readonly sizingWhyOpen = signal(false);
  /** The reader's own answer allowance, or null to use the worked-out one. */
  public readonly maxLengthOverride = signal<number | null>(null);
  /** The reader's own room for the request, or null for the worked-out one. */
  public readonly maxContextOverride = signal<number | null>(null);
  /** What the chosen model's workers advertise, or null before they are read. */
  public readonly workerLimits = signal<TextWorkerLimits | null>(null);
  /** Which take has its list of edits open. */
  public readonly changesOpen = signal<number | null>(null);
  /** The request whose body and answer are being read, or null for none. */
  public readonly detailsRequest = signal<StoredTextRequest | null>(null);

  /** Whether the list of every draft is open over the page. */
  public readonly libraryOpen = signal(false);
  /** How many drafts this browser keeps, or null before they are counted. */
  public readonly draftCount = signal<number | null>(null);

  constructor() {
    this.chosenAnonymous.set(this.storedAnonymous());
    this.optionsOpen.set(this.storedOptions());
    this.chosenTab.set(this.storedTab());
    inject(DestroyRef).onDestroy(() => {
      this.cancelEstimate();
      this.releaseStagedUrl();
    });

    effect(() => {
      const pin = this.foldPin();
      if (pin) untracked(() => this.openOverride.set(pin.open));
    });
    // The model list is fetched once the card is open: a folded card asks the
    // horde for nothing.
    effect(() => {
      if (this.isOpen() && untracked(() => this.models()) === null) {
        void this.loadModels();
      }
      if (this.isOpen() && untracked(() => this.styles()) === null) {
        void this.loadStyles();
      }
    });
    // A chosen style that the current job has no use for (the card switched
    // between writing and improving) goes back to the built-in instruction
    // rather than being sent for the wrong job.
    effect(() => {
      const offered = this.roleStyles();
      const chosen = untracked(() => this.styleId());
      if (chosen && !offered.some((style) => style.id === chosen)) {
        untracked(() => this.styleId.set(null));
      }
    });
    // What the workers running the chosen model will take is read whenever the
    // pick changes: the sizes are held to it, and a request above every
    // eligible worker's ceiling is picked up by nobody.
    effect(() => {
      const model = this.chosenModel();
      untracked(() => void this.loadWorkerLimits(model));
    });
    // Everything the price depends on is read here so a change to any of it
    // reschedules the one pending estimate.
    effect(() => {
      const ready = this.isOpen() && this.hasMaterial() && !this.busy();
      this.note();
      this.pick();
      this.seed();
      this.foundCaption();
      this.foundTags();
      this.styleWords();
      this.styleId();
      this.takes();
      this.anonymous();
      this.workerLimits();
      this.maxLengthOverride();
      this.maxContextOverride();
      untracked(() => this.scheduleEstimate(ready));
    });
    // An open card is what the reader is looking at, so its requests are
    // checked at the quicker pace; a folded one leaves them to the slower one.
    effect((onCleanup) => {
      if (!this.isOpen() || !this.isBrowser) return;
      const release = this.queue.watch(this.requestContext());
      onCleanup(release);
    });
    // The drafts are counted once the card is open, where the count is shown;
    // a folded card under every alchemy job reads nothing.
    effect(() => {
      if (
        this.isOpen() &&
        this.isBrowser &&
        untracked(() => this.draftCount()) === null
      ) {
        untracked(() => void this.countDrafts());
      }
    });
    // Takes are written to the drafts store by the queue, so the drafts are
    // counted again when the request on show lands.
    effect(() => {
      const request = this.current();
      const seen = request ? `${request.localId}:${request.state}` : null;
      const landed =
        seen !== null &&
        this.lastSeenRequest !== null &&
        seen !== this.lastSeenRequest &&
        (request?.state === 'done' || request?.state === 'cancelled');
      this.lastSeenRequest = seen;
      if (landed) untracked(() => void this.countDrafts());
    });
  }

  /** The request on show and its state at the last look, to spot a landing. */
  private lastSeenRequest: string | null = null;

  /** Which requests are this card's. */
  public readonly requestContext = computed<TextRequestContext>(() => {
    const jobId = this.jobId();
    return jobId ? { kind: 'alchemy', jobId } : { kind: 'studio' };
  });

  /**
   * The request the card shows: the newest one asked from here. Older ones stay
   * in the queue's list, which is what a card drawing several would read.
   */
  public readonly current = computed<StoredTextRequest | null>(
    () => this.queue.requestsFor(this.requestContext())().at(0) ?? null,
  );

  /** Whether the request on show may still change. */
  public readonly live = computed(() => {
    const request = this.current();
    return request !== null && isLiveTextRequest(request);
  });

  /** The takes the request on show came back with, done or cancelled. */
  public readonly takesShown = computed<readonly TextRequestTake[]>(() => {
    const request = this.current();
    if (request?.state !== 'done' && request?.state !== 'cancelled') return [];
    return request.results ?? [];
  });

  /** Whether the request on show is being cancelled right now. */
  public readonly cancellingCurrent = computed(() => {
    const request = this.current();
    return request !== null && this.queue.cancelling().has(request.localId);
  });

  /**
   * How the horde-wide position has moved while the request waits. Only a
   * movement is worth a line; a position that has not moved says nothing the
   * figures do not.
   */
  public readonly trend = computed<QueueTrend | null>(() => {
    const request = this.current();
    if (request?.state !== 'queued') return null;
    const trend = this.waitInsights.trendFor(request.localId);
    return trend === 'steady' ? null : trend;
  });

  /** The clock the time waited is drawn against. */
  public readonly now = computed(() => this.queue.clock());

  public readonly isOpen = computed(() => {
    const override = this.openOverride();
    if (override !== null) return override;
    return this.defaultOpen() ?? false;
  });

  public toggleOpen(): void {
    this.openOverride.set(!this.isOpen());
  }

  /** Which tab is showing; without the picture tab there is only the one. */
  public readonly activeTab = computed<PromptHelpTab>(() =>
    this.picture() ? this.chosenTab() : 'improve',
  );

  public chooseTab(tab: PromptHelpTab): void {
    this.chosenTab.set(tab);
    this.rememberTab(tab);
  }

  private storedTab(): PromptHelpTab {
    if (!this.isBrowser) return 'improve';
    try {
      return localStorage.getItem(TAB_STORAGE_KEY) === 'picture'
        ? 'picture'
        : 'improve';
    } catch {
      // Private modes refuse storage; the first tab is a fine answer.
      return 'improve';
    }
  }

  private rememberTab(tab: PromptHelpTab): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // Nothing here is worth failing a tab press over.
    }
  }

  /**
   * The words read out of a picture. Under an alchemy job they are handed in
   * with the job; in the studio the card asks for the reading itself.
   */
  public readonly foundCaption = computed(() =>
    this.picture() ? this.describe.findings().caption : this.caption(),
  );

  public readonly foundTags = computed(() =>
    this.picture() ? this.describe.findings().tags : this.tags(),
  );

  /** Whether there is a prompt in the box worth rewriting. */
  public readonly improving = computed(() => !!this.seed()?.trim());

  public toggleOptions(): void {
    const open = !this.optionsOpen();
    this.optionsOpen.set(open);
    // Only a deliberate press is worth remembering; the fold the card opens
    // by itself must not overwrite what the reader last chose.
    this.rememberOptions(open);
  }

  private storedOptions(): boolean {
    if (!this.isBrowser) return false;
    try {
      return localStorage.getItem(OPTIONS_STORAGE_KEY) === 'true';
    } catch {
      // Private modes refuse storage; folded is a fine answer.
      return false;
    }
  }

  private rememberOptions(value: boolean): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(OPTIONS_STORAGE_KEY, String(value));
    } catch {
      // Nothing here is worth failing a fold over.
    }
  }

  public onTakesInput(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    this.takes.set(Math.min(MAX_TAKES, Math.max(MIN_TAKES, parsed)));
  }

  /** Logged out, every request is anonymous already; the switch says so. */
  public readonly anonymousLocked = computed(() => !this.auth.isLoggedIn());

  public readonly anonymous = computed(
    () => this.anonymousLocked() || this.chosenAnonymous(),
  );

  /** The account's kudos, or null when there is no account to read them from. */
  public readonly balance = computed(() => this.auth.kudos());

  /** Kudos as the studio's balance chip writes them, so the two figures agree. */
  public abbreviateKudos(value: number): string {
    return this.units.formatCompactNumber(value);
  }

  public onAnonymousChange(value: boolean): void {
    if (this.anonymousLocked()) return;
    this.chosenAnonymous.set(value);
    this.flippedForCost.set(false);
    // A deliberate choice stands even after a later price would flip it back.
    this.flipSpent = true;
    this.rememberAnonymous(value);
  }

  private storedAnonymous(): boolean {
    if (!this.isBrowser) return false;
    try {
      return localStorage.getItem(ANONYMOUS_STORAGE_KEY) === 'true';
    } catch {
      // Private modes refuse storage; the default choice is a fine answer.
      return false;
    }
  }

  private rememberAnonymous(value: boolean): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(ANONYMOUS_STORAGE_KEY, String(value));
    } catch {
      // Nothing here is worth failing a toggle over.
    }
  }

  /** Models with workers, curated ones first, for the override list. */
  public readonly onlineModels = computed(() =>
    (this.models() ?? [])
      .filter((model) => model.count > 0)
      .sort(
        (a, b) =>
          (curatedRank(a.name) ?? 99) - (curatedRank(b.name) ?? 99) ||
          b.count - a.count,
      ),
  );

  /** The styles written for the job the card has now. */
  public readonly roleStyles = computed<ImagePromptStyle[]>(() => {
    const role = this.mode() === 'improve' ? 'improve' : 'describe';
    return (this.styles() ?? []).filter((style) => style.role === role);
  });

  public readonly chosenStyle = computed<ImagePromptStyle | null>(() => {
    const id = this.styleId();
    return this.roleStyles().find((style) => style.id === id) ?? null;
  });

  /**
   * A style that names no direction is the plain one of its role, and the chip
   * says so in the reader's own language rather than in the style's name.
   */
  public styleLabel(style: ImagePromptStyle): string {
    return (
      imagePromptStyleLabel(style) ??
      this.transloco.translate('prompt_draft.chip_plain')
    );
  }

  public chooseStyle(id: string | null): void {
    this.styleId.set(id);
  }

  /** Take a picture from the file picker and show it, without reading it yet. */
  public onDescribeFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so picking the same picture again still counts as a change.
    input.value = '';
    if (file) void this.stagePicture(file, 'picked', file.name);
  }

  /** The card takes a drop anywhere on its body while the picture tab shows. */
  private get droppable(): boolean {
    return this.picture() && this.activeTab() === 'picture';
  }

  public onDescribeDragOver(event: DragEvent): void {
    if (!this.droppable) return;
    event.preventDefault();
    this.describeDragging.set(true);
  }

  public onDescribeDragLeave(): void {
    this.describeDragging.set(false);
  }

  public onDescribeDrop(event: DragEvent): void {
    if (!this.droppable) return;
    event.preventDefault();
    this.describeDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.stagePicture(file, 'picked', file.name);
  }

  /** Show the picture already attached as the source, leaving it attached. */
  public describeSourcePicture(): void {
    const blob = this.describe.sourcePicture();
    if (blob) void this.stagePicture(blob, 'source', null);
  }

  /**
   * Put a picture in front of the reader, shrunk to what would be sent, and
   * wait there. Nothing is asked of the horde until the button below it is
   * pressed, so a pick or a drop costs nothing and can be undone.
   */
  private async stagePicture(
    blob: Blob,
    origin: DescribeOrigin,
    name: string | null,
  ): Promise<void> {
    const token = (this.stageToken += 1);
    this.releaseStagedUrl();
    this.stagedPicture.set(null);
    this.stagedError.set(null);
    this.stagedName.set(name);
    this.stagedOrigin.set(origin);
    this.stagedUrl.set(this.isBrowser ? URL.createObjectURL(blob) : null);
    this.staging.set(true);
    const outcome = await this.describe.prepare(blob);
    if (token !== this.stageToken) return;
    this.staging.set(false);
    if (outcome.kind === 'refused') {
      this.stagedError.set(outcome.error.key);
      return;
    }
    this.stagedPicture.set(outcome.picture);
  }

  /** Whether there is a picture on screen waiting on the reader. */
  public readonly hasStaged = computed(
    () => this.stagedUrl() !== null || this.staging(),
  );

  /** Whether the button that starts the reading can do anything. */
  public readonly canRead = computed(
    () => this.stagedPicture() !== null && !this.describe.pending(),
  );

  /** The thumbnail names the picture it stands for. */
  public readonly stagedAlt = computed(() => {
    const name = this.stagedName();
    return name
      ? this.transloco.translate('generate.describe.staged_alt', { name })
      : this.transloco.translate('generate.describe.staged_alt_source');
  });

  /** Ask for the staged picture to be read. */
  public readStagedPicture(): void {
    const picture = this.stagedPicture();
    if (!picture || this.describe.pending()) return;
    void this.describe.read(picture, this.stagedOrigin());
  }

  /** Take the staged picture away, along with anything read from it. */
  public clearStagedPicture(): void {
    this.stageToken += 1;
    this.releaseStagedUrl();
    this.stagedPicture.set(null);
    this.stagedError.set(null);
    this.stagedName.set(null);
    this.staging.set(false);
    this.describe.clear();
  }

  private releaseStagedUrl(): void {
    const url = this.stagedUrl();
    if (url) URL.revokeObjectURL(url);
    this.stagedUrl.set(null);
  }

  /** Put alchemy's caption in the prompt box, as the reading worded it. */
  public useDescribeCaption(): void {
    const caption = this.describe.findings().caption;
    if (caption) {
      this.use.emit({ prompt: caption, negative: null, source: 'draft' });
    }
  }

  /** Take one of the findings away for use elsewhere. */
  public async copyDescribeLine(text: string): Promise<void> {
    if (await copyToClipboard(text)) {
      this.toast.success('generate.describe.copied', { transloco: true });
    }
  }

  /** Every answer the last request came back with. */
  public readonly draftTexts = computed<string[]>(() =>
    this.takesShown().map((take) => take.text),
  );

  public readonly draftText = computed<string | null>(
    () => this.draftTexts().at(0) ?? null,
  );

  /**
   * Anything at all to write from. A studio card improving a prompt can also
   * have a picture's words behind it, so the two sources are one test rather
   * than one per job.
   */
  public readonly hasMaterial = computed(
    () =>
      !!(
        this.seed()?.trim() ||
        this.foundCaption() ||
        this.foundTags() ||
        this.note().trim()
      ),
  );

  public isCurated(model: ActiveModel): boolean {
    return curatedRank(model.name) !== null;
  }

  /**
   * What the option says about a model beside its name: the workers running it
   * and, where the name gives its size away, what asking it is likely to cost.
   */
  public modelMeta(model: ActiveModel): string {
    const tier = modelCostTier(model.name);
    if (tier === null) return String(model.count);
    const word =
      tier === 'small'
        ? this.transloco.translate('prompt_draft.tier_small')
        : tier === 'medium'
          ? this.transloco.translate('prompt_draft.tier_medium')
          : this.transloco.translate('prompt_draft.tier_large');
    return `${model.count}, ${word}`;
  }

  public onPickChange(value: string): void {
    this.pick.set(value as PickValue);
  }

  /**
   * Whether the reader asked for a big model: the quality pick, or a named
   * model whose size puts it past the small tier. Kudos scale with size, so
   * these are the picks whose price can climb into the hundreds.
   */
  public readonly costlyPick = computed(() => {
    const pick = this.pick();
    if (pick === 'quality') return true;
    if (!pick.startsWith('model:')) return false;
    const tier = modelCostTier(pick.slice('model:'.length));
    return tier === 'medium' || tier === 'large';
  });

  /** An anonymous request costs the reader nothing, so there is nothing to steer. */
  public readonly showCostNudge = computed(
    () => this.costlyPick() && !this.anonymous(),
  );

  /** Whether the price is worth stopping on before the reader's own kudos pay it. */
  public readonly priceIsHigh = computed(() => {
    const price = this.estimatedKudos();
    return price !== null && price > COSTLY_DRAFT_KUDOS && !this.anonymous();
  });

  public useValuePick(): void {
    this.pick.set('auto');
  }

  public onNoteInput(value: string): void {
    this.note.set(value);
  }

  private modelPick(): PromptDraftModelPick {
    const pick = this.pick();
    if (pick === 'auto' || pick === 'quality' || pick === 'any') return pick;
    return { model: pick.slice('model:'.length) };
  }

  private material(): PromptDraftInput {
    const words = this.styleWords()?.trim();
    const styled = words ? { styleWords: words } : {};
    const caption = this.foundCaption();
    const tags = this.foundTags();
    // A prompt being improved keeps the picture's words when there are any:
    // the reader asked for both, and the model writes better with the scene
    // in front of it.
    const found = caption || tags ? { caption, tags } : {};
    return this.mode() === 'improve'
      ? { prompt: this.seed(), note: this.note(), ...found, ...styled }
      : { caption, tags, note: this.note(), ...styled };
  }

  private shape(): PromptDraftShape {
    const length = this.maxLengthOverride();
    const context = this.maxContextOverride();
    return {
      style: this.chosenStyle(),
      takes: this.takes(),
      limits: this.workerLimits(),
      ...(length !== null ? { maxLength: length } : {}),
      ...(context !== null ? { maxContextLength: context } : {}),
    };
  }

  /**
   * The model the request would go out on, where the pick names one. The
   * workers carrying it are what the sizes are held to; asking for any model
   * at all names none, and the sizes then follow the material alone.
   */
  public readonly chosenModel = computed<string | null>(
    () => pickTextModel(this.onlineModels(), this.modelPick()).label,
  );

  private async loadWorkerLimits(model: string | null): Promise<void> {
    this.workerLimits.set(await this.drafts.workerLimitsFor(model));
  }

  /** The two sizes the request would go out with, and the figures behind them. */
  public readonly sizing = computed<TextRequestSizing>(() =>
    this.drafts.sizing(this.material(), this.shape()),
  );

  /**
   * A style supplies its own sampling parameters, so the sizes the card works
   * out are neither sent nor worth showing beside a style's price.
   */
  public readonly showSizing = computed(
    () => this.chosenStyle() === null && this.hasMaterial(),
  );

  /** The note behind the sizes, naming what held the answer allowance down. */
  public readonly sizingWhyKey = computed<string | null>(() => {
    switch (this.sizing().limitedBy) {
      case 'workers':
        return 'prompt_draft.sizing_why_workers';
      case 'style':
        return 'prompt_draft.sizing_why_style';
      default:
        return null;
    }
  });

  public toggleSizingWhy(): void {
    this.sizingWhyOpen.update((open) => !open);
  }

  public toggleAdvanced(): void {
    this.advancedOpen.update((open) => !open);
  }

  /**
   * A figure the reader typed stands as typed, up to what the workers
   * advertise; an empty field goes back to the size the card works out.
   */
  public onMaxLengthInput(value: string): void {
    this.maxLengthOverride.set(this.readSize(value));
  }

  public onMaxContextInput(value: string): void {
    this.maxContextOverride.set(this.readSize(value));
  }

  private readSize(value: string): number | null {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) return null;
    return parsed;
  }

  /** The body the button would send, and the call that would send it. */
  public readonly previewSections = computed<readonly JsonInspectorSection[]>(
    () => {
      const body = this.drafts.previewRequest(
        this.material(),
        this.modelPick(),
        this.models() ?? [],
        this.shape(),
      );
      const curl = this.curlFor(body, this.anonymous());
      return [
        {
          id: 'request',
          label: this.transloco.translate('prompt_draft.preview_body'),
          value: body,
        },
        {
          id: 'curl',
          label: this.transloco.translate('prompt_draft.preview_curl'),
          value: curl,
        },
      ];
    },
  );

  /**
   * The call that sends a body, for a reader who wants to run it themselves.
   * The reader's own key is never written onto a page, so a request sent on it
   * shows a placeholder where the anonymous key is shown outright.
   */
  private curlFor(body: unknown, anonymous: boolean): string {
    const key = anonymous ? ANONYMOUS_API_KEY : KEY_PLACEHOLDER;
    return [
      `curl -X POST "${this.apiBase}/generate/text/async"`,
      `  -H "apikey: ${key}"`,
      '  -H "Content-Type: application/json"',
      '  -H "Client-Agent: AiHordeFrontpage:generate"',
      `  -d '${stringifyAsJson(body)}'`,
    ].join(' \\\n');
  }

  public openPreview(): void {
    this.previewOpen.set(true);
  }

  public closePreview(): void {
    this.previewOpen.set(false);
  }

  /** Everything a finished request was sent with and everything it came back with. */
  public readonly detailSections = computed<readonly JsonInspectorSection[]>(
    () => {
      const request = this.detailsRequest();
      if (!request) return [];
      return [
        {
          id: 'request',
          label: this.transloco.translate('prompt_draft.details_request'),
          value: request.request,
        },
        {
          id: 'response',
          label: this.transloco.translate('prompt_draft.details_response'),
          value:
            request.response ??
            this.transloco.translate('prompt_draft.details_response_none'),
        },
        {
          id: 'curl',
          label: this.transloco.translate('prompt_draft.preview_curl'),
          value: this.curlFor(request.request, request.anonymous),
        },
      ];
    },
  );

  public openDetails(request: StoredTextRequest | null): void {
    if (request) this.detailsRequest.set(request);
  }

  public closeDetails(): void {
    this.detailsRequest.set(null);
  }

  private cancelEstimate(): void {
    if (this.estimateTimer !== null) {
      clearTimeout(this.estimateTimer);
      this.estimateTimer = null;
    }
  }

  private scheduleEstimate(ready: boolean): void {
    this.cancelEstimate();
    if (!this.isBrowser) return;
    if (!ready) {
      // A price shown beside material that has since changed is worse than none.
      this.estimateToken += 1;
      this.estimatedKudos.set(null);
      this.estimating.set(false);
      return;
    }
    this.estimateTimer = setTimeout(() => {
      this.estimateTimer = null;
      const token = (this.estimateToken += 1);
      this.estimating.set(true);
      this.estimateChain = this.estimateChain.then(() =>
        this.runEstimate(token),
      );
    }, ESTIMATE_DEBOUNCE_MS);
  }

  private async runEstimate(token: number): Promise<void> {
    if (token !== this.estimateToken) return;
    let kudos: number | null;
    try {
      kudos = await this.drafts.estimate(
        this.material(),
        this.modelPick(),
        this.models() ?? undefined,
        this.anonymous(),
        this.shape(),
      );
    } catch {
      // A price that cannot be fetched leaves the line off; the button works.
      kudos = null;
    }
    if (token !== this.estimateToken) return;
    this.estimatedKudos.set(kudos);
    this.estimating.set(false);
    this.flipIfUnaffordable(kudos);
  }

  /**
   * A request the account cannot pay for is refused at the horde, so the card
   * moves it to the anonymous key rather than letting the reader press a button
   * that cannot work. It happens once; after that the switch is theirs.
   */
  private flipIfUnaffordable(kudos: number | null): void {
    if (kudos === null || this.flipSpent) return;
    if (this.anonymousLocked() || this.chosenAnonymous()) return;
    const balance = this.balance();
    if (balance === null || kudos <= balance) return;
    this.flipSpent = true;
    this.chosenAnonymous.set(true);
    this.flippedForCost.set(true);
    // The card has just changed a setting on the reader's behalf, so the fold
    // holding that setting opens, once, where they can see and undo it.
    if (!this.optionsForcedOpen) {
      this.optionsForcedOpen = true;
      this.optionsOpen.set(true);
    }
  }

  /**
   * Send the card's material. While a request from this card is still waiting
   * the press asks first, and only {@link confirmReplaceSend} cancels that one
   * and sends.
   */
  public async draft(): Promise<void> {
    if (this.busy() || !this.hasMaterial()) return;
    if (this.live()) {
      this.confirmReplace.set(true);
      return;
    }
    await this.sendMaterial(false);
  }

  public async confirmReplaceSend(): Promise<void> {
    this.confirmReplace.set(false);
    if (this.busy() || !this.hasMaterial()) return;
    await this.sendMaterial(true);
  }

  public declineReplace(): void {
    this.confirmReplace.set(false);
  }

  private async sendMaterial(replace: boolean): Promise<void> {
    this.busy.set(true);
    this.copiedTake.set(null);
    try {
      const sent = await this.drafts.submit(
        this.material(),
        this.modelPick(),
        this.models() ?? undefined,
        {
          anonymous: this.anonymous(),
          origin: this.origin() ?? this.defaultOrigin(),
          context: this.requestContext(),
          replace,
          quotedKudos: this.estimatedKudos(),
        },
        this.shape(),
      );
      // Another press got a request in first; ask rather than drop this one.
      if (sent.kind === 'busy') this.confirmReplace.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  /** Stop the request on show. Any take already written is kept. */
  public cancelCurrent(): void {
    const request = this.current();
    if (request) void this.queue.cancel(request.localId);
  }

  /**
   * Send the request on show again with another model choice, cancelling it
   * first while it still waits. It goes out with the material it was asked
   * with, not whatever the card holds now, since it is the same ask pointed at
   * other workers.
   */
  public async repick(pick: TextRequestRepick): Promise<void> {
    const request = this.current();
    if (!request || this.busy()) return;
    this.pick.set(pick);
    this.busy.set(true);
    this.copiedTake.set(null);
    try {
      const style =
        this.styles()?.find((candidate) => candidate.id === request.styleId) ??
        null;
      await this.drafts.submit(
        request.input,
        pick,
        this.models() ?? undefined,
        {
          anonymous: request.anonymous,
          origin: request.origin,
          context: request.context,
          replace: true,
          quotedKudos: null,
        },
        { style, takes: request.takes },
      );
    } finally {
      this.busy.set(false);
    }
  }

  private defaultOrigin(): PromptDraftOrigin {
    return this.mode() === 'improve' ? 'studio' : 'alchemy';
  }

  public async copy(index = 0): Promise<void> {
    const text = this.draftTexts()[index];
    if (!text) return;
    await copyToClipboard(text);
    this.copiedTake.set(index);
  }

  /**
   * Hand a take to the prompt box. Its negative line goes with it, because the
   * model wrote the two as one answer.
   */
  public send(index = 0): void {
    const text = this.draftTexts()[index];
    if (!text) return;
    const negative = this.negativeFor(index);
    this.use.emit({
      prompt: text,
      negative: negative === '' ? null : negative,
      source: 'draft',
    });
  }

  /** The negative line a take came with, empty where the model wrote none. */
  public negativeFor(index: number): string {
    return this.takesShown().at(index)?.negative ?? '';
  }

  /**
   * Hand a take over as the worker wrote it, edits and all. The negative is
   * left alone: the raw answer is one piece of text, and any negative line in
   * it is part of what the reader asked to see.
   */
  public sendRaw(index: number): void {
    const take = this.takesShown().at(index);
    if (!take?.rawText) return;
    this.use.emit({ prompt: take.rawText, negative: null, source: 'draft' });
  }

  /** What cleaning altered in a take, in the order the service reports it. */
  public changesOf(take: TextRequestTake): readonly PromptDraftChange[] {
    return take.changes ?? [];
  }

  /** The line describing one edit, in the reader's words. */
  public changeKey(change: PromptDraftChange): string {
    return `prompt_draft.change_${change}`;
  }

  /**
   * An answer that repeats its own instruction is not a prompt. It is shown
   * with a warning instead of a press that would write it into the box, and
   * the reader can still take it as written.
   */
  public isEcho(take: TextRequestTake): boolean {
    return this.changesOf(take).includes('instruction_echo');
  }

  public toggleChanges(index: number): void {
    this.changesOpen.update((open) => (open === index ? null : index));
  }

  /**
   * Requests that have not landed as drafts, from every card and every job,
   * so the list of drafts shows what is still coming wherever it was asked.
   */
  public readonly liveRequests = computed<PromptLibraryLiveRequest[]>(() =>
    this.queue.requests().flatMap((request) => {
      const stateKey = liveRequestStateKey(request);
      return stateKey === null
        ? []
        : [
            {
              id: request.localId,
              stateKey,
              preview: liveRequestPreview(request),
              createdAt: request.createdAt,
            },
          ];
    }),
  );

  /**
   * Requests that ended with nothing to use, from every card and every job.
   * They are listed apart from the ones still coming: a reader scanning for a
   * prompt that is on its way should not have to read past the ones that are
   * not coming at all.
   */
  public readonly failedRequests = computed<PromptLibraryFailedRequest[]>(() =>
    this.queue.requests().flatMap((request) => {
      const stateKey = isUnfinished(request) ? settledStateKey(request) : null;
      if (stateKey === null) return [];
      const worker = request.results?.find(
        (take) => take.workerName ?? take.workerId,
      );
      const reasonKey = emptyReasonKey(request);
      return [
        {
          id: request.localId,
          stateKey,
          stateParams: {
            worker: worker?.workerName ?? worker?.workerId ?? '',
          },
          ...(reasonKey ? { reasonKey } : {}),
          preview: liveRequestPreview(request),
          at: request.createdAt,
        },
      ];
    }),
  );

  /** Show what one of the listed requests was sent with and came back with. */
  public detailsFor(localId: string): void {
    this.openDetails(
      this.queue.requests().find((request) => request.localId === localId) ??
        null,
    );
  }

  /**
   * Send a listed request again. It goes out with the material it was asked
   * with rather than whatever the card holds now, and the service keeps it off
   * any worker that has already answered this visit with nothing.
   */
  public async retryFailed(localId: string): Promise<void> {
    const request = this.queue
      .requests()
      .find((candidate) => candidate.localId === localId);
    if (!request || this.busy()) return;
    this.busy.set(true);
    try {
      const style =
        this.styles()?.find((candidate) => candidate.id === request.styleId) ??
        null;
      await this.drafts.submit(
        request.input,
        request.pick,
        this.models() ?? undefined,
        {
          anonymous: request.anonymous,
          origin: request.origin,
          context: request.context,
          replace: true,
          quotedKudos: null,
        },
        { style, takes: request.takes },
      );
    } finally {
      this.busy.set(false);
    }
  }

  /** Take a listed request off the list for good. */
  public dismissFailed(localId: string): void {
    void this.queue.remove(localId);
  }

  public clearFailed(): void {
    for (const row of this.failedRequests()) {
      void this.queue.remove(row.id);
    }
  }

  public openLibrary(): void {
    this.libraryOpen.set(true);
  }

  /** A draft deleted in the list changes the count the press shows. */
  public closeLibrary(): void {
    this.libraryOpen.set(false);
    void this.countDrafts();
  }

  public useFromLibrary(use: PromptLibraryUse): void {
    this.closeLibrary();
    this.use.emit(use);
  }

  private async countDrafts(): Promise<void> {
    try {
      this.draftCount.set((await this.store.listAll()).length);
    } catch {
      // A store that will not open leaves the press without a number.
      this.draftCount.set(null);
    }
  }

  private async loadModels(): Promise<void> {
    this.models.set(await this.drafts.textModels());
  }

  private async loadStyles(): Promise<void> {
    this.styles.set(await this.drafts.imagePromptStyles());
  }
}
