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
import { SweepLibraryService } from '../../services/sweep-library.service';
import { environment } from '../../../environments/environment';
import en from '../../../assets/i18n/en.json';
import stubIndex from '../../testing/fixtures/sweep-index.stub.json';

@Component({
  imports: [GsSweepScrubComponent],
  template: `<app-gs-sweep-scrub
    [parameter]="parameter"
    [modelSlug]="modelSlug"
  />`,
})
class HostComponent {
  public parameter = 'steps';
  public modelSlug: string | undefined = undefined;
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
    /** What the studio is set to, as the baseline the library maps. */
    studioBaseline?: string;
    /** What the surface hosting the scrubber names, if it names anything. */
    modelSlug?: string;
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
    if (options?.studioBaseline) {
      TestBed.inject(SweepLibraryService).setStudioBaseline(
        options.studioBaseline,
      );
    }
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.modelSlug = options?.modelSlug;
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
    expect(el().textContent).toContain('Rendered at 12');
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
    expect(el().textContent).toContain('Rendered at 30');
    expect(el().textContent).toContain('Past here the picture stops changing');
  });

  it('shows the strip for the model the studio is set to', async () => {
    await setUp({ studioBaseline: 'stable_diffusion_1' });

    expect(
      find<HTMLImageElement>('.gs-sweep-preview')?.getAttribute('src'),
    ).toBe(
      `${environment.sweepLibraryBaseUrl}/steps/deliberate/landscape/001_8.webp`,
    );
  });

  it('lets a surface that names a model override the studio', async () => {
    await setUp({
      studioBaseline: 'stable_diffusion_1',
      modelSlug: 'albedobase-xl',
    });

    expect(
      find<HTMLImageElement>('.gs-sweep-preview')?.getAttribute('src'),
    ).toBe(
      `${environment.sweepLibraryBaseUrl}/steps/albedobase-xl/person/002_12.webp`,
    );
  });

  it('opens the frame full size, focused, and closes on Escape', async () => {
    await setUp();
    find<HTMLButtonElement>('.gs-sweep-offer')!.click();
    fixture.detectChanges();

    const trigger = find<HTMLButtonElement>('.gs-sweep-zoom')!;
    trigger.click();
    fixture.detectChanges();

    const panel = find<HTMLElement>('.gs-sweep-viewer-body')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(
      find<HTMLImageElement>('.gs-sweep-viewer-img')!.getAttribute('src'),
    ).toBe(
      `${environment.sweepLibraryBaseUrl}/steps/albedobase-xl/person/002_12.webp`,
    );
    expect(document.activeElement).toBe(panel);

    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(find('.gs-sweep-viewer')).toBeNull();
    // Focus comes back where it was, not to the top of the document.
    expect(document.activeElement).toBe(find('.gs-sweep-zoom'));
  });

  it('keeps Tab inside the enlarged view', async () => {
    await setUp();
    find<HTMLButtonElement>('.gs-sweep-offer')!.click();
    fixture.detectChanges();
    find<HTMLButtonElement>('.gs-sweep-zoom')!.click();
    fixture.detectChanges();

    const panel = find<HTMLElement>('.gs-sweep-viewer-body')!;
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    panel.dispatchEvent(tab);
    fixture.detectChanges();

    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(find('.gs-sweep-viewer-x'));
  });

  it('closes the enlarged view from its backdrop and its close button', async () => {
    await setUp();
    find<HTMLButtonElement>('.gs-sweep-offer')!.click();
    fixture.detectChanges();
    find<HTMLButtonElement>('.gs-sweep-zoom')!.click();
    fixture.detectChanges();

    find<HTMLButtonElement>('.gs-sweep-viewer-x')!.click();
    fixture.detectChanges();
    expect(find('.gs-sweep-viewer')).toBeNull();

    find<HTMLButtonElement>('.gs-sweep-zoom')!.click();
    fixture.detectChanges();
    find<HTMLElement>('.gs-sweep-viewer')!.click();
    fixture.detectChanges();

    expect(find('.gs-sweep-viewer')).toBeNull();
    // A press that lands on the panel itself is not a press outside it.
    find<HTMLButtonElement>('.gs-sweep-zoom')!.click();
    fixture.detectChanges();
    find<HTMLElement>('.gs-sweep-viewer-body')!.click();
    fixture.detectChanges();

    expect(find('.gs-sweep-viewer')).not.toBeNull();
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
