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
import { GenerateSettingsEntryComponent } from './generate-settings-entry.component';
import { GenerateSettingsIndexComponent } from '../generate-settings-index/generate-settings-index.component';
import { environment } from '../../../../environments/environment';
import { referenceNeighbours } from '../reference-data';
import en from '../../../../assets/i18n/en.json';
import stubIndex from '../../../testing/fixtures/sweep-index.stub.json';

const translations = en as Record<string, string>;

/** Stands in for the Learn shell, so the router mounts the page it routes to. */
@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class HostComponent {}

describe('GenerateSettingsEntryComponent', () => {
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
            path: 'generate/learn/settings',
            component: GenerateSettingsIndexComponent,
          },
          {
            path: 'generate/learn/settings/:param',
            component: GenerateSettingsEntryComponent,
          },
        ]),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    await router.navigateByUrl(`/generate/learn/settings/${param}`);
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
      '/generate/learn/settings',
    );
    expect(find('.gs-ref-back')?.textContent?.trim()).toBe(
      translations['generate.reference.back'],
    );
  });

  it('walks on to the neighbouring settings in the same area', async () => {
    await setUp('cfg');
    const { previous, next } = referenceNeighbours('cfg');

    expect(previous).toBe('steps');
    expect(next).toBe('sampler');
    expect(
      all<HTMLAnchorElement>('.gs-ref-onward').map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual([
      `/generate/learn/settings/${previous}`,
      `/generate/learn/settings/${next}`,
    ]);
  });

  it('offers no way on where the area holds one setting', async () => {
    await setUp('loras');

    expect(referenceNeighbours('loras')).toEqual({
      previous: null,
      next: null,
    });
    expect(all('.gs-ref-onward')).toHaveLength(0);
  });

  it('sends a URL naming no setting back to the index', async () => {
    await setUp('not_a_setting');

    expect(router.url).toBe('/generate/learn/settings');
    expect(find('app-gs-param-entry')).toBeNull();
    expect(find('.gs-ref-index-title')).not.toBeNull();
  });
});
