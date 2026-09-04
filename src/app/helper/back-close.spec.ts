import { describe, expect, it, vi } from 'vitest';
import { BackClose } from './back-close';

/**
 * A history stack with the two behaviours that matter here: an entry carries the
 * state it was pushed with, and going back tells everyone listening.
 */
function fakeView(): {
  view: Window & typeof globalThis;
  entries: unknown[];
  fireBack: () => void;
} {
  const entries: unknown[] = [null];
  const listeners = new Set<() => void>();
  const fireBack = (): void => {
    if (entries.length > 1) {
      entries.pop();
    }
    for (const listener of [...listeners]) {
      listener();
    }
  };
  const view = {
    scrollX: 0,
    scrollY: 0,
    scrollTo: () => undefined,
    requestAnimationFrame: () => 0,
    history: {
      get state() {
        return entries[entries.length - 1];
      },
      pushState: (state: unknown) => entries.push(state),
      back: fireBack,
    },
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  } as unknown as Window & typeof globalThis;
  return { view, entries, fireBack };
}

describe('BackClose', () => {
  it('answers Back by closing the layer, once', () => {
    const { view, fireBack } = fakeView();
    const close = vi.fn();
    const layer = new BackClose(view, close);

    layer.arm();
    fireBack();
    fireBack();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('gives the entry back when the layer closes by other means', () => {
    const { view, entries } = fakeView();
    const close = vi.fn();
    const layer = new BackClose(view, close);
    const before = entries.length;

    layer.arm();
    expect(entries.length).toBe(before + 1);

    layer.disarm();

    expect(entries.length).toBe(before);
    // Releasing is not going back: the layer is already closed.
    expect(close).not.toHaveBeenCalled();
  });

  it('takes one entry however often it is asked', () => {
    const { view, entries } = fakeView();
    const layer = new BackClose(view, vi.fn());
    const before = entries.length;

    layer.arm();
    layer.arm();

    expect(entries.length).toBe(before + 1);
  });

  it('leaves the page alone when something else pushed after it', () => {
    const { view, entries } = fakeView();
    const layer = new BackClose(view, vi.fn());

    layer.arm();
    view.history.pushState({ elsewhere: true }, '');
    layer.disarm();

    // The layer's own entry is buried, and walking back from here would take
    // the reader off the page rather than tidy the history.
    expect(entries.length).toBe(3);
  });

  it('stops answering once it is detached', () => {
    const { view, fireBack } = fakeView();
    const close = vi.fn();
    const layer = new BackClose(view, close);

    layer.arm();
    layer.detach();
    fireBack();

    expect(close).not.toHaveBeenCalled();
  });

  it('lets Back go on out when the layer declines it', () => {
    const { view, entries, fireBack } = fakeView();
    const layer = new BackClose(view, () => false);
    const before = entries.length;

    layer.arm();
    expect(entries.length).toBe(before + 1);
    fireBack();

    // The layer's own entry is gone and it asked for one more step back, so
    // the reader's single press is not spent on tidying the history.
    expect(entries.length).toBe(before);
  });

  it('answers the next Back too when it took the last one', () => {
    const { view, entries, fireBack } = fakeView();
    const close = vi.fn(() => true);
    const layer = new BackClose(view, close);
    const before = entries.length;

    layer.arm();
    fireBack();
    expect(entries.length).toBe(before + 1);
    fireBack();

    expect(close).toHaveBeenCalledTimes(2);
  });

  it('does nothing at all where there is no window', () => {
    const layer = new BackClose(null, vi.fn());

    expect(() => {
      layer.arm();
      layer.disarm();
      layer.detach();
    }).not.toThrow();
  });
});
