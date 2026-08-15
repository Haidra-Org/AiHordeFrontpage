import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import { GsSettingChipComponent } from '../gs-setting-chip/gs-setting-chip.component';
import {
  settingProseLabelKey,
  settingSection,
  sweepGridNoteKey,
} from '../../content/settings';
import { sectionIdentity } from '../../content/sections';
import { GsDoorComponent } from '../gs-door/gs-door.component';
import {
  SweepLibraryService,
  SweepStop,
} from '../../services/sweep-library.service';

/**
 * A two-axis plate from the sweep library: the same scene rendered across every
 * combination of two settings, so "these two are not independent" is something
 * the reader sees in one look.
 *
 * It sits beside the scrubber rather than inside it, because a grid answers a
 * different question from a strip: a strip says what one number does, and the
 * plate says what it does while the number next to it is also wrong. Like the
 * scrubber it starts as one line of offer, and unlike the scrubber it fetches
 * nothing at all until that offer is taken: a plate is dozens of frames, which
 * is not something to load behind a reader's back on any connection.
 *
 * Opened, it is the enlarged layer directly, on the same viewer grammar the
 * scrubber's full-size frame uses. Cells are reached with the arrow keys and
 * open to their own full-size look; Escape steps back out of a cell, then out
 * of the plate. A page about one of the two settings lays the same plate out on
 * the page instead, through `startExpanded`, and drops the parts of the layer
 * that only a layer needs.
 */
