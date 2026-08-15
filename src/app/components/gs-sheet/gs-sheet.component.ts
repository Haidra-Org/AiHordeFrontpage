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
import { BlockScrollStrategy, Overlay } from '@angular/cdk/overlay';
import { IconComponent } from '../icon/icon.component';

/** How far along its own height a drag has to travel before it snaps over. */
const SNAP_FRACTION = 0.25;
/** A drag past this share of the viewport height jumps two stops rather than one. */
const LONG_DRAG_FRACTION = 0.45;

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
 * words as well as chevrons so the affordance is not a guess.
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
      <div class="gs-sheet-bar">
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
   * Whether the chassis offers a way out of itself. Content the reader is
   * part-way through has no safe dismissal here: a close button and the Escape
   * that follows a collapse would both end that content rather than the sheet
   * around it, so such a sheet hides both and carries its own exit instead.
   */
  public readonly dismissible = input(true);

  /** The reader dismissed the sheet; the caller decides what that means. */
  public readonly closed = output<void>();

  private readonly bodyRef = viewChild<ElementRef<HTMLElement>>('sheetBody');

  /**
   * The page behind the sheet stops scrolling once the sheet is above peek:
   * a body that scrolls internally over a page that also scrolls sends every
   * overshoot to the wrong one, which reads as the tutorial dragging the form
   * about. CDK's strategy is what the overlay layer uses for the same reason,
   * so a sheet and a dialog lock the page the same way and restore it the same
   * way.
   */
  private readonly scrollBlock: BlockScrollStrategy =
    inject(Overlay).scrollStrategies.block();

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

  private observer: ResizeObserver | null = null;

  constructor() {
    // Signal inputs are not bound until after construction, so the opening
    // state is taken when it arrives rather than read out of the constructor.
    effect(() => {
      const start = this.startExpanded();
      untracked(() => this.at.set(start ? 'half' : 'peek'));
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
      afterNextRender(() => this.observeHeight(), { injector: this.injector });
    }
    effect(() => {
      const above = this.at() !== 'peek';
      if (!this.isBrowser) {
        return;
      }
      if (above) {
        this.scrollBlock.enable();
      } else {
        this.scrollBlock.disable();
      }
    });
    this.destroyRef.onDestroy(() => {
      this.scrollBlock.disable();
      this.observer?.disconnect();
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
    this.setStop(STOPS[Math.max(0, Math.min(STOPS.length - 1, index))]);
  }

  private setStop(next: SheetStop): void {
    const previous = this.at();
    if (previous === next) {
      return;
    }
    this.at.set(next);
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
    target.focus();
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
