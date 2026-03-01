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
  maxWaitMs: number = 3000,
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