@Component({
  selector: 'app-gs-sweep-grid',
  imports: [
    TranslocoPipe,
    IconComponent,
    GsSettingChipComponent,
    GsDoorComponent,
  ],
  template: `
    @if (strip(); as plate) {
      <!-- The two settings the plate is of, named as the panel names them, so
           the offer says which pair of numbers is about to be argued about. -->
      @let rowsName = rowsLabelKey() | transloco;
      @let columnsName = columnsLabelKey() | transloco;

      <div class="gs-sweep">
        @if (!inline()) {
          <!-- A grid is dozens of frames and a layer of its own, so the offer is
               a door rather than a capsule: it leads with six of the plate's own
               first stops as a contact sheet, and carries the arrow that says
               the press leaves the page. -->
          <app-gs-door
            kind="grid"
            controlClass="gs-sweep-grid-offer"
            [tiles]="sheet()"
            [eyebrow]="
              sectionLabelKey()
                ? ('generate.sweeps.badge_grid'
                  | transloco: { section: sectionLabelKey()! | transloco })
                : ('generate.sweeps.badge_grid_plain' | transloco)
            "
            [title]="
              'generate.sweeps.grid_expand'
                | transloco: { rows: rowsName, columns: columnsName }
            "
            [meta]="
              'generate.sweeps.grid_meta'
                | transloco
                  : {
                      n: plate.stops.length,
                      rows: rowCount(),
                      columns: columnCount(),
                    }
            "
            [monoMeta]="true"
            (entered)="open()"
          />
        }

        @if (opened() || inline()) {
          <div
            class="gs-sweep-viewer"
            [class.gs-sweep-viewer--inline]="inline()"
            [attr.tabindex]="inline() ? null : 0"
            (click)="onBackdrop($event)"
            (keydown.escape)="close()"
          >
            <div
              #panel
              class="gs-sweep-viewer-body gs-sweep-grid-body"
              [attr.role]="inline() ? null : 'dialog'"
              [attr.aria-modal]="inline() ? null : 'true'"
              [attr.tabindex]="inline() ? null : -1"
              [attr.aria-label]="
                inline() ? null : ('generate.sweeps.grid_title' | transloco)
              "
              (keydown)="onKeydown($event)"
            >
              <div class="gs-sweep-viewer-top">
                <span class="gs-sweep-viewer-name">
                  {{ 'generate.sweeps.grid_title' | transloco }}
                </span>
                @if (!inline()) {
                  <button
                    #closeButton
                    type="button"
                    class="gs-sweep-viewer-x"
                    [attr.aria-label]="'generate.sweeps.grid_close' | transloco"
                    (click)="close()"
                  >
                    <app-icon name="x-mark" class="gs-ico-sm" />
                  </button>
                }
              </div>

              @if (cell(); as shown) {
                <div class="gs-sweep-grid-cell-view">
                  <img
                    class="gs-sweep-viewer-img"
                    [src]="frameUrl(shown)"
                    [alt]="shown.caption"
                  />
                  <p class="gs-sweep-viewer-cap">{{ shown.caption }}</p>
                  <!-- The same four moves the arrow keys make, on screen: a
                       reader who opened a cell with a finger has no arrow keys
                       and would otherwise have to go back to the plate to
                       reach the picture beside it. The edges disable rather
                       than vanish, so the row does not shuffle under the
                       finger that is using it. -->
                  <div
                    class="gs-sweep-cell-nav"
                    role="group"
                    [attr.aria-label]="
                      'generate.sweeps.cell_nav_label' | transloco
                    "
                  >
                    @for (step of cellMoves; track step.key) {
                      <button
                        type="button"
                        class="gs-sweep-cell-step"
                        [disabled]="!canMove(step)"
                        [attr.aria-label]="step.labelKey | transloco"
                        (click)="move(step)"
                      >
                        <app-icon [name]="step.icon" class="gs-ico-sm" />
                      </button>
                    }
                  </div>
                  <button
                    #back
                    type="button"
                    class="gs-sweep-collapse"
                    (click)="backToPlate()"
                  >
                    {{ 'generate.sweeps.grid_back' | transloco }}
                  </button>
                </div>
              } @else {
                <!-- A real table: the plate is two headed axes of values, which
                     is what a table is, and it gives the headers their reading
                     order without a hand-built grid role. -->
                <div class="gs-sweep-grid-scroll">
                  <table class="gs-sweep-plate">
                    <caption class="sr-only">
                      {{
                        plate.grid!.rows.caption
                      }}
                      {{
                        plate.grid!.columns.caption
                      }}
                    </caption>
                    <thead>
                      <tr>
                        <!-- The corner is the one cell that can say which way
                             round the plate is read, and the only place the two
                             settings appear together without a value. -->
                        <td class="gs-sweep-plate-corner">
                          {{
                            'generate.sweeps.grid_corner'
                              | transloco
                                : { rows: rowsName, columns: columnsName }
                          }}
                        </td>
                        @for (
                          column of plate.grid!.columns.values;
                          track $index
                        ) {
                          <th scope="col" class="gs-sweep-plate-head">
                            <app-gs-setting-chip
                              [glyph]="false"
                              [settingId]="plate.grid!.columns.parameter"
                              [value]="column"
                            />
                          </th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (
                        row of plate.grid!.rows.values;
                        track $index;
                        let r = $index
                      ) {
                        <tr>
                          <th scope="row" class="gs-sweep-plate-head">
                            <app-gs-setting-chip
                              [glyph]="false"
                              [settingId]="plate.grid!.rows.parameter"
                              [value]="row"
                            />
                          </th>
                          @for (
                            column of plate.grid!.columns.values;
                            track $index;
                            let c = $index
                          ) {
                            <td class="gs-sweep-plate-td">
                              @if (stopAt(r, c); as frame) {
                                <button
                                  #cellButton
                                  type="button"
                                  class="gs-sweep-plate-cell"
                                  [class.is-at]="at() === r * columnCount() + c"
                                  [attr.aria-label]="frame.caption"
                                  (click)="openCell(r * columnCount() + c)"
                                >
                                  <img
                                    class="gs-sweep-plate-img"
                                    [src]="frameUrl(frame)"
                                    alt=""
                                    loading="lazy"
                                  />
                                </button>
                              }
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p class="gs-sweep-plate-legend">
                  {{ plate.grid!.rows.caption }}
                  {{ plate.grid!.columns.caption }}
                </p>
                <!-- What the plate is of, where the axes alone would let it be
                     misread as more than one shoot. -->
                @if (noteKey(); as note) {
                  <p class="gs-sweep-plate-legend">{{ note | transloco }}</p>
                }
                <p class="gs-sweep-plate-legend">
                  {{ 'generate.sweeps.grid_hint' | transloco }}
                </p>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
  host: {
    '[class]': 'identityClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsSweepGridComponent {
  private readonly sweeps = inject(SweepLibraryService);

  /** The plate's own parameter name, e.g. `steps_cfg_grid`. */
  public readonly parameter = input.required<string>();
  /** Narrow the plate to one model; unset takes the model the studio is on. */
  public readonly modelSlug = input<string | undefined>(undefined);
  /** Narrow the plate to one scene. */
  public readonly sceneId = input<string | undefined>(undefined);
  /**
   * Lay the plate out on the page rather than behind an offer. A page about one
   * setting is where a reader has come to look at pictures of it, so the plate
   * is part of the page: it keeps the same chassis and the same cell view, and
   * drops the parts that only a layer over the page needs, which is the way out
   * of it and the focus it would have taken.
   */
  public readonly startExpanded = input(false);

  private readonly isOpen = signal(false);
  private readonly cursor = signal<number | null>(null);
  private readonly zoomed = signal(false);

  /** The moves the cell view puts on screen, as something the template repeats. */
  public readonly cellMoves = CELL_MOVES;

  public readonly opened = this.isOpen.asReadonly();
  /** Whether the plate is part of the page rather than a layer over it. */
  public readonly inline = computed(() => this.startExpanded());
  /** Which cell the arrow keys are on, or null before they have been used. */
  public readonly at = this.cursor.asReadonly();

  /** This plate's own footnote, where it needs a sentence the others do not. */
  public readonly noteKey = computed(() => sweepGridNoteKey(this.parameter()));

  /** What the panel calls each axis, for the offer and the plate's corner. */
  public readonly rowsLabelKey = computed(() =>
    settingProseLabelKey(this.strip()?.grid?.rows.parameter ?? ''),
  );
  public readonly columnsLabelKey = computed(() =>
    settingProseLabelKey(this.strip()?.grid?.columns.parameter ?? ''),
  );

  /** The area of the panel the plate belongs to, taken from its rows axis. */
  private readonly identity = computed(() =>
    sectionIdentity(settingSection(this.strip()?.grid?.rows.parameter ?? '')),
  );

  public readonly sectionLabelKey = computed(
    () => this.identity()?.labelKey ?? null,
  );
  public readonly identityClass = computed(
    () => this.identity()?.className ?? '',
  );

  /**
   * The contact sheet the door leads with: the plate's own first six frames.
   * Six is one row of the sheet's three columns doubled, which is enough to
   * read as a grid of renders and few enough to stay a thumbnail.
   */
  public readonly sheet = computed<readonly string[]>(() =>
    (this.strip()?.stops ?? []).slice(0, 6).map((stop) => this.frameUrl(stop)),
  );

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly closeButton =
    viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly cellButtons =
    viewChildren<ElementRef<HTMLButtonElement>>('cellButton');

  private focusedPanel: HTMLElement | null = null;
  /** The cell the keyboard was last moved to, so a re-render cannot re-take focus. */
  private focusedCell: number | null = null;

  public readonly strip = computed(() =>
    this.sweeps.grid(
      this.parameter(),
      this.modelSlug() ?? this.sweeps.studioModelSlug(),
      this.sceneId(),
    ),
  );

  public readonly columnCount = computed(
    () => this.strip()?.grid?.columns.values.length ?? 0,
  );
  public readonly rowCount = computed(
    () => this.strip()?.grid?.rows.values.length ?? 0,
  );

  /** The cell on show full size, or null while the plate itself is. */
  public readonly cell = computed<SweepStop | null>(() => {
    const at = this.cursor();
    return this.zoomed() && at !== null
      ? (this.strip()?.stops[at] ?? null)
      : null;
  });

  constructor() {
    void this.sweeps.ensureLoaded();

    afterRenderEffect(() => {
      const panel = this.panel()?.nativeElement ?? null;
      // A plate laid out on the page is part of the page, and taking focus on
      // arrival would move a reader who never asked to be moved.
      if (panel && panel !== this.focusedPanel && !this.inline()) {
        panel.focus();
      }
      this.focusedPanel = panel;

      // Arrow keys move a cell cursor rather than the browser's focus, so the
      // focus is moved after the fact to keep the two in one place.
      const at = this.cursor();
      if (!panel || this.zoomed() || at === null || at === this.focusedCell) {
        this.focusedCell = panel ? this.focusedCell : null;
        return;
      }
      this.cellButtons()[at]?.nativeElement.focus();
      this.focusedCell = at;
    });
  }

  public frameUrl(stop: SweepStop): string {
    return this.sweeps.imageUrl(stop);
  }

  /** The frame at one row and column, the plate being laid out row by row. */
  public stopAt(row: number, column: number): SweepStop | null {
    return this.strip()?.stops[row * this.columnCount() + column] ?? null;
  }

  public open(): void {
    this.isOpen.set(true);
  }

  /** Fold the plate away. There is nothing to fold away when it is the page. */
  public close(): void {
    if (this.inline()) {
      return;
    }
    this.isOpen.set(false);
    this.zoomed.set(false);
    this.cursor.set(null);
    this.focusedCell = null;
  }

  public openCell(index: number): void {
    this.cursor.set(index);
    this.zoomed.set(true);
  }

  /** Back out of one cell to the plate, with the cursor left where it was. */
  public backToPlate(): void {
    this.zoomed.set(false);
    this.focusedCell = null;
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  /**
   * Escape steps back out of a cell first and out of the plate second, so a
   * reader who opened one frame is not thrown all the way out of the grid.
   * Enter and Space are the button's own. Tab is held inside the layer by hand:
   * the plate is reached with the arrow keys, so the only tab stop it needs is
   * the way out.
   */
  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (this.zoomed()) {
        this.backToPlate();
      } else {
        this.close();
      }
      return;
    }
    // Tab is only held in when there is a layer to hold it in; on the page the
    // plate is one more thing to tab past.
    if (event.key === 'Tab' && !this.inline()) {
      event.preventDefault();
      this.closeButton()?.nativeElement.focus();
      return;
    }
    const step = MOVES[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    this.move(step);
  }

  /** Move the cursor by a whole column or a whole row, staying on the plate. */
  public move(step: CellMove): void {
    if (this.columnCount() === 0 || this.rowCount() === 0) {
      return;
    }
    if (this.cursor() === null) {
      // The first arrow key enters the plate rather than moving inside it.
      this.cursor.set(0);
      return;
    }
    const next = this.landing(step);
    if (next !== null) {
      this.cursor.set(next);
    }
  }

  /** Whether a step in this direction lands on another cell of the plate. */
  public canMove(step: CellMove): boolean {
    return this.landing(step) !== null;
  }

  /** Where a step from the cursor lands, or null when it runs off the plate. */
  private landing(step: CellMove): number | null {
    const columns = this.columnCount();
    const rows = this.rowCount();
    const at = this.cursor();
    if (columns === 0 || rows === 0 || at === null) {
      return null;
    }
    const row = Math.floor(at / columns) + step.row;
    const column = (at % columns) + step.column;
    if (row < 0 || row >= rows || column < 0 || column >= columns) {
      return null;
    }
    return row * columns + column;
  }
}

/** A step across the plate: one whole column, or one whole row. */
interface CellMove {
  row: number;
  column: number;
}

/** Which way each arrow key moves the cell cursor. */
const MOVES: Readonly<Record<string, CellMove>> = {
  ArrowLeft: { row: 0, column: -1 },
  ArrowRight: { row: 0, column: 1 },
  ArrowUp: { row: -1, column: 0 },
  ArrowDown: { row: 1, column: 0 },
};

/** The same four moves as buttons in the cell view, in reading order. */
const CELL_MOVES: readonly (CellMove & {
  key: string;
  icon: string;
  labelKey: string;
})[] = [
  {
    ...MOVES['ArrowLeft'],
    key: 'left',
    icon: 'chevron-left',
    labelKey: 'generate.sweeps.cell_prev_column',
  },
  {
    ...MOVES['ArrowUp'],
    key: 'up',
    icon: 'chevron-up',
    labelKey: 'generate.sweeps.cell_prev_row',
  },
  {
    ...MOVES['ArrowDown'],
    key: 'down',
    icon: 'chevron-down',
    labelKey: 'generate.sweeps.cell_next_row',
  },
  {
    ...MOVES['ArrowRight'],
    key: 'right',
    icon: 'chevron-right',
    labelKey: 'generate.sweeps.cell_next_column',
  },
];
