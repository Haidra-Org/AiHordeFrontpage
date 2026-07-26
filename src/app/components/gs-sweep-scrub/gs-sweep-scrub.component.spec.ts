import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GsSweepScrubComponent } from './gs-sweep-scrub.component';
import { environment } from '../../../environments/environment';
import en from '../../../assets/i18n/en.json';
import stubIndex from '../../testing/fixtures/sweep-index.stub.json';

@Component({
  imports: [GsSweepScrubComponent],
  template: `<app-gs-sweep-scrub [parameter]="parameter" />`,
})
class HostComponent {
  public parameter = 'steps';
}

/** The test DOM has no media queries at all, so the flag is installed. */
function stubReducedData(reduced: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) =>
      ({
        matches: reduced && query.includes('prefers-reduced-data'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  });
}

describe('GsSweepScrubComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let http: HttpTestingController;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);

  async function setUp(options?: {
    reducedData?: boolean;
    empty?: boolean;
  }): Promise<void> {
    stubReducedData(options?.reducedData ?? false);
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const request = http.expectOne(
      `${environment.sweepLibraryBaseUrl}/index.json`,
    );
    if (options?.empty) {
      request.error(new ProgressEvent('offline'), {
        status: 0,
        statusText: '',
      });
    } else {
      request.flush(stubIndex);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('renders nothing at all when the library has no strip', async () => {
    await setUp({ empty: true });

    expect(el().textContent?.trim()).toBe('');
    expect(find('.gs-sweep')).toBeNull();
  });

  it('offers the sweep collapsed, with the middle stop as its preview', async () => {
    await setUp();

    expect(find('.gs-sweep-offer')).not.toBeNull();
    expect(find('.gs-sweep-frame')).toBeNull();
    expect(
      find<HTMLImageElement>('.gs-sweep-preview')?.getAttribute('src'),
    ).toBe(
      `${environment.sweepLibraryBaseUrl}/steps/albedobase-xl/person/002_12.webp`,
    );
  });

  it('keeps even the preview behind a tap when data is being saved', async () => {
    await setUp({ reducedData: true });

    expect(find('.gs-sweep-offer')).not.toBeNull();
    expect(find('.gs-sweep-preview')).toBeNull();
  });

  it('expands to the large frame, its caption and a scrubber', async () => {
    await setUp();

    find<HTMLButtonElement>('.gs-sweep-offer')!.click();
    fixture.detectChanges();

    expect(find<HTMLImageElement>('.gs-sweep-frame')?.getAttribute('src')).toBe(
      `${environment.sweepLibraryBaseUrl}/steps/albedobase-xl/person/002_12.webp`,
    );
    expect(el().textContent).toContain('The face and the light have settled.');
    expect(el().textContent).toContain('Set to 12');
    expect(find('.gs-sweep-range')).not.toBeNull();
  });

  it('carries slider semantics and moves with the keyboard', async () => {
    await setUp();
    find<HTMLButtonElement>('.gs-sweep-offer')!.click();
    fixture.detectChanges();

    const range = find<HTMLInputElement>('.gs-sweep-range')!;
    expect(range.type).toBe('range');
    expect(range.min).toBe('0');
    expect(range.max).toBe('2');
    expect(range.value).toBe('1');
    expect(range.getAttribute('aria-label')).toBe(
      en['generate.sweeps.slider_label'],
    );
    expect(range.getAttribute('aria-valuetext')).toBe('12');

    // What ArrowRight does to a range input, which jsdom does not do for us.
    range.value = '2';
    range.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(range.getAttribute('aria-valuetext')).toBe('30');
    expect(el().textContent).toContain('Set to 30');
    expect(el().textContent).toContain('Past here the picture stops changing');
  });

  it('collapses back to the offer', async () => {
    await setUp();
    find<HTMLButtonElement>('.gs-sweep-offer')!.click();
    fixture.detectChanges();

    find<HTMLButtonElement>('.gs-sweep-collapse')!.click();
    fixture.detectChanges();

    expect(find('.gs-sweep-frame')).toBeNull();
    expect(find('.gs-sweep-offer')).not.toBeNull();
  });
});
