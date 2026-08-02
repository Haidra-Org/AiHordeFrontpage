import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it } from 'vitest';
import { DocsSettingsEntryComponent } from './settings-entry.component';
import { DocsSettingsIndexComponent } from '../settings-index/settings-index.component';
import { environment } from '../../../../environments/environment';
import { SECTION_IDENTITIES } from '../../../content/sections';
import { SETTINGS_INDEX, settingNeighbours } from '../../../content/settings';
import en from '../../../../assets/i18n/en.json';
import stubIndex from '../../../testing/fixtures/sweep-index.stub.json';

const translations = en as Record<string, string>;

/** Stands in for the Learn shell, so the router mounts the page it routes to. */
@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class HostComponent {}

describe('DocsSettingsEntryComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let http: HttpTestingController;
  let router: Router;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));

  /** Answer whatever sweep fetches the mounted page happens to make. */
  const flushLibrary = (): void => {
    for (const request of http.match(
      `${environment.sweepLibraryBaseUrl}/index.json`,
    )) {
      request.flush(stubIndex);
    }
  };

  async function setUp(param: string): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'docs/image/settings',
            component: DocsSettingsIndexComponent,
          },
          {
            path: 'docs/image/settings/:param',
            component: DocsSettingsEntryComponent,
          },
        ]),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    await router.navigateByUrl(`/docs/image/settings/${param}`);
    fixture.detectChanges();
    flushLibrary();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    flushLibrary();
    fixture.detectChanges();
  }

  it('mounts the shared entry for the setting the URL names', async () => {
    await setUp('steps');

    expect(find('app-gs-param-entry')).not.toBeNull();
    expect(find('.gs-ref-title')?.textContent?.trim()).toBe(
      translations['generate.help.steps.title'],
    );
    // The routed page is the reference, so it never offers a way to itself.
    expect(find('.gs-ref-foot')).toBeNull();
  });

  it('offers the way back to the index', async () => {
    await setUp('steps');

    expect(find<HTMLAnchorElement>('.gs-ref-back')?.getAttribute('href')).toBe(
      '/docs/image/settings',
    );
    expect(find('.gs-ref-back')?.textContent?.trim()).toBe(
      translations['generate.reference.back'],
    );
  });

  it('walks on to the neighbouring settings in the same area', async () => {
    await setUp('cfg');
    const { previous, next } = settingNeighbours('cfg');

    expect(previous).toBe('steps');
    expect(next).toBe('sampler');
    expect(
      all<HTMLAnchorElement>('.gs-ref-onward').map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual([
      `/docs/image/settings/${previous}`,
      `/docs/image/settings/${next}`,
    ]);
    // Neighbours in the area being read are named, not annotated.
    expect(all('.gs-ref-onward-sec')).toHaveLength(0);
    for (const link of all<HTMLAnchorElement>('.gs-ref-onward')) {
      expect(link.classList).toContain(
        SECTION_IDENTITIES['sampling'].className,
      );
    }
  });

  it('names the area a link crosses into, and takes its hue', async () => {
    const sequence = SETTINGS_INDEX.flatMap((group) => group.ids);
    // The last entry of the first area: its way on leaves that area.
    const edge = SETTINGS_INDEX[0].ids[SETTINGS_INDEX[0].ids.length - 1];
    const next = sequence[sequence.indexOf(edge) + 1];
    const crossed = SETTINGS_INDEX[1].section;

    await setUp(edge);

    const link = find<HTMLAnchorElement>('.gs-ref-onward--next');
    expect(link?.getAttribute('href')).toBe(`/docs/image/settings/${next}`);
    expect(link?.classList).toContain(SECTION_IDENTITIES[crossed].className);
    expect(
      link?.querySelector('.gs-ref-onward-sec')?.textContent?.trim(),
    ).toContain(translations[SECTION_IDENTITIES[crossed].labelKey]);
    expect(
      link?.querySelector('.gs-ref-onward-name')?.textContent?.trim(),
    ).toBe(translations[`generate.help.${next}.title`]);
  });

  it('has no way back from the first setting in the reference', async () => {
    const first = SETTINGS_INDEX[0].ids[0];
    await setUp(first);

    expect(settingNeighbours(first).previous).toBeNull();
    expect(all('.gs-ref-onward')).toHaveLength(1);
    expect(find('.gs-ref-onward--next')).not.toBeNull();
  });

  it('has no way on from the last setting in the reference', async () => {
    const sequence = SETTINGS_INDEX.flatMap((group) => group.ids);
    const last = sequence[sequence.length - 1];
    await setUp(last);

    expect(settingNeighbours(last).next).toBeNull();
    expect(all('.gs-ref-onward')).toHaveLength(1);
    expect(find('.gs-ref-onward--next')).toBeNull();
  });

  it('sends a URL naming no setting back to the index', async () => {
    await setUp('not_a_setting');

    expect(router.url).toBe('/docs/image/settings');
    expect(find('app-gs-param-entry')).toBeNull();
    expect(find('.gs-ref-index-title')).not.toBeNull();
  });
});
