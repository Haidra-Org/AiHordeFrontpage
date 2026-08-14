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

/**
 * Two renders of one scene, one over the other, with a divider the reader wipes
 * across them.
 *
 * A before and an after are a comparison of two states rather than a range, and
 * the difference between them is usually in one place: laid out side by side
 * the reader has to carry half the picture across the gap in their head, which
 * is exactly the work a wipe does for them. The divider is theirs to move, by
 * drag, by press anywhere on the picture, or from the keyboard.
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
      [style.--gs-wipe-at]="atCss()"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="endDrag()"
      (pointercancel)="endDrag()"
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

  /** The first frame to arrive, for callers showing a note until one does. */
  public readonly imageLoad = output<void>();

  private readonly at = signal(50);
  private readonly width = signal(0);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');

  private dragging = false;
  private announcedLoad = false;

  public readonly tileCells = TILE_CELLS;

  /** How much of the after side is revealed, as a percentage of the width. */
  public readonly percent = this.at.asReadonly();

  /** The same number as a slider reads it out: whole percent, not a fraction. */
  public readonly rounded = computed(() => Math.round(this.at()));

  public readonly atCss = computed(() => `${this.at()}%`);

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
    this.dragging = true;
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

  /** Where a pointer at this page position falls across the pair. */
  private pointTo(clientX: number): void {
    const stage = this.stage()?.nativeElement;
    if (!stage) {
      return;
    }
    const box = stage.getBoundingClientRect();
    if (box.width <= 0) {
      return;
    }
    this.setPercent(((clientX - box.left) / box.width) * 100);
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
