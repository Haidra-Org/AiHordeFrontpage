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
import { GsControlGalleryComponent } from './gs-control-gallery.component';
import { environment } from '../../../environments/environment';
import en from '../../../assets/i18n/en.json';

const WORLD_ONE = 'controlnet-gallery/deliberate/courier-ink';
const WORLD_TWO = 'controlnet-gallery/anything-diffusion/fox-shrine-ink';

/** Two examples of the same two modes, which is the shape the page reads. */
const INDEX = {
  schema_version: 1,
  seed: 1312,
  strips: [
    world(WORLD_ONE, 'deliberate', 'Deliberate', 'courier-ink', 'The courier'),
    world(
      WORLD_TWO,
      'anything-diffusion',
      'Anything Diffusion',
      'fox-shrine-ink',
      'The fox shrine',
    ),
  ],
};

function world(
  stripId: string,
  slug: string,
  name: string,
  sceneId: string,
  label: string,
): unknown {
  return {
    strip_id: stripId,
    parameter: 'controlnet_gallery',
    presentation: 'triptych',
    caption: '',
    complete: true,
    image_model: { slug, name, baseline: 'stable_diffusion_1', note: '' },
    scene: { scene_id: sceneId, label, prompt: 'a courier' },
    source_image: `${stripId}/source.webp`,
    stops: [
      {
        value: 'canny',
        label: 'canny',
        caption: `Canny on ${label}.`,
        file: `${stripId}/001_canny.webp`,
        control_type: 'canny',
        control_group: 'edges',
        control_map: `${stripId}/001_canny_map.webp`,
      },
      {
        value: 'openpose',
        label: 'openpose',
        caption: `Openpose on ${label}.`,
        file: `${stripId}/023_openpose.webp`,
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
    [noteKeys]="noteKeys"
  />`,
})
class HostComponent {
  public types: readonly string[] = ['canny', 'openpose', 'seg'];
  public worlds: readonly string[] = [WORLD_ONE, WORLD_TWO];
  public descriptionKeys: Readonly<Record<string, string>> = {
    canny: 'alchemy.annotation.detector.canny',
    openpose: 'alchemy.annotation.detector.openpose',
    seg: 'alchemy.annotation.detector.seg',
  };
  public noteKeys: Readonly<Record<string, string>> = {
    canny: 'generate.control_types.note_hough',
  };
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
    expect(notes[0]).toContain('Hard outlines');
    expect(notes[1]).toContain('hough');
  });

  it('shows every example of one mode, each with its source and its map', async () => {
    await setUp();
    openTile(0);

    const worlds = all('.gs-ctl-world');
    expect(worlds.length).toBe(2);
    expect(worlds[0].textContent).toContain('The courier');
    expect(worlds[1].textContent).toContain('The fox shrine');
    expect(worlds[0].textContent).toContain('Canny on The courier.');

    const frames = Array.from(
      worlds[0].querySelectorAll<HTMLImageElement>('.gs-ctl-frame img'),
    ).map((image) => image.getAttribute('src'));
    expect(frames).toEqual([
      `${environment.evidenceBaseUrl}/${WORLD_ONE}/source.webp`,
      `${environment.evidenceBaseUrl}/${WORLD_ONE}/001_canny_map.webp`,
      `${environment.evidenceBaseUrl}/${WORLD_ONE}/001_canny.webp`,
    ]);
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
});
