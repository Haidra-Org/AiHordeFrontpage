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
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import {
  PromptDraftModelPick,
  PromptDraftOrigin,
  PromptDraftOutcome,
  PromptDraftService,
  curatedRank,
} from '../../services/prompt-draft.service';
import {
  PromptDraftDbService,
  StoredPromptDraft,
} from '../../services/prompt-draft-db.service';
import { AuthService } from '../../services/auth.service';
import { UnitConversionService } from '../../services/unit-conversion.service';
import { ActiveModel } from '../../types/active-model';
import { copyToClipboard } from '../../helper/copy-to-clipboard';
import type { AlchemyFoldPin } from '../alchemy/alchemy-pictures/alchemy-pictures.component';

/** How the override select names its choice. */
type PickValue = 'auto' | 'any' | `model:${string}`;

/** Where the anonymous choice is remembered between visits. */
const ANONYMOUS_STORAGE_KEY = 'aihorde.prompt-draft.anonymous';

/** Long enough that a typed note is priced once, not on every keystroke. */
const ESTIMATE_DEBOUNCE_MS = 600;

/** How many past drafts the strip offers. */
const HISTORY_LIMIT = 10;

/**
 * A prompt written by one of the horde's text models. Under an alchemy job it
 * writes from what alchemy found in a picture: the caption, the strongest
 * tags, and a note from the reader. Under the image studio's prompt box it
 * improves what is already written. Either way the draft is shown, not
 * applied: it goes to the prompt box or the clipboard on a press.
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
  imports: [TranslocoPipe, IconComponent, DatePipe],
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
  private readonly units = inject(UnitConversionService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  public readonly caption = input<string | null>(null);
  public readonly tags = input<string | null>(null);
  /** The prompt as written, when the card is there to improve one. */
  public readonly seed = input<string | null>(null);
  public readonly defaultOpen = input<boolean | null>(null);
  public readonly foldPin = input<AlchemyFoldPin | null>(null);
  /**
   * Which surface the card sits on, for the history. Left unset it follows the
   * job the card has, so a caller that has nothing to add need say nothing.
   */
  public readonly origin = input<PromptDraftOrigin | null>(null);
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
  public readonly copied = signal(false);

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
    });
    // Everything the price depends on is read here so a change to any of it
    // reschedules the one pending estimate.
    effect(() => {
      const ready = this.isOpen() && this.hasMaterial() && !this.busy();
      this.note();
      this.pick();
      this.seed();
      this.caption();
      this.tags();
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

  public readonly draftText = computed(() => {
    const outcome = this.outcome();
    return outcome?.kind === 'done' ? outcome.text : null;
  });

  public readonly hasMaterial = computed(() =>
    this.mode() === 'improve'
      ? !!this.seed()?.trim()
      : !!(this.caption() || this.tags() || this.note().trim()),
  );

  public isCurated(model: ActiveModel): boolean {
    return curatedRank(model.name) !== null;
  }

  public onPickChange(value: string): void {
    this.pick.set(value as PickValue);
  }

  public onNoteInput(value: string): void {
    this.note.set(value);
  }

  private modelPick(): PromptDraftModelPick {
    const pick = this.pick();
    if (pick === 'auto' || pick === 'any') return pick;
    return { model: pick.slice('model:'.length) };
  }

  private material(): {
    caption?: string | null;
    tags?: string | null;
    note?: string | null;
    prompt?: string | null;
  } {
    return this.mode() === 'improve'
      ? { prompt: this.seed(), note: this.note() }
      : { caption: this.caption(), tags: this.tags(), note: this.note() };
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
  }

  public async draft(): Promise<void> {
    if (this.busy() || !this.hasMaterial()) return;
    this.busy.set(true);
    this.outcome.set(null);
    this.copied.set(false);
    try {
      const outcome = await this.drafts.draft(
        this.material(),
        this.modelPick(),
        this.models() ?? undefined,
        {
          anonymous: this.anonymous(),
          origin: this.origin() ?? this.defaultOrigin(),
        },
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

  public async copy(): Promise<void> {
    const text = this.draftText();
    if (!text) return;
    await copyToClipboard(text);
    this.copied.set(true);
  }

  public send(): void {
    const text = this.draftText();
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
}
