import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it } from 'vitest';
import {
  ControlWorldStrips,
  GsControlGalleryComponent,
} from './gs-control-gallery.component';
import { environment } from '../../../environments/environment';
import en from '../../../assets/i18n/en.json';

const WORLD_ONE = 'controlnet-gallery/deliberate/courier-ink';
const WORLD_ONE_BUILDING = 'controlnet-gallery/deliberate/skyharbor-tower-ink';
const WORLD_TWO = 'controlnet-gallery/anything-diffusion/fox-shrine-ink';

/**
 * Two examples of the same two modes, one of them published on a second kind
 * of source picture, and a strength strip for one mode: the shape the page
 * reads, including a mode the library has swept the dial against and one it
 * has not.
 */
const INDEX = {
  schema_version: 1,
  seed: 1312,
  strips: [
    world(WORLD_ONE, 'deliberate', 'Deliberate', 'courier-ink', 'The courier'),
    world(
      WORLD_ONE_BUILDING,
      'deliberate',
      'Deliberate',
      'skyharbor-tower-ink',
      'The mooring tower, asked for at dusk in rain',
      'building',
      'The source is a building: straight edges and a long run of perspective.',
    ),
    world(
      WORLD_TWO,
      'anything-diffusion',
      'Anything Diffusion',
      'fox-shrine-ink',
      'The fox shrine, in ink and vermilion',
    ),
    strength('canny'),
  ],
};

/** A full-range strength strip, keyed to the mode it was rendered against. */
function strength(type: string): unknown {
  return {
    strip_id: `control-strength/${type}/deliberate/courier-ink`,
    parameter: 'control_strength',
    presentation: 'strip',
    caption: `How hard a ${type} map holds the render.`,
    complete: true,
    image_model: {
      slug: 'deliberate',
      name: 'Deliberate',
      baseline: 'stable_diffusion_1',
      note: '',
    },
    scene: {
      scene_id: 'courier-ink',
      label: 'The courier',
      prompt: 'a courier',
    },
    varying: ['control_strength'],
    stops: [
      {
        value: 0.5,
        label: '0_5',
        caption: 'Barely held.',
        file: `control-strength/${type}/deliberate/courier-ink/001_0_5.webp`,
        control_type: type,
      },
      {
        value: 1,
        label: '1',
        caption: 'Held to the map.',
        file: `control-strength/${type}/deliberate/courier-ink/002_1.webp`,
        control_type: type,
      },
      {
        value: 2,
        label: '2',
        caption: 'Held past what the prompt asked for.',
        file: `control-strength/${type}/deliberate/courier-ink/003_2.webp`,
        control_type: type,
      },
    ],
  };
}

function world(
  stripId: string,
  slug: string,
  name: string,
  sceneId: string,
  label: string,
  subject = 'anchor',
  caption = '',
): unknown {
  return {
    strip_id: stripId,
    parameter: 'controlnet_gallery',
    presentation: 'triptych',
    subject,
    caption,
    complete: true,
    image_model: { slug, name, baseline: 'stable_diffusion_1', note: '' },
    scene: { scene_id: sceneId, label, prompt: 'a courier' },
    source_image: `${stripId}/source.webp`,
    source_width: 512,
    source_height: 512,
    held: { width: 512, height: 512 },
    stops: [
      {
        value: 'canny',
        label: 'canny',
        caption: `Canny on ${label}.`,
        file: `${stripId}/001_canny.webp`,
        width: 512,
        height: 512,
        control_type: 'canny',
        control_group: 'edges',
        control_map: `${stripId}/001_canny_map.webp`,
      },
      {
        value: 'openpose',
        label: 'openpose',
        caption: `Openpose on ${label}.`,
        file: `${stripId}/023_openpose.webp`,
        width: 512,
        height: 512,
        control_type: 'openpose',
        control_group: 'pose',
        control_map: `${stripId}/023_openpose_map.webp`,
      },
    ],
  };
}

