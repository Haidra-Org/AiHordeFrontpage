import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Under this the two halves are too small to read against each other, so the
 * pair is shown side by side instead. It is the drawn width of the images that
 * decides it rather than the width of the screen: a wipe inside a narrow column
 * on a wide display is just as unreadable.
 */
const MIN_WIPE_WIDTH_PX = 280;

/** How far one arrow key moves the divider, in percent of the width. */
const KEY_STEP = 5;

/** Which way each key moves the divider, and where the two ends are. */
const KEY_MOVES: Readonly<Record<string, number>> = {
  ArrowLeft: -KEY_STEP,
  ArrowDown: -KEY_STEP,
  ArrowRight: KEY_STEP,
  ArrowUp: KEY_STEP,
};

/**
 * The nine copies a repeated frame is laid out as. Three across rather than two
 * puts whole joins inside the plate instead of only at the point where the four
 * corners meet, which is where a seam is easiest to see.
 */
const TILE_CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

/** A CSS length that is exact enough to draw against and short enough to read. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Two renders of one scene, one over the other, with a divider the reader wipes
 * across them.
 *
 * A before and an after are a comparison of two states rather than a range, and
 * the difference between them is usually in one place: laid out side by side
 * the reader has to carry half the picture across the gap in their head, which
 * is exactly the work a wipe does for them. The divider is theirs to move, by
 * drag, by press anywhere on the picture (unless the caller has kept the
 * presses for itself), or from the keyboard.
 *
 * Below the width at which each half stops being legible the wipe stops being
 * the better reading and the pair is shown side by side instead. That fallback
 * lives here rather than in the callers: every surface that has a before and an
 * after has the same narrow column somewhere, and a consumer branching on width
 * would be writing this component's own rule again in its own template.
 *
 * The two side labels are the tags in the corners, so a still of the component
 * (a screenshot, a print) still says which half is which. They are given either
 * as text or as projected content, which is how a caller with a richer token to
 * put there (a setting chip, say) puts it there.
 */
