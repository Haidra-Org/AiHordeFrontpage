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
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import {
  PromptDraftInput,
  PromptDraftModelPick,
  PromptDraftOrigin,
  PromptDraftOutcome,
  PromptDraftService,
  PromptDraftShape,
  curatedRank,
  modelCostTier,
} from '../../services/prompt-draft.service';
import {
  PromptDraftDbService,
  StoredPromptDraft,
} from '../../services/prompt-draft-db.service';
import { AuthService } from '../../services/auth.service';
import { StudioDescribeService } from '../../services/studio-describe.service';
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

/** Long enough that a typed note is priced once, not on every keystroke. */
const ESTIMATE_DEBOUNCE_MS = 600;

/** How many past drafts the strip offers. */
const HISTORY_LIMIT = 10;

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
  imports: [TranslocoPipe, IconComponent, DatePipe, JsonInspectorComponent],
  templateUrl: './prompt-draft-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-size]': '"tall"',
  },
})
export class PromptDraftCardComponent {
  private readonly drafts = inject(PromptDraftService);
  private readonly store = inject(PromptDraftDbService);
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
  /** The draft, for the prompt box it was written for. */
  public readonly apply = output<string>();

  /** Which job the card has: writing from findings, or improving a prompt. */
  public readonly mode = computed<'draft' | 'improve'>(() =>
    this.seed() !== null ? 'improve' : 'draft',
  );

  private readonly openOverride = signal<boolean | null>(null);
  public readonly note = signal('');
  public readonly pick = signal<PickValue>('auto');
  public readonly models = signal<ActiveModel[] | null>(null);
  public readonly busy = signal(false);
  public readonly outcome = signal<PromptDraftOutcome | null>(null);
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

  public readonly historyOpen = signal(false);
  public readonly history = signal<StoredPromptDraft[]>([]);

  constructor() {
    this.chosenAnonymous.set(this.storedAnonymous());
    this.optionsOpen.set(this.storedOptions());
    inject(DestroyRef).onDestroy(() => this.cancelEstimate());

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
      untracked(() => this.scheduleEstimate(ready));
    });
  }

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

  /** Take a picture from the file picker and read it, without attaching it. */
  public onDescribeFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so picking the same picture again still counts as a change.
    input.value = '';
    if (file) void this.describe.describe(file, 'picked');
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
    if (file) void this.describe.describe(file, 'picked');
  }

  /** Read the picture already attached as the source, leaving it attached. */
  public describeSourcePicture(): void {
    const blob = this.describe.sourcePicture();
    if (blob) void this.describe.describe(blob, 'source');
  }

  /** Put alchemy's caption in the prompt box, as the reading worded it. */
  public useDescribeCaption(): void {
    const caption = this.describe.findings().caption;
    if (caption) this.apply.emit(caption);
  }

  /** Take one of the findings away for use elsewhere. */
  public async copyDescribeLine(text: string): Promise<void> {
    if (await copyToClipboard(text)) {
      this.toast.success('generate.describe.copied', { transloco: true });
    }
  }

  /** Every answer the last request came back with. */
  public readonly draftTexts = computed<string[]>(() => {
    const outcome = this.outcome();
    return outcome?.kind === 'done' ? outcome.texts : [];
  });

  public readonly draftText = computed(() => this.draftTexts()[0] ?? null);

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
    return { style: this.chosenStyle(), takes: this.takes() };
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
      const key = this.anonymous() ? ANONYMOUS_API_KEY : KEY_PLACEHOLDER;
      const curl = [
        `curl -X POST "${this.apiBase}/generate/text/async"`,
        `  -H "apikey: ${key}"`,
        '  -H "Content-Type: application/json"',
        '  -H "Client-Agent: AiHordeFrontpage:generate"',
        `  -d '${stringifyAsJson(body)}'`,
      ].join(' \\\n');
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

  public openPreview(): void {
    this.previewOpen.set(true);
  }

  public closePreview(): void {
    this.previewOpen.set(false);
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

  public async draft(): Promise<void> {
    if (this.busy() || !this.hasMaterial()) return;
    this.busy.set(true);
    this.outcome.set(null);
    this.copiedTake.set(null);
    try {
      const outcome = await this.drafts.draft(
        this.material(),
        this.modelPick(),
        this.models() ?? undefined,
        {
          anonymous: this.anonymous(),
          origin: this.origin() ?? this.defaultOrigin(),
        },
        this.shape(),
      );
      this.outcome.set(outcome);
      if (outcome.kind === 'done') await this.loadHistory();
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

  public send(index = 0): void {
    const text = this.draftTexts()[index];
    if (text) this.apply.emit(text);
  }

  public async toggleHistory(): Promise<void> {
    const open = !this.historyOpen();
    this.historyOpen.set(open);
    if (open) await this.loadHistory();
  }

  public usePast(draft: StoredPromptDraft): void {
    this.apply.emit(draft.text);
  }

  public async copyPast(draft: StoredPromptDraft): Promise<void> {
    await copyToClipboard(draft.text);
  }

  public async deletePast(draft: StoredPromptDraft): Promise<void> {
    await this.store.remove(draft.id);
    await this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    try {
      this.history.set(await this.store.list(HISTORY_LIMIT));
    } catch {
      // A history that will not open leaves the strip empty, nothing more.
      this.history.set([]);
    }
  }

  private async loadModels(): Promise<void> {
    this.models.set(await this.drafts.textModels());
  }

  private async loadStyles(): Promise<void> {
    this.styles.set(await this.drafts.imagePromptStyles());
  }
}
