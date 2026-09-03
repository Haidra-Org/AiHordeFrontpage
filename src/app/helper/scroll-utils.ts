const SCROLL_PADDING = 16;

/**
 * Scroll the window so that `element` is visible below the sticky header stack.
 *
 * @param element  Target element to scroll into view
 * @param offset   Total height of sticky headers (from StickyRegistryService.totalOffset())
 * @param behavior Scroll behavior — defaults to 'smooth'
 */
export function scrollToElement(
  element: HTMLElement,
  offset: number,
  behavior: ScrollBehavior = 'smooth',
): void {
  const top =
    element.getBoundingClientRect().top +
    window.scrollY -
    offset -
    SCROLL_PADDING;
  window.scrollTo({ top, behavior });
}

/**
 * Scroll the window so that `element` is centered within the usable viewport
 * area below sticky headers.
 *
 * Useful for highlighted rows/cards where centering is preferred over
 * top-alignment while still respecting sticky header offsets.
 */
export function scrollToElementCentered(
  element: HTMLElement,
  offset: number,
  behavior: ScrollBehavior = 'smooth',
): void {
  const rect = element.getBoundingClientRect();
  const availableHeight = Math.max(0, window.innerHeight - offset);
  const centeredTop =
    rect.top + window.scrollY - offset - (availableHeight - rect.height) / 2;
  window.scrollTo({ top: Math.max(0, centeredTop), behavior });
}

/**
 * Wait for an element with the given `id` to appear in the DOM, then scroll
 * to it.
 *
 * On cross-route navigation with a fragment (e.g. `/workers#text`), the
 * target element might not exist yet because the destination component is
 * lazily loaded. A single requestAnimationFrame is not enough — the
 * component may take several frames to render.
 *
 * Uses a MutationObserver so the scroll fires as soon as the element is
 * inserted, without polling. Falls back to a timeout so it never leaks.
 *
 * Delegates to `scrollIntoView` so that CSS `scroll-padding-top` (on the
 * scroll container) and `scroll-margin-top` (on the target) are both
 * respected — no manual offset math needed.
 */
export function scrollToAnchorWhenReady(
  anchorId: string,
  doc: Document,
  maxWaitMs = 3000,
): void {
  // Fast-path: element already in the DOM (same-page fragment)
  const existing = doc.getElementById(anchorId);
  if (existing) {
    requestAnimationFrame(() =>
      existing.scrollIntoView({ behavior: 'instant', block: 'start' }),
    );
    return;
  }

  // Slow-path: wait for lazy component to render
  const observer = new MutationObserver(() => {
    const el = doc.getElementById(anchorId);
    if (el) {
      cleanup();
      // Allow one additional frame for layout to settle
      requestAnimationFrame(() =>
        el.scrollIntoView({ behavior: 'instant', block: 'start' }),
      );
    }
  });

  observer.observe(doc.body, { childList: true, subtree: true });

  const timer = setTimeout(() => cleanup(), maxWaitMs);

  function cleanup(): void {
    observer.disconnect();
    clearTimeout(timer);
  }
}

/** How a strip places the line it has been asked to bring into view. */
export type ScrollWithinAlign = 'center' | 'nearest';

/**
 * Bring a line into view by moving the strip it sits in, and nothing else.
 *
 * `scrollIntoView` scrolls every ancestor that can move, and in Chromium it
 * also carries the sequential focus start point onto its target: a rail that
 * marked its current entry that way sent the reader's first Tab into the middle
 * of the rail, past the page header and everything above it. Moving the strip
 * by a measured offset leaves the page and the focus order where the reader
 * left them.
 *
 * Both axes are answered at once. A strip that cannot move on one of them
 * clamps that target back to where it was, so one call serves a rail's row form
 * and its column form without being told which it is looking at.
 */
export function scrollWithin(
  container: HTMLElement,
  target: HTMLElement,
  align: ScrollWithinAlign,
  behavior: ScrollBehavior,
): void {
  const box = target.getBoundingClientRect();
  const frame = container.getBoundingClientRect();
  container.scrollTo({
    left:
      container.scrollLeft +
      scrollOffset(
        box.left - frame.left,
        box.width,
        container.clientWidth,
        align,
      ),
    top:
      container.scrollTop +
      scrollOffset(
        box.top - frame.top,
        box.height,
        container.clientHeight,
        align,
      ),
    behavior,
  });
}

/**
 * How far one axis has to move: to the middle of the strip for `center`, and
 * for `nearest` as far as the edge it is over, or not at all while it is inside.
 */
function scrollOffset(
  start: number,
  size: number,
  frameSize: number,
  align: ScrollWithinAlign,
): number {
  if (align === 'center') {
    return start - (frameSize - size) / 2;
  }
  if (start < 0) {
    return start;
  }
  const past = start + size - frameSize;
  return past > 0 ? past : 0;
}
