import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../icon/icon.component';
import {
  PromptDraftModelPick,
  PromptDraftOutcome,
  PromptDraftService,
  curatedRank,
} from '../../../services/prompt-draft.service';
import { ActiveModel } from '../../../types/active-model';
import { copyToClipboard } from '../../../helper/copy-to-clipboard';
import type { AlchemyFoldPin } from '../alchemy-pictures/alchemy-pictures.component';

/** How the override select names its choice. */
type PickValue = 'auto' | 'any' | `model:${string}`;

/**
 * A prompt for the image studio, written by one of the horde's text models
 * from what alchemy found in a picture: the caption, the strongest tags, and
 * a note from the reader. The draft is shown, not applied: it goes to the
 * studio or the clipboard on a press.
 *
 * The model is picked from a curated list by default, and the pick can be
 * overridden with any model online, or no preference at all, for a reader
 * who knows what they want.
 */
@Component({
  selector: 'app-alchemy-prompt-draft',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './alchemy-prompt-draft.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-size]': '"tall"',
  },
})
export class AlchemyPromptDraftComponent {
  private readonly drafts = inject(PromptDraftService);

  public readonly caption = input<string | null>(null);
  public readonly tags = input<string | null>(null);
  public readonly defaultOpen = input<boolean | null>(null);
  public readonly foldPin = input<AlchemyFoldPin | null>(null);
  /** The draft, for the image studio's prompt box. */
  public readonly sendToPrompt = output<string>();

  private readonly openOverride = signal<boolean | null>(null);
  public readonly note = signal('');
  public readonly pick = signal<PickValue>('auto');
  public readonly models = signal<ActiveModel[] | null>(null);
  public readonly busy = signal(false);
  public readonly outcome = signal<PromptDraftOutcome | null>(null);
  public readonly copied = signal(false);

  constructor() {
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
  }

  public readonly isOpen = computed(() => {
    const override = this.openOverride();
    if (override !== null) return override;
    return this.defaultOpen() ?? false;
  });

  public toggleOpen(): void {
    this.openOverride.set(!this.isOpen());
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

  public readonly hasMaterial = computed(
    () => !!(this.caption() || this.tags() || this.note().trim()),
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

  public async draft(): Promise<void> {
    if (this.busy() || !this.hasMaterial()) return;
    this.busy.set(true);
    this.outcome.set(null);
    this.copied.set(false);
    try {
      const outcome = await this.drafts.draft(
        { caption: this.caption(), tags: this.tags(), note: this.note() },
        this.modelPick(),
        this.models() ?? undefined,
      );
      this.outcome.set(outcome);
    } finally {
      this.busy.set(false);
    }
  }

  public async copy(): Promise<void> {
    const text = this.draftText();
    if (!text) return;
    await copyToClipboard(text);
    this.copied.set(true);
  }

  public send(): void {
    const text = this.draftText();
    if (text) this.sendToPrompt.emit(text);
  }

  private async loadModels(): Promise<void> {
    this.models.set(await this.drafts.textModels());
  }
}
