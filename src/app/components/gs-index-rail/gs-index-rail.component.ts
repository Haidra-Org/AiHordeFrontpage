import { DOCUMENT, NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';

/** One line of the rail: a place on the page, and how it is named and hued. */
export interface GsIndexRailEntry {
  /** Identifies the entry to the rail; need not be the target's DOM id. */
  id: string;
  /** The name the entry is read by, resolved through transloco. */
  labelKey?: string;
  /**
   * The name the entry is read by, already in the reader's words. For a rail
   * over data the page did not author, such as the style catalogue's category
   * names, which have no key to resolve. An entry carries this or a `labelKey`.
   */
  label?: string;
  /** Registry name of the entry's duotone glyph, where it has one. */
  icon?: string;
  /** `gs-sec--<section>`, the hue the bar and glyph are tinted from. */
  hueClass?: string;
  /** DOM id of the element the entry scrolls to and watches. Anchor mode. */
  targetId?: string;
  /** Where the entry goes instead of scrolling. Link mode. */
  link?: string | (string | number)[];
  /**
   * A word set quietly after the label, for an entry that is offered with
   * something to say about it. The entry stays reachable; it reads muted.
   */
  noteKey?: string;
  /**
   * A second name under the first, for a rail whose entries are known by two:
   * what the page is about, and what it is called elsewhere. Only the column
   * form shows it, the bar having one line to spend per entry.
   */
  subLabelKey?: string;
  /** The entry is something the reader has finished; drawn as a check after the name. */
  done?: boolean;
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
 * Two modes, one idiom. In anchor mode an entry names an element on the page
 * and pressing it scrolls there, with scrollspy saying which is being read; the
 * rail never needs to know what page it is on. In link mode an entry names a
 * route instead, and the page — which is what reads the URL — says which entry
 * is current through `currentId`. An entry carries a link or a target, and a
 * rail is one or the other throughout.
 */
@Component({
  selector: 'app-gs-index-rail',
  imports: [TranslocoPipe, IconComponent, RouterLink, NgTemplateOutlet],
  template: `
    <nav
      #nav
      class="gs-index-rail-nav"
      [attr.aria-label]="labelKey() | transloco"
    >
      @for (entry of entries(); track entry.id) {
        @if (entry.link; as link) {
          <a
            class="gs-index-entry"
            [class]="entry.hueClass"
            [class.gs-index-entry--muted]="!!entry.noteKey"
            [routerLink]="link"
            [attr.aria-current]="entry.id === activeId() ? 'page' : null"
          >
            <ng-container
              [ngTemplateOutlet]="line"
              [ngTemplateOutletContext]="{ $implicit: entry }"
            />
          </a>
        } @else {
          <button
            type="button"
            class="gs-index-entry"
            [class]="entry.hueClass"
            [attr.aria-current]="entry.id === activeId() ? 'true' : null"
            (click)="jumpTo(entry)"
          >
            <ng-container
              [ngTemplateOutlet]="line"
              [ngTemplateOutletContext]="{ $implicit: entry }"
            />
          </button>
        }
      }
    </nav>

    <ng-template #line let-entry>
      @if (entry.icon; as icon) {
        <app-icon class="gs-index-entry-mark" [name]="icon" />
      }
      @if (entry.label; as label) {
        <span class="gs-index-entry-label">{{ label }}</span>
      } @else {
        <span class="gs-index-entry-label">{{
          entry.labelKey | transloco
        }}</span>
      }
      @if (entry.done) {
        <span
          class="gs-index-entry-done"
          [attr.aria-label]="'generate.learn.done_mark' | transloco"
        >
          <app-icon name="check" class="gs-ico-sm" aria-hidden="true" />
        </span>
      }
      @if (entry.noteKey; as noteKey) {
        <span class="gs-index-entry-note">{{ noteKey | transloco }}</span>
      }
      @if (entry.subLabelKey; as subLabelKey) {
        <span class="gs-index-entry-sub">{{ subLabelKey | transloco }}</span>
      }
    </ng-template>
  `,
  host: {
    class: 'gs-index-rail',
    '[class.gs-index-rail--bar]': 'barForm()',
    '[class.gs-index-rail--fade-start]': 'fadeStart()',
    '[class.gs-index-rail--fade-end]': 'fadeEnd()',
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
  /** Link mode: the entry the page is on. Ignored where entries scroll. */
  public readonly currentId = input<string | null>(null);
  /**
   * Hold the slim bar form at every width, for a rail whose page has no margin
   * to stand a contents column up in: inside a modal, or beside a wide layout
   * that already spends both gutters.
   */
  public readonly barForm = input<boolean>(false);

  /** The entry scrollspy last put under the reader, before any has been seen. */
  private readonly seen = signal<string | null>(null);

  private readonly nav = viewChild<ElementRef<HTMLElement>>('nav');

  /**
   * Whether the row form has entries out of sight to one side. The bar carries
   * more names than fit on a wide screen as readily as on a narrow one, and a
   * rail that ends in a half-drawn word looks like the last entry rather than
   * like there being another after it, so the edge with more behind it is faded
   * out. Both stay false in the column form, which does not scroll sideways.
   */
  public readonly fadeStart = signal(false);
  public readonly fadeEnd = signal(false);

  /** Whether the entries route rather than scroll, which the entries say. */
  private readonly linkMode = computed(() =>
    this.entries().some((entry) => entry.link),
  );

  /**
   * The entry the rail marks as current. In anchor mode nothing has been
   * scrolled past on arrival, so the first entry stands for the top of the page
   * rather than the rail starting with no line marked at all; in link mode the
   * page is somewhere definite, and a guess at it would be wrong as often as
   * not.
   */
  public readonly activeId = computed(() =>
    this.linkMode()
      ? this.currentId()
      : (this.seen() ?? this.entries()[0]?.id ?? null),
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
          // Read from everything currently in view rather than from the
          // records alone, so a jump that leaves nothing in the band lands on
          // no entry rather than on whichever one was last stepped over.
          const current = entries.find((entry) => visible.has(entry.id));
          this.seen.set(current?.id ?? null);
        },
        { rootMargin: SPY_ROOT_MARGIN },
      );

      for (const entry of entries) {
        const target = entry.targetId
          ? this.document.getElementById(entry.targetId)
          : null;
        if (target) {
          observer.observe(target);
        }
      }
      onCleanup(() => observer.disconnect());
    });

    // Read from the element rather than from the entries: whether the rail
    // overflows depends on the width it was given and on how long the names
    // came out, neither of which the component is told.
    afterRenderEffect((onCleanup) => {
      this.entries();
      const nav = this.nav()?.nativeElement;
      if (!nav || !this.isBrowser) {
        return;
      }

      const measure = (): void => {
        const slack = nav.scrollWidth - nav.clientWidth;
        // A sub-pixel remainder is rounding, not an entry out of sight.
        const overflows = slack > 1;
        this.fadeStart.set(overflows && nav.scrollLeft > 1);
        this.fadeEnd.set(overflows && nav.scrollLeft < slack - 1);
      };

      measure();
      nav.addEventListener('scroll', measure, { passive: true });
      const resize =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(measure);
      resize?.observe(nav);
      onCleanup(() => {
        nav.removeEventListener('scroll', measure);
        resize?.disconnect();
      });
    });
  }

  /**
   * Take the page to the entry's section. The mark moves with the press rather
   * than waiting for the scroll to settle, which on a smooth scroll is most of
   * a second of the rail still pointing at where the reader was.
   */
  public jumpTo(entry: GsIndexRailEntry): void {
    this.seen.set(entry.id);
    if (!this.isBrowser || !entry.targetId) {
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
