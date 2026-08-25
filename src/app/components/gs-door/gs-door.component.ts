import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * A door: the evidence capsule's chassis for a press that leaves the page.
 *
 * The capsule and the door are deliberately the same card. What separates them
 * is the peek pane and the glyph on the trailing edge, and nothing else: a
 * chevron over a strip of film means the evidence opens here, an arrow means
 * the press goes somewhere. A reader who has learned one card has learned every
 * card the docs put in front of them.
 *
 * Two kinds. A `grid` door leads with a contact sheet of the plate's own first
 * stops, because a grid is thirty-six frames and a sentence about it is not
 * evidence of anything. A `studio` door trades the film for the panel's own
 * blue and its dials: "go and do" must never look like "stay and see", and the
 * one thing a reader should never misread is which of the two they are about to
 * get.
 *
 * The words arrive already translated. A door's title is the caller's sentence
 * about where it goes, and composing it here would mean this component knowing
 * about grids, flows and settings alike.
 */
@Component({
  selector: 'app-gs-door',
  imports: [IconComponent],
  template: `
    <button
      type="button"
      class="gs-cap gs-door"
      [class]="controlClass()"
      [class.gs-door--tutorial]="kind() === 'tutorial'"
      [disabled]="disabled()"
      (click)="entered.emit()"
    >
      @if (kind() === 'tutorial') {
        <!-- The tutorials' own mark and hue: every door that starts one wears
             them, so a reader learns once what the amber cap means. -->
        <span class="gs-door-panel gs-door-panel--tutorial" aria-hidden="true">
          <app-icon name="academic-cap" />
        </span>
      } @else if (kind() === 'studio') {
        <span class="gs-door-panel" aria-hidden="true">
          <app-icon [name]="icon() ?? 'adjustments-horizontal'" />
        </span>
      } @else {
        <span class="gs-door-sheet" aria-hidden="true">
          @for (tile of tiles(); track $index) {
            <img class="gs-door-tile" [src]="tile" alt="" loading="lazy" />
          }
        </span>
      }
      <span class="gs-cap-text">
        @if (eyebrow(); as badge) {
          <span
            class="gs-cap-eyebrow"
            [class.gs-tut-eyebrow]="kind() === 'tutorial'"
          >
            <span class="gs-cap-dot" aria-hidden="true"></span>
            {{ badge }}
          </span>
        }
        <span class="gs-cap-title">{{ title() }}</span>
        @if (meta(); as note) {
          <span class="gs-cap-meta">
            <span [class.gs-cap-mono]="monoMeta()">{{ note }}</span>
          </span>
        }
      </span>
      <span class="gs-door-arrow" aria-hidden="true">
        <app-icon [name]="arrowIcon()" class="gs-ico-sm" />
      </span>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsDoorComponent {
  /**
   * Which kind of door: evidence somewhere else, the panel itself, or a
   * tutorial, which wears the tutorials' own mark and hue wherever it starts.
   */
  public readonly kind = input.required<'grid' | 'studio' | 'tutorial'>();
  /**
   * The glyph on a studio door where the place it leads to has a mark of its
   * own (the picture, the flask, the cap); null takes the panel's sliders.
   */
  public readonly icon = input<string | null>(null);
  /** The badge over the title, already translated, or null where there is none. */
  public readonly eyebrow = input<string | null>(null);
  /** Where the door goes, in the caller's own words. */
  public readonly title = input.required<string>();
  /** The line under the title: a payload in numbers, or what the press does. */
  public readonly meta = input<string | null>(null);
  /** Whether the meta line is a count and belongs in the mono face. */
  public readonly monoMeta = input(false);
  /** The frames a grid door leads with, as URLs the caller has resolved. */
  public readonly tiles = input<readonly string[]>([]);
  /**
   * A class for the button itself, where the surface mounting the door already
   * has one it hangs behaviour or layout on.
   */
  public readonly controlClass = input('');
  public readonly disabled = input(false);

  public readonly entered = output<void>();

  /** Off the page for a grid, across to the panel for the studio. */
  public readonly arrowIcon = computed(() =>
    this.kind() === 'studio' ? 'arrow-right' : 'arrow-top-right-on-square',
  );
}
