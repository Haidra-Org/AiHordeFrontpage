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

/**
 * Minimal fake ResizeObserver: the wipe decides between its two presentations
 * on the width it is given, and jsdom lays nothing out to give it one.
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

  /** Tell whatever the wipe is watching how much room the pair has. */
  const reportWidth = (width: number): void => {
    for (const observer of FakeResizeObserver.instances) {
      observer.callback(
        [{ contentRect: { width } } as unknown as ResizeObserverEntry],
        observer as unknown as ResizeObserver,
      );
    }
    fixture.detectChanges();
  };

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
    vi.unstubAllGlobals();
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
    // The stub marks this stop as picked from a batch of 4, and curation is
    // disclosed rather than hidden.
    expect(find('.gs-sweep-caption-batch')?.textContent).toContain(
      'Picked from a batch of 4.',
    );
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
    // These used to be laid out side by side with a heading each. The pair is
    // now handed to the wipe, which carries both sides and their names itself
    // and falls back to that same side-by-side layout on a narrow column.
    it('hands both frames to the wipe, named by their chips, with no slider', async () => {
      await setUp({ parameter: 'tiling' });

      find<HTMLButtonElement>('.gs-sweep-offer')!.click();
      fixture.detectChanges();

      expect(find('.gs-wipe')).not.toBeNull();
      expect(find('.gs-sweep-range')).toBeNull();
      // The index labels these `off`/`on`, which is a filename, not a heading.
      expect(
        all('.gs-wipe-tag').map((n) =>
          n.textContent?.replace(/\s+/g, ' ').trim(),
        ),
      ).toEqual([
        `Tiling ${en['generate.sweeps.state_off']}`,
        `Tiling ${en['generate.sweeps.state_on']}`,
      ]);
      expect(all('.gs-wipe-tag app-gs-setting-chip')).toHaveLength(2);
      expect(el().textContent).toContain('Every join is a hard line.');
      expect(el().textContent).toContain('The grain runs on across each join.');
    });

    it('lays the pair side by side where the wipe would be too narrow', async () => {
      await setUp({ parameter: 'tiling' });
      find<HTMLButtonElement>('.gs-sweep-offer')!.click();
      fixture.detectChanges();

      reportWidth(200);

      expect(find('.gs-wipe')!.classList.contains('is-wiping')).toBe(false);
      expect(find('.gs-wipe-divider')).toBeNull();
      expect(all('.gs-wipe-tag')).toHaveLength(2);
      expect(all('.gs-wipe-tiled')).toHaveLength(2);
    });

    it('enlarges the pair as one wipe and gives focus back to the control', async () => {
      await setUp({ parameter: 'tiling' });
      find<HTMLButtonElement>('.gs-sweep-offer')!.click();
      fixture.detectChanges();

      find<HTMLButtonElement>('.gs-sweep-pair-enlarge')!.click();
      fixture.detectChanges();

      expect(
        find<HTMLElement>('.gs-sweep-viewer-body')!.getAttribute('aria-label'),
      ).toBe(en['generate.sweeps.enlarged_pair_title']);
      // The layer shows the comparison, not one side lifted out of it.
      expect(find('.gs-sweep-viewer-wipe .gs-wipe')).not.toBeNull();
      expect(find('.gs-sweep-viewer-img')).toBeNull();

      find<HTMLButtonElement>('.gs-sweep-viewer-x')!.click();
      fixture.detectChanges();

      expect(document.activeElement).toBe(find('.gs-sweep-pair-enlarge'));
    });

    it('keeps the wipe divider in the Tab cycle of the enlarged view', async () => {
      await setUp({ parameter: 'tiling' });
      find<HTMLButtonElement>('.gs-sweep-offer')!.click();
      fixture.detectChanges();
      find<HTMLButtonElement>('.gs-sweep-pair-enlarge')!.click();
      fixture.detectChanges();

      const panel = find<HTMLElement>('.gs-sweep-viewer-body')!;
      panel.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          bubbles: true,
          cancelable: true,
        }),
      );
      fixture.detectChanges();

      expect(document.activeElement).toBe(find('.gs-sweep-viewer-x'));
      panel.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          bubbles: true,
          cancelable: true,
        }),
      );
      fixture.detectChanges();

      expect(document.activeElement).toBe(
        find('.gs-sweep-viewer-body .gs-wipe-divider'),
      );
    });
  });

  it('lays a tiled strip out as a plate of nine beside the tile itself', async () => {
    await setUp({ parameter: 'tiling' });
    find<HTMLButtonElement>('.gs-sweep-offer')!.click();
    fixture.detectChanges();

    const [first] = all<HTMLElement>('.gs-wipe-tiled');
    expect(first.getAttribute('role')).toBe('img');
    expect(first.getAttribute('aria-label')).toContain('repeated nine times');
    const copies = Array.from(first.querySelectorAll<HTMLImageElement>('img'));
    expect(copies).toHaveLength(9);
    for (const copy of copies) {
      expect(copy.getAttribute('src')).toBe(
        `${environment.sweepLibraryBaseUrl}/tiling/deliberate/texture/001_off.webp`,
      );
      expect(copy.getAttribute('loading')).toBe('lazy');
    }

    // The plate says whether the joins show; the tile on its own says what was
    // rendered. Both stops carry one, and neither is behind a toggle.
    const solos = all<HTMLImageElement>('.gs-sweep-solo-img');
    expect(solos.map((solo) => solo.getAttribute('src'))).toEqual([
      `${environment.sweepLibraryBaseUrl}/tiling/deliberate/texture/001_off.webp`,
      `${environment.sweepLibraryBaseUrl}/tiling/deliberate/texture/002_on.webp`,
    ]);
    expect(solos[0].getAttribute('alt')).toContain('single tile');
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
