import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GsToolTabsComponent } from './gs-tool-tabs.component';
import en from '../../../assets/i18n/en.json';

@Component({ template: 'page' })
class StubPageComponent {}

const translations = en as Record<string, string>;

describe('GsToolTabsComponent', () => {
  let fixture: ComponentFixture<GsToolTabsComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const links = (): HTMLAnchorElement[] =>
    Array.from(el().querySelectorAll<HTMLAnchorElement>('.gs-subtab'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        GsToolTabsComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([
          { path: 'generate/image', component: StubPageComponent },
          { path: 'generate/alchemy', component: StubPageComponent },
          { path: 'docs/image', component: StubPageComponent },
        ]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GsToolTabsComponent);
    fixture.detectChanges();
  });

  it('is the wide row with its way into the glossary by default', () => {
    expect(el().querySelector('.gs-subtabs')?.className).not.toContain(
      'gs-subtabs--phone-only',
    );
    expect(
      el().querySelector('.gs-subtab-glossary')?.getAttribute('aria-label'),
    ).toBe(translations['help.open_glossary']);
  });

  it('drops the wide row, glossary and all, when a shell has chrome of its own', () => {
    fixture.componentRef.setInput('wideRow', false);
    fixture.detectChanges();

    expect(el().querySelector('.gs-subtabs')?.className).toContain(
      'gs-subtabs--phone-only',
    );
    expect(el().querySelector('.gs-subtab-glossary')).toBeNull();
    // The three tools are the point of the bar and stay whatever shape it takes.
    expect(links()).toHaveLength(3);
  });

  it('marks the documentation as the page on screen only when told it is', () => {
    expect(links()[2].getAttribute('aria-current')).toBeNull();

    fixture.componentRef.setInput('docsCurrent', true);
    fixture.detectChanges();

    expect(links()[2].getAttribute('aria-current')).toBe('page');
    expect(links()[2].className).toContain('gs-subtab--active');
  });
});
