import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { vi } from 'vitest';
import { StickyRegistryService } from './sticky-registry.service';

/**
 * Minimal fake ResizeObserver that lets tests trigger callbacks manually.
 * Each instance records its callback and the elements it observes.
 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observed: Element[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  unobserve(_target: Element): void {
    void _target;
  }

  disconnect(): void {
    this.observed = [];
  }
}

/** Create a fake HTMLElement whose getBoundingClientRect returns the given height. */
function makeFakeElement(height: number): HTMLElement {
  const style: Record<string, string> = {};
  const el = {
    getBoundingClientRect: () =>
      ({
        height,
        top: 0,
        left: 0,
        width: 0,
        right: 0,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
    style: {
      top: '',
      setProperty(prop: string, value: string) {
        style[prop] = value;
      },
      removeProperty(prop: string) {
        delete style[prop];
        if (prop === 'top') {
          el.style.top = '';
        }
      },
      getPropertyValue(prop: string) {
        return style[prop] ?? '';
      },
    },
  } as unknown as HTMLElement;
  return el;
}

/** Flush the requestAnimationFrame used by scheduleRecalculate(). */
function flushRAF(): void {
  vi.advanceTimersByTime(17); // One frame at ~60fps
}

describe('StickyRegistryService', () => {
  let service: StickyRegistryService;
  let doc: Document;

  beforeEach(() => {
    vi.useFakeTimers();

    FakeResizeObserver.instances = [];
    vi.stubGlobal(
      'ResizeObserver',
      FakeResizeObserver as unknown as typeof ResizeObserver,
    );

    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) =>
        setTimeout(() => cb(performance.now()), 16) as unknown as number,
    );

    TestBed.configureTestingModule({
      providers: [
        StickyRegistryService,
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    service = TestBed.inject(StickyRegistryService);
    doc = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have a default totalOffset of 100', () => {
    expect(service.totalOffset()).toBe(100);
  });

  it('should register an element and update totalOffset after RAF', () => {
    const el = makeFakeElement(64);
    service.register(el, 0);
    flushRAF();

    expect(service.totalOffset()).toBe(64);
  });

  it('should set --sticky-offset CSS property on <html>', () => {
    const el = makeFakeElement(80);
    service.register(el, 0);
    flushRAF();

    expect(doc.documentElement.style.getPropertyValue('--sticky-offset')).toBe(
      '80px',
    );
  });

  it('should set inline top on registered elements based on stacking order', () => {
    const nav = makeFakeElement(64);
    const filter = makeFakeElement(52);
    const pills = makeFakeElement(48);

    service.register(nav, 0);
    service.register(filter, 10);
    service.register(pills, 20);
    flushRAF();

    expect(nav.style.top).toBe('0px');
    expect(filter.style.top).toBe('64px');
    expect(pills.style.top).toBe('116px');
    expect(service.totalOffset()).toBe(164);
  });

  it('should recalculate when an element is unregistered', () => {
    const nav = makeFakeElement(64);
    const filter = makeFakeElement(52);
    const pills = makeFakeElement(48);

    service.register(nav, 0);
    service.register(filter, 10);
    service.register(pills, 20);
    flushRAF();

    service.unregister(filter);
    flushRAF();

    expect(nav.style.top).toBe('0px');
    expect(pills.style.top).toBe('64px');
    expect(service.totalOffset()).toBe(112);
  });

  it('should remove inline top from unregistered elements', () => {
    const el = makeFakeElement(64);
    service.register(el, 0);
    flushRAF();

    expect(el.style.top).toBe('0px');

    service.unregister(el);
    flushRAF();

    expect(el.style.top).toBe('');
  });

  it('should treat 0-height (hidden) elements as contributing 0px', () => {
    const nav = makeFakeElement(64);
    const hidden = makeFakeElement(0);
    const filter = makeFakeElement(52);

    service.register(nav, 0);
    service.register(hidden, 5);
    service.register(filter, 10);
    flushRAF();

    expect(hidden.style.top).toBe('64px');
    expect(filter.style.top).toBe('64px');
    expect(service.totalOffset()).toBe(116);
  });

  it('offsetFor() returns the correct top offset for a specific element', () => {
    const nav = makeFakeElement(64);
    const filter = makeFakeElement(52);
    const pills = makeFakeElement(48);

    service.register(nav, 0);
    service.register(filter, 10);
    service.register(pills, 20);
    flushRAF();

    expect(service.offsetFor(nav)).toBe(0);
    expect(service.offsetFor(filter)).toBe(64);
    expect(service.offsetFor(pills)).toBe(116);
  });

  it('offsetFor() returns 0 for an unregistered element', () => {
    const el = makeFakeElement(64);
    expect(service.offsetFor(el)).toBe(0);
  });

  it('should coalesce multiple rapid recalculations into one RAF', () => {
    const nav = makeFakeElement(64);
    const filter = makeFakeElement(52);

    service.register(nav, 0);
    service.register(filter, 10);
    // Both register() calls schedule RAF, but only one should execute
    flushRAF();

    expect(service.totalOffset()).toBe(116);
  });

  it('should expose totalOffset$ Observable that emits on changes', () => {
    const emitted: number[] = [];
    const sub = service.totalOffset$.subscribe((val) => emitted.push(val));

    // Flush change detection so the initial signal value propagates
    TestBed.flushEffects();

    expect(emitted).toContain(100);
    sub.unsubscribe();
  });

  describe('SSR (non-browser platform)', () => {
    let ssrService: StickyRegistryService;

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          StickyRegistryService,
          { provide: PLATFORM_ID, useValue: 'server' },
        ],
      });
      ssrService = TestBed.inject(StickyRegistryService);
    });

    it('register should be a no-op on server', () => {
      const el = makeFakeElement(64);
      ssrService.register(el, 0);
      flushRAF();

      // totalOffset stays at default because register was a no-op
      expect(ssrService.totalOffset()).toBe(100);
    });

    it('unregister should be a no-op on server', () => {
      const el = makeFakeElement(64);
      expect(() => ssrService.unregister(el)).not.toThrow();
    });
  });

  describe('window detection — no gaps between consecutive sticky elements', () => {
    it('consecutive elements should stack flush: top[i] + height[i] === top[i+1]', () => {
      const elements = [
        { el: makeFakeElement(64), order: 0 },
        { el: makeFakeElement(52), order: 10 },
        { el: makeFakeElement(48), order: 20 },
      ];

      for (const { el, order } of elements) {
        service.register(el, order);
      }
      flushRAF();

      // Verify no gaps between consecutive registered elements
      const tops = elements.map(({ el }) => parseFloat(el.style.top));
      const heights = [64, 52, 48];

      for (let i = 0; i < elements.length - 1; i++) {
        const expectedNext = tops[i] + heights[i];
        expect(tops[i + 1]).toBe(expectedNext);
      }
    });

    it('last element top + height should equal totalOffset', () => {
      const nav = makeFakeElement(64);
      const filter = makeFakeElement(52);
      const pills = makeFakeElement(48);

      service.register(nav, 0);
      service.register(filter, 10);
      service.register(pills, 20);
      flushRAF();

      const lastTop = parseFloat(pills.style.top);
      const lastHeight = 48;
      expect(lastTop + lastHeight).toBe(service.totalOffset());
    });

    it('removing a middle element should reposition remaining elements flush', () => {
      const nav = makeFakeElement(64);
      const filter = makeFakeElement(52);
      const pills = makeFakeElement(48);

      service.register(nav, 0);
      service.register(filter, 10);
      service.register(pills, 20);
      flushRAF();

      service.unregister(filter);
      flushRAF();

      expect(nav.style.top).toBe('0px');
      expect(pills.style.top).toBe('64px');

      const lastTop = parseFloat(pills.style.top);
      expect(lastTop + 48).toBe(service.totalOffset());
    });

    it('registering elements out of order should still produce flush positioning', () => {
      const pills = makeFakeElement(48);
      const nav = makeFakeElement(64);
      const filter = makeFakeElement(52);

      // Register in reverse order
      service.register(pills, 20);
      service.register(nav, 0);
      service.register(filter, 10);
      flushRAF();

      expect(nav.style.top).toBe('0px');
      expect(filter.style.top).toBe('64px');
      expect(pills.style.top).toBe('116px');
      expect(service.totalOffset()).toBe(164);
    });

    it('duplicate registration of the same order should not create gaps', () => {
      const el1 = makeFakeElement(64);
      const el2 = makeFakeElement(52);

      service.register(el1, 0);
      service.register(el2, 0);
      flushRAF();

      // Elements with the same order are valid — they just stack
      const top1 = parseFloat(el1.style.top);
      const top2 = parseFloat(el2.style.top);
      // One will be at 0, the other at 64 (or 52 depending on iteration order)
      // The key assertion: their combined contribution equals totalOffset
      expect(service.totalOffset()).toBe(116);
      // And no gap: the one at position 0 plus its height equals the other's top
      const [first, second] =
        top1 < top2
          ? [
              { top: top1, h: 64 },
              { top: top2, h: 52 },
            ]
          : [
              { top: top2, h: 52 },
              { top: top1, h: 64 },
            ];
      expect(first.top + first.h).toBe(second.top);
    });
  });
});
