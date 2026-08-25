import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GsPixelBadgeComponent } from './gs-pixel-badge.component';
import en from '../../../assets/i18n/en.json';

@Component({
  imports: [GsPixelBadgeComponent],
  template: `<app-gs-pixel-badge
    [width]="width()"
    [height]="height()"
    [shown]="shown()"
    [label]="label()"
  />`,
})
class HostComponent {
  public readonly width = signal<number | null>(1024);
  public readonly height = signal<number | null>(768);
  public readonly shown = signal<number | null>(null);
  public readonly label = signal('');
}

describe('GsPixelBadgeComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const badge = (): HTMLElement | null =>
    el().querySelector<HTMLElement>('.gs-pixels-text');
  const text = (): string =>
    badge()?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

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

  it('says the size in the pixels the picture was made at', () => {
    expect(text()).toBe('1024 × 768');
  });

  it('adds what the view is drawing it at, where the surface can zoom', () => {
    fixture.componentInstance.shown.set(41.4);
    fixture.detectChanges();

    expect(text()).toBe('1024 × 768 · shown at 41%');
  });

  it('names what the size belongs to, where a surface shows more than one', () => {
    fixture.componentInstance.label.set('Detail');
    fixture.detectChanges();

    expect(text()).toBe('Detail · 1024 × 768');
  });

  it('says the same thing in words for a reader being read to', () => {
    expect(badge()?.getAttribute('aria-label')).toBe('1024 by 768 pixels');

    fixture.componentInstance.shown.set(200);
    fixture.detectChanges();

    expect(badge()?.getAttribute('aria-label')).toBe(
      '1024 by 768 pixels, shown at 200 percent',
    );
  });

  it('renders nothing at all where no size is known', () => {
    fixture.componentInstance.width.set(null);
    fixture.detectChanges();

    expect(badge()).toBeNull();
    expect(el().textContent?.trim()).toBe('');
  });
});
