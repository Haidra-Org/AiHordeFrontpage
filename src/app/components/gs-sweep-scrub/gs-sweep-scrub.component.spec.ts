import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
    [controlType]="controlType"
    [startExpanded]="startExpanded"
    [viewerFirst]="viewerFirst"
    [register]="register"
  />`,
})
class HostComponent {
  public readonly explorer = viewChild.required(GsSweepScrubComponent);
  public parameter = 'steps';
  public modelSlug: string | undefined = undefined;
  public controlType: string | undefined = undefined;
  public startExpanded = false;
  public viewerFirst = false;
  public register: 'full' | 'filmcard' = 'full';
}

/**
 * Minimal fake ResizeObserver. Two things measure themselves: the wipe decides
 * between its two presentations on the width it is given, and the explorer
 * decides between a sheet and a panel on the room its host has. jsdom lays
 * nothing out, so the test hands both a number when it wants one.
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

/** The test DOM has no media queries at all, so the flags are installed. */
function stubMedia(flags: {
  reducedData?: boolean;
  reducedMotion?: boolean;
  finePointer?: boolean;
}) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) =>
      ({
        matches:
          (!!flags.reducedData && query.includes('prefers-reduced-data')) ||
          (!!flags.reducedMotion && query.includes('prefers-reduced-motion')) ||
          (!!flags.finePointer && query.includes('pointer: fine')),
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

  /**
   * Open the plate the way a reader does. A press anywhere on the card lands
   * on the door, which reaches over the whole of it; jsdom does not do hit
   * testing, so the test presses the door itself.
   */
  const openPlate = (): void => {
    find<HTMLButtonElement>('.gs-sweep-card-door')!.click();
    fixture.detectChanges();
  };

  /** The tick rail. */
  const rail = (): HTMLElement => find<HTMLElement>('.gs-tickrail')!;

  /** A key pressed on a rail, as the browser would deliver it. */
  const railKey = (key: string): void => {
    rail().dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
  };

  /** A press on one of the rail's slits. */
  const clickTick = (at: number): void => {
    all<HTMLElement>('.gs-tickrail-tick')[at].click();
    fixture.detectChanges();
  };

  /**
   * Tell the lane how wide it is. jsdom lays nothing out, and the scrubber
   * reads a position across a measured width.
   */
  const railWidth = (width: number): void => {
    vi.spyOn(rail(), 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width,
      right: width,
      top: 0,
      bottom: 44,
      height: 44,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  };

  /**
   * A press or a drag on the lane itself, away from any slit. jsdom has no
   * PointerEvent, so the mouse event of the same name stands in for one; a
   * pointer without an id is one nothing can capture.
   */
  const railPointer = (type: string, clientX: number): void => {
    rail().dispatchEvent(
      new MouseEvent(type, {
        clientX,
        clientY: 22,
        bubbles: true,
        cancelable: true,
      }),
    );
    fixture.detectChanges();
  };

  /** A pointer event on any element, in the shape the handlers read. */
  const pointer = (
    target: Element,
    type: string,
    init: { clientX?: number; clientY?: number; pointerId?: number },
  ): void => {
    const event = new MouseEvent(type, {
      clientX: init.clientX ?? 0,
      clientY: init.clientY ?? 0,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'pointerId', {
      value: init.pointerId ?? 1,
    });
    target.dispatchEvent(event);
    fixture.detectChanges();
  };

  /** Tell everything that measures itself how much room it has. */
  const reportWidth = (width: number): void => {
    for (const observer of FakeResizeObserver.instances) {
      observer.callback(
        [{ contentRect: { width } } as unknown as ResizeObserverEntry],
        observer as unknown as ResizeObserver,
      );
    }
    fixture.detectChanges();
  };

  /**
   * The same, with a height: the full-size view's arithmetic is against both,
   * because what a picture fits at is whichever of the two runs out first.
   */
  const reportBox = (width: number, height: number): void => {
    for (const observer of FakeResizeObserver.instances) {
      observer.callback(
        [{ contentRect: { width, height } } as unknown as ResizeObserverEntry],
        observer as unknown as ResizeObserver,
      );
    }
    fixture.detectChanges();
  };

  /** Hand an element the rectangle jsdom will not lay out for it. */
  const boxOf = (
    element: Element,
    left: number,
    top: number,
    width: number,
    height: number,
  ): void => {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect);
  };

  /**
   * What the size badge reads. The full-size view is the surface being asked
   * whenever it is up, and the plate's own stage is still behind it.
   */
  const badge = (): Element | null => {
    const inViewer = el().querySelector('dialog[open] .gs-pixels--stage');
    return inViewer ?? el().querySelector('.gs-pixels--stage');
  };
  const badgeText = (): string =>
    badge()?.querySelector('.gs-pixels-text')?.textContent?.trim() ?? '';

  /** The compare chip that holds the frame against its starting picture. */
  const compareChip = (): HTMLButtonElement =>
    find<HTMLButtonElement>('.gs-sweep-chip')!;

  /** Where the strip currently stands, as the rail reads it out. */
  const railAt = (): string | null =>
    find('.gs-tickrail')?.getAttribute('aria-valuenow') ?? null;

  /** One of the three named sizes in the full-size view. */
  const zoomPill = (label: string): HTMLButtonElement =>
    all<HTMLButtonElement>('dialog[open] .gs-sweep-scale').find(
      (pill) => pill.textContent?.trim() === label,
    )!;

  /** The same control on the plate, which now carries one of its own. */
  const platePill = (label: string): HTMLButtonElement | undefined =>
    all<HTMLButtonElement>('.gs-plate-col .gs-sweep-scale').find(
      (pill) => pill.textContent?.trim() === label,
    );

  const dialog = (): HTMLDialogElement =>
    find<HTMLDialogElement>('dialog.gs-sweep-dialog')!;

  async function setUp(options?: {
    reducedData?: boolean;
    empty?: boolean;
    /** What the studio is set to, as the baseline the library maps. */
    studioBaseline?: string;
    /** What the surface hosting the explorer names, if it names anything. */
    modelSlug?: string;
    /** Which sweep to put on show; the steps strip unless said otherwise. */
    parameter?: string;
    /** Which guidance mode's strip, where the field was swept against several. */
    controlType?: string;
    /** Whether the surface opens the strip without waiting to be asked. */
    startExpanded?: boolean;
    /** Whether the offer opens the full-size view instead of the plate. */
    viewerFirst?: boolean;
    /** Which collapsed card the surface asks for. */
    register?: 'full' | 'filmcard';
    /** Whether the reader has a pointer the lens is worth offering to. */
    finePointer?: boolean;
  }): Promise<void> {
    stubMedia({
      reducedData: options?.reducedData ?? false,
      finePointer: options?.finePointer ?? false,
    });
    FakeResizeObserver.instances = [];
    vi.stubGlobal(
      'ResizeObserver',
      FakeResizeObserver as unknown as typeof ResizeObserver,
    );
    try {
      // The view the reader last asked for lasts a session, and one test is not
      // the next test's session. What is remembered for longer (the layout) is
      // left alone, because a spec of its own is about exactly that.
      sessionStorage.clear();
    } catch {
      // A DOM without storage starts with nothing remembered anyway.
    }
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
        // The folded sampler note and the details links resolve against a
        // router.
        provideRouter([]),
      ],
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
    fixture.componentInstance.controlType = options?.controlType;
    fixture.componentInstance.startExpanded = options?.startExpanded ?? false;
    fixture.componentInstance.viewerFirst = options?.viewerFirst ?? false;
    fixture.componentInstance.register = options?.register ?? 'full';
    fixture.detectChanges();

    const request = http.expectOne(`${environment.evidenceBaseUrl}/index.json`);
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

  describe('the collapsed card', () => {
    it('previews the difference as a pair with a divider, not the existence of a sweep', async () => {
      await setUp();

      const sides = all<HTMLImageElement>('.gs-sweep-card-stage .gs-wipe-img');
      expect(sides.map((frame) => frame.getAttribute('src'))).toEqual([
        `${environment.evidenceBaseUrl}/steps/albedobase-xl/person/001_4.webp`,
        `${environment.evidenceBaseUrl}/steps/albedobase-xl/person/003_30.webp`,
      ]);
      for (const frame of sides) {
        expect(frame.getAttribute('loading')).toBe('lazy');
      }
      // The divider is on the card from the start, so the pair reads as
      // something to move rather than as two pictures side by side.
      expect(find('.gs-sweep-card-stage .gs-wipe-divider')).not.toBeNull();
    });

    it('names the setting, says one line about the strip, and names the press', async () => {
      await setUp();

      expect(find('.gs-sweep-card-title')?.textContent?.trim()).toBe('Steps');
      // The first sentence of the strip's own caption. The rest is what the
      // plate folds under "Why it looks like this".
      expect(find('.gs-sweep-card-line')?.textContent?.trim()).toBe(
        'How far the sampler gets to run before the picture is handed back.',
      );
      expect(find('.gs-sweep-card-door')?.textContent?.trim()).toBe(
        'Drag to explore 3 pictures',
      );
      expect(text()).toContain('Sampling · Interactive explorer');
    });

    it('takes the pair the strip names for its preview', async () => {
      await setUp();

      // The stub names 0 and 2 on the steps strip; a strip that names none
      // falls back to the setting's default against the last stop.
      const sides = all<HTMLImageElement>('.gs-sweep-card-stage .gs-wipe-img');
      expect(sides[0].getAttribute('src')).toContain('001_4.webp');
      expect(sides[1].getAttribute('src')).toContain('003_30.webp');
    });

    it('opens the plate from the door that reaches over the card', async () => {
      await setUp();
      // The door is a button with a word and a focus ring, and its reach is
      // what makes a press anywhere on the card open the plate.
      expect(find('.gs-sweep-card-door')?.tagName).toBe('BUTTON');
      openPlate();

      expect(find('.gs-plate')).not.toBeNull();
      expect(find('.gs-sweep-stage')).not.toBeNull();
      expect(find('.gs-sweep-card')).toBeNull();
    });

    it('leaves the divider draggable without opening', async () => {
      await setUp();

      find<HTMLElement>('.gs-sweep-card-stage .gs-wipe-divider')!.click();
      fixture.detectChanges();

      expect(find('.gs-plate')).toBeNull();
      expect(find('.gs-sweep-card')).not.toBeNull();
    });

    it('drops the badge and the line in the compact register', async () => {
      await setUp({ register: 'filmcard' });

      expect(
        find('.gs-sweep-card')?.classList.contains('gs-sweep-card--film'),
      ).toBe(true);
      expect(text()).not.toContain('Interactive explorer');
      expect(find('.gs-sweep-card-title')?.textContent?.trim()).toBe('Steps');

      openPlate();
      expect(find('.gs-plate')).not.toBeNull();
    });

    it('keeps even the preview behind a press when data is being saved', async () => {
      await setUp({ reducedData: true });

      expect(find('.gs-sweep-card')).not.toBeNull();
      expect(find('.gs-sweep-card-stage')).toBeNull();
    });
  });

  describe('the open plate', () => {
    it('puts the frame on the stage with its value, and the rail and strip under it', async () => {
      await setUp({ startExpanded: true });

      expect(
        find<HTMLImageElement>('.gs-sweep-stage .gs-sweep-frame')?.getAttribute(
          'src',
        ),
      ).toBe(
        `${environment.evidenceBaseUrl}/steps/albedobase-xl/person/002_12.webp`,
      );
      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 12');
      expect(find('.gs-tickrail')).not.toBeNull();
      expect(all('.gs-sweep-film-cell')).toHaveLength(3);
      expect(find('.gs-sweep-expand')).not.toBeNull();
    });

    it('carries the stop caption with the strip caption standing under it', async () => {
      await setUp({ startExpanded: true });

      expect(find('.gs-sweep-caption-text')?.textContent?.trim()).toBe(
        'The face and the light have settled.',
      );
      // The strip's own caption is the one line that says what all the
      // pictures are, so it is in view rather than behind a fold.
      expect(find('.gs-plate-lead')?.textContent?.trim()).toBe(
        'How far the sampler gets to run before the picture is handed back.',
      );
      expect(find('.gs-plate-read .gs-sweep-caption')).not.toBeNull();
    });

    it('discloses a frame picked from a batch', async () => {
      await setUp({ startExpanded: true });

      expect(find('.gs-sweep-caption-batch')?.textContent).toContain(
        'Picked from a batch of 4.',
      );
    });

    it('is a focusable region that says what it is and steps from the keyboard', async () => {
      await setUp({ startExpanded: true });
      const stage = find<HTMLElement>('.gs-sweep-stage')!;

      expect(stage.getAttribute('tabindex')).toBe('0');
      expect(stage.getAttribute('aria-roledescription')).toBe(
        en['generate.sweeps.stage_role'],
      );
      expect(stage.getAttribute('aria-label')).toBe('Steps');

      stage.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
        }),
      );
      fixture.detectChanges();
      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 30');

      stage.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Home',
          bubbles: true,
          cancelable: true,
        }),
      );
      fixture.detectChanges();
      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 4');
    });

    it('scrubs on a horizontal drag across the stage', async () => {
      await setUp({ startExpanded: true });
      const stage = find<HTMLElement>('.gs-sweep-stage')!;
      vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        width: 300,
        right: 300,
        top: 0,
        bottom: 300,
        height: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      pointer(stage, 'pointerdown', { clientX: 150, clientY: 150 });
      pointer(stage, 'pointermove', { clientX: 260, clientY: 152 });

      // One hundred pixels across a three-stop strip drawn 300 wide is one
      // stop along, and the drag counts from where the press landed.
      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 30');

      // The gesture is a drag, so the press it produced does not also open the
      // full-size view.
      pointer(stage, 'pointerup', { clientX: 260, clientY: 152 });
      stage.click();
      fixture.detectChanges();
      expect(dialog().open).toBe(false);
    });

    it('moves the plate from the filmstrip and marks the stop on show', async () => {
      await setUp({ startExpanded: true });

      const cells = all<HTMLButtonElement>('.gs-sweep-film-go');
      expect(cells[1].getAttribute('aria-current')).toBe('true');
      expect(cells[2].getAttribute('aria-label')).toBe('Show Steps 30');

      cells[2].click();
      fixture.detectChanges();

      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 30');
      expect(cells[2].getAttribute('aria-current')).toBe('true');
      expect(all('.gs-sweep-film-img')[2].getAttribute('loading')).toBe('lazy');
    });

    it('offers carets only where the filmstrip hides frames, and they move the row without choosing', async () => {
      await setUp({ startExpanded: true });

      // A row that fits its lane has nothing to scroll to.
      expect(find('.gs-sweep-film-caret')).toBeNull();

      const strip = find<HTMLElement>('.gs-sweep-film')!;
      Object.defineProperty(strip, 'scrollWidth', { value: 600 });
      Object.defineProperty(strip, 'clientWidth', { value: 300 });
      Object.defineProperty(strip, 'scrollLeft', { value: 0, writable: true });
      const scrollBy = vi.fn();
      strip.scrollBy = scrollBy;
      strip.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();

      const start = find<HTMLButtonElement>('.gs-sweep-film-caret--start')!;
      const end = find<HTMLButtonElement>('.gs-sweep-film-caret--end')!;
      expect(start.disabled).toBe(true);
      expect(end.disabled).toBe(false);
      expect(end.getAttribute('aria-label')).toBe(
        'Scroll the row to later frames',
      );

      end.click();
      fixture.detectChanges();

      expect(scrollBy).toHaveBeenCalledWith(
        expect.objectContaining({ left: 240 }),
      );
      expect(
        all<HTMLButtonElement>('.gs-sweep-film-go')[1].getAttribute(
          'aria-current',
        ),
      ).toBe('true');

      strip.scrollLeft = 300;
      strip.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();

      expect(
        find<HTMLButtonElement>('.gs-sweep-film-caret--start')!.disabled,
      ).toBe(false);
      expect(
        find<HTMLButtonElement>('.gs-sweep-film-caret--end')!.disabled,
      ).toBe(true);
    });

    it('carries slider semantics on the rail and moves with the keyboard', async () => {
      await setUp({ startExpanded: true });

      expect(all('.gs-tickrail-tick')).toHaveLength(3);
      expect(rail().getAttribute('role')).toBe('slider');
      expect(rail().getAttribute('tabindex')).toBe('0');
      expect(rail().getAttribute('aria-label')).toBe(
        en['generate.sweeps.slider_label'],
      );
      expect(rail().getAttribute('aria-valuemin')).toBe('1');
      expect(rail().getAttribute('aria-valuemax')).toBe('3');
      expect(rail().getAttribute('aria-valuenow')).toBe('2');
      expect(rail().getAttribute('aria-valuetext')).toBe('12');

      railKey('ArrowRight');
      expect(rail().getAttribute('aria-valuenow')).toBe('3');
      expect(rail().getAttribute('aria-valuetext')).toBe('30');

      railKey('Home');
      expect(rail().getAttribute('aria-valuenow')).toBe('1');
      railKey('End');
      expect(rail().getAttribute('aria-valuenow')).toBe('3');
      // The ends hold rather than wrapping round.
      railKey('ArrowRight');
      expect(rail().getAttribute('aria-valuenow')).toBe('3');
    });

    it('jumps to the frame whose slit was pressed', async () => {
      await setUp({ startExpanded: true });

      clickTick(2);
      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 30');
      clickTick(0);
      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 4');
    });

    it('takes a press anywhere on the lane to the nearest stop', async () => {
      await setUp({ startExpanded: true });
      railWidth(300);

      railPointer('pointerdown', 20);
      expect(rail().getAttribute('aria-valuenow')).toBe('1');
      railPointer('pointerup', 20);

      railPointer('pointerdown', 290);
      expect(rail().getAttribute('aria-valuenow')).toBe('3');
    });

    it('keeps snapping while a drag runs, and stops when it is let go', async () => {
      await setUp({ startExpanded: true });
      railWidth(300);

      railPointer('pointerdown', 20);
      railPointer('pointermove', 160);
      expect(rail().getAttribute('aria-valuenow')).toBe('2');

      railPointer('pointerup', 160);
      railPointer('pointermove', 290);
      expect(rail().getAttribute('aria-valuenow')).toBe('2');
    });

    it('puts each end number at the position of its own slit', async () => {
      await setUp({ startExpanded: true });

      const ticks = all<HTMLElement>('.gs-tickrail-tick');
      const ends = all<HTMLElement>('.gs-tickrail-end');

      expect(ends).toHaveLength(2);
      expect(ends[0].style.left).toBe(ticks[0].style.left);
      expect(ends[1].style.left).toBe(ticks[ticks.length - 1].style.left);
      expect(ticks[0].style.left).not.toBe('0%');
    });

    it('collapses back to the card', async () => {
      await setUp({ startExpanded: true });

      find<HTMLButtonElement>('.gs-plate-head .gs-plate-x')!.click();
      fixture.detectChanges();

      expect(find('.gs-plate')).toBeNull();
      expect(find('.gs-sweep-card')).not.toBeNull();
    });
  });

  describe('the pictures a frame is held against', () => {
    it('offers the starting picture as a chip and wipes the frame against it', async () => {
      await setUp({ parameter: 'denoising_strength', startExpanded: true });

      const chips = all<HTMLButtonElement>('.gs-sweep-chip');
      expect(chips).toHaveLength(1);
      expect(find('.gs-sweep-chips--dock')).not.toBeNull();
      expect(find('.gs-sweep-chips--overlay')).toBeNull();
      expect(chips[0].textContent?.trim()).toBe(
        en['generate.sweeps.source_label'],
      );
      expect(chips[0].getAttribute('aria-pressed')).toBe('false');

      chips[0].click();
      fixture.detectChanges();

      expect(
        find<HTMLImageElement>('.gs-sweep-stage .gs-wipe-img')?.getAttribute(
          'src',
        ),
      ).toBe(
        `${environment.evidenceBaseUrl}/denoising-strength/deliberate/place/source.webp`,
      );
      expect(
        find<HTMLButtonElement>('.gs-sweep-chip')?.getAttribute('aria-pressed'),
      ).toBe('true');
    });

    it('offers the control map beside the starting picture where a detector drew one', async () => {
      await setUp({
        parameter: 'control_strength',
        controlType: 'canny',
        startExpanded: true,
      });
      reportWidth(900);

      const chips = all<HTMLButtonElement>('.gs-sweep-chip');
      // With room beside the picture the chips read in the column next to
      // it rather than over the subject.
      expect(find('.gs-plate-read .gs-sweep-chips--read')).not.toBeNull();
      expect(find('.gs-sweep-stage .gs-sweep-chips')).toBeNull();
      expect(find('.gs-sweep-chips--dock')).toBeNull();
      expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
        en['generate.sweeps.source_label'],
        en['generate.sweeps.control_map_label'],
      ]);

      chips[1].click();
      fixture.detectChanges();

      expect(
        find<HTMLImageElement>('.gs-sweep-stage .gs-wipe-img')?.getAttribute(
          'src',
        ),
      ).toBe(
        `${environment.evidenceBaseUrl}/control-strength/canny/deliberate/courier-ink/source_map.webp`,
      );
    });

    it('offers nothing to compare where the strip was made from nothing', async () => {
      await setUp({ startExpanded: true });

      expect(all('.gs-sweep-chip')).toHaveLength(0);
      expect(text()).not.toContain(en['generate.sweeps.control_map_label']);
    });
  });

  describe('the details', () => {
    /** Answer the sidecar fetch for one library path. */
    const flushSidecar = async (
      path: string,
      record: Record<string, unknown> | null,
    ): Promise<void> => {
      const pending = http.expectOne(`${environment.evidenceBaseUrl}/${path}`);
      if (record === null) {
        pending.error(new ProgressEvent('offline'), {
          status: 0,
          statusText: '',
        });
      } else {
        pending.flush(record);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    };

    const openDetails = (): void => {
      find<HTMLButtonElement>('.gs-plate-details-go')!.click();
      fixture.detectChanges();
    };

    it('keeps provenance one step down from the picture', async () => {
      await setUp({ startExpanded: true });

      expect(find('.gs-plate-details')).toBeNull();
      expect(text()).not.toContain('AlbedoBase XL (SDXL) · SDXL');

      openDetails();

      expect(find('.gs-plate-details')).not.toBeNull();
      expect(find('.gs-plate-model')?.textContent?.trim()).toBe(
        'AlbedoBase XL (SDXL) · SDXL',
      );
      expect(text()).toContain(en['generate.sweeps.held_constant']);
      expect(document.activeElement).toBe(find('.gs-plate-details'));
    });

    it('carries the request, the record link and the setting links', async () => {
      await setUp({ startExpanded: true });
      openDetails();
      await flushSidecar('steps/albedobase-xl/person/002_12.json', {
        model_requested: 'AlbedoBase XL (SDXL)',
        params: { steps: 12, cfg_scale: 7 },
      });

      expect(find('.gs-plate-request .gs-recipe')).not.toBeNull();
      expect(find('.gs-plate-raw')?.textContent).toContain('"cfg_scale": 7');
      expect(
        find<HTMLAnchorElement>('.gs-plate-sidecar')?.getAttribute('href'),
      ).toBe(
        `${environment.evidenceBaseUrl}/steps/albedobase-xl/person/002_12.json`,
      );
      expect(all('.gs-plate-links .gs-plate-link').length).toBeGreaterThan(0);
    });

    it('fetches the record again when the reader scrubs on', async () => {
      await setUp({ startExpanded: true });
      openDetails();
      await flushSidecar('steps/albedobase-xl/person/002_12.json', {
        params: { steps: 12 },
      });

      clickTick(0);
      await flushSidecar('steps/albedobase-xl/person/001_4.json', {
        params: { steps: 4 },
      });

      expect(find('.gs-plate-raw')?.textContent).toContain('"steps": 4');
    });

    it('reads a record once, however often it is asked for', async () => {
      await setUp({ startExpanded: true });
      openDetails();
      await flushSidecar('steps/albedobase-xl/person/002_12.json', {
        params: { steps: 12 },
      });

      openDetails();
      openDetails();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      http.expectNone(
        `${environment.evidenceBaseUrl}/steps/albedobase-xl/person/002_12.json`,
      );
      expect(find('.gs-plate-raw')?.textContent).toContain('"steps": 12');
    });

    it('says so when the record cannot be loaded', async () => {
      await setUp({ startExpanded: true });
      openDetails();
      await flushSidecar('steps/albedobase-xl/person/002_12.json', null);

      expect(find('.gs-plate-request')?.textContent).toContain(
        'could not be loaded',
      );
      expect(find('.gs-plate-raw')).toBeNull();
    });

    it('closes on Escape and hands focus back to the handle', async () => {
      await setUp({ startExpanded: true });
      openDetails();

      find<HTMLElement>('.gs-plate-details')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      fixture.detectChanges();

      expect(find('.gs-plate-details')).toBeNull();
    });
  });

  describe('how the stops are laid out', () => {
    it('leads with the grid where the host is wide enough to compare in it', async () => {
      await setUp({ startExpanded: true });
      reportWidth(1000);

      expect(find('.gs-sweep-film')).toBeNull();
      expect(
        all('.gs-sweep-options--frames .gs-sweep-plate-cell'),
      ).toHaveLength(3);
      // The stage stays: the grid is another way of choosing a stop rather
      // than another way of showing one.
      expect(find('.gs-sweep-stage')).not.toBeNull();
      expect(all('.gs-sweep-option-cap')[1].textContent).toContain('12');
      expect(find('.gs-plate-sheet-go')?.textContent?.trim()).toBe(
        en['generate.sweeps.layout_strip'],
      );
    });

    it('leads with the filmstrip on a narrow host and offers the grid', async () => {
      await setUp({ startExpanded: true });
      reportWidth(500);

      expect(find('.gs-sweep-film')).not.toBeNull();
      expect(find('.gs-sweep-options')).toBeNull();
      expect(find('.gs-plate-sheet-go')?.textContent?.trim()).toBe(
        en['generate.sweeps.layout_grid'],
      );

      find<HTMLButtonElement>('.gs-plate-sheet-go')!.click();
      fixture.detectChanges();

      expect(find('.gs-sweep-film')).toBeNull();
      expect(
        all('.gs-sweep-options--frames .gs-sweep-plate-cell'),
      ).toHaveLength(3);
    });

    it('collapses the grid to the strip and remembers the answer for that shape', async () => {
      localStorage.clear();
      await setUp({ startExpanded: true });
      reportWidth(1000);

      find<HTMLButtonElement>('.gs-plate-sheet-go')!.click();
      fixture.detectChanges();
      expect(find('.gs-sweep-film')).not.toBeNull();
      expect(localStorage.getItem('gs-sweep-layout-wide')).toBe('strip');

      await setUp({ startExpanded: true });
      reportWidth(1000);
      expect(find('.gs-sweep-film')).not.toBeNull();
      localStorage.clear();
    });

    it('picks a stop from the grid and takes one full size', async () => {
      localStorage.clear();
      await setUp({ startExpanded: true });
      reportWidth(1000);

      const cells = all<HTMLButtonElement>(
        '.gs-sweep-options--frames .gs-sweep-plate-cell',
      );
      cells[2].click();
      fixture.detectChanges();

      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 30');
      expect(cells[2].getAttribute('aria-current')).toBe('true');
      expect(dialog().open).toBe(false);

      all<HTMLButtonElement>('.gs-sweep-expand--cell')[0].click();
      fixture.detectChanges();

      expect(dialog().open).toBe(true);
      expect(find('.gs-sweep-dialog-pos')?.textContent?.trim()).toBe('1 / 3');
    });

    it('holds the filmstrip still while a drag is in flight', async () => {
      localStorage.clear();
      await setUp({ startExpanded: true });
      reportWidth(500);
      const strip = find<HTMLElement>('.gs-sweep-film')!;
      expect(strip.classList.contains('is-dragging')).toBe(false);

      railWidth(300);
      railPointer('pointerdown', 20);
      expect(
        find<HTMLElement>('.gs-sweep-film')!.classList.contains('is-dragging'),
      ).toBe(true);

      railPointer('pointerup', 20);
      expect(
        find<HTMLElement>('.gs-sweep-film')!.classList.contains('is-dragging'),
      ).toBe(false);
    });
  });

  describe('the full-size view', () => {
    const openViewer = (): void => {
      find<HTMLElement>('.gs-sweep-stage')!.click();
      fixture.detectChanges();
    };

    it('opens from a press on the stage and shows the same frame', async () => {
      await setUp({ startExpanded: true });
      openViewer();

      expect(dialog().open).toBe(true);
      expect(
        find<HTMLImageElement>(
          '.gs-sweep-stage--big .gs-sweep-frame',
        )?.getAttribute('src'),
      ).toBe(
        `${environment.evidenceBaseUrl}/steps/albedobase-xl/person/002_12.webp`,
      );
      expect(dialog().getAttribute('aria-label')).toBe(
        'The example rendered at 12, full size',
      );
    });

    it('opens from the expand glyph as well as the picture', async () => {
      await setUp({ startExpanded: true });

      find<HTMLButtonElement>('.gs-sweep-expand')!.click();
      fixture.detectChanges();

      expect(dialog().open).toBe(true);
    });

    it('steps between the stops, and holds at the ends', async () => {
      await setUp({ startExpanded: true });
      openViewer();

      const steps = all<HTMLButtonElement>('.gs-sweep-dialog-step');
      expect(find('.gs-sweep-dialog-pos')?.textContent?.trim()).toBe('2 / 3');

      steps[1].click();
      fixture.detectChanges();
      expect(find('.gs-sweep-dialog-pos')?.textContent?.trim()).toBe('3 / 3');
      expect(all<HTMLButtonElement>('.gs-sweep-dialog-step')[1].disabled).toBe(
        true,
      );

      all<HTMLButtonElement>('.gs-sweep-dialog-step')[0].click();
      fixture.detectChanges();
      expect(find('.gs-sweep-dialog-pos')?.textContent?.trim()).toBe('2 / 3');
    });

    it('steps on a swipe across and closes on a swipe down', async () => {
      await setUp({ startExpanded: true });
      openViewer();
      const stage = find<HTMLElement>('.gs-sweep-stage--big')!;

      pointer(stage, 'pointerdown', { clientX: 200, clientY: 200 });
      pointer(stage, 'pointerup', { clientX: 80, clientY: 206 });
      expect(find('.gs-sweep-dialog-pos')?.textContent?.trim()).toBe('3 / 3');

      pointer(stage, 'pointerdown', { clientX: 200, clientY: 100 });
      pointer(stage, 'pointerup', { clientX: 204, clientY: 300 });
      expect(dialog().open).toBe(false);
    });

    it('pinches the frame between two fingers', async () => {
      await setUp({ startExpanded: true });
      openViewer();
      const stage = find<HTMLElement>('.gs-sweep-stage--big')!;

      pointer(stage, 'pointerdown', { clientX: 100, clientY: 0, pointerId: 1 });
      pointer(stage, 'pointerdown', { clientX: 200, clientY: 0, pointerId: 2 });
      pointer(stage, 'pointermove', { clientX: 300, clientY: 0, pointerId: 2 });

      expect(stage.style.getPropertyValue('--gs-sweep-zoom')).toBe('2');
    });

    it('closes from its own control and hands focus back', async () => {
      await setUp({ startExpanded: true });
      const expand = find<HTMLButtonElement>('.gs-sweep-expand')!;
      expand.focus();
      expand.click();
      fixture.detectChanges();

      find<HTMLButtonElement>('.gs-sweep-dialog-x')!.click();
      fixture.detectChanges();

      expect(dialog().open).toBe(false);
      expect(document.activeElement).toBe(find('.gs-sweep-expand'));
    });

    it('closes when the browser closes the dialog, however it was asked', async () => {
      await setUp({ startExpanded: true });
      const expand = find<HTMLButtonElement>('.gs-sweep-expand')!;
      expand.focus();
      expand.click();
      fixture.detectChanges();

      // What Escape does, from the browser's side of the dialog: the element
      // closes itself and says so, and the component has to follow rather than
      // wait to be told by one of its own controls.
      dialog().dispatchEvent(new Event('close'));
      fixture.detectChanges();

      expect(find('.gs-sweep-dialog-body')).toBeNull();
      expect(document.activeElement).toBe(find('.gs-sweep-expand'));
    });

    it('holds one position for the plate and the view together', async () => {
      await setUp({ startExpanded: true });
      openViewer();

      all<HTMLButtonElement>('.gs-sweep-dialog-step')[1].click();
      fixture.detectChanges();
      find<HTMLButtonElement>('.gs-sweep-dialog-x')!.click();
      fixture.detectChanges();

      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 30');
    });
  });

  describe('two-frame strips', () => {
    it('wipes the pair over each other rather than scrubbing between them', async () => {
      await setUp({ parameter: 'tiling', startExpanded: true });
      reportWidth(600);

      expect(all('.gs-sweep-stage .gs-wipe-tiled')).toHaveLength(2);
      expect(find('.gs-wipe-divider')).not.toBeNull();
      // Nothing lies between a before and an after.
      expect(find('.gs-tickrail')).toBeNull();
      expect(find('.gs-sweep-film')).toBeNull();
      expect(find('.gs-sweep-dialog-steps')).toBeNull();
    });

    it('names the two sides with the chips the rest of the studio uses', async () => {
      await setUp({ parameter: 'tiling', startExpanded: true });
      reportWidth(600);

      const tags = all<HTMLElement>('.gs-sweep-stage .gs-wipe-tag');
      expect(tags[0].textContent).toContain('Off');
      expect(tags[1].textContent).toContain('On');
    });

    it('lays a tiled pair out beside the tile that was rendered', async () => {
      await setUp({ parameter: 'tiling', startExpanded: true });

      expect(all('.gs-sweep-solos .gs-sweep-solo-img')).toHaveLength(2);
      expect(text()).toContain(en['generate.sweeps.tile_solo_label']);
    });

    it('keeps the presentation toggle for the pairs that start apart', async () => {
      await setUp({ parameter: 'sampler_solver_type', startExpanded: true });

      // Only the pairs the studio deliberately sets apart carry the choice;
      // for the rest the wipe is the better reading and asking would be noise.
      expect(find('.gs-sweep-pair-mode')).toBeNull();
      expect(find('.gs-wipe-divider')).not.toBeNull();
    });

    it('reads both captions under the pair', async () => {
      await setUp({ parameter: 'tiling', startExpanded: true });

      expect(all('.gs-sweep-pair-cap')).toHaveLength(2);
    });

    it('previews the pair on the card as the pair itself', async () => {
      await setUp({ parameter: 'tiling' });

      expect(find('.gs-sweep-card-door')?.textContent?.trim()).toBe(
        en['generate.sweeps.card_door_pair'],
      );
    });
  });

  describe('which strip is shown', () => {
    it('shows the strip for the model the studio is set to', async () => {
      await setUp({
        studioBaseline: 'stable_diffusion_1',
        startExpanded: true,
      });

      expect(
        find<HTMLImageElement>('.gs-sweep-stage .gs-sweep-frame')?.getAttribute(
          'src',
        ),
      ).toContain('/steps/deliberate/landscape/');
    });

    it('lets a surface that names a model override the studio', async () => {
      await setUp({
        studioBaseline: 'stable_diffusion_1',
        modelSlug: 'albedobase-xl',
        startExpanded: true,
      });

      expect(
        find<HTMLImageElement>('.gs-sweep-stage .gs-sweep-frame')?.getAttribute(
          'src',
        ),
      ).toContain('/steps/albedobase-xl/person/');
    });

    it('picks the strip rendered against the guidance mode the surface names', async () => {
      await setUp({
        parameter: 'control_strength',
        controlType: 'canny',
        startExpanded: true,
      });

      expect(text()).toContain(en['generate.sweeps.control_map_label']);
    });

    it('renders nothing for a parameter the library has no strip for', async () => {
      await setUp({ parameter: 'karras' });

      expect(find('.gs-sweep')).toBeNull();
    });
  });

  describe('the second reading of a parameter', () => {
    it('swaps to the converging strip and keeps the position', async () => {
      await setUp({ startExpanded: true });

      railKey('End');
      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 30');

      const variants = all<HTMLButtonElement>('.gs-sweep-variant');
      expect(variants).toHaveLength(2);
      variants[1].click();
      fixture.detectChanges();

      expect(variants[1].getAttribute('aria-pressed')).toBe('true');
      expect(
        find<HTMLImageElement>('.gs-sweep-stage .gs-sweep-frame')?.getAttribute(
          'src',
        ),
      ).toContain('/steps-converging/');
      expect(rail().getAttribute('aria-valuenow')).toBe('3');
    });

    it('folds the note that says which kind of sampler is which', async () => {
      await setUp({ startExpanded: true });

      const why = find<HTMLButtonElement>('.gs-plate-controls .gs-sweep-why')!;
      expect(why.getAttribute('aria-expanded')).toBe('false');

      why.click();
      fixture.detectChanges();

      expect(text()).toContain('Other samplers that can add noise include');
      expect(find('.gs-sweep-why-link')).not.toBeNull();
    });
  });

  describe('a surface that has no room for the plate', () => {
    it('takes the offer straight to the full-size view', async () => {
      await setUp({ viewerFirst: true });

      find<HTMLButtonElement>('.gs-sweep-card-door')!.click();
      fixture.detectChanges();

      expect(dialog().open).toBe(true);
      // Nothing opens behind it: the plate is what does not fit here.
      expect(find('.gs-plate')).toBeNull();
      expect(find('.gs-sweep-dialog-param')?.textContent?.trim()).toBe('Steps');
      expect(find('.gs-sweep-dialog-steps')).not.toBeNull();
    });

    it('comes back to the offer when the view is closed', async () => {
      await setUp({ viewerFirst: true });
      find<HTMLButtonElement>('.gs-sweep-card-door')!.click();
      fixture.detectChanges();

      find<HTMLButtonElement>('.gs-sweep-dialog-x')!.click();
      fixture.detectChanges();

      expect(dialog().open).toBe(false);
      expect(find('.gs-sweep-card')).not.toBeNull();
    });

    it('ignores startExpanded, which has nothing to open here', async () => {
      await setUp({ viewerFirst: true, startExpanded: true });

      expect(find('.gs-plate')).toBeNull();
      expect(find('.gs-sweep-card')).not.toBeNull();
    });
  });

  describe('a host too narrow for the instrument', () => {
    it('stands as a launcher: the pair still, the words, one press', async () => {
      await setUp();
      reportWidth(366);

      expect(find('.gs-sweep-card--launch')).not.toBeNull();
      // Nothing to drag and nothing to unfold: the divider is gone with the
      // instrument it belonged to.
      expect(find('.gs-sweep-card-stage .gs-wipe-divider')).toBeNull();
      expect(all('.gs-sweep-card-stage .gs-wipe-img')).toHaveLength(2);
      expect(find('.gs-sweep-card-title')?.textContent?.trim()).toBe('Steps');
      expect(find('.gs-sweep-card-line')?.textContent?.trim()).toBe(
        'How far the sampler gets to run before the picture is handed back.',
      );
      expect(find('.gs-sweep-card-door')?.textContent?.trim()).toBe(
        en['generate.sweeps.card_launch'],
      );
    });

    it('keeps the instrument where the room is there for it', async () => {
      await setUp();
      reportWidth(590);

      expect(find('.gs-sweep-card--launch')).toBeNull();
      expect(find('.gs-sweep-card-stage .gs-wipe-divider')).not.toBeNull();
    });

    it('takes the press straight to the full-size view, with its controls', async () => {
      await setUp();
      reportWidth(366);

      find<HTMLButtonElement>('.gs-sweep-card-door')!.click();
      fixture.detectChanges();

      expect(dialog().open).toBe(true);
      expect(find('.gs-plate')).toBeNull();
      expect(find('.gs-sweep-dialog-param')?.textContent?.trim()).toBe('Steps');
      expect(find('dialog[open] .gs-tickrail')).not.toBeNull();
      expect(find('.gs-sweep-dialog-steps')).not.toBeNull();
      expect(all('dialog[open] .gs-sweep-scale').length).toBeGreaterThan(0);
    });

    it('does not open, however the surface asks', async () => {
      await setUp({ startExpanded: true });
      reportWidth(366);

      expect(find('.gs-plate')).toBeNull();
      expect(find('.gs-sweep-card--launch')).not.toBeNull();
    });

    it('neither reads nor writes what a wider surface remembered', async () => {
      await setUp();
      const read = vi.spyOn(Storage.prototype, 'getItem');
      const written = vi.spyOn(Storage.prototype, 'setItem');

      reportWidth(366);

      expect(find('.gs-sweep-card--launch')).not.toBeNull();
      expect(read).not.toHaveBeenCalled();
      expect(written).not.toHaveBeenCalled();
    });
  });

  describe('how big the picture is', () => {
    it('says the size the whole strip was rendered at, on the stage', async () => {
      await setUp({ startExpanded: true });

      expect(badgeText()).toBe('1024 × 1024');
    });

    it('prefers a stop of its own size over the strip it stands in', async () => {
      await setUp({ parameter: 'scheduler', startExpanded: true });

      // The strip was rendered at 1024; the second stop says it is 2048, and a
      // stop that says so is the answer for that stop.
      expect(badgeText()).toBe('1024 × 1024');
      all<HTMLButtonElement>('.gs-sweep-film-go')[1].click();
      fixture.detectChanges();
      expect(badgeText()).toBe('2048 × 2048');
    });

    it('marks only the stops of a different size in the contact sheet', async () => {
      await setUp({ parameter: 'scheduler', startExpanded: true });
      reportWidth(900);

      const cells = all('.gs-sweep-options--frames .gs-pixels--cell');
      expect(cells).toHaveLength(1);
      expect(cells[0].textContent?.trim()).toBe('2048 × 2048');
    });

    it('says what the full-size view is drawing it at, and keeps saying it', async () => {
      await setUp({ startExpanded: true });
      find<HTMLButtonElement>('.gs-sweep-expand')!.click();
      fixture.detectChanges();
      reportBox(800, 600);

      // 600 of room for 1024 of picture is the shorter side, so that is what
      // the picture fits at.
      expect(badgeText()).toBe('1024 × 1024 · shown at 59%');
      zoomPill('100%').click();
      fixture.detectChanges();
      expect(badgeText()).toBe('1024 × 1024 · shown at 100%');
    });

    it('announces the size politely in the full-size view and not on the plate', async () => {
      await setUp({ startExpanded: true });

      expect(badge()?.getAttribute('aria-live')).toBeNull();
      find<HTMLButtonElement>('.gs-sweep-expand')!.click();
      fixture.detectChanges();

      expect(badge()?.getAttribute('aria-live')).toBe('polite');
    });
  });

  describe('one zoom and pan model, on the plate as in the view', () => {
    /** The plate, opened and measured, with the picture whole. */
    const openPlate = async (): Promise<void> => {
      await setUp({ startExpanded: true });
      reportBox(800, 600);
    };

    const plateStage = (): HTMLElement =>
      find<HTMLElement>('.gs-plate-col .gs-sweep-stage')!;

    /** The plate's own badge, which is behind the view's while that is open. */
    const plateBadge = (): string =>
      find(
        '.gs-plate-col .gs-pixels--stage .gs-pixels-text',
      )?.textContent?.trim() ?? '';

    /** Draw the picture closer in, the way a reader's pills do. */
    const zoomPlateTo = (label: string): void => {
      platePill(label)!.click();
      fixture.detectChanges();
    };

    it('offers the zoom on the plate where the picture has pixels to spare', async () => {
      await openPlate();

      // 1024 of picture in 800 of room: there is something behind the pills.
      expect(platePill('Fit')).toBeDefined();
      expect(platePill('100%')).toBeDefined();
      expect(platePill('200%')).toBeDefined();
    });

    it('says nothing about the zoom where the picture already fits', async () => {
      await openPlate();
      reportBox(2400, 2400);

      expect(platePill('Fit')).toBeUndefined();
    });

    it('says how close in the plate is drawing the picture', async () => {
      await openPlate();

      expect(plateBadge()).toBe('1024 × 1024');
      zoomPlateTo('100%');
      expect(plateBadge()).toBe('1024 × 1024 · shown at 100%');
    });

    it('scrubs on a drag while the picture is whole', async () => {
      await openPlate();
      const stage = plateStage();
      boxOf(stage, 0, 0, 600, 400);

      pointer(stage, 'pointerdown', { clientX: 300, clientY: 200 });
      pointer(stage, 'pointermove', { clientX: 100, clientY: 200 });
      pointer(stage, 'pointerup', { clientX: 100, clientY: 200 });

      expect(railAt()).toBe('1');
      expect(stage.style.getPropertyValue('--gs-sweep-pan-x')).toBe('0px');
    });

    it('pans on the same drag once the picture is drawn closer in', async () => {
      await openPlate();
      zoomPlateTo('200%');
      const stage = plateStage();
      boxOf(stage, 0, 0, 600, 400);
      const wasAt = railAt();

      pointer(stage, 'pointerdown', { clientX: 300, clientY: 200 });
      pointer(stage, 'pointermove', { clientX: 220, clientY: 160 });
      pointer(stage, 'pointerup', { clientX: 220, clientY: 160 });

      // The strip stayed where it was; the picture moved under the finger.
      expect(railAt()).toBe(wasAt);
      expect(stage.style.getPropertyValue('--gs-sweep-pan-x')).toBe('-80px');
      expect(stage.style.getPropertyValue('--gs-sweep-pan-y')).toBe('-40px');
    });

    it('leaves the strip to the rail once the picture is being panned', async () => {
      await openPlate();
      zoomPlateTo('200%');

      railKey('ArrowRight');

      expect(railAt()).toBe('3');
    });

    it('pinches about the point between the two fingers', async () => {
      await openPlate();
      const stage = plateStage();
      boxOf(stage, 0, 0, 600, 400);

      pointer(stage, 'pointerdown', {
        clientX: 280,
        clientY: 200,
        pointerId: 1,
      });
      pointer(stage, 'pointerdown', {
        clientX: 320,
        clientY: 200,
        pointerId: 2,
      });
      // The fingers move apart to four times the spread they started at.
      pointer(stage, 'pointermove', {
        clientX: 220,
        clientY: 200,
        pointerId: 1,
      });
      pointer(stage, 'pointermove', {
        clientX: 380,
        clientY: 200,
        pointerId: 2,
      });

      expect(plateBadge()).not.toBe('1024 × 1024');
      expect(plateBadge()).toContain('shown at');

      pointer(stage, 'pointerup', { clientX: 220, clientY: 200, pointerId: 1 });
      pointer(stage, 'pointerup', { clientX: 380, clientY: 200, pointerId: 2 });
      // A pinch is never read as a scrub when the fingers come off: the strip
      // is still on the stop it opened at.
      expect(railAt()).toBe('2');
    });

    it('toggles between whole and true pixels on two presses', async () => {
      await openPlate();
      zoomPlateTo('100%');
      const stage = plateStage();
      boxOf(stage, 0, 0, 600, 400);

      stage.dispatchEvent(
        new MouseEvent('dblclick', {
          clientX: 300,
          clientY: 200,
          bubbles: true,
          cancelable: true,
        }),
      );
      fixture.detectChanges();

      expect(platePill('Fit')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('leaves the plain wheel to the page until the picture is zoomed', async () => {
      await openPlate();
      const stage = plateStage();

      const plain = new WheelEvent('wheel', {
        deltaY: -240,
        bubbles: true,
        cancelable: true,
      });
      stage.dispatchEvent(plain);
      fixture.detectChanges();
      expect(plain.defaultPrevented).toBe(false);
      expect(plateBadge()).toBe('1024 × 1024');

      // The platform's own zoom modifier makes it the picture's.
      const held = new WheelEvent('wheel', {
        deltaY: -240,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      stage.dispatchEvent(held);
      fixture.detectChanges();
      expect(held.defaultPrevented).toBe(true);
      // 600 of room for 1024 of picture is what the picture fits at, and one
      // notch of the wheel is a step up from there rather than a named size.
      expect(plateBadge()).toBe('1024 × 1024 · shown at 124%');
    });

    it('keeps the divider to its handle while the picture is panned', async () => {
      await setUp({ parameter: 'sampler_solver_type', startExpanded: true });
      reportBox(800, 600);
      const stage = plateStage();
      boxOf(stage, 0, 0, 600, 400);
      const divider = find<HTMLElement>('.gs-plate-col .gs-wipe-divider')!;

      // A drag that starts on the divider is the divider's, and never the
      // picture's: the picture stays where it is.
      pointer(divider, 'pointerdown', { clientX: 300, clientY: 200 });
      pointer(divider, 'pointermove', { clientX: 200, clientY: 200 });
      pointer(divider, 'pointerup', { clientX: 200, clientY: 200 });

      expect(stage.style.getPropertyValue('--gs-sweep-pan-x')).toBe('0px');
    });

    it('steps back to the whole picture on Escape before it closes', async () => {
      await openPlate();
      find<HTMLButtonElement>('.gs-sweep-expand')!.click();
      fixture.detectChanges();
      reportBox(800, 600);
      zoomPill('200%').click();
      fixture.detectChanges();

      find<HTMLElement>('.gs-sweep-dialog-body')!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
      fixture.detectChanges();

      expect(dialog().open).toBe(true);
      expect(zoomPill('Fit').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('how close in the full-size view draws', () => {
    /** Open the picture full size with a measured room around it. */
    const openBig = async (options?: {
      parameter?: string;
      finePointer?: boolean;
    }): Promise<void> => {
      await setUp({
        startExpanded: true,
        parameter: options?.parameter,
        finePointer: options?.finePointer,
      });
      find<HTMLButtonElement>('.gs-sweep-expand')!.click();
      fixture.detectChanges();
      reportBox(800, 600);
    };

    it('offers the picture whole, its own pixels, and twice them', async () => {
      await openBig();

      expect(
        Array.from(
          dialog().querySelectorAll<HTMLElement>('.gs-sweep-scale'),
        ).map((pill) => pill.textContent?.trim()),
      ).toEqual(['Fit', '100%', '200%']);
      expect(zoomPill('Fit').getAttribute('aria-pressed')).toBe('true');
    });

    it('moves between the three and lights the one it is at', async () => {
      await openBig();

      zoomPill('200%').click();
      fixture.detectChanges();
      expect(zoomPill('200%').getAttribute('aria-pressed')).toBe('true');
      expect(badgeText()).toBe('1024 × 1024 · shown at 200%');

      zoomPill('Fit').click();
      fixture.detectChanges();
      expect(zoomPill('Fit').getAttribute('aria-pressed')).toBe('true');
      expect(badgeText()).toBe('1024 × 1024 · shown at 59%');
    });

    it('answers the keys for closer, further and back to the whole picture', async () => {
      await openBig();
      const body = find<HTMLElement>('.gs-sweep-dialog-body')!;
      // The keys are taken by the explorer itself, from wherever inside the
      // full-size view they are pressed.
      const key = (name: string): void => {
        body.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: name,
            bubbles: true,
            cancelable: true,
          }),
        );
        fixture.detectChanges();
      };

      zoomPill('100%').click();
      fixture.detectChanges();
      key('+');
      expect(badgeText()).toBe('1024 × 1024 · shown at 125%');
      key('-');
      expect(badgeText()).toBe('1024 × 1024 · shown at 100%');
      key('0');
      expect(zoomPill('Fit').getAttribute('aria-pressed')).toBe('true');
    });

    it('opens a stop at its own pixels, centred on the detail crop', async () => {
      await setUp({ parameter: 'upscaler_form', startExpanded: true });

      fixture.componentInstance.explorer().openStopAtCrop(2);
      fixture.detectChanges();
      reportBox(800, 600);

      expect(dialog().hasAttribute('open')).toBe(true);
      // The third stop is a four-times pass, and the pair is read at the file's
      // own pixels rather than at whatever the room fits.
      expect(badgeText()).toBe('2048 × 2048 · shown at 100%');

      // The crop sits at 1065,184 and is 532 across, so its middle is carried
      // from where it lies to the middle of the room.
      const stage = find<HTMLElement>('.gs-sweep-stage--big')!;
      expect(stage.style.getPropertyValue('--gs-sweep-pan-x')).toBe('-307px');
      expect(stage.style.getPropertyValue('--gs-sweep-pan-y')).toBe('574px');
    });

    it('opens a stop whole where the library cut no detail from it', async () => {
      await setUp({ startExpanded: true });

      fixture.componentInstance.explorer().openStopAtCrop(1);
      fixture.detectChanges();
      reportBox(800, 600);

      expect(dialog().hasAttribute('open')).toBe(true);
      expect(zoomPill('Fit').getAttribute('aria-pressed')).toBe('true');
    });

    it('asks for the file itself only once the reader wants its pixels', async () => {
      await openBig({ parameter: 'scheduler' });
      all<HTMLButtonElement>('.gs-sweep-film-go')[1].click();
      fixture.detectChanges();

      const frame = (): string | null =>
        find<HTMLImageElement>(
          '.gs-sweep-stage--big .gs-sweep-frame',
        )?.getAttribute('src') ?? null;
      expect(frame()).toBe(
        `${environment.evidenceBaseUrl}/scheduler/albedobase-xl/person/002_karras.fit.webp`,
      );

      zoomPill('100%').click();
      fixture.detectChanges();
      expect(frame()).toBe(
        `${environment.evidenceBaseUrl}/scheduler/albedobase-xl/person/002_karras.webp`,
      );
    });

    it('holds a view the reader set as the picture under it changes', async () => {
      await openBig();
      zoomPill('200%').click();
      fixture.detectChanges();

      find<HTMLButtonElement>('.gs-sweep-dialog-step')!.click();
      fixture.detectChanges();

      expect(zoomPill('200%').getAttribute('aria-pressed')).toBe('true');
    });

    it('refits a view the reader never touched', async () => {
      await openBig();

      find<HTMLButtonElement>('.gs-sweep-dialog-step')!.click();
      fixture.detectChanges();

      expect(zoomPill('Fit').getAttribute('aria-pressed')).toBe('true');
    });

    it('carries the same view into both sides of a comparison', async () => {
      await setUp({ parameter: 'denoising_strength', startExpanded: true });
      compareChip().click();
      fixture.detectChanges();
      find<HTMLButtonElement>('.gs-sweep-expand')!.click();
      fixture.detectChanges();
      reportBox(800, 600);

      const wipe = (): HTMLElement =>
        find<HTMLElement>('.gs-sweep-stage--big .gs-wipe')!;
      expect(wipe().classList.contains('is-zoomed')).toBe(false);

      zoomPill('200%').click();
      fixture.detectChanges();

      // One number drives both layers and the divider between them, so the two
      // sides are the same pixels however far in the reader has gone.
      expect(wipe().classList.contains('is-zoomed')).toBe(true);
      expect(wipe().style.getPropertyValue('--gs-wipe-zoom')).not.toBe('1');
      expect(wipe().style.getPropertyValue('--gs-wipe-pan-x')).toBe('0px');
    });
  });

  describe('the divider, the tags and the glyph on one picture', () => {
    /** A strip whose stage carries a wipe: a frame over its starting picture. */
    const openCompared = async (): Promise<void> => {
      await setUp({ parameter: 'denoising_strength', startExpanded: true });
      compareChip().click();
      fixture.detectChanges();
    };

    it('moves the divider without moving the strip under it', async () => {
      await openCompared();
      const divider = find<HTMLElement>('.gs-wipe-divider')!;
      const before = railAt();

      pointer(divider, 'pointerdown', { clientX: 100, clientY: 40 });
      pointer(divider, 'pointermove', { clientX: 260, clientY: 44 });
      pointer(divider, 'pointerup', { clientX: 260, clientY: 44 });

      expect(railAt()).toBe(before);
    });

    it('does not open the picture when pointer capture retargets a divider drag click', async () => {
      await openCompared();
      const divider = find<HTMLElement>('.gs-wipe-divider')!;
      const wipe = find<HTMLElement>('.gs-wipe')!;

      pointer(divider, 'pointerdown', { clientX: 100, clientY: 40 });
      pointer(wipe, 'pointermove', { clientX: 260, clientY: 44 });
      pointer(wipe, 'pointerup', { clientX: 260, clientY: 44 });
      wipe.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();

      expect(dialog().open).toBe(false);
    });

    it('opens the picture full size when the glyph is pressed over a wipe', async () => {
      await openCompared();

      find<HTMLButtonElement>('.gs-sweep-expand')!.click();
      fixture.detectChanges();

      expect(dialog().open).toBe(true);
    });

    it('keeps the divider to its handle and leaves the rest to the picture', async () => {
      await openCompared();

      // The divider is the one control on a pair; a press on it is not a press
      // on the picture and opens nothing.
      find<HTMLElement>('.gs-plate-col .gs-wipe-divider')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
      expect(dialog().open).toBe(false);

      // Anywhere else on the pair is the picture, and the picture opens.
      find<HTMLElement>('.gs-plate-col .gs-wipe')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
      expect(dialog().open).toBe(true);
    });

    it('does not take a press on a side tag for a press on the picture', async () => {
      await openCompared();

      find<HTMLElement>('.gs-wipe-tag')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();

      expect(dialog().open).toBe(false);
    });

    it('holds both sides of a comparison in one box in the full-size view', async () => {
      await openCompared();
      expect(
        find('.gs-plate-col .gs-wipe')?.classList.contains('is-fitted'),
      ).toBe(false);

      find<HTMLButtonElement>('.gs-sweep-expand')!.click();
      fixture.detectChanges();

      const wipe = find<HTMLElement>('.gs-sweep-stage--big .gs-wipe')!;
      expect(wipe.classList.contains('is-fitted')).toBe(true);
      reportBox(800, 600);
      // 600 of room for a 512-pixel square picture, so the box is the room's
      // shorter side and the two sides are drawn into the whole of it.
      expect(wipe.style.getPropertyValue('--gs-wipe-box-w')).toBe('600px');
      expect(wipe.style.getPropertyValue('--gs-wipe-box-h')).toBe('600px');
    });
  });

  describe('the lens', () => {
    /** The lens toggle, which is the one glyph on the stage that presses in. */
    const loupe = (): HTMLButtonElement | null =>
      find<HTMLButtonElement>('.gs-sweep-glyphs button[aria-pressed]');

    it('is offered to a pointer and to nothing else', async () => {
      await setUp({ startExpanded: true });
      expect(loupe()).toBeNull();

      await setUp({ startExpanded: true, finePointer: true });
      expect(loupe()).not.toBeNull();
    });

    it('follows the pointer over the picture once it is armed', async () => {
      await setUp({ startExpanded: true, finePointer: true });
      const stage = find<HTMLElement>('.gs-plate-col .gs-sweep-stage')!;
      boxOf(stage, 0, 0, 400, 400);
      boxOf(find<HTMLElement>('.gs-sweep-frame')!, 0, 0, 400, 400);

      loupe()!.click();
      fixture.detectChanges();
      pointer(stage, 'pointermove', { clientX: 200, clientY: 200 });

      const lens = find<HTMLElement>('.gs-sweep-lens')!;
      expect(lens).not.toBeNull();
      expect(lens.style.left).toBe('200px');
      // The middle of a 1024-pixel picture, held at the middle of the lens.
      expect(lens.style.backgroundPosition).toBe('');
      expect(
        find<HTMLElement>('.gs-sweep-lens-half')!.style.backgroundPosition,
      ).toBe('-412px -412px');
    });

    it('splits down the middle while a comparison is up', async () => {
      await setUp({
        parameter: 'denoising_strength',
        startExpanded: true,
        finePointer: true,
      });
      compareChip().click();
      fixture.detectChanges();
      const stage = find<HTMLElement>('.gs-plate-col .gs-sweep-stage')!;
      boxOf(stage, 0, 0, 400, 400);
      boxOf(
        find<HTMLElement>('.gs-wipe-media--before .gs-wipe-img')!,
        0,
        0,
        400,
        400,
      );

      loupe()!.click();
      fixture.detectChanges();
      pointer(stage, 'pointermove', { clientX: 120, clientY: 160 });

      const halves = all('.gs-sweep-lens-half');
      expect(halves).toHaveLength(2);
      expect(halves[1].classList.contains('is-split')).toBe(true);
    });

    it('leaves with the pointer', async () => {
      await setUp({ startExpanded: true, finePointer: true });
      const stage = find<HTMLElement>('.gs-plate-col .gs-sweep-stage')!;
      boxOf(stage, 0, 0, 400, 400);
      boxOf(find<HTMLElement>('.gs-sweep-frame')!, 0, 0, 400, 400);
      loupe()!.click();
      fixture.detectChanges();
      pointer(stage, 'pointermove', { clientX: 200, clientY: 200 });
      expect(find('.gs-sweep-lens')).not.toBeNull();

      stage.dispatchEvent(new MouseEvent('pointerleave', { bubbles: false }));
      fixture.detectChanges();

      expect(find('.gs-sweep-lens')).toBeNull();
    });
  });

  describe('what a frame in a sheet is captioned with', () => {
    it('shows the value alone and says the setting in the button name', async () => {
      await setUp({ parameter: 'scheduler', startExpanded: true });
      reportWidth(900);

      expect(
        all('.gs-sweep-option-cap .gs-sweep-value').map((cell) =>
          cell.textContent?.trim(),
        ),
      ).toEqual(['normal', 'karras', 'simple']);
      expect(all('.gs-sweep-option-cap .gs-setting-chip')).toHaveLength(0);
      expect(find('.gs-sweep-plate-cell')?.getAttribute('aria-label')).toBe(
        'Show Schedule normal',
      );
    });
  });

  describe('the plate demonstrating itself', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('is offered as a word in the head and not opened unasked', async () => {
      await setUp({ startExpanded: true });

      expect(find('.gs-plate-tour-go')?.textContent?.trim()).toBe(
        'What is this?',
      );
      expect(find('.gs-plate-tour')).toBeNull();
    });

    it('walks the slider through every value, then visits each region, and ends where the reader was', async () => {
      await setUp({ startExpanded: true });
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
      });
      // The reader is on the middle stop; the tour must give it back.
      expect(
        all<HTMLButtonElement>('.gs-sweep-film-go')[1].getAttribute(
          'aria-current',
        ),
      ).toBe('true');

      find<HTMLButtonElement>('.gs-plate-tour-go')!.click();
      fixture.detectChanges();

      const bubble = find<HTMLElement>('.gs-plate-tour')!;
      expect(bubble).not.toBeNull();
      expect(bubble.textContent).toContain(
        'Every picture here was made from the same prompt, model and seed. Only Steps changed',
      );
      expect(bubble.textContent).toContain('1 of 4');
      // The scrub starts from the first stop.
      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 4');

      // Three stops at the slowest pace: the slider reaches the last one.
      vi.advanceTimersByTime(1500);
      fixture.detectChanges();
      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 30');
      expect(find('.gs-tour-target')).not.toBeNull();

      // The hold ends and the next step is the caption.
      vi.advanceTimersByTime(1600);
      fixture.detectChanges();
      expect(find('.gs-plate-tour')?.textContent).toContain(
        'This line says what changed',
      );
      expect(find('.gs-plate-tour')?.textContent).toContain('2 of 4');

      // Next by hand, twice, then Done.
      find<HTMLButtonElement>('.gs-plate-tour-btn--go')!.click();
      fixture.detectChanges();
      expect(find('.gs-plate-tour')?.textContent).toContain(
        'Each small picture is one value',
      );
      find<HTMLButtonElement>('.gs-plate-tour-btn--go')!.click();
      fixture.detectChanges();
      expect(find('.gs-plate-tour')?.textContent).toContain(
        'Open the picture full size',
      );
      expect(
        find<HTMLButtonElement>('.gs-plate-tour-btn--go')?.textContent?.trim(),
      ).toBe('Done');
      find<HTMLButtonElement>('.gs-plate-tour-btn--go')!.click();
      fixture.detectChanges();

      expect(find('.gs-plate-tour')).toBeNull();
      expect(find('.gs-tour-target')).toBeNull();
      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 12');
      expect(document.activeElement).toBe(find('.gs-plate-tour-go'));
    });

    it('stands aside the moment the reader presses the plate', async () => {
      await setUp({ startExpanded: true });
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
      });
      find<HTMLButtonElement>('.gs-plate-tour-go')!.click();
      fixture.detectChanges();
      expect(find('.gs-plate-tour')).not.toBeNull();

      find<HTMLElement>('.gs-sweep-stage')!.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true }),
      );
      fixture.detectChanges();

      expect(find('.gs-plate-tour')).toBeNull();
      // Nothing left ticking: the clock can run on without moving the slider.
      vi.advanceTimersByTime(10000);
      fixture.detectChanges();
      expect(find('.gs-sweep-pill')?.textContent?.trim()).toBe('Steps 12');
    });
  });

  describe('the copy it asks the ledger for', () => {
    it('reads every line it names out of the translation file', () => {
      const wanted = [
        'generate.sweeps.card_door',
        'generate.sweeps.card_door_pair',
        'generate.sweeps.stage_role',
        'generate.sweeps.compare_group',
        'generate.sweeps.details',
        'generate.sweeps.details_close',
        'generate.sweeps.layout_grid',
        'generate.sweeps.layout_strip',
        'generate.sweeps.stop_enlarge',
        'generate.sweeps.stop_go',
        'generate.sweeps.stop_prev',
        'generate.sweeps.stop_next',
        'generate.sweeps.held_label',
        'generate.sweeps.model_label',
        'generate.sweeps.scene_label',
        'generate.sweeps.sidecar_link',
        'generate.sweeps.links_label',
        'generate.sweeps.setting_page',
      ];
      const ledger = en as Record<string, string>;

      const missing = wanted.filter((key) => !ledger[key]);
      expect(missing).toEqual([]);
    });

    it('says nothing in the vocabulary of the code', () => {
      const ledger = en as Record<string, string>;
      const lines = Object.entries(ledger)
        .filter(([key]) => key.startsWith('generate.sweeps.'))
        .map(([, line]) => line);

      for (const line of lines) {
        expect(line).not.toMatch(/\bstrip_id\b|\bsidecar\b|\bindex\.json\b/);
        expect(line).not.toContain('—');
      }
    });
  });
});
