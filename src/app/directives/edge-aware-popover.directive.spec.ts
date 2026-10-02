import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { EdgeAwarePopoverDirective } from './edge-aware-popover.directive';
import { StickyRegistryService } from '../services/sticky-registry.service';

@Component({
  imports: [EdgeAwarePopoverDirective],
  template: `<div class="anchor">
    <div
      class="pop"
      appEdgeAware
      [edgeAlign]="align()"
      [viewportPoint]="point()"
      [viewportAnchor]="fixedAnchor()"
    ></div>
  </div>`,
})
class HostComponent {
  public readonly align = signal<'start' | 'end'>('start');
  public readonly point = signal<{ x: number; y: number } | null>(null);
  public readonly fixedAnchor = signal<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  } | null>(null);
}

/** jsdom lays nothing out, so both boxes are measured by hand. */
function place(element: Element, left: number, width: number): void {
  element.getBoundingClientRect = (): DOMRect =>
    ({
      left,
      right: left + width,
      width,
      top: 0,
      bottom: 0,
      height: 0,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('EdgeAwarePopoverDirective', () => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  /** The height of the fixed header stack; most cases here have none. */
  const stickyOffset = signal(0);

  afterEach(() => {
    stickyOffset.set(0);
    Object.defineProperty(window, 'innerWidth', {
      value: originalWidth,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: originalHeight,
      configurable: true,
    });
  });

  function setViewport(width: number, height = originalHeight): void {
    Object.defineProperty(window, 'innerWidth', {
      value: width,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: height,
      configurable: true,
    });
  }

  async function render(
    anchorLeft: number,
    anchorWidth: number,
    popWidth: number,
    align: 'start' | 'end' = 'start',
  ): Promise<{ pop: HTMLElement; fixture: ComponentFixture<HostComponent> }> {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        {
          provide: StickyRegistryService,
          useValue: { totalOffset: stickyOffset.asReadonly() },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.align.set(align);
    const host = fixture.nativeElement as HTMLElement;
    // The boxes have to be measurable before the directive first asks.
    fixture.detectChanges();
    const anchor = host.querySelector<HTMLElement>('.anchor')!;
    const pop = host.querySelector<HTMLElement>('.pop')!;
    place(anchor, anchorLeft, anchorWidth);
    place(pop, 0, popWidth);
    return { pop, fixture };
  }

  it('leaves a panel that fits on its own edge', async () => {
    setViewport(1200);
    const { pop, fixture } = await render(400, 100, 300);

    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(pop.style.left).toBe('0px');
    expect(pop.style.right).toBe('auto');
  });

  it('flips to the other edge when its own would run off the screen', async () => {
    setViewport(1000);
    const { pop, fixture } = await render(880, 100, 300, 'start');

    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    // Anchored right: the panel's right edge meets the anchor's, 200px left.
    expect(pop.style.left).toBe('-200px');
  });

  it('pushes a panel that fits on neither edge in from the gutter', async () => {
    setViewport(360);
    const { pop, fixture } = await render(300, 40, 336, 'end');

    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(pop.style.left).toBe('-288px');
  });

  it('leaves a panel the stylesheet pins to the screen alone', async () => {
    setViewport(360);
    const { pop, fixture } = await render(300, 40, 336, 'end');
    pop.style.position = 'fixed';

    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(pop.style.left).toBe('');
    expect(pop.style.right).toBe('');
  });

  it('measures and clamps a fixed overlay on both viewport axes', async () => {
    setViewport(360, 480);
    const { pop, fixture } = await render(0, 0, 214);
    pop.style.position = 'fixed';
    place(pop, 0, 214);
    pop.getBoundingClientRect = (): DOMRect =>
      ({
        left: 0,
        right: 214,
        width: 214,
        top: 0,
        bottom: 420,
        height: 420,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fixture.componentInstance.point.set({ x: 340, y: 460 });
    fixture.detectChanges();
    await Promise.resolve();

    expect(pop.style.left).toBe('134px');
    expect(pop.style.top).toBe('48px');
  });

  it('caps and scrolls an overlay taller than the viewport', async () => {
    setViewport(360, 240);
    const { pop, fixture } = await render(0, 0, 214);
    pop.style.position = 'fixed';
    pop.getBoundingClientRect = (): DOMRect =>
      ({
        left: 0,
        right: 214,
        width: 214,
        top: 0,
        bottom: 216,
        height: 216,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fixture.componentInstance.point.set({ x: 20, y: 220 });
    fixture.detectChanges();
    await Promise.resolve();

    expect(pop.style.maxHeight).toBe('216px');
    expect(pop.style.top).toBe('12px');
    expect(pop.style.overflow).toBe('auto');
  });

  it('opens a fixed overlay below and end-aligned with its trigger', async () => {
    setViewport(800, 700);
    const { pop, fixture } = await render(0, 0, 200, 'end');
    pop.style.position = 'fixed';
    pop.getBoundingClientRect = (): DOMRect =>
      ({
        left: 0,
        right: 200,
        width: 200,
        top: 0,
        bottom: 300,
        height: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fixture.componentInstance.fixedAnchor.set({
      top: 100,
      right: 500,
      bottom: 126,
      left: 474,
    });
    fixture.detectChanges();
    await Promise.resolve();

    expect(pop.style.left).toBe('300px');
    expect(pop.style.top).toBe('132px');
    expect(pop.dataset['edgePlacement']).toBe('bottom');
  });

  it('flips a trigger-connected overlay above when the bottom is crowded', async () => {
    setViewport(800, 700);
    const { pop, fixture } = await render(0, 0, 200, 'end');
    pop.style.position = 'fixed';
    pop.getBoundingClientRect = (): DOMRect =>
      ({
        left: 0,
        right: 200,
        width: 200,
        top: 0,
        bottom: 300,
        height: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fixture.componentInstance.fixedAnchor.set({
      top: 600,
      right: 500,
      bottom: 626,
      left: 474,
    });
    fixture.detectChanges();
    await Promise.resolve();

    expect(pop.style.left).toBe('300px');
    expect(pop.style.top).toBe('294px');
    expect(pop.dataset['edgePlacement']).toBe('top');
  });

  it('caps an upward overlay before it can overlap its trigger', async () => {
    setViewport(800, 500);
    const { pop, fixture } = await render(0, 0, 200, 'end');
    pop.style.position = 'fixed';
    pop.getBoundingClientRect = (): DOMRect => {
      const height = Math.min(
        476,
        Number.parseFloat(pop.style.maxHeight) || 476,
      );
      return {
        left: 0,
        right: 200,
        width: 200,
        top: 0,
        bottom: height,
        height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
    fixture.componentInstance.fixedAnchor.set({
      top: 300,
      right: 500,
      bottom: 326,
      left: 474,
    });
    fixture.detectChanges();
    await Promise.resolve();

    expect(pop.style.maxHeight).toBe('282px');
    expect(pop.style.top).toBe('12px');
    expect(Number.parseFloat(pop.style.top) + 282).toBe(294);
  });

  it('keeps an upward overlay clear of the fixed site header', async () => {
    setViewport(800, 730);
    stickyOffset.set(105);
    const { pop, fixture } = await render(0, 0, 200, 'end');
    pop.style.position = 'fixed';
    pop.getBoundingClientRect = (): DOMRect => {
      const height = Math.min(
        600,
        Number.parseFloat(pop.style.maxHeight) || 600,
      );
      return {
        left: 0,
        right: 200,
        width: 200,
        top: 0,
        bottom: height,
        height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
    fixture.componentInstance.fixedAnchor.set({
      top: 456,
      right: 500,
      bottom: 480,
      left: 474,
    });
    fixture.detectChanges();
    await Promise.resolve();

    // 456 - 6 gap - (105 header + 12 gutter)
    expect(pop.style.maxHeight).toBe('333px');
    expect(pop.style.top).toBe('117px');
    expect(pop.dataset['edgePlacement']).toBe('top');
  });

  it('keeps an overlay opened at a point clear of the fixed site header', async () => {
    setViewport(360, 480);
    stickyOffset.set(64);
    const { pop, fixture } = await render(0, 0, 214);
    pop.style.position = 'fixed';
    pop.getBoundingClientRect = (): DOMRect =>
      ({
        left: 0,
        right: 214,
        width: 214,
        top: 0,
        bottom: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fixture.componentInstance.point.set({ x: 20, y: 30 });
    fixture.detectChanges();
    await Promise.resolve();

    expect(pop.style.top).toBe('76px');
    expect(pop.style.maxHeight).toBe('392px');
  });

  it('uses the full layout height while an upward menu is scaling open', async () => {
    setViewport(800, 700);
    const { pop, fixture } = await render(0, 0, 200, 'end');
    pop.style.position = 'fixed';
    Object.defineProperty(pop, 'offsetWidth', {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(pop, 'offsetHeight', {
      configurable: true,
      value: 300,
    });
    pop.getBoundingClientRect = (): DOMRect =>
      ({
        left: 0,
        right: 192,
        width: 192,
        top: 0,
        bottom: 288,
        height: 288,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fixture.componentInstance.fixedAnchor.set({
      top: 600,
      right: 500,
      bottom: 626,
      left: 474,
    });
    fixture.detectChanges();
    await Promise.resolve();

    expect(pop.style.left).toBe('300px');
    expect(pop.style.top).toBe('294px');
    expect(Number.parseFloat(pop.style.top) + pop.offsetHeight).toBe(594);
  });
});