@Component({
  imports: [GsControlGalleryComponent],
  template: `<app-gs-control-gallery
    [types]="types"
    [worlds]="worlds"
    [descriptionKeys]="descriptionKeys"
    [nameKeys]="nameKeys"
    [noteKeys]="noteKeys"
    [groupLabelKey]="groupLabelKey"
  />`,
})
class HostComponent {
  public types: readonly string[] = ['canny', 'openpose', 'seg'];
  public worlds: readonly ControlWorldStrips[] = [
    { anchor: WORLD_ONE, building: WORLD_ONE_BUILDING },
    { anchor: WORLD_TWO },
  ];
  public descriptionKeys: Readonly<Record<string, string>> = {
    canny: 'alchemy.annotation.detector.canny',
    openpose: 'alchemy.annotation.detector.openpose',
    seg: 'alchemy.annotation.detector.seg',
  };
  public nameKeys: Readonly<Record<string, string>> = {
    canny: 'alchemy.annotation.detector_name.canny',
    openpose: 'alchemy.annotation.detector_name.openpose',
    seg: 'alchemy.annotation.detector_name.seg',
  };
  public noteKeys: Readonly<Record<string, string>> = {
    canny: 'generate.control_types.note_hough',
  };
  public groupLabelKey: string | null = 'alchemy.annotation.group_edges';
}

