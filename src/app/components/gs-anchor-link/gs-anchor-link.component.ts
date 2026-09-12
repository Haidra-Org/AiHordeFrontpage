import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { copyToClipboard } from '../../helper/copy-to-clipboard';
import { IconComponent } from '../icon/icon.component';

/** How long the confirmation stands before the glyph goes back to offering. */
const SAID_MS = 2000;

/**
 * The chain beside a heading: the way to hand someone else the exact place in
 * the documentation being read.
 *
 * A reader who has found the paragraph that answers their question wants to
 * send that paragraph to somebody, and the address bar only ever names the
 * page. So every heading worth arriving at carries this, and pressing it puts
 * the whole address on the clipboard and writes the same address into the bar.
 *
 * It is a real link rather than a button, so the browser's own ways of taking a
 * link keep working: middle-click opens the place in a tab, the context menu
 * copies it, and a keyboard reaches it in reading order. Only the plain press is
 * taken over, because that is the one whose default (jump, and leave the reader
 * to select the address bar themselves) is the least useful thing that could
 * happen.
 *
 * A heading that is the page's own title passes no target: the page's address is
 * already the thing to share, and hanging a fragment off it would hand people a
 * longer link that goes to exactly the same place.
 */
@Component({
  selector: 'app-gs-anchor-link',
  imports: [TranslocoPipe, IconComponent],
  template: `
    @let name = label();
    <a
      class="gs-anchor-link"
      [href]="href()"
      [attr.aria-label]="
        name
          ? ('docs.anchor.copy' | transloco: { name })
          : ('docs.anchor.copy_plain' | transloco)
      "
      (click)="share($event)"
    >
      <app-icon
        [name]="said() ? 'check' : 'link'"
        class="gs-ico-sm"
        aria-hidden="true"
      />
    </a>
    <!-- Present from the start rather than added on the press: a live region
         inserted at the moment it has something to say is announced by some
         readers and missed by others. -->
    <span class="gs-anchor-said" role="status" aria-live="polite">
      @if (said()) {
        {{ 'docs.anchor.copied' | transloco }}
      }
    </span>
  `,
  host: {
    class: 'gs-anchor',
    '[class.gs-anchor--said]': 'said()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsAnchorLinkComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);

  /**
   * The DOM id of the place the link arrives at. Left unset by a page title,
   * which is shared as the page rather than as a place within it.
   */
  public readonly targetId = input<string>('');

  /**
   * What the heading says, so the link is offered by name rather than as one of
   * a page full of identical chains. Already in the reader's words: the call
   * sites resolve their own keys, some of which are interpolated.
   */
  public readonly label = input<string>('');

  /** Whether the address has just been taken, which the glyph confirms. */
  public readonly said = signal(false);

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  /**
   * Where the link points. A fragment is resolved by the browser against the
   * page it is on, which is what makes the same markup correct while the page
   * is being prerendered and after it has been navigated to.
   */
  public readonly href = computed(() => {
    const target = this.targetId();
    return target ? `#${target}` : this.pathOnly();
  });

  /**
   * Take the address, and put the page where the link says it goes.
   *
   * A press carrying a modifier, or made with anything but the primary button,
   * is left alone: the reader has asked the browser for a new tab or a new
   * window, and answering that with a clipboard write would be a different
   * thing from what they asked for.
   */
  public share(event: MouseEvent): void {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();

    const target = this.targetId();
    if (target) {
      void this.router.navigate([], {
        relativeTo: this.route,
        fragment: target,
        queryParamsHandling: 'preserve',
        // The reader is still on the page they were reading, so the back button
        // should leave it rather than walk back through the headings they took
        // links to on the way down.
        replaceUrl: true,
      });
    }

    void this.copy(target);
  }

  private async copy(target: string): Promise<void> {
    const address = this.document.defaultView?.location.href.split('#')[0];
    if (!address) {
      return;
    }
    const copied = await copyToClipboard(
      target ? `${address}#${target}` : address,
    );
    if (!copied) {
      return;
    }
    this.said.set(true);
    this.clearTimer();
    this.timer = setTimeout(() => this.said.set(false), SAID_MS);
  }

  /** The current address without the fragment, for a link that is the page. */
  private pathOnly(): string {
    return this.router.url.split('#', 1).at(0) ?? '';
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
