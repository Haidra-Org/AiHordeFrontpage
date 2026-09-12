import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { A11yModule } from '@angular/cdk/a11y';
import { IconComponent } from '../icon/icon.component';
import { useScrollLock } from '../../helper/scroll-lock';
import { useBackClose } from '../../helper/back-close';

/** How far along its own height a drag has to travel before it snaps over. */
const SNAP_FRACTION = 0.25;
/** A drag past this share of the viewport height jumps two stops rather than one. */
const LONG_DRAG_FRACTION = 0.45;
/** How far a sideways gesture has to travel before it is a swipe rather than a tap. */
const SWIPE_MIN_PX = 24;
/**
 * How much longer a gesture has to be sideways than up for it to be read as a
 * swipe. A thumb travelling to a stop rarely leaves a straight line, so the
 * angle is generous; anything steeper belongs to the stop it is heading for.
 */
const SWIPE_AXIS_RATIO = 1.7;

/**
 * How much of the screen the sheet takes: a bar (peek), the step at a readable
 * height (half), or the whole viewport (full) for a reader who finds the half
 * too small to read and follow at once.
 */
export type SheetStop = 'peek' | 'half' | 'full';
const STOPS: readonly SheetStop[] = ['peek', 'half', 'full'];
/** Movement above this is a drag, so the click that follows is not a tap. */
const DRAG_SLOP_PX = 6;
/** The clearance to claim while the sheet measures as nothing. */
const FALLBACK_CLEARANCE_PX = 96;
/** Where the page reads how much room the sheet is taking at the bottom. */
const CLEARANCE_VAR = '--gs-sheet-clearance';

/** Which headings the sheet will hand focus to when it opens. */
const HEADING_SELECTOR = 'h1, h2, h3, [data-sheet-heading]';

let nextInstance = 0;

/**
 * A bottom sheet, with nothing in it. The studio needs the same chassis for
 * more than one thing on a phone (a setting's reference entry, and the
 * follow-along steps after it), and each of those is content rather than a
 * different way of covering the bottom of the screen.
 *
 * It has three stops. At peek it is a bar: a grabber, whatever the caller
 * projects into `[sheet-bar]`, and the buttons that move it. At half it shows
 * its body at a readable height and scrolls it. At full it takes the whole
 * viewport, for a reader who finds the half too small to read and follow at
 * once. It moves from the labelled buttons, from a tap on the grabber and from a
 * drag on the grabber, because on a phone those are one intention and only the
 * last of them is discoverable without reading anything; the buttons carry
 * words as well as chevrons so the affordance is not a guess. The bar and the
 * body also report a sideways swipe, for content that has a next and a
 * previous; the same rule holds there, and every caller that takes the swipe
 * keeps its own buttons for both directions.
 *
 * The system Back gesture takes an open sheet down to its bar before it takes
 * the reader off the page.
 *
 * Whether a sheet is the right presentation at all is a question for CSS: the
 * host is display:none from 1024px up, where the studio has a pane to dock
 * things in instead. Nothing here measures the viewport, so a server render and
 * the first client frame agree about what exists.
 */
