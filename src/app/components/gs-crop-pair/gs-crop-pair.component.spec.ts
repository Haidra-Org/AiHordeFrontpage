import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CropSide, GsCropPairComponent } from './gs-crop-pair.component';
import en from '../../../assets/i18n/en.json';

const translations = en as Record<string, string>;

@Component({
  imports: [GsCropPairComponent],
  template: `<app-gs-crop-pair [before]="before()" [after]="after()" />`,
})
class HostComponent {
  public readonly before = signal<CropSide>({
    src: '/lib/before_crop.webp',
    width: 461,
    height: 461,
    label: '0.1',
  });
  public readonly after = signal<CropSide>({
    src: '/lib/after_crop.webp',
    width: 461,
    height: 461,
    label: '1',
  });
}

/**
 * Minimal fake ResizeObserver. The pair decides between the wipe and the still
 * preview on the room its host has, and jsdom lays nothing out, so the test
 * hands it a number when it wants one.
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

describe('GsCropPairComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));
  const badges = (): string[] =>
    all<HTMLElement>('.gs-pixels-text').map(
      (badge) => badge.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );

  /** Tell everything that measures itself how much room it has. */
  const reportWidth = (width: number): void => {
    for (const observer of FakeResizeObserver.instances) {
      observer.callback(
        [{ contentRect: { width } } as unknown as ResizeObserverEntry],
        observer as unknown as ResizeObserver,
      );
    }
    fixture.detectChanges();
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
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wipes the two crops against each other in one bounded box', () => {
    const wipe = el().querySelector<HTMLElement>('.gs-wipe');

    expect(wipe).not.toBeNull();
    expect(el().querySelectorAll('.gs-wipe-img').length).toBe(2);
    expect(wipe?.style.getPropertyValue('--gs-wipe-box-w')).toBe('461px');
    expect(wipe?.style.getPropertyValue('--gs-wipe-box-h')).toBe('461px');
  });

  it('says both sizes, each against the side it belongs to', () => {
    expect(badges()).toEqual(['0.1 · 461 × 461', '1 · 461 × 461']);
  });

  it('reads an unequal pair at the larger side and says which was enlarged', () => {
    fixture.componentInstance.before.set({
      src: '/lib/source_crop.webp',
      width: 133,
      height: 133,
      label: 'Source',
    });
    fixture.componentInstance.after.set({
      src: '/lib/result_crop.webp',
      width: 532,
      height: 532,
      label: 'RealESRGAN x4plus',
    });
    fixture.detectChanges();

    const wipe = el().querySelector<HTMLElement>('.gs-wipe');
    expect(wipe?.style.getPropertyValue('--gs-wipe-box-w')).toBe('532px');
    expect(badges()).toEqual([
      'Source · 133 × 133',
      'RealESRGAN x4plus · 532 × 532',
    ]);

    const notes = all<HTMLElement>('.gs-wipe-note').map((note) =>
      note.textContent?.trim(),
    );
    expect(notes).toEqual([
      translations['generate.sweeps.match_note'].replace('{{ factor }}', '4'),
    ]);
  });

  it('stands still, both crops in the room, on a host too narrow to wipe', () => {
    reportWidth(366);

    expect(el().querySelector('.gs-wipe-divider')).toBeNull();
    expect(el().querySelectorAll('.gs-wipe-img').length).toBe(2);
    // No box: the crops are scaled into the column rather than held at their
    // own pixels, which is the reading the press to full size gives.
    const wipe = el().querySelector<HTMLElement>('.gs-wipe');
    expect(wipe?.style.getPropertyValue('--gs-wipe-box-w')).toBe('auto');
  });

  it('keeps the wipe where the room is there for it', () => {
    reportWidth(590);

    expect(el().querySelector('.gs-wipe-divider')).not.toBeNull();
  });
});
