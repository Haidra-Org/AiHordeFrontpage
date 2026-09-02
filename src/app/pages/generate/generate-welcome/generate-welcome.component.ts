import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsSheetComponent } from '../../../components/gs-sheet/gs-sheet.component';
import { DatabaseService } from '../../../services/database.service';
import {
  TutorialEngineService,
  TutorialLevel,
} from '../../../services/tutorial-engine.service';
import { DOCS_IMAGE } from '../../../content/docs-links';
import { isConceptFlow } from '../../../content/flows';

/** Set once the reader has asked not to be welcomed again. */
export const WELCOMED_KEY = 'aihorde.generate.learn.welcomed';

/** What a focus trap counts as somewhere to land. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** One of the ways in offered on a first visit. */
export interface WelcomeDoor {
  /** Suffix of the door's `generate.welcome.*` keys, and of nothing else. */
  id: string;
  /** The Learn level taking this door settles on. */
  level: TutorialLevel;
  /** The tutorial to start, or null to leave the reader in a bare studio. */
  flowId: string | null;
}

/**
 * The ways in offered to a reader who has not been here before, asked once at
 * every width. The studio stacks its panes on a narrow screen, so an offer made
 * inside the results would sit below the whole control panel where a first-time
 * reader never meets it; asking over the page is what makes the question the
 * same question on a phone and on a desktop.
 *
 * One list, two presentations, the way the panel's Options list is drawn: the
 * house bottom sheet where the studio has no room beside the panel, and a
 * centred dialog where it has. The host decides which by handing in the width
 * it already watches, so nothing here measures the viewport.
 */
@Component({
  selector: 'app-generate-welcome',
  imports: [
    TranslocoPipe,
    NgTemplateOutlet,
    RouterLink,
    IconComponent,
    GsSheetComponent,
  ],
  templateUrl: './generate-welcome.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateWelcomeComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly db = inject(DatabaseService);
  private readonly tutorial = inject(TutorialEngineService);

  /** Whether the studio is stacking its panes, which is what picks the sheet. */
  public readonly narrow = input(false);

  /** The reader is done with the offer, however they answered it. */
  public readonly closed = output<void>();

  /**
   * The ways in. The first door runs the txt2img walkthrough, which makes an
   * image by working the panel; the second starts the migrating track, since a
   * reader comfortable with this has almost always generated somewhere else and
   * needs their vocabulary mapped rather than image generation taught, and it
   * hands over to that same walkthrough at the end. Pointing a door at another
   * track is this list's `flowId` and nothing else.
   */
  public readonly doors: readonly WelcomeDoor[] = [
    { id: 'door1', level: 'new_to_this', flowId: 'txt2img' },
    { id: 'door2', level: 'comfortable', flowId: 'concepts_migrating' },
    { id: 'door3', level: 'expert', flowId: null },
  ];

  /** The whole shelf of reading, which the foot row offers beside the doors. */
  public readonly docsLink = DOCS_IMAGE;

  /** Whether the reader has asked not to be offered this again. */
  public readonly dontShow = signal(false);

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    const onKeydown = (event: KeyboardEvent): void => this.handleKey(event);
    this.document.addEventListener('keydown', onKeydown);
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('keydown', onKeydown),
    );

    // The dialog itself takes focus rather than the first door: the press that
    // opened the studio must not carry into starting a walkthrough.
    afterNextRender(() => this.panel()?.nativeElement.focus());
  }

  public setDontShow(event: Event): void {
    this.dontShow.set((event.target as HTMLInputElement).checked);
  }

  /**
   * What the door offers, in the words the rest of the studio uses for it. Two
   * of the three run something from the same registry, and one of those two
   * teaches an idea rather than a technique: calling that one a tutorial
   * promises a walkthrough the reader will not be given.
   */
  public badgeKey(door: WelcomeDoor): string {
    return door.flowId !== null && isConceptFlow(door.flowId)
      ? 'generate.learn.badge_read'
      : 'generate.learn.badge';
  }

  /**
   * Take a door: settle the Learn level it stands for and start its tutorial, if
   * it has one. Only a door sets a level, so the offer can be skipped without
   * committing the reader to a register they never chose.
   */
  public enterVia(door: WelcomeDoor): void {
    this.tutorial.setLevel(door.level);
    if (door.flowId) {
      void this.tutorial.start(door.flowId);
    }
    this.close();
  }

  /** Put the offer away for this visit, leaving the level as it was. */
  public skip(): void {
    this.close();
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.skip();
    }
  }

  /**
   * Answering the offer closes it for this visit; only the checkbox says it
   * should stay closed, because a reader who took a door may well want the same
   * question again on a screen they have not settled into yet.
   */
  private close(): void {
    if (this.dontShow()) {
      this.db.store(WELCOMED_KEY, true);
    }
    this.closed.emit();
  }

  /** The sheet answers Escape and traps focus itself, so this only serves the dialog. */
  private handleKey(event: KeyboardEvent): void {
    if (this.narrow()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.skip();
      return;
    }
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return;
    }
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
