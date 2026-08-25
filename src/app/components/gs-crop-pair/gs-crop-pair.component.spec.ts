import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
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

describe('GsCropPairComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));
  const badges = (): string[] =>
    all<HTMLElement>('.gs-pixels-text').map(
      (badge) => badge.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );

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
});
