import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { EdgeAwarePopoverDirective } from './edge-aware-popover.directive';

@Component({
  imports: [EdgeAwarePopoverDirective],
  template: `<div class="anchor">
    <div class="pop" appEdgeAware [edgeAlign]="align()"></div>
  </div>`,
})
class HostComponent {
  public readonly align = signal<'start' | 'end'>('start');
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

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      value: originalWidth,
      configurable: true,
    });
  });

  function setViewport(width: number): void {
    Object.defineProperty(window, 'innerWidth', {
      value: width,
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
});