@Component({
  selector: 'app-gs-sheet',
  imports: [TranslocoPipe, IconComponent, A11yModule],
  template: `
    <div
      class="gs-sheet-panel"
      [style.transform]="dragTransform()"
      [cdkTrapFocus]="stop() === 'full'"
    >
      <!-- Whatever the caller wants read across the very top edge, before the
           grip: the tutorial puts its progress there, three pixels tall, so
           the peek row spends no height on it. -->
      <ng-content select="[sheet-edge]" />
      <!-- The grip row: the grabber across the width, and the stop buttons at
           its end, so the controls that move the sheet sit with the handle
           that moves it rather than in the row the content's own actions
           need. The grabber is pointer-only and hidden from assistive
           technology on purpose: everything it does is on the buttons beside
           it, and those are what a keyboard or a screen reader is given. -->
      <div class="gs-sheet-top">
        <!-- A caller may put its own first line here, beside the stop buttons:
             the tutorial's mark and name live on this row so the sheet spends
             one row on identity and controls together rather than two. With
             content in it the grabber becomes a pill over the row's centre. -->
        <ng-content select="[sheet-head]" />
        <button
          type="button"
          class="gs-sheet-grab"
          tabindex="-1"
          aria-hidden="true"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (pointercancel)="onPointerUp($event)"
          (click)="onGrabClick()"
        >
          <span class="gs-sheet-grip"></span>
        </button>
        <div class="gs-sheet-stops">
          <!-- One labelled button per direction the sheet can go from where it
             is: the words say what happens, the chevron says which way. -->
          @if (stop() !== 'full') {
            <button
              type="button"
              class="gs-sheet-btn gs-sheet-btn--labelled"
              [attr.aria-expanded]="expanded()"
              [attr.aria-controls]="bodyId"
              (click)="up()"
            >
              <app-icon
                name="chevron-right"
                class="gs-sheet-chev gs-sheet-chev--up"
              />
              <span class="gs-sheet-btn-text">{{
                (stop() === 'peek'
                  ? 'generate.sheet.show'
                  : 'generate.sheet.fill'
                ) | transloco
              }}</span>
            </button>
          }
          @if (stop() !== 'peek') {
            <button
              type="button"
              class="gs-sheet-btn gs-sheet-btn--labelled"
              [attr.aria-controls]="bodyId"
              (click)="down()"
            >
              <app-icon name="chevron-right" class="gs-sheet-chev" />
              <span class="gs-sheet-btn-text">{{
                (stop() === 'full'
                  ? 'generate.sheet.shrink'
                  : 'generate.sheet.hide'
                ) | transloco
              }}</span>
            </button>
          }
          @if (dismissible()) {
            <button
              type="button"
              class="gs-sheet-btn"
              [attr.aria-label]="'generate.sheet.close' | transloco"
              (click)="close()"
            >
              <app-icon name="x-mark" />
            </button>
          }
        </div>
      </div>
      <!-- The bar takes both gestures a phone reader will try on it: a drag up
           or down moves the sheet, as it does on the grabber, and a swipe
           across asks the content to move on. Which of the two a gesture is is
           decided once, from its first few pixels, so neither can start in the
           middle of the other. -->
      <div
        class="gs-sheet-bar"
        (pointerdown)="onSurfaceDown($event, true)"
        (pointermove)="onSurfaceMove($event)"
        (pointerup)="onSurfaceUp($event)"
        (pointercancel)="onSurfaceCancel()"
      >
        <div class="gs-sheet-slot">
          <ng-content select="[sheet-bar]" />
        </div>
      </div>
      <div
        #sheetBody
        class="gs-sheet-body"
        [id]="bodyId"
        tabindex="-1"
        [hidden]="!expanded()"
        (pointerdown)="onSurfaceDown($event, false)"
        (pointermove)="onSurfaceMove($event)"
        (pointerup)="onSurfaceUp($event)"
        (pointercancel)="onSurfaceCancel()"
      >
        <ng-content />
      </div>
    </div>
  `,
  host: {
    class: 'gs-sheet',
    role: 'dialog',
    '[attr.aria-label]': 'label()',
    '[attr.aria-modal]': 'stop() === "full" ? "true" : null',
    '[class.gs-sheet--open]': 'expanded()',
    '[class.gs-sheet--full]': 'stop() === "full"',
    '[class.gs-sheet--dragging]': 'dragging()',
    '(document:keydown.escape)': 'onEscape()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsSheetComponent {
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The accessible name of the sheet as a whole. */
  public readonly label = input('');
  /**
   * Whether the sheet arrives expanded. A sheet the reader asked for by name
   * should already be showing what they asked for; one that appeared on its own
   * should not have taken the screen before they looked at it.
   */
  public readonly startExpanded = input(false);
  /**
   * The stop to open at, when the caller knows better than the memory: a long
   * read has nothing to show behind it, so it asks for full whatever the reader
   * chose for a stepped tutorial. Null defers to the memory and to
   * `startExpanded`.
   */
  public readonly startAt = input<SheetStop | null>(null);
  /**
   * Whether the chassis offers a way out of itself. Content the reader is
   * part-way through has no safe dismissal here: a close button and the Escape
   * that follows a collapse would both end that content rather than the sheet
   * around it, so such a sheet hides both and carries its own exit instead.
   */
  public readonly dismissible = input(true);

  /**
   * A storage key under which the stop is remembered between mounts, for a
   * sheet the reader meets again and again: a reader who chose full for one
   * step should not have to choose it for the next.
   *
   * The memory lasts the visit and no longer. A stop chosen once and kept for
   * ever means a reader meets a sheet already over the thing they came back
   * for, with no memory of having asked for it.
   */
  public readonly rememberAs = input<string | null>(null);

  /** The reader dismissed the sheet; the caller decides what that means. */
  public readonly closed = output<void>();

  /**
   * A sideways swipe across the bar or the body, in the direction a reader
   * reads: `forward` for a swipe to the left, `back` for one to the right. The
   * chassis knows nothing about what the content does with it, and every
   * caller that takes it keeps its own visible buttons for the same two moves.
   */
  public readonly swiped = output<'forward' | 'back'>();

  private readonly bodyRef = viewChild<ElementRef<HTMLElement>>('sheetBody');

  /**
   * The page behind the sheet stops scrolling while the sheet is the whole
   * screen: nothing of the page is visible then, and a page that still moves
   * under a full sheet reads as the tutorial dragging the form about. At half
   * the page stays scrollable on purpose, because the band above the sheet is
   * where the field a step points at is brought into view; the body's own
   * `overscroll-behavior: contain` keeps its overshoot from reaching the page.
   * The shared lock is what the overlay layer uses, so a sheet and a dialog
   * lock the page the same way and restore it the same way.
   */
  private readonly scrollBlock = useScrollLock();

  /**
   * The system Back gesture takes the sheet down to its bar before it takes the
   * reader off the page. On a phone Back is what a reader reaches for to get a
   * cover off the screen, and a sheet that lets it through loses them the page
   * and everything they had set up on it. A sheet already at its bar is not
   * covering anything, so Back goes where it always went.
   */
  private readonly backClose = useBackClose(() => {
    if (!this.expanded()) {
      return false;
    }
    this.collapse();
    return true;
  });

  public readonly bodyId = `gs-sheet-body-${nextInstance++}`;

  private readonly at = signal<SheetStop>('peek');
  /** Which stop the sheet is at. */
  public readonly stop = this.at.asReadonly();
  /** Whether the body is on screen at all: any stop above peek. */
  public readonly expanded = computed(() => this.at() !== 'peek');

  public readonly dragging = signal(false);
  private readonly dragOffset = signal(0);
  public readonly dragTransform = computed(() => {
    const offset = this.dragOffset();
    return offset === 0 ? null : `translateY(${offset}px)`;
  });

  /** Where the drag started, and which stop it started from. */
  private startY = 0;
  private startedAt: SheetStop = 'peek';
  /** Whether the pointer moved far enough that the click after it is no tap. */
  private moved = false;

  /** Where a gesture on the bar or the body began, and what it turned out to be. */
  private surfaceStartX = 0;
  private surfaceStartY = 0;
  private surfaceAxis: 'undecided' | 'across' | 'along' | 'given-up' =
    'given-up';
  /** Whether the surface the gesture started on can move the sheet as well. */
  private surfaceDetents = false;

  /**
   * Whether the screen is wider than it is tall. A sheet takes the same share
   * of a short screen as of a tall one, so in landscape it stops offering
   * itself the whole viewport and lands at the readable height instead; a
   * reader who wants the whole screen there still has the button that says so.
   */
  private readonly landscape = signal(false);
  private orientation: MediaQueryList | null = null;

  private observer: ResizeObserver | null = null;

  constructor() {
    // Signal inputs are not bound until after construction, so the opening
    // state is taken when it arrives rather than read out of the constructor.
    effect(() => {
      const start = this.startExpanded();
      const asked = this.startAt();
      const remembered = this.rememberedStop();
      untracked(() =>
        this.at.set(
          this.landed(asked ?? remembered ?? (start ? 'half' : 'peek')),
        ),
      );
    });
    // The height is read after the browser has drawn the state it belongs to;
    // reading it as the state changes would publish the height it just left.
    effect(() => {
      this.expanded();
      if (!this.isBrowser) {
        return;
      }
      afterNextRender(() => this.publishClearance(), {
        injector: this.injector,
      });
    });
    if (this.isBrowser) {
      // The shape of the screen is read after the first frame, so a server
      // render and the frame that replaces it agree about what exists; the
      // stop the sheet landed on without being told is checked against it
      // once, there and nowhere else. A reader who rotates the phone keeps the
      // stop they chose, as every other sheet on the platform does.
      afterNextRender(
        () => {
          this.observeHeight();
          this.watchOrientation();
          this.at.set(this.landed(untracked(() => this.at())));
          // Armed for as long as the sheet is on the page, at every stop: the
          // entry is what makes the gesture reach this component at all, and
          // what it does with the gesture depends on the stop it is at when
          // the gesture arrives, not on the stop it was at when it armed.
          this.backClose.arm();
        },
        { injector: this.injector },
      );
    }
    effect(() => {
      const whole = this.at() === 'full';
      if (!this.isBrowser) {
        return;
      }
      if (whole) {
        this.scrollBlock.enable();
      } else {
        this.scrollBlock.disable();
      }
    });
    this.destroyRef.onDestroy(() => {
      this.observer?.disconnect();
      this.orientation?.removeEventListener('change', this.onOrientation);
      if (this.isBrowser) {
        document.documentElement.style.removeProperty(CLEARANCE_VAR);
      }
    });
  }

  /** Between the bar and the readable height, which is what a tap on the grabber means. */
  public toggle(): void {
    this.setStop(this.at() === 'peek' ? 'half' : 'peek');
  }

  public collapse(): void {
    this.setStop('peek');
  }

  public expand(): void {
    this.setStop('half');
  }

  /** One stop up: peek to half, half to full. */
  public up(): void {
    this.setStop(this.at() === 'peek' ? 'half' : 'full');
  }

  /** One stop down: full to half, half to peek. */
  public down(): void {
    this.setStop(this.at() === 'full' ? 'half' : 'peek');
  }

  public close(): void {
    this.closed.emit();
  }

  /**
   * Put the body back at its start. Content that replaces itself in place (a
   * tutorial moving to its next step) is otherwise read from wherever the last
   * one was left, which lands the reader in the middle of a sentence they have
   * not met.
   */
  public scrollBodyToTop(): void {
    this.bodyRef()?.nativeElement.scrollTo?.({ top: 0, behavior: 'auto' });
  }

  /**
   * Where a stop the sheet was not asked for by name actually lands. On a
   * screen wider than it is tall the whole viewport is not a stop the sheet
   * takes on its own: the readable height already leaves the body more lines
   * than the full height does rows to spare, and the reader keeps the labelled
   * button for the times they want everything.
   */
  private landed(stop: SheetStop): SheetStop {
    return stop === 'full' && this.landscape() ? 'half' : stop;
  }

  private readonly onOrientation = (event: MediaQueryListEvent): void =>
    this.landscape.set(event.matches);

  private watchOrientation(): void {
    const query = globalThis.matchMedia?.('(min-aspect-ratio: 1/1)');
    if (!query) {
      return;
    }
    this.orientation = query;
    this.landscape.set(query.matches);
    query.addEventListener('change', this.onOrientation);
  }

  /**
   * Escape unwinds one layer at a time: an expanded sheet collapses to its bar,
   * and a sheet already at its bar is dismissed. Two presses is the shortest
   * way out that never takes away what the reader was looking at by surprise.
   * The second press does nothing where the sheet is not dismissible.
   */
  public onEscape(): void {
    if (this.at() !== 'peek') {
      this.down();
      return;
    }
    if (!this.dismissible()) {
      return;
    }
    this.close();
  }

  public onGrabClick(): void {
    if (this.moved) {
      this.moved = false;
      return;
    }
    this.toggle();
  }

  public onPointerDown(event: PointerEvent): void {
    if (event.button > 0) {
      return;
    }
    this.startY = event.clientY;
    this.startedAt = this.at();
    this.moved = false;
    this.dragging.set(true);
    (event.target as Element).setPointerCapture?.(event.pointerId);
  }

  /**
   * The sheet only follows the pointer towards a stop it has: at peek that is
   * up, at full it is down, and at half it is either. Rubber-banding towards a
   * state that does not exist would promise it.
   */
  public onPointerMove(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    const delta = event.clientY - this.startY;
    let offset = delta;
    if (this.startedAt === 'peek') {
      offset = Math.min(0, delta);
    } else if (this.startedAt === 'full') {
      offset = Math.max(0, delta);
    }
    if (Math.abs(offset) > DRAG_SLOP_PX) {
      this.moved = true;
    }
    this.dragOffset.set(offset);
  }

  /**
   * A short drag moves one stop in its direction; a drag longer than a good
   * share of the screen moves two, so a reader can pull the bar straight up to
   * full or throw the full sheet straight down to the bar.
   */
  public onPointerUp(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    const offset = this.dragOffset();
    this.dragging.set(false);
    this.dragOffset.set(0);
    const travel =
      this.host.nativeElement.offsetHeight || FALLBACK_CLEARANCE_PX;
    if (Math.abs(offset) < travel * SNAP_FRACTION) {
      return;
    }
    const viewport = this.isBrowser ? window.innerHeight : 0;
    const steps =
      viewport > 0 && Math.abs(offset) >= viewport * LONG_DRAG_FRACTION ? 2 : 1;
    const direction = offset < 0 ? 1 : -1;
    const index = STOPS.indexOf(this.startedAt) + direction * steps;
    const stop = STOPS.at(Math.max(0, Math.min(STOPS.length - 1, index)));
    if (stop) {
      this.setStop(this.landed(stop));
    }
  }

  /**
   * Where a gesture on the bar or the body starts. The pointer is not captured
   * and nothing is decided yet: the surfaces carry buttons, and a press that
   * turns out to be a press has to reach the button under it.
   */
  public onSurfaceDown(event: PointerEvent, detents: boolean): void {
    if (event.button > 0 || this.crossesSideways(event)) {
      this.surfaceAxis = 'given-up';
      return;
    }
    this.surfaceStartX = event.clientX;
    this.surfaceStartY = event.clientY;
    this.surfaceAxis = 'undecided';
    this.surfaceDetents = detents;
  }

  /**
   * Which gesture this is, decided once and then held. A sideways swipe has to
   * be both long enough to be deliberate and much more sideways than up, so a
   * thumb reaching for a stop never moves the content instead; anything else on
   * a surface that has stops is the drag the grabber does, and anything else on
   * the body is the body being read.
   */
  public onSurfaceMove(event: PointerEvent): void {
    if (this.surfaceAxis === 'given-up') {
      return;
    }
    if (this.surfaceAxis === 'along') {
      this.onPointerMove(event);
      return;
    }
    const dx = event.clientX - this.surfaceStartX;
    const dy = event.clientY - this.surfaceStartY;
    if (this.surfaceAxis === 'across') {
      return;
    }
    if (
      Math.abs(dx) >= SWIPE_MIN_PX &&
      Math.abs(dx) > Math.abs(dy) * SWIPE_AXIS_RATIO
    ) {
      this.surfaceAxis = 'across';
      return;
    }
    if (Math.abs(dy) <= DRAG_SLOP_PX) {
      return;
    }
    if (!this.surfaceDetents) {
      this.surfaceAxis = 'given-up';
      return;
    }
    // The drag is measured from where the finger went down rather than from
    // where it was when the axis became clear, so the sheet does not jump the
    // few pixels it took to decide.
    this.surfaceAxis = 'along';
    this.startY = this.surfaceStartY;
    this.startedAt = this.at();
    this.moved = true;
    this.dragging.set(true);
    // The surface itself takes the pointer, not whatever was under the finger:
    // a drag that leaves the bar has to keep reporting to the bar, and by this
    // point the gesture is a drag and no longer a press on a button. Capturing
    // any earlier would take the press off the buttons the bar carries.
    this.capture(event);
    this.onPointerMove(event);
  }

  public onSurfaceUp(event: PointerEvent): void {
    const axis = this.surfaceAxis;
    this.surfaceAxis = 'given-up';
    if (axis === 'along') {
      this.onPointerUp(event);
      return;
    }
    if (axis !== 'across') {
      return;
    }
    const dx = event.clientX - this.surfaceStartX;
    if (Math.abs(dx) < SWIPE_MIN_PX) {
      return;
    }
    this.swiped.emit(dx < 0 ? 'forward' : 'back');
  }

  /**
   * Hand the pointer to the element the handler is on. Where the element is
   * gone (a surface that re-rendered mid-gesture) there is nothing to capture
   * and the gesture ends with the events it has already had.
   */
  private capture(event: PointerEvent): void {
    const surface = event.currentTarget as Element | null;
    try {
      surface?.setPointerCapture?.(event.pointerId);
    } catch {
      // A pointer the browser has already released cannot be captured, and a
      // gesture that ends there is one the reader has already finished.
    }
  }

  public onSurfaceCancel(): void {
    if (this.surfaceAxis === 'along') {
      this.dragging.set(false);
      this.dragOffset.set(0);
    }
    this.surfaceAxis = 'given-up';
  }

  /**
   * Whether the gesture started on something that scrolls sideways of its own
   * accord (a strip of pictures inside the body). That content owns the
   * sideways axis where it has one, and taking it would stop the strip moving.
   */
  private crossesSideways(event: PointerEvent): boolean {
    let node = event.target as HTMLElement | null;
    const panel = this.host.nativeElement;
    while (node && node !== panel) {
      const overflow = getComputedStyle(node).overflowX;
      if (
        (overflow === 'auto' || overflow === 'scroll') &&
        node.scrollWidth - node.clientWidth > 1
      ) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  /**
   * The stop remembered under `rememberAs`, if it is one the sheet has. Kept
   * for the visit rather than for ever: see {@link rememberAs}.
   */
  private rememberedStop(): SheetStop | null {
    const key = this.rememberAs();
    if (!key || !this.isBrowser) {
      return null;
    }
    const stored = sessionStorage.getItem(key);
    return STOPS.includes(stored as SheetStop) ? (stored as SheetStop) : null;
  }

  private setStop(next: SheetStop): void {
    const previous = this.at();
    if (previous === next) {
      return;
    }
    this.at.set(next);
    const key = this.rememberAs();
    if (key && this.isBrowser) {
      sessionStorage.setItem(key, next);
    }
    // Focus follows the body when it first appears; a change of size around a
    // body already being read leaves the reader where they were.
    if (previous !== 'peek' || next === 'peek' || !this.isBrowser) {
      return;
    }
    afterNextRender(() => this.focusHeading(), { injector: this.injector });
  }

  /**
   * Move focus into what the sheet just revealed. The heading is the target
   * rather than the first control: the reader asked to read the thing, and
   * landing on a button inside it says nothing about what it is.
   */
  private focusHeading(): void {
    const body = this.bodyRef()?.nativeElement;
    if (!body) {
      return;
    }
    const target = body.querySelector<HTMLElement>(HEADING_SELECTOR) ?? body;
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }
    // Focus without moving the body. A heading that is only there for assistive
    // technology can sit below a picture or a lead, and letting the focus drag
    // the body to it opens the sheet part-way down what it has to say.
    target.focus({ preventScroll: true });
  }

  /**
   * Watch the sheet's own height so the page can scroll clear of it. The
   * content decides how tall the bar is and whether the body reaches its cap,
   * so the number is measured rather than restated from the stylesheet.
   */
  private observeHeight(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.observer = new ResizeObserver(() => this.publishClearance());
    this.observer.observe(this.host.nativeElement);
  }

  private publishClearance(): void {
    const height =
      this.host.nativeElement.offsetHeight || FALLBACK_CLEARANCE_PX;
    document.documentElement.style.setProperty(CLEARANCE_VAR, `${height}px`);
  }
}
