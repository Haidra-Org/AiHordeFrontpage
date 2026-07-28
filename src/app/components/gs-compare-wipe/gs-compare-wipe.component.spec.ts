import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GsCompareWipeComponent } from './gs-compare-wipe.component';
import en from '../../../assets/i18n/en.json';

/**
 * Minimal fake ResizeObserver: jsdom lays nothing out, so the width the
 * component decides its presentation on is the one the test reports.
 */
class FakeResizeObserver {
  public static instances: FakeResizeObserver[] = [];
  public readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  public observe(): void {
    // The test decides when a measurement arrives.
  }

  public unobserve(): void {
    // Nothing to stop watching.
  }

  public disconnect(): void {
    // Nothing to stop watching.
  }
}

@Component({
  imports: [GsCompareWipeComponent],
  template: `<app-gs-compare-wipe
    [beforeSrc]="beforeSrc"
    [afterSrc]="afterSrc"
    [beforeLabel]="beforeLabel"
    [afterLabel]="afterLabel"
    [beforeAlt]="beforeAlt"
    [afterAlt]="afterAlt"
    [tiled]="tiled"
    (imageLoad)="loads = loads + 1"
  />`,
})
class HostComponent {
  public beforeSrc = '/one.webp';
  public afterSrc = '/two.webp';
  public beforeLabel = '';
  public afterLabel = '';
  public beforeAlt = 'The scene before';
  public afterAlt = 'The scene after';
  public tiled = false;
  public loads = 0;
}

@Component({
  imports: [GsCompareWipeComponent],
  template: `<app-gs-compare-wipe beforeSrc="/one.webp" afterSrc="/two.webp">
    <span wipe-before class="projected-before">Tiling Off</span>
    <span wipe-after class="projected-after">Tiling On</span>
  </app-gs-compare-wipe>`,
})
class ProjectedHostComponent {}

