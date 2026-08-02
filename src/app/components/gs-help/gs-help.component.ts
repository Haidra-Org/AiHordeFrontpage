import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsHelpDockService } from '../../services/gs-help-dock.service';
import { GsHelpService } from '../../services/gs-help.service';
import {
  hasReference,
  settingNoteKey,
  settingTitleKey,
} from '../../content/settings';
import { IconComponent } from '../icon/icon.component';

/**
 * The studio's per-field help affordance: a small circled "?" beside a label
 * that expands a plain-language note about what the field does.
 *
 * The note is rendered inline, immediately below the row it belongs to, rather
 * than as a floating popover. The control panel body is a scroll container with
 * its own containing block (`.gs-body`), so a positioned popover would either be
 * clipped by it or have to be measured and re-anchored on every scroll; an
 * inline note cannot be clipped, reads in DOM order, and works the same on touch
 * as with a mouse. It also means the trigger toggles on click/Enter/Space only:
 * expanding on hover or on tab-focus would shift the rest of the form under the
 * pointer while the reader is aiming at something else.
 *
 * The note is prose and nothing else. It used to mount the parameter sweeps
 * under itself, which pushed the field it was describing off the screen the
 * moment anyone asked what the field was; the pictures, the numbers and the
 * depth now live in the setting's reference entry, and the note offers the way
 * to it rather than becoming it.
 *
 * Content lives under `generate.help.<topic>.title` (a short field name, used
 * for the trigger's accessible name) and `generate.help.<topic>.body`.
 */
@Component({
  selector: 'app-gs-help',
  imports: [TranslocoPipe, IconComponent],
  template: `
    <button
      #trigger
      type="button"
      class="gs-help-btn"
      [attr.aria-expanded]="isOpen()"
      [attr.aria-controls]="noteId()"
      [attr.aria-describedby]="isOpen() ? noteId() : null"
      (click)="toggle($event)"
    >
      <span aria-hidden="true">?</span>
      <span class="sr-only"
        >{{ 'generate.help.about' | transloco }}
        {{ titleKey() | transloco }}</span
      >
    </button>
    @if (isOpen()) {
      <p class="gs-help-note gs-fadeup" role="note" [id]="noteId()">
        {{ bodyKey() | transloco }}
      </p>
      <!-- Only where there is something to see: a setting the reference has not
           reached yet would be offering a door onto an empty room. -->
      @if (hasEntry()) {
        <button type="button" class="gs-help-see" (click)="seeIt($event)">
          <app-icon name="photo" class="gs-ico-sm" />
          {{ 'generate.help.see_it' | transloco }}
        </button>
      }
    }
  `,
  host: {
    class: 'gs-help',
    '(document:keydown.escape)': 'onEscape()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsHelpComponent {
  private readonly help = inject(GsHelpService);
  private readonly dock = inject(GsHelpDockService);

  /** The `generate.help.<topic>` content this trigger explains. */
  public readonly topic = input.required<string>();

  private static nextInstance = 0;
  private readonly instance = GsHelpComponent.nextInstance++;

  private readonly trigger =
    viewChild<ElementRef<HTMLButtonElement>>('trigger');

  public readonly noteId = computed(
    () => `gs-help-${this.topic()}-${this.instance}`,
  );
  public readonly titleKey = computed(() => settingTitleKey(this.topic()));
  public readonly bodyKey = computed(() => settingNoteKey(this.topic()));

  /** Whether the reference has an entry this note can send a reader on to. */
  public readonly hasEntry = computed(() => hasReference(this.topic()));

  constructor() {
    effect(() => {
      if (this.help.requestedTopic() === this.topic()) {
        this.help.claimTopic(this.noteId());
      }
    });
  }

  public isOpen(): boolean {
    return this.help.isOpen(this.noteId());
  }

  /**
   * Stops the click short of any surrounding `<label>` or row handler: the
   * trigger sits next to controls whose own row is clickable.
   */
  public toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.help.toggle(this.noteId());
  }

  /**
   * Open the setting's reference entry, docked beside the results or in the
   * mobile sheet. The note is left expanded: it is the thing that said the
   * entry existed, and collapsing it would take the way back with it.
   */
  public seeIt(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.dock.open(this.topic());
  }

  public onEscape(): void {
    if (!this.isOpen()) {
      return;
    }
    this.help.close();
    this.trigger()?.nativeElement.focus();
  }
}
