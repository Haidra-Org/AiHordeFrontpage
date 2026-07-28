import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';

/** One line of the rail: a place on the page, and how it is named and hued. */
export interface GsIndexRailEntry {
  /** Identifies the entry to the rail; need not be the target's DOM id. */
  id: string;
  /** The name the entry is read by, resolved through transloco. */
  labelKey: string;
  /** Registry name of the entry's duotone glyph, where it has one. */
  icon?: string;
  /** `gs-sec--<section>`, the hue the bar and glyph are tinted from. */
  hueClass?: string;
  /** DOM id of the element the entry scrolls to and watches. */
  targetId: string;
}

/**
 * Where a section has to be past the top of the viewport before the rail calls
 * it the one being read. Without it the section below is already "current" the
 * moment its heading appears, which reads as the rail running ahead of the eye.
 */
const SPY_ROOT_MARGIN = '-12% 0px -68% 0px';

/**
 * The contents of a long reading page, as a rail beside it.
 *
 * One idiom for both shapes the page can take: a sticky column of hairline-
 * separated lines on a wide screen, and the same lines as a slim scrolling bar
 * where there is no room beside the prose. The line being read carries its
 * section's hue as a leading bar (an underline in the bar form), which is the
 * same device the follow-along highlight uses to say "here".
 *
 * Anchor mode only: an entry names an element on the page, and pressing it
 * scrolls there. Nothing routes, so the rail never needs to know what page it
 * is on.
 */
@Component({
  selector: 'app-gs-index-rail',
  imports: [TranslocoPipe, IconComponent],
  template: `
    <nav class="gs-index-rail-nav" [attr.aria-label]="labelKey() | transloco">
      @for (entry of entries(); track entry.id) {
        <button
          type="button"
          class="gs-index-entry"
          [class]="entry.hueClass"
          [attr.aria-current]="entry.id === activeId() ? 'true' : null"
          (click)="jumpTo(entry)"
        >
          @if (entry.icon; as icon) {
            <app-icon class="gs-index-entry-mark" [name]="icon" />
          }
          <span class="gs-index-entry-label">{{
            entry.labelKey | transloco
          }}</span>
        </button>
      }
    </nav>
  `,
  host: {
    class: 'gs-index-rail',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsIndexRailComponent {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The places on the page, in the order the page puts them. */
  public readonly entries = input.required<readonly GsIndexRailEntry[]>();
  /** What the rail is called to a reader who cannot see it. */
  public readonly labelKey = input<string>('generate.learn.rail_label');

  /** The entry scrollspy last put under the reader, before any has been seen. */
  private readonly seen = signal<string | null>(null);

  /**
   * The entry the rail marks as current. Nothing has been scrolled past on
   * arrival, so the first entry stands for the top of the page rather than the
   * rail starting with no line marked at all.
   */
  public readonly activeId = computed(
    () => this.seen() ?? this.entries()[0]?.id ?? null,
  );

  constructor() {
    // After render rather than on the signal: the sections the rail watches are
    // siblings of it in the page's own template, and are not in the document
    // yet at the point an ordinary effect on `entries` would first run.
    afterRenderEffect((onCleanup) => {
      const entries = this.entries();
      if (!this.isBrowser || typeof IntersectionObserver === 'undefined') {
        return;
      }

      const visible = new Set<string>();
      const observer = new IntersectionObserver(
        (records) => {
          for (const record of records) {
            const id = this.entryIdForTarget(record.target.id);
            if (!id) {
              continue;
            }
            if (record.isIntersecting) {
              visible.add(id);
            } else {
              visible.delete(id);
            }
          }
          // The highest of the sections in view, so a short section framed
          // together with the one below it does not hand the mark downwards.
          const current = entries.find((entry) => visible.has(entry.id));
          if (current) {
            this.seen.set(current.id);
          }
        },
        { rootMargin: SPY_ROOT_MARGIN },
      );

      for (const entry of entries) {
        const target = this.document.getElementById(entry.targetId);
        if (target) {
          observer.observe(target);
        }
      }
      onCleanup(() => observer.disconnect());
    });
  }

  /**
   * Take the page to the entry's section. The mark moves with the press rather
   * than waiting for the scroll to settle, which on a smooth scroll is most of
   * a second of the rail still pointing at where the reader was.
   */
  public jumpTo(entry: GsIndexRailEntry): void {
    this.seen.set(entry.id);
    if (!this.isBrowser) {
      return;
    }
    this.document.getElementById(entry.targetId)?.scrollIntoView({
      behavior: this.scrollBehavior(),
      block: 'start',
    });
  }

  private entryIdForTarget(targetId: string): string | null {
    return (
      this.entries().find((entry) => entry.targetId === targetId)?.id ?? null
    );
  }

  private scrollBehavior(): ScrollBehavior {
    const reduced = globalThis.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    return reduced ? 'auto' : 'smooth';
  }
}