@Component({
  selector: 'app-gs-compare-wipe',
  imports: [TranslocoPipe, NgTemplateOutlet],
  host: { '(click)': 'onClick($event)' },
  template: `
    <!-- One side, however this pair has to be drawn. A repeated frame has no
         single image to hang alt text on, so the nine copies are one labelled
         group and the copies themselves are decoration. -->
    <ng-template #media let-src="src" let-alt="alt">
      @if (tiled()) {
        <span class="gs-wipe-tiled" role="img" [attr.aria-label]="alt">
          @for (cell of tileCells; track cell) {
            <img
              class="gs-wipe-tile"
              [src]="src"
              alt=""
              loading="lazy"
              (load)="onImageLoad()"
            />
          }
        </span>
      } @else {
        <img
          class="gs-wipe-img"
          [src]="src"
          [alt]="alt"
          loading="lazy"
          (load)="onImageLoad()"
        />
      }
    </ng-template>

    <div
      #stage
      class="gs-wipe"
      [class.is-wiping]="wiping()"
      [class.is-fitted]="fitted()"
      [class.is-zoomed]="zoomed()"
      [style.--gs-wipe-at]="atCss()"
      [style.--gs-wipe-zoom]="zoom()"
      [style.--gs-wipe-pan-x.px]="panX()"
      [style.--gs-wipe-pan-y.px]="panY()"
      [style.--gs-wipe-box-w]="boxCss().width"
      [style.--gs-wipe-box-h]="boxCss().height"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="endDrag()"
      (pointercancel)="cancelDrag()"
    >
      <div class="gs-wipe-media gs-wipe-media--before">
        <ng-container
          [ngTemplateOutlet]="media"
          [ngTemplateOutletContext]="{ src: beforeSrc(), alt: beforeAlt() }"
        />
      </div>
      <span class="gs-wipe-tag gs-wipe-tag--before">
        <ng-content select="[wipe-before]">{{
          beforeLabel() || ('generate.compare.before' | transloco)
        }}</ng-content>
        @if (beforeNote()) {
          <span class="gs-wipe-note">{{ beforeNote() }}</span>
        }
      </span>

      <div class="gs-wipe-media gs-wipe-media--after">
        <ng-container
          [ngTemplateOutlet]="media"
          [ngTemplateOutletContext]="{ src: afterSrc(), alt: afterAlt() }"
        />
      </div>
      <span class="gs-wipe-tag gs-wipe-tag--after">
        <ng-content select="[wipe-after]">{{
          afterLabel() || ('generate.compare.after' | transloco)
        }}</ng-content>
        @if (afterNote()) {
          <span class="gs-wipe-note">{{ afterNote() }}</span>
        }
      </span>

      @if (wiping()) {
        <!-- The divider is the control, so it is what takes focus and what the
             arrow keys move; the bar and the grip inside it are the drawing. -->
        <div
          class="gs-wipe-divider"
          role="slider"
          tabindex="0"
          aria-orientation="horizontal"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-label]="'generate.compare.slider_label' | transloco"
          [attr.aria-valuenow]="rounded()"
          [attr.aria-valuetext]="
            'generate.compare.value_text' | transloco: { percent: rounded() }
          "
          (keydown)="onKeydown($event)"
        >
          <span class="gs-wipe-grip" aria-hidden="true"></span>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsCompareWipeComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** The state the reader starts from, drawn underneath. */
  public readonly beforeSrc = input.required<string>();
  /** The state being compared to it, revealed from the right. */
  public readonly afterSrc = input.required<string>();
  /** What the corner tag on the left says. Empty falls back to "Before". */
  public readonly beforeLabel = input('');
  /** What the corner tag on the right says. Empty falls back to "After". */
  public readonly afterLabel = input('');
  public readonly beforeAlt = input('');
  public readonly afterAlt = input('');
  /**
   * Draw each side as a three-by-three plate of the one frame. A tile only shows
   * its seams where one copy meets the next, so a pair of tiles has to be
   * repeated before there is anything to compare.
   */
  public readonly tiled = input(false);
  /**
   * Lay the pair out side by side whatever the room, on the same fallback the
   * narrow case already uses. A wipe holds a comparison for the reader where the
   * difference is in one place on one composition; where the two frames are
   * different pictures the divider reads as a collage, and the caller says so.
   */
  public readonly sideBySide = input(false);
  /**
   * Move the divider only from the divider itself. A pair standing inside a
   * surface that is itself pressable (the sweep's collapsed card, which opens
   * on a press anywhere) cannot also claim every press on the picture, or the
   * one control the card offers becomes the only thing on it that does nothing.
   */
  public readonly handleOnly = input(false);
  /**
   * Hold both sides in one box that clamps to the room the caller gives it,
   * rather than letting the pair's own pixels set the height. A wipe inside a
   * full-screen view has a box to fill and two pictures that may not be the
   * same size as each other: one box, both sides drawn into it, is what makes
   * the divider compare the same pixels on both sides of itself.
   */
  public readonly fit = input(false);
  /**
   * How big that box is, in CSS pixels. The caller knows which of the two sides
   * is the larger and so which one's pixels the pair is being read at, and a
   * measured box is the only way the smaller side is enlarged to meet the
   * larger rather than the larger being reduced to meet it. Null leaves the box
   * to the pictures themselves.
   */
  public readonly fitWidth = input<number | null>(null);
  public readonly fitHeight = input<number | null>(null);
  /**
   * How far in the pair is drawn, and how far it has been dragged from centre.
   * Both sides take the same view, and the divider is carried with them, so
   * what is on either side of it stays the same pair of pixels at every zoom.
   */
  public readonly zoom = input(1);
  public readonly panX = input(0);
  public readonly panY = input(0);
  /**
   * A line under each side's tag for what had to be done to it to make the
   * comparison fair, e.g. that the smaller side was enlarged to match.
   */
  public readonly beforeNote = input('');
  public readonly afterNote = input('');

  /** The first frame to arrive, for callers showing a note until one does. */
  public readonly imageLoad = output<void>();

  private readonly at = signal(50);
  private readonly width = signal(0);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');

  private dragging = false;
  private suppressClick = false;
  private suppressClickTimer: ReturnType<typeof setTimeout> | null = null;
  private announcedLoad = false;

  public readonly tileCells = TILE_CELLS;

  /** How much of the after side is revealed, as a percentage of the width. */
  public readonly percent = this.at.asReadonly();

  /** The same number as a slider reads it out: whole percent, not a fraction. */
  public readonly rounded = computed(() => Math.round(this.at()));

  public readonly atCss = computed(() => `${this.at()}%`);

  /** Whether both sides are being drawn into one box the caller bounds. */
  public readonly fitted = computed(() => this.fit() && this.wiping());

  /** Whether the pair is drawn at anything other than the size it was given. */
  public readonly zoomed = computed(() => this.zoom() !== 1);

  /**
   * The box in CSS pixels, or `auto` while the caller has measured nothing. A
   * pair whose caller measures nothing is drawn at whatever the pictures make
   * of the room, which is what a pair without a box does anyway.
   */
  public readonly boxCss = computed(() => {
    const width = this.fitWidth();
    const height = this.fitHeight();
    return width && height && width > 0 && height > 0
      ? { width: `${round(width)}px`, height: `${round(height)}px` }
      : { width: 'auto', height: 'auto' };
  });

  /**
   * Whether the pair is being wiped rather than laid out side by side. A width
   * of zero is a pair that has not been measured yet rather than a pair with no
   * room: the wipe is the presentation, and the fallback waits to be needed.
   */
  public readonly wiping = computed(() => {
    if (this.sideBySide()) {
      return false;
    }
    const width = this.width();
    return width === 0 || width >= MIN_WIPE_WIDTH_PX;
  });

  constructor() {
    this.observeWidth();
  }

  /**
   * Move the divider, in percent from the left. Clamped to the picture and held
   * to a tenth of a percent: a drag across a wide frame is finer than the whole
   * percent the slider reads out, and rounding it there would make it step.
   */
  public setPercent(next: number): void {
    if (Number.isNaN(next)) {
      return;
    }
    const held = Math.min(Math.max(next, 0), 100);
    this.at.set(Math.round(held * 10) / 10);
  }

  /**
   * A press anywhere on the pair puts the divider there and starts a drag: the
   * divider is small and the picture is what the reader is looking at.
   */
  public onPointerDown(event: PointerEvent): void {
    if (!this.wiping()) {
      return;
    }
    if (
      this.handleOnly() &&
      !(
        event.target instanceof Element &&
        event.target.closest('.gs-wipe-divider')
      )
    ) {
      return;
    }
    // The press belongs to the divider from here on. A wipe often stands on a
    // surface that is itself dragged (the sweep's stage scrubs through stops),
    // and a press that reached both would move the divider and the picture
    // under it at once.
    event.stopPropagation();
    this.dragging = true;
    this.suppressClick = true;
    if (this.suppressClickTimer !== null) {
      clearTimeout(this.suppressClickTimer);
      this.suppressClickTimer = null;
    }
    const stage = this.stage()?.nativeElement;
    if (
      stage &&
      Number.isFinite(event.pointerId) &&
      typeof stage.setPointerCapture === 'function'
    ) {
      stage.setPointerCapture(event.pointerId);
    }
    this.pointTo(event.clientX);
  }

  public onPointerMove(event: PointerEvent): void {
    if (this.dragging) {
      this.pointTo(event.clientX);
    }
  }

  public endDrag(): void {
    this.dragging = false;
    if (this.suppressClick) {
      this.suppressClickTimer = setTimeout(() => {
        this.suppressClick = false;
        this.suppressClickTimer = null;
      }, 0);
    }
  }

  public cancelDrag(): void {
    this.dragging = false;
    this.suppressClick = false;
  }

  /** Pointer capture can retarget the drag's click to the picture underneath. */
  public onClick(event: MouseEvent): void {
    if (!this.suppressClick) {
      return;
    }
    event.stopPropagation();
    this.suppressClick = false;
    if (this.suppressClickTimer !== null) {
      clearTimeout(this.suppressClickTimer);
      this.suppressClickTimer = null;
    }
  }

  /**
   * The arrows step, the ends snap. Both are taken from the divider rather than
   * the page, so the keys that scroll go on scrolling everywhere else.
   */
  public onKeydown(event: KeyboardEvent): void {
    const move = KEY_MOVES[event.key];
    if (move !== undefined) {
      event.preventDefault();
      this.setPercent(this.at() + move);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      this.setPercent(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      this.setPercent(100);
    }
  }

  public onImageLoad(): void {
    if (!this.announcedLoad) {
      this.announcedLoad = true;
      this.imageLoad.emit();
    }
  }

  /**
   * Where a pointer at this page position falls across the pair, in the
   * picture's own pixels rather than the box's. The two are the same until the
   * pair is zoomed or dragged, and once it is, the divider has to follow the
   * pointer over the picture rather than over the frame around it.
   */
  private pointTo(clientX: number): void {
    const stage = this.stage()?.nativeElement;
    if (!stage) {
      return;
    }
    const box = stage.getBoundingClientRect();
    if (box.width <= 0) {
      return;
    }
    const centre = box.left + box.width / 2;
    const across = (clientX - centre - this.panX()) / (box.width * this.zoom());
    this.setPercent((across + 0.5) * 100);
  }

  /**
   * Watch the room the pair has. The observer reports on the element it is
   * given as soon as it is given it, so the first reading arrives without a
   * separate measurement; where there is no observer at all (a server render,
   * an old engine) the pair is left as the wipe it is meant to be.
   */
  private observeWidth(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const element = this.host.nativeElement;
    const observer = new ResizeObserver((entries) => {
      this.width.set(entries[0]?.contentRect.width ?? element.offsetWidth);
    });
    observer.observe(element);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
