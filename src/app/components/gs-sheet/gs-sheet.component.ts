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
import { IconComponent } from '../icon/icon.component';

/** How far along its own height a drag has to travel before it snaps over. */
const SNAP_FRACTION = 0.25;
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
 * Docked it is a bar: a grabber, whatever the caller projects into
 * `[sheet-bar]`, and the two buttons that open and dismiss it. Expanded it
 * scrolls its own body. It opens from the chevron, from a tap on the grabber
 * and from a drag on the grabber, because on a phone those are one intention
 * and only the last of them is discoverable without reading anything.
 *
 * Whether a sheet is the right presentation at all is a question for CSS: the
 * host is display:none from 1024px up, where the studio has a pane to dock
 * things in instead. Nothing here measures the viewport, so a server render and
 * the first client frame agree about what exists.
 */
@Component({
  selector: 'app-gs-sheet',
  imports: [TranslocoPipe, IconComponent],
  template: `
    <div class="gs-sheet-panel" [style.transform]="dragTransform()">
      <!-- Pointer-only, and hidden from assistive technology on purpose:
           everything the grabber does is also on the chevron beside it, and
           that is the control a keyboard or a screen reader is given. -->
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
      <div class="gs-sheet-bar">
        <div class="gs-sheet-slot">
          <ng-content select="[sheet-bar]" />
        </div>
        <button
          type="button"
          class="gs-sheet-btn"
          [attr.aria-expanded]="expanded()"
          [attr.aria-controls]="bodyId"
          [attr.aria-label]="
            (expanded() ? 'generate.sheet.collapse' : 'generate.sheet.expand')
              | transloco
          "
          (click)="toggle()"
        >
          <app-icon
            name="chevron-right"
            class="gs-sheet-chev"
            [class.gs-sheet-chev--up]="!expanded()"
          />
        </button>
        <button
          type="button"
          class="gs-sheet-btn"
          [attr.aria-label]="'generate.sheet.close' | transloco"
          (click)="close()"
        >
          <app-icon name="x-mark" />
        </button>
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
    '[class.gs-sheet--open]': 'expanded()',
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

  /** The reader dismissed the sheet; the caller decides what that means. */
  public readonly closed = output<void>();

  private readonly bodyRef = viewChild<ElementRef<HTMLElement>>('sheetBody');

  public readonly bodyId = `gs-sheet-body-${nextInstance++}`;

  private readonly open = signal(false);
  public readonly expanded = this.open.asReadonly();

  public readonly dragging = signal(false);
  private readonly dragOffset = signal(0);
  public readonly dragTransform = computed(() => {
    const offset = this.dragOffset();
    return offset === 0 ? null : `translateY(${offset}px)`;
  });

  /** Where the drag started, and which state it started from. */
  private startY = 0;
  private startedExpanded = false;
  /** Whether the pointer moved far enough that the click after it is no tap. */
  private moved = false;

  private observer: ResizeObserver | null = null;

  constructor() {
    // Signal inputs are not bound until after construction, so the opening
    // state is taken when it arrives rather than read out of the constructor.
    effect(() => {
      const start = this.startExpanded();
      untracked(() => this.open.set(start));
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
    this.destroyRef.onDestroy(() => {
      this.observer?.disconnect();
      if (this.isBrowser) {
        document.documentElement.style.removeProperty(CLEARANCE_VAR);
      }
    });
  }

  public toggle(): void {
    this.setExpanded(!this.open());
  }

  public collapse(): void {
    this.setExpanded(false);
  }

  public expand(): void {
    this.setExpanded(true);
  }

  public close(): void {
    this.closed.emit();
  }

  /**
   * Escape unwinds one layer at a time: an expanded sheet collapses to its bar,
   * and a sheet already at its bar is dismissed. Two presses is the shortest
   * way out that never takes away what the reader was looking at by surprise.
   */
  public onEscape(): void {
    if (this.open()) {
      this.collapse();
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
    this.startedExpanded = this.open();
    this.moved = false;
    this.dragging.set(true);
    (event.target as Element).setPointerCapture?.(event.pointerId);
  }

  /**
   * An expanded sheet only follows the pointer downwards and a docked one only
   * upwards: the other direction asks the sheet for a state it does not have,
   * and rubber-banding towards one would promise it.
   */
  public onPointerMove(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    const delta = event.clientY - this.startY;
    const offset = this.startedExpanded
      ? Math.max(0, delta)
      : Math.min(0, delta);
    if (Math.abs(offset) > DRAG_SLOP_PX) {
      this.moved = true;
    }
    this.dragOffset.set(offset);
  }

  public onPointerUp(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    const offset = Math.abs(this.dragOffset());
    this.dragging.set(false);
    this.dragOffset.set(0);
    const travel =
      this.host.nativeElement.offsetHeight || FALLBACK_CLEARANCE_PX;
    if (offset >= travel * SNAP_FRACTION) {
      this.setExpanded(!this.startedExpanded);
    }
  }

  private setExpanded(next: boolean): void {
    if (this.open() === next) {
      return;
    }
    this.open.set(next);
    if (!next || !this.isBrowser) {
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
