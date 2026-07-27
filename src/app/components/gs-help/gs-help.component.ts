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
import { GsHelpService } from '../../services/gs-help.service';
import {
  SWEEP_GRID_PARAMETER_BY_HELP_TOPIC,
  SWEEP_PARAMETER_BY_HELP_TOPIC,
} from '../../services/sweep-library.service';
import { GsSweepGridComponent } from '../gs-sweep-grid/gs-sweep-grid.component';
import { GsSweepScrubComponent } from '../gs-sweep-scrub/gs-sweep-scrub.component';

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
 * Content lives under `generate.help.<topic>.title` (a short field name, used
 * for the trigger's accessible name) and `generate.help.<topic>.body`.
 */
@Component({
  selector: 'app-gs-help',
  imports: [TranslocoPipe, GsSweepScrubComponent, GsSweepGridComponent],
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
      <!-- Anyone who opened the note gets the pictures if there are any: a
           reader who says "expert" is still allowed to want to see it. -->
      @if (sweepParameter(); as parameter) {
        <app-gs-sweep-scrub [parameter]="parameter" />
      }
      <!-- Second line, under the strip: the plate is the follow-up question,
           and a reader who has not asked the first one is not looking for it. -->
      @if (sweepGridParameter(); as parameter) {
        <app-gs-sweep-grid [parameter]="parameter" />
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

  /** The `generate.help.<topic>` content this trigger explains. */
  public readonly topic = input.required<string>();

  private static nextInstance = 0;
  private readonly instance = GsHelpComponent.nextInstance++;

  private readonly trigger =
    viewChild<ElementRef<HTMLButtonElement>>('trigger');

  public readonly noteId = computed(
    () => `gs-help-${this.topic()}-${this.instance}`,
  );
  public readonly titleKey = computed(
    () => `generate.help.${this.topic()}.title`,
  );
  public readonly bodyKey = computed(
    () => `generate.help.${this.topic()}.body`,
  );
  /** The sweep this field has pictures for, or null when it has none. */
  public readonly sweepParameter = computed(
    () => SWEEP_PARAMETER_BY_HELP_TOPIC[this.topic()] ?? null,
  );
  /** The two-axis plate this field shares with the one beside it, if any. */
  public readonly sweepGridParameter = computed(
    () => SWEEP_GRID_PARAMETER_BY_HELP_TOPIC[this.topic()] ?? null,
  );

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

  public onEscape(): void {
    if (!this.isOpen()) {
      return;
    }
    this.help.close();
    this.trigger()?.nativeElement.focus();
  }
}