describe('GsControlGalleryComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);

  async function setUp(): Promise<void> {
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
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${environment.evidenceBaseUrl}/index.json`).flush(INDEX);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Open the enlarging layer on one mode, by the tile that carries it. */
  function openTile(at: number): void {
    all<HTMLButtonElement>('.gs-ref-zoom')[at].click();
    fixture.detectChanges();
  }

  it('lays out a tile per mode, cut from the first example', async () => {
    await setUp();

    expect(all('li').length).toBe(3);
    expect(all<HTMLImageElement>('.gs-ref-zoom img')[0].getAttribute('src')) //
      .toBe(`${environment.evidenceBaseUrl}/${WORLD_ONE}/001_canny.webp`);
    expect(el().textContent).toContain('canny');
    expect(el().textContent).toContain('openpose');
  });

  it('says so where a mode has nothing published, and keeps its place', async () => {
    await setUp();

    // Three modes were asked for and two were published, so the third is a
    // tile that says nothing was published rather than a missing tile.
    expect(all('.gs-ref-zoom').length).toBe(2);
    expect(all('.gs-ref-map-gap').length).toBe(1);
    expect(el().textContent).toContain('seg');
  });

  it('carries the picker own line and the further note a mode needs', async () => {
    await setUp();

    const notes = all('.gs-ref-map-note').map((node) => node.textContent ?? '');
    expect(notes[0]).toContain('Finds hard outlines');
    expect(notes[1]).toContain('hough');
  });

  it('heads the layer with the mode said aloud, its group and its own id', async () => {
    await setUp();
    openTile(0);

    const band = find<HTMLElement>('.gs-ctl-band')!;
    expect(band.querySelector('.gs-ctl-title')?.textContent?.trim()) //
      .toBe('Canny');
    expect(band.querySelector('.gs-ctl-id')?.textContent?.trim()).toBe('canny');
    expect(band.querySelector('.gs-ctl-group')?.textContent) //
      .toContain('Edges and outlines');
    expect(band.querySelector('.gs-ctl-lead')?.textContent) //
      .toContain('Finds hard outlines');
    expect(band.querySelector('.gs-sweep-viewer-x')).not.toBeNull();
  });

  it('labels each frame above it and says what the render ran on', async () => {
    await setUp();
    openTile(0);

    expect(all('.gs-ctl-over').map((node) => (node.textContent ?? '').trim())) //
      .toEqual(['Starting picture', 'Control map', 'Finished image']);
    expect(find('.gs-ctl-model')!.textContent?.trim()).toBe('Deliberate');
    expect(find('.gs-ctl-meta')!.textContent).toContain('Rendered on');
  });

  it('says what each of the three frames is in pixels, from the index', async () => {
    await setUp();
    openTile(0);

    const badges = all<HTMLElement>('.gs-ctl-shot .gs-pixels-text').map(
      (badge) => badge.textContent?.replace(/\s+/g, ' ').trim(),
    );

    // The source and the render are stated by the index; the map is published
    // without a size, so its frame carries none until the file has arrived.
    expect(badges).toEqual(['512 × 512', '512 × 512']);
  });

  it('takes the map own size off the file, which is the only place it is', async () => {
    await setUp();
    openTile(0);

    const map = all<HTMLImageElement>('.gs-ctl-shot img')[1];
    Object.defineProperty(map, 'naturalWidth', {
      value: 512,
      configurable: true,
    });
    Object.defineProperty(map, 'naturalHeight', {
      value: 512,
      configurable: true,
    });
    map.dispatchEvent(new Event('load'));
    fixture.detectChanges();

    expect(all('.gs-ctl-shot .gs-pixels-text').length).toBe(3);
  });

  it('carries the size into the full-size view, with how far it is reduced', async () => {
    await setUp();
    openTile(0);
    all<HTMLButtonElement>('.gs-ctl-shot')[2].click();
    fixture.detectChanges();

    const image = find<HTMLImageElement>('.gs-tut-viewer-img')!;
    image.getBoundingClientRect = () =>
      ({ width: 256, height: 256 }) as DOMRect;
    Object.defineProperty(image, 'naturalWidth', {
      value: 512,
      configurable: true,
    });
    Object.defineProperty(image, 'naturalHeight', {
      value: 512,
      configurable: true,
    });
    image.dispatchEvent(new Event('load'));
    fixture.detectChanges();

    expect(
      find('.gs-tut-viewer-stage .gs-pixels-text')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('512 × 512 · shown at 50%');
  });

  it('heads the strength strip so it reads as its own section', async () => {
    await setUp();
    openTile(0);

    expect(find('.gs-ctl-head')!.textContent).toContain(
      'What control strength does',
    );
    expect(find('.gs-ctl-dial app-gs-sweep-scrub')).not.toBeNull();
  });

  it('shows one example at a time, with its source, its map and its render', async () => {
    await setUp();
    openTile(0);

    const worlds = all('.gs-ctl-world');
    expect(worlds.length).toBe(1);
    expect(worlds[0].textContent).toContain('Canny on The courier.');
    expect(worlds[0].textContent).not.toContain('The fox shrine');

    const frames = Array.from(
      worlds[0].querySelectorAll<HTMLImageElement>('.gs-ctl-frame img'),
    ).map((image) => image.getAttribute('src'));
    expect(frames).toEqual([
      `${environment.evidenceBaseUrl}/${WORLD_ONE}/source.webp`,
      `${environment.evidenceBaseUrl}/${WORLD_ONE}/001_canny_map.webp`,
      `${environment.evidenceBaseUrl}/${WORLD_ONE}/001_canny.webp`,
    ]);
  });

  it('offers the examples by the labels the library gives their scenes', async () => {
    await setUp();
    openTile(0);

    const group = find<HTMLElement>('.gs-ctl-switch--world')!;
    expect(group.getAttribute('role')).toBe('radiogroup');
    const options = all<HTMLButtonElement>(
      '.gs-ctl-switch--world .gs-ctl-switch-opt',
    );
    // The library labels the second scene with a clause; the switcher is one
    // row of options, so it carries what stands before the first comma.
    expect(options.map((option) => (option.textContent ?? '').trim())) //
      .toEqual(['The courier', 'The fox shrine']);
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(options[1].getAttribute('tabindex')).toBe('-1');
  });

  it('changes the example on show when another one is chosen', async () => {
    await setUp();
    openTile(0);

    all<HTMLButtonElement>(
      '.gs-ctl-switch--world .gs-ctl-switch-opt',
    )[1].click();
    fixture.detectChanges();

    expect(find('.gs-ctl-world')!.textContent) //
      .toContain('Canny on The fox shrine,');
    expect(
      all<HTMLImageElement>('.gs-ctl-frame img')[0].getAttribute('src'),
    ).toBe(`${environment.evidenceBaseUrl}/${WORLD_TWO}/source.webp`);
  });

  it('offers the kinds of picture the example was published on', async () => {
    await setUp();
    openTile(0);

    const options = all<HTMLButtonElement>(
      '.gs-ctl-switch--subject .gs-ctl-switch-opt',
    );
    // The first example carries a second kind of picture and the third kind
    // is unpublished, so it is not offered.
    expect(options.map((option) => (option.textContent ?? '').trim())) //
      .toEqual(['Character', 'Building']);
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(options[1].getAttribute('tabindex')).toBe('-1');
  });

  it('changes the source picture without leaving the example', async () => {
    await setUp();
    openTile(0);

    all<HTMLButtonElement>('.gs-ctl-switch--subject .gs-ctl-switch-opt')[1] //
      .click();
    fixture.detectChanges();

    const world = find<HTMLElement>('.gs-ctl-world')!;
    expect(
      Array.from(world.querySelectorAll<HTMLImageElement>('img')).map((image) =>
        image.getAttribute('src'),
      )[0],
    ).toBe(`${environment.evidenceBaseUrl}/${WORLD_ONE_BUILDING}/source.webp`);
    expect(world.textContent).toContain('straight edges');
    // The example is still the one that was chosen before the picture changed.
    expect(
      all<HTMLButtonElement>('.gs-ctl-switch--world .gs-ctl-switch-opt')[0] //
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('keeps the kind of picture when another example is chosen', async () => {
    await setUp();
    openTile(0);
    all<HTMLButtonElement>('.gs-ctl-switch--subject .gs-ctl-switch-opt')[1] //
      .click();
    fixture.detectChanges();

    all<HTMLButtonElement>('.gs-ctl-switch--world .gs-ctl-switch-opt')[1] //
      .click();
    fixture.detectChanges();

    // The second example was published on its own picture only, so that is
    // what is shown and what the switcher says is showing.
    expect(all('.gs-ctl-switch--subject').length).toBe(0);
    expect(find('.gs-ctl-world')!.textContent).toContain('The fox shrine');

    all<HTMLButtonElement>('.gs-ctl-switch--world .gs-ctl-switch-opt')[0] //
      .click();
    fixture.detectChanges();
    expect(
      all<HTMLButtonElement>('.gs-ctl-switch--subject .gs-ctl-switch-opt')[1] //
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('moves between the kinds of picture on the arrows', async () => {
    await setUp();
    openTile(0);

    all<HTMLButtonElement>('.gs-ctl-switch--subject .gs-ctl-switch-opt')[0] //
      .dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
        }),
      );
    fixture.detectChanges();

    expect(find('.gs-ctl-world')!.textContent).toContain('straight edges');
    expect(document.activeElement).toBe(
      all<HTMLButtonElement>('.gs-ctl-switch--subject .gs-ctl-switch-opt')[1],
    );
  });

  it('steps the full-size pictures within the kind of picture on show', async () => {
    await setUp();
    openTile(0);
    all<HTMLButtonElement>('.gs-ctl-switch--subject .gs-ctl-switch-opt')[1] //
      .click();
    fixture.detectChanges();

    all<HTMLButtonElement>('.gs-ctl-shot')[0].click();
    fixture.detectChanges();

    // Only the first example was published on a building, so that is the whole
    // run: three frames rather than the six the other picture offers.
    expect(
      find('app-gs-shot-viewer .gs-tut-viewer-count')?.textContent,
    ).toContain('1 of 3');
  });

  it('moves between the examples on the arrows and wraps at both ends', async () => {
    await setUp();
    openTile(0);
    const options = all<HTMLButtonElement>(
      '.gs-ctl-switch--world .gs-ctl-switch-opt',
    );

    options[0].dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      }),
    );
    fixture.detectChanges();
    expect(find('.gs-ctl-world')!.textContent).toContain('The fox shrine');
    expect(document.activeElement).toBe(
      all<HTMLButtonElement>('.gs-ctl-switch--world .gs-ctl-switch-opt')[1],
    );

    all<HTMLButtonElement>(
      '.gs-ctl-switch--world .gs-ctl-switch-opt',
    )[1].dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      }),
    );
    fixture.detectChanges();
    expect(find('.gs-ctl-world')!.textContent).toContain('The courier');
  });

  it('opens the same layer from the words under the tile', async () => {
    await setUp();

    const doors = all<HTMLButtonElement>('.gs-ctl-more');
    // Two modes are published and the third has nothing to open onto.
    expect(doors.length).toBe(2);
    expect(doors[0].textContent).toContain('See more examples');

    doors[0].click();
    fixture.detectChanges();

    expect(find('.gs-ctl-body')).not.toBeNull();
    expect(find('.gs-ctl-world')!.textContent).toContain(
      'Canny on The courier',
    );
  });

  it('reads the strength dial against the mode the layer is showing', async () => {
    await setUp();
    openTile(0);

    const scrub = find<HTMLElement>('.gs-ctl-body app-gs-sweep-scrub');
    expect(scrub).not.toBeNull();
    expect(scrub!.querySelector('.gs-sweep')).not.toBeNull();
    expect(scrub!.textContent).toContain('Held to the map.');
  });

  it('says nothing where the library has swept no strength for the mode', async () => {
    await setUp();
    openTile(1);

    // openpose has examples but no strength strip, and the layer is still the
    // example and its switcher rather than an error or an empty plate.
    expect(all('.gs-ctl-world').length).toBe(1);
    expect(all('.gs-ctl-switch--world .gs-ctl-switch-opt').length).toBe(2);
    expect(find('.gs-ctl-body app-gs-sweep-scrub')).toBeNull();
  });

  it('opens any frame at full size, and says which picture it is', async () => {
    await setUp();
    openTile(0);

    all<HTMLButtonElement>('.gs-ctl-shot')[1].click();
    fixture.detectChanges();

    const viewer = find<HTMLElement>('app-gs-shot-viewer')!;
    expect(viewer.querySelector('img')?.getAttribute('src')) //
      .toBe(`${environment.evidenceBaseUrl}/${WORLD_ONE}/001_canny_map.webp`);
    expect(viewer.querySelector('.gs-tut-viewer-name')?.textContent) //
      .toContain('Control map, The courier');
    expect(viewer.querySelector('.gs-tut-viewer-count')?.textContent) //
      .toContain('2 of 6');
  });

  it('steps through the frames of every example without shutting', async () => {
    await setUp();
    openTile(0);
    all<HTMLButtonElement>('.gs-ctl-shot')[2].click();
    fixture.detectChanges();

    // Past the last frame of the first example is the first frame of the
    // second, and the layer behind follows it to that example.
    all<HTMLButtonElement>('.gs-tut-viewer-step')[1].click();
    fixture.detectChanges();

    const viewer = find<HTMLElement>('app-gs-shot-viewer')!;
    expect(viewer.querySelector('img')?.getAttribute('src')) //
      .toBe(`${environment.evidenceBaseUrl}/${WORLD_TWO}/source.webp`);
    expect(viewer.querySelector('.gs-tut-viewer-name')?.textContent) //
      .toContain('Starting picture, The fox shrine');
    expect(find('.gs-ctl-world')!.textContent).toContain('The fox shrine');

    // And back the way it came.
    all<HTMLButtonElement>('.gs-tut-viewer-step')[0].click();
    fixture.detectChanges();
    expect(
      find<HTMLElement>('app-gs-shot-viewer')!
        .querySelector('img')
        ?.getAttribute('src'),
    ).toBe(`${environment.evidenceBaseUrl}/${WORLD_ONE}/001_canny.webp`);
  });

  it('shuts the full-size picture on escape and leaves the layer open', async () => {
    await setUp();
    openTile(0);
    const frame = all<HTMLButtonElement>('.gs-ctl-shot')[0];
    frame.click();
    fixture.detectChanges();

    find<HTMLElement>('.gs-tut-viewer-body')!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    fixture.detectChanges();

    expect(find('app-gs-shot-viewer')).toBeNull();
    expect(find('.gs-ctl-body')).not.toBeNull();
    expect(document.activeElement).toBe(frame);
  });

  it('closes on escape and hands focus back to the tile that opened it', async () => {
    await setUp();
    const tile = all<HTMLButtonElement>('.gs-ref-zoom')[1];
    tile.click();
    fixture.detectChanges();
    expect(find('.gs-ctl-body')).not.toBeNull();

    find<HTMLElement>('.gs-ctl-body')!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    fixture.detectChanges();

    expect(find('.gs-ctl-body')).toBeNull();
    expect(document.activeElement).toBe(tile);
  });

  it('keeps Tab inside the layer and wraps it at both ends', async () => {
    await setUp();
    openTile(0);
    const body = find<HTMLElement>('.gs-ctl-body')!;
    const focusables = Array.from(
      body.querySelectorAll<HTMLElement>(
        'a[href], button, [tabindex]:not([tabindex="-1"]), input, select, textarea',
      ),
    ).filter((element) => element.getAttribute('tabindex') !== '-1');
    expect(focusables.length).toBeGreaterThan(1);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    const forward = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    last.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    first.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });
});
