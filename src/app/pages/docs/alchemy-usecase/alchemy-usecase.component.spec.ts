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
import { DocsAlchemyUseCaseComponent } from './alchemy-usecase.component';
import { DocsAlchemyHomeComponent } from '../alchemy-home/alchemy-home.component';
import { environment } from '../../../../environments/environment';
import {
  ALCHEMY_EVIDENCE_ROOT,
  AlchemyEvidenceManifest,
} from '../../../content/alchemy-evidence';
import {
  ANNOTATION_DETECTOR_GROUPS,
  alchemyUseCase,
  annotationGroupLabelKey,
} from '../../../content/alchemy-usecases';
import en from '../../../../assets/i18n/en.json';
import stubIndex from '../../../testing/fixtures/sweep-index.stub.json';

const manifestUrl = `${ALCHEMY_EVIDENCE_ROOT}/manifest.json`;

const PUBLISHED: AlchemyEvidenceManifest = {
  generated_against: 'https://aihorde.net/api/v2',
  entries: [
    {
      use_case: 'describe',
      form: 'caption',
      title: 'One line about the picture',
      files: {
        source: 'describe/source.webp',
        result_text: 'describe/caption.txt',
      },
    },
    {
      use_case: 'enlarge',
      form: 'RealESRGAN_x4plus',
      title: 'Four times',
      files: {
        source: 'enlarge/source.webp',
        result: 'enlarge/realesrgan.webp',
      },
      model: 'RealESRGAN_x4plus',
      notes: 'Rendered from the same source as every other stop.',
    },
  ],
};

/** The same run, published with its structure kept rather than flattened. */
const STRUCTURED: AlchemyEvidenceManifest = {
  generated_against: 'https://aihorde.net/api/v2',
  entries: [
    {
      use_case: 'describe',
      form: 'caption',
      title: 'One line about the picture',
      files: {
        source: 'describe/source.webp',
        result_json: 'describe/caption.json',
      },
    },
  ],
};

/** Every detector the picker offers, in the order the gallery reads them. */
const DETECTORS = ANNOTATION_DETECTOR_GROUPS.flatMap((group) => group.types);

/** The detector the library is short of, which the page still has to name. */
const UNPUBLISHED = 'openpose';

/**
 * The control map library as it is published: one source, one run per detector.
 * One detector is left without a result, because a page that dropped it would
 * be telling the reader the studio does not offer it.
 */
const CONTROL_MAPS: AlchemyEvidenceManifest = {
  generated_against: 'https://aihorde.net/api/v2',
  entries: DETECTORS.map((type) => ({
    use_case: 'control_map',
    form: 'annotation',
    title: type,
    control_type: type,
    model: type,
    notes: `What ${type} reads.`,
    files: {
      source: 'sources/anchor.webp',
      ...(type === UNPUBLISHED
        ? {}
        : { result: `control_map/${type}/result.webp` }),
    },
  })),
};

/** Stands in for the docs shell, so the router mounts the page it routes to. */
@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class HostComponent {}

describe('DocsAlchemyUseCaseComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let http: HttpTestingController;
  let router: Router;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));

  /** Answer whatever sweep fetches the mounted entry happens to make. */
  const flushLibrary = (): void => {
    for (const request of http.match(
      `${environment.evidenceBaseUrl}/index.json`,
    )) {
      request.flush(stubIndex);
    }
  };

  async function setUp(
    useCase: string,
    manifest: AlchemyEvidenceManifest | null = null,
  ): Promise<void> {
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
          { path: 'docs/alchemy', component: DocsAlchemyHomeComponent },
          {
            path: 'docs/alchemy/:useCase',
            component: DocsAlchemyUseCaseComponent,
          },
        ]),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    await router.navigateByUrl(`/docs/alchemy/${useCase}`);
    fixture.detectChanges();

    for (const request of http.match(manifestUrl)) {
      if (manifest) {
        request.flush(manifest);
      } else {
        request.error(new ProgressEvent('error'), {
          status: 404,
          statusText: 'nope',
        });
      }
    }
    flushLibrary();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  it('writes the use case out, and every form it is made of', async () => {
    await setUp('enlarge');

    expect(el().textContent).toContain('Enlarge a picture');
    expect(all('.gs-ref-variant-name')).toHaveLength(
      alchemyUseCase('enlarge')?.forms.length,
    );
    // Named as the tool names them, which is not the API's form id.
    expect(el().textContent).toContain('RealESRGAN x4 (anime)');
  });

  it('shows no evidence band where the library published nothing', async () => {
    await setUp('enlarge');

    expect(find('.gs-ref-evidence')).toBeNull();
    expect(el().textContent).not.toContain('alchemy.usecases.');
  });

  it('shows a published run as its source beside its result', async () => {
    await setUp('enlarge', PUBLISHED);

    const frames = all<HTMLImageElement>('.gs-ref-shot-frame img');
    expect(frames.map((frame) => frame.getAttribute('src'))).toEqual([
      `${ALCHEMY_EVIDENCE_ROOT}/enlarge/source.webp`,
      `${ALCHEMY_EVIDENCE_ROOT}/enlarge/realesrgan.webp`,
    ]);
    expect(el().textContent).toContain(
      'Rendered from the same source as every other stop.',
    );
  });

  it('shows the words a describe-family form answered with', async () => {
    await setUp('describe', PUBLISHED);

    http
      .expectOne(`${ALCHEMY_EVIDENCE_ROOT}/describe/caption.txt`)
      .flush('a black dog sitting on the ground\n');
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(find('.gs-ref-shot-text')?.textContent).toContain(
      'a black dog sitting on the ground',
    );
  });

  it('reads a structured answer with the studio, not as flat words', async () => {
    await setUp('describe', STRUCTURED);

    http
      .expectOne(`${ALCHEMY_EVIDENCE_ROOT}/describe/caption.json`)
      .flush({ caption: 'a black dog sitting on the ground' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(find('.gs-ref-shot-text')).toBeNull();
    expect(find('.alchemy-result')?.textContent).toContain(
      'a black dog sitting on the ground',
    );
  });

  it('shows the shared source once, and every detector under its group', async () => {
    await setUp('control_map', CONTROL_MAPS);

    const leads = all<HTMLImageElement>('.gs-ref-shot-frame--lead img');
    expect(leads.map((frame) => frame.getAttribute('src'))).toEqual([
      `${ALCHEMY_EVIDENCE_ROOT}/sources/anchor.webp`,
    ]);

    const names = all('.gs-ref-map-name').map((name) =>
      name.textContent?.trim(),
    );
    expect(names).toEqual([...DETECTORS]);
    expect(new Set(names).size).toBe(DETECTORS.length);
  });

  it('heads each group with what it reads, in the order the picker offers', async () => {
    await setUp('control_map', CONTROL_MAPS);

    const heads = all('.gs-ref-maps-head').map((head) =>
      head.textContent?.trim(),
    );
    const translations = en as Record<string, string>;
    expect(heads).toEqual(
      ANNOTATION_DETECTOR_GROUPS.map(
        (group) => translations[annotationGroupLabelKey(group.id)],
      ),
    );
  });

  it('keeps a detector nothing was published for, and says what it reads', async () => {
    await setUp('control_map', CONTROL_MAPS);

    expect(all('.gs-ref-map-gap')).toHaveLength(1);
    expect(all('.gs-ref-map img')).toHaveLength(DETECTORS.length - 1);
    expect(el().textContent).toContain(`What ${UNPUBLISHED} reads.`);
  });

  it('opens a map whole, and shuts the layer again', async () => {
    await setUp('control_map', CONTROL_MAPS);

    expect(find('.gs-tut-viewer')).toBeNull();

    const trigger = all<HTMLButtonElement>('.gs-ref-map .gs-ref-zoom')[0];
    trigger.click();
    fixture.detectChanges();

    const shown = find<HTMLImageElement>('.gs-tut-viewer-img');
    expect(shown?.getAttribute('src')).toBe(
      all<HTMLImageElement>('.gs-ref-map img')[0].getAttribute('src'),
    );
    expect(find('.gs-tut-viewer-name')?.textContent?.trim()).toBe(DETECTORS[0]);

    find<HTMLButtonElement>('.gs-tut-viewer-x')?.click();
    fixture.detectChanges();
    expect(find('.gs-tut-viewer')).toBeNull();
  });

  it('opens the shared source whole as well', async () => {
    await setUp('control_map', CONTROL_MAPS);

    find<HTMLButtonElement>('.gs-ref-shot-frame--lead .gs-ref-zoom')?.click();
    fixture.detectChanges();

    expect(
      find<HTMLImageElement>('.gs-tut-viewer-img')?.getAttribute('src'),
    ).toBe(`${ALCHEMY_EVIDENCE_ROOT}/sources/anchor.webp`);
  });

  it('offers the way on to where a control map is used', async () => {
    await setUp('control_map', CONTROL_MAPS);

    const links = all<HTMLAnchorElement>('.gs-ref-link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/docs/image/learn/controlnet',
      '/docs/image/settings/source',
    ]);
  });

  it('sends a URL naming no use case back to the list', async () => {
    await setUp('not_a_use_case');

    expect(router.url).toBe('/docs/alchemy');
  });

  it('offers the way on to the next use case', async () => {
    await setUp('describe');

    const onwards = all<HTMLAnchorElement>('.gs-ref-onward');
    expect(onwards.map((link) => link.getAttribute('href'))).toEqual([
      '/docs/alchemy/control_map',
    ]);
  });
});
