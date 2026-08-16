import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RememberedHeightDirective } from './remembered-height.directive';

/**
 * Minimal fake ResizeObserver: jsdom lays nothing out, so the size change a
 * drag would report has to be delivered by hand.
 */
class FakeResizeObserver {
  public static instances: FakeResizeObserver[] = [];
  public readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  public observed: Element[] = [];

  public observe(target: Element): void {
    this.observed.push(target);
  }
  public unobserve(target: Element): void {
    this.observed = this.observed.filter((el) => el !== target);
  }
  public disconnect(): void {
    this.observed = [];
  }
}

@Component({
  imports: [RememberedHeightDirective],
  template: `<textarea appRememberedHeight="test.height"></textarea>`,
})
class HostComponent {}

describe('RememberedHeightDirective', () => {
  let fixture: ComponentFixture<HostComponent>;

  const area = (): HTMLTextAreaElement =>
    (fixture.nativeElement as HTMLElement).querySelector(
      'textarea',
    ) as HTMLTextAreaElement;

  /** Report a size change the way the browser does after a drag. */
  const resized = (): void => {
    for (const observer of FakeResizeObserver.instances) {
      observer.callback([], observer as unknown as ResizeObserver);
    }
  };

  const create = async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  };

  beforeEach(() => {
    localStorage.clear();
    FakeResizeObserver.instances = [];
    vi.stubGlobal(
      'ResizeObserver',
      FakeResizeObserver as unknown as typeof ResizeObserver,
    );
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('gives back the height it was left at', async () => {
    localStorage.setItem('test.height', JSON.stringify('180px'));

    await create();

    expect(area().style.height).toBe('180px');
  });

  it('starts at the stylesheet height when nothing was stored', async () => {
    await create();

    expect(area().style.height).toBe('');
  });

  it('writes the height down once the drag settles', async () => {
    await create();

    area().style.height = '240px';
    resized();
    vi.advanceTimersByTime(200);

    expect(localStorage.getItem('test.height')).toBe(JSON.stringify('240px'));
  });

  it('leaves a height it never set alone', async () => {
    await create();

    resized();
    vi.advanceTimersByTime(200);

    expect(localStorage.getItem('test.height')).toBeNull();
  });
});