describe('GsCompareWipeComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));
  const stage = (): HTMLElement => find<HTMLElement>('.gs-wipe')!;
  const divider = (): HTMLElement | null =>
    find<HTMLElement>('.gs-wipe-divider');
  const at = (): string => stage().style.getPropertyValue('--gs-wipe-at');

  /** Report a width to the observer the component set up on itself. */
  const measure = (width: number): void => {
    for (const observer of FakeResizeObserver.instances) {
      observer.callback(
        [{ contentRect: { width } } as unknown as ResizeObserverEntry],
        observer as unknown as ResizeObserver,
      );
    }
    fixture.detectChanges();
  };

  const key = (name: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key: name,
      bubbles: true,
      cancelable: true,
    });
    divider()!.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };

  /**
   * A press or a drag at a page position, over a pair jsdom has been told is
   * 400px wide. jsdom has no PointerEvent, so the mouse event of the same name
   * stands in for one; a pointer without an id is one nothing can capture.
   */
  const pointer = (type: string, clientX: number): void => {
    stage().dispatchEvent(
      new MouseEvent(type, { clientX, bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
  };

  /** Draw the pair, after whatever the test set on the host. */
  const render = (): void => {
    fixture.detectChanges();
  };

  const widthIs = (width: number): void => {
    vi.spyOn(stage(), 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width,
      right: width,
      top: 0,
      bottom: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  };

  beforeEach(async () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal(
      'ResizeObserver',
      FakeResizeObserver as unknown as typeof ResizeObserver,
    );

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        ProjectedHostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stacks the two pictures and names each half in its corner', () => {
    render();

    const images = all<HTMLImageElement>('.gs-wipe-img');
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      '/one.webp',
      '/two.webp',
    ]);
    expect(images.map((image) => image.getAttribute('alt'))).toEqual([
      'The scene before',
      'The scene after',
    ]);
    // A still of the component still says which half is which.
    expect(all('.gs-wipe-tag').map((tag) => tag.textContent?.trim())).toEqual([
      en['generate.compare.before'],
      en['generate.compare.after'],
    ]);
  });

  it('takes the names the caller gives it over its own', () => {
    fixture.componentInstance.beforeLabel = 'Karras off';
    fixture.componentInstance.afterLabel = 'Karras on';
    render();

    expect(all('.gs-wipe-tag').map((tag) => tag.textContent?.trim())).toEqual([
      'Karras off',
      'Karras on',
    ]);
  });

  it('lets a caller put its own token in the corners', () => {
    const projected = TestBed.createComponent(ProjectedHostComponent);
    projected.detectChanges();
    const host = projected.nativeElement as HTMLElement;

    expect(
      host.querySelector('.gs-wipe-tag--before .projected-before'),
    ).not.toBeNull();
    expect(
      host.querySelector('.gs-wipe-tag--after .projected-after'),
    ).not.toBeNull();
  });

  it('carries slider semantics on the divider', () => {
    render();

    const handle = divider()!;

    expect(handle.getAttribute('role')).toBe('slider');
    expect(handle.getAttribute('tabindex')).toBe('0');
    expect(handle.getAttribute('aria-label')).toBe(
      en['generate.compare.slider_label'],
    );
    expect(handle.getAttribute('aria-valuemin')).toBe('0');
    expect(handle.getAttribute('aria-valuemax')).toBe('100');
    expect(handle.getAttribute('aria-valuenow')).toBe('50');
    expect(handle.getAttribute('aria-valuetext')).toBe(
      '50% of the second picture shown',
    );
    expect(at()).toBe('50%');
  });

  it('steps with the arrow keys and snaps to the ends', () => {
    render();

    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(at()).toBe('55%');

    key('ArrowLeft');
    key('ArrowLeft');
    expect(at()).toBe('45%');
    expect(divider()!.getAttribute('aria-valuenow')).toBe('45');

    key('End');
    expect(at()).toBe('100%');
    // The end holds rather than running past the picture.
    key('ArrowRight');
    expect(at()).toBe('100%');

    key('Home');
    expect(at()).toBe('0%');
    key('ArrowLeft');
    expect(at()).toBe('0%');
  });

  it('puts the divider where the picture was pressed, and drags it', () => {
    render();
    widthIs(400);

    pointer('pointerdown', 100);
    expect(at()).toBe('25%');

    pointer('pointermove', 300);
    expect(at()).toBe('75%');

    // The drag ends with the press: the pointer moving on is nobody's business.
    pointer('pointerup', 0);
    pointer('pointermove', 40);
    expect(at()).toBe('75%');
  });

  it('lays the pair out side by side where a half would be too small to read', () => {
    render();
    measure(200);

    expect(stage().classList.contains('is-wiping')).toBe(false);
    expect(divider()).toBeNull();
    // The pair is still a pair: both pictures, both names.
    expect(all('.gs-wipe-img')).toHaveLength(2);
    expect(all('.gs-wipe-tag')).toHaveLength(2);

    measure(600);
    expect(stage().classList.contains('is-wiping')).toBe(true);
    expect(divider()).not.toBeNull();
  });

  it('draws a repeated pair as a three-by-three plate of each side', () => {
    fixture.componentInstance.tiled = true;
    render();

    const sides = all<HTMLElement>('.gs-wipe-tiled');
    expect(sides).toHaveLength(2);
    expect(sides[0].getAttribute('role')).toBe('img');
    expect(sides[0].getAttribute('aria-label')).toBe('The scene before');
    expect(sides[0].querySelectorAll('img')).toHaveLength(9);
    expect(all('.gs-wipe-img')).toHaveLength(0);
  });

  it('says once that a picture has arrived', () => {
    render();

    for (const image of all<HTMLImageElement>('.gs-wipe-img')) {
      image.dispatchEvent(new Event('load'));
    }
    fixture.detectChanges();

    expect(fixture.componentInstance.loads).toBe(1);
  });
});
