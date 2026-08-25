import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GsShotViewerComponent } from './gs-shot-viewer.component';
import en from '../../../assets/i18n/en.json';

@Component({
  imports: [GsShotViewerComponent],
  template: `<app-gs-shot-viewer
    [src]="src()"
    label="The render"
    [width]="width()"
    [height]="height()"
  />`,
})
class HostComponent {
  public readonly src = signal('/lib/render.webp');
  public readonly width = signal<number | null>(2048);
  public readonly height = signal<number | null>(2048);
}

describe('GsShotViewerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const badge = (): string =>
    el()
      .querySelector<HTMLElement>('.gs-pixels-text')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim() ?? '';

  /** The file arriving, at the size the browser would report for it. */
  function arrivesAt(natural: number, drawn: number): void {
    const image = el().querySelector<HTMLImageElement>('.gs-tut-viewer-img')!;
    Object.defineProperty(image, 'naturalWidth', {
      value: natural,
      configurable: true,
    });
    Object.defineProperty(image, 'naturalHeight', {
      value: natural,
      configurable: true,
    });
    image.getBoundingClientRect = () =>
      ({ width: drawn, height: drawn }) as DOMRect;
    image.dispatchEvent(new Event('load'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
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

  it('says the size the library published, and how far the layer reduced it', () => {
    arrivesAt(2048, 512);

    expect(badge()).toBe('2048 × 2048 · shown at 25%');
  });

  it('falls back to the size the file itself turned out to be', () => {
    fixture.componentInstance.width.set(null);
    fixture.componentInstance.height.set(null);
    fixture.detectChanges();
    arrivesAt(768, 768);

    expect(badge()).toBe('768 × 768 · shown at 100%');
  });

  it('says nothing at all while no size is known either way', () => {
    fixture.componentInstance.width.set(null);
    fixture.componentInstance.height.set(null);
    fixture.detectChanges();

    expect(el().querySelector('.gs-pixels-text')).toBeNull();
  });

  it('holds the picture in a box of its own, so the badge sits on it', () => {
    const hold = el().querySelector('.gs-tut-viewer-hold');

    expect(hold?.querySelector('.gs-tut-viewer-img')).not.toBeNull();
    expect(hold?.querySelector('app-gs-pixel-badge')).not.toBeNull();
  });
});
