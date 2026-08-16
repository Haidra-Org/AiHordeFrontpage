import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Directive,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  inject,
  input,
} from '@angular/core';
import { DatabaseService } from '../services/database.service';

/** How long the height has to hold still before it is written down. */
const SETTLE_MS = 200;

/**
 * Keeps the height a reader drags a textarea to, and gives it back on the next
 * visit. Dragging the grip is how the prompt boxes are sized, and a size the
 * reader has to set again on every visit is a setting they do not really have.
 *
 * Only a drag leaves an inline height on the element, so that is the one value
 * worth storing: a height that comes from the stylesheet is the default and
 * stays the default.
 */
@Directive({ selector: 'textarea[appRememberedHeight]' })
export class RememberedHeightDirective implements OnInit {
  /** The storage key this field's height is kept under. */
  public readonly key = input.required<string>({
    alias: 'appRememberedHeight',
  });

  private readonly host = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);
  private readonly db = inject(DatabaseService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private observer: ResizeObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.observer?.disconnect();
      if (this.timer !== null) {
        clearTimeout(this.timer);
      }
    });
  }

  public ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }

    const element = this.host.nativeElement;
    const stored = this.db.get<string | null>(this.key(), null);
    if (typeof stored === 'string' && stored !== '') {
      element.style.height = stored;
    }

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    // A drag reports every intermediate size, so the write waits for the
    // reader to let go rather than following the pointer into storage.
    this.observer = new ResizeObserver(() => this.schedule());
    this.observer.observe(element);
  }

  private schedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.save();
    }, SETTLE_MS);
  }

  private save(): void {
    const height = this.host.nativeElement.style.height;
    if (height === '') {
      return;
    }
    this.db.store(this.key(), height);
  }
}
