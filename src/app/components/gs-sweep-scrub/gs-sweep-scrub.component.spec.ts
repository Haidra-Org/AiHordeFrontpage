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
    [startExpanded]="startExpanded"
  />`,
})
class HostComponent {
  public parameter = 'steps';
  public modelSlug: string | undefined = undefined;
  public startExpanded = false;
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
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));
  /** The rendered words, with the template's own whitespace collapsed out. */
  const text = (): string =>
    el().textContent?.replace(/\s+/g, ' ').trim() ?? '';

  async function setUp(options?: {
    reducedData?: boolean;
    empty?: boolean;
    /** What the studio is set to, as the baseline the library maps. */
    studioBaseline?: string;
    /** What the surface hosting the scrubber names, if it names anything. */
    modelSlug?: string;
    /** Which sweep to put on show; the steps strip unless said otherwise. */
    parameter?: string;
    /** Whether the surface opens the strip without waiting to be asked. */
    startExpanded?: boolean;
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
    fixture.componentInstance.parameter = options?.parameter ?? 'steps';
    fixture.componentInstance.startExpanded = options?.startExpanded ?? false;
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
    expect(text()).toContain('Steps 12');
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
    expect(text()).toContain('Steps 30');
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

  describe('two-frame strips', () => {
    it('shows both frames at once, named and captioned, with no slider', async () => {
      await setUp({ parameter: 'tiling' });

      find<HTMLButtonElement>('.gs-sweep-offer')!.click();
      fixture.detectChanges();

      const frames = all<HTMLElement>('.gs-sweep-pair-item');
      expect(frames).toHaveLength(2);
      expect(find('.gs-sweep-range')).toBeNull();
      // The index labels these `off`/`on`, which is a filename, not a heading.
      expect(
        all('.gs-sweep-pair-name').map((n) => n.textContent?.trim()),
      ).toEqual([
        en['generate.sweeps.state_off'],
        en['generate.sweeps.state_on'],
      ]);
      expect(el().textContent).toContain('Every join is a hard line.');
      expect(el().textContent).toContain('The grain runs on across each join.');
    });

    it('enlarges the side that was pressed and gives focus back to it', async () => {
      await setUp({ parameter: 'tiling' });
      find<HTMLButtonElement>('.gs-sweep-offer')!.click();
      fixture.detectChanges();

      all<HTMLButtonElement>('.gs-sweep-zoom')[1].click();
      fixture.detectChanges();

      expect(
        find<HTMLElement>('.gs-sweep-viewer-body')!.getAttribute('aria-label'),
      ).toContain('On');
      find<HTMLButtonElement>('.gs-sweep-viewer-x')!.click();
      fixture.detectChanges();

      expect(document.activeElement).toBe(all('.gs-sweep-zoom')[1]);
    });
  });

  it('lays a tiled strip out as four copies of the one tile', async () => {
    await setUp({ parameter: 'tiling' });
    find<HTMLButtonElement>('.gs-sweep-offer')!.click();
    fixture.detectChanges();

    const [first] = all<HTMLElement>('.gs-sweep-tiled');
    expect(first.getAttribute('role')).toBe('img');
    expect(first.getAttribute('aria-label')).toContain('repeated four times');
    const copies = Array.from(first.querySelectorAll<HTMLImageElement>('img'));
    expect(copies).toHaveLength(4);
    for (const copy of copies) {
      expect(copy.getAttribute('src')).toBe(
        `${environment.sweepLibraryBaseUrl}/tiling/deliberate/texture/001_off.webp`,
      );
      expect(copy.getAttribute('loading')).toBe('lazy');
    }
  });

  it('names a strip that varies the wording by the wording, not by a setting', async () => {
    await setUp({ parameter: 'prompt_emphasis' });
    find<HTMLButtonElement>('.gs-sweep-offer')!.click();
    fixture.detectChanges();

    // The label on these stops is a filename token, so it is never read out.
    expect(find('.gs-sweep-caption-value')?.textContent?.trim()).toBe(
      'Prompted with (watercolor painting:1.0)',
    );
    expect(
      find<HTMLInputElement>('.gs-sweep-range')!.getAttribute('aria-valuetext'),
    ).toBe('1');
    expect(find<HTMLImageElement>('.gs-sweep-frame')!.getAttribute('alt')).toBe(
      'The same picture rendered at 1',
    );

    find<HTMLButtonElement>('.gs-sweep-zoom')!.click();
    fixture.detectChanges();

    expect(find('.gs-sweep-viewer-name')?.textContent?.trim()).toBe(
      'Prompted with (watercolor painting:1.0)',
    );
  });

  it('shows the image a denoising strip was painted over', async () => {
    await setUp({ parameter: 'denoising_strength' });
    find<HTMLButtonElement>('.gs-sweep-offer')!.click();
    fixture.detectChanges();

    expect(
      find<HTMLImageElement>('.gs-sweep-source-img')!.getAttribute('src'),
    ).toBe(
      `${environment.sweepLibraryBaseUrl}/denoising-strength/deliberate/place/source.webp`,
    );
    expect(el().textContent).toContain(en['generate.sweeps.source_label']);

    find<HTMLButtonElement>('.gs-sweep-zoom')!.click();
    fixture.detectChanges();

    expect(find('.gs-sweep-viewer-source-img')).not.toBeNull();
  });

  describe('the second reading of steps', () => {
    it('swaps to the converging strip and keeps the slider where it was', async () => {
      await setUp();
      find<HTMLButtonElement>('.gs-sweep-offer')!.click();
      fixture.detectChanges();

      const range = find<HTMLInputElement>('.gs-sweep-range')!;
      range.value = '2';
      range.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const [base, alternate] = all<HTMLButtonElement>('.gs-sweep-variant');
      expect(base.getAttribute('aria-pressed')).toBe('true');

      alternate.click();
      fixture.detectChanges();

      expect(alternate.getAttribute('aria-pressed')).toBe('true');
      expect(find<HTMLInputElement>('.gs-sweep-range')!.value).toBe('2');
      expect(
        find<HTMLImageElement>('.gs-sweep-frame')!.getAttribute('src'),
      ).toBe(
        `${environment.sweepLibraryBaseUrl}/steps-converging/albedobase-xl/person/003_30.webp`,
      );
      expect(el().textContent).toContain('Settled, and the same picture');
    });

    it('offers no choice on a parameter with only one reading published', async () => {
      await setUp({ parameter: 'cfg_scale' });
      find<HTMLButtonElement>('.gs-sweep-offer')!.click();
      fixture.detectChanges();

      expect(all('.gs-sweep-variant')).toHaveLength(0);
    });
  });

  describe('the full-size view', () => {
    const openZoom = (): void => {
      find<HTMLButtonElement>('.gs-sweep-offer')!.click();
      fixture.detectChanges();
      find<HTMLButtonElement>('.gs-sweep-zoom')!.click();
      fixture.detectChanges();
    };

    const arrow = (key: string): void => {
      find<HTMLElement>('.gs-sweep-viewer-body')!.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
    };

    it('carries the scrubber with it and steps with the arrow keys', async () => {
      await setUp();
      openZoom();

      const range = (): HTMLInputElement =>
        find<HTMLInputElement>('.gs-sweep-viewer-foot .gs-sweep-range')!;
      expect(range().value).toBe('1');
      expect(range().max).toBe('2');

      arrow('ArrowRight');
      expect(range().value).toBe('2');
      expect(range().getAttribute('aria-valuetext')).toBe('30');
      expect(
        find<HTMLImageElement>('.gs-sweep-viewer-img')!.getAttribute('src'),
      ).toBe(
        `${environment.sweepLibraryBaseUrl}/steps/albedobase-xl/person/003_30.webp`,
      );

      // The edge holds rather than wrapping round to the other end.
      arrow('ArrowRight');
      expect(range().value).toBe('2');

      arrow('ArrowLeft');
      arrow('ArrowLeft');
      expect(range().value).toBe('0');
    });

    it('leaves the strip on the stop the reader scrubbed to', async () => {
      await setUp();
      openZoom();
      arrow('ArrowRight');
      find<HTMLButtonElement>('.gs-sweep-viewer-x')!.click();
      fixture.detectChanges();

      expect(find<HTMLInputElement>('.gs-sweep-range')!.value).toBe('2');
      expect(text()).toContain('Steps 30');
    });

    it('scrubs from the slider inside the layer', async () => {
      await setUp();
      openZoom();

      const range = find<HTMLInputElement>(
        '.gs-sweep-viewer-foot .gs-sweep-range',
      )!;
      range.value = '0';
      range.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(text()).toContain('Barely resolved');
    });

    it('offers the pair of readings inside the layer, without closing it', async () => {
      await setUp();
      openZoom();

      const variants = all<HTMLButtonElement>(
        '.gs-sweep-viewer-body .gs-sweep-variant',
      );
      expect(variants).toHaveLength(2);

      variants[1].click();
      fixture.detectChanges();

      expect(find('.gs-sweep-viewer')).not.toBeNull();
      expect(
        find<HTMLImageElement>('.gs-sweep-viewer-img')!.getAttribute('src'),
      ).toBe(
        `${environment.sweepLibraryBaseUrl}/steps-converging/albedobase-xl/person/002_12.webp`,
      );
    });

    it('names the frame by its value rather than by its filename token', async () => {
      // The denoising strip labels 0.15 as `0_15`, which is a filename.
      await setUp({ parameter: 'denoising_strength' });
      openZoom();

      expect(
        find('.gs-sweep-viewer-name')?.textContent?.replace(/\s+/g, ' ').trim(),
      ).toBe('Denoise 0.5');
      arrow('ArrowLeft');
      expect(
        find('.gs-sweep-viewer-name')?.textContent?.replace(/\s+/g, ' ').trim(),
      ).toBe('Denoise 0.15');
    });
  });

  it('opens already expanded where the page is about the one setting', async () => {
    await setUp({ startExpanded: true });

    expect(find('.gs-sweep-offer')).toBeNull();
    expect(find('.gs-sweep-frame')).not.toBeNull();
    expect(find('.gs-sweep-range')).not.toBeNull();
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
