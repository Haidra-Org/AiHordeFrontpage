import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { DocsAlchemyHomeComponent } from './alchemy-home.component';
import {
  ALCHEMY_EVIDENCE_ROOT,
  AlchemyEvidenceManifest,
} from '../../../content/alchemy-evidence';
import { ALCHEMY_USE_CASES } from '../../../content/alchemy-usecases';
import en from '../../../../assets/i18n/en.json';

const manifestUrl = `${ALCHEMY_EVIDENCE_ROOT}/manifest.json`;

const PUBLISHED: AlchemyEvidenceManifest = {
  generated_against: 'https://aihorde.net/api/v2',
  entries: [
    {
      use_case: 'enlarge',
      form: 'RealESRGAN_x4plus',
      title: 'Four times',
      files: {
        source: 'enlarge/source.webp',
        result: 'enlarge/realesrgan.webp',
      },
    },
  ],
};

describe('DocsAlchemyHomeComponent', () => {
  let fixture: ComponentFixture<DocsAlchemyHomeComponent>;
  let http: HttpTestingController;

  const query = <T extends Element>(selector: string): T[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector),
    );

  const text = (): string =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        DocsAlchemyHomeComponent,
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

    fixture = TestBed.createComponent(DocsAlchemyHomeComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('lists every use case, linked to its own page', () => {
    http.expectOne(manifestUrl).flush({ generated_against: '', entries: [] });
    fixture.detectChanges();

    const links = query<HTMLAnchorElement>('a.gs-ref-card');
    expect(links.length).toBe(ALCHEMY_USE_CASES.length);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      ALCHEMY_USE_CASES.map((useCase) => `/docs/alchemy/${useCase.id}`),
    );
  });

  it('names each use case in words rather than by its id', () => {
    http.expectOne(manifestUrl).flush({ generated_against: '', entries: [] });
    fixture.detectChanges();

    expect(text()).toContain('Image enlargement');
    expect(text()).toContain('Background removal');
    expect(text()).not.toContain('alchemy.usecases.');
  });

  it('shows no pictures where the library has published none', () => {
    http
      .expectOne(manifestUrl)
      .error(new ProgressEvent('error'), { status: 404, statusText: 'nope' });
    fixture.detectChanges();

    expect(query('img.gs-ref-card-img')).toHaveLength(0);
    expect(query('a.gs-ref-card')).toHaveLength(ALCHEMY_USE_CASES.length);
  });

  it('leads a card with what a published run of it produced', async () => {
    http.expectOne(manifestUrl).flush(PUBLISHED);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const images = query<HTMLImageElement>('img.gs-ref-card-img');
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe(
      `${ALCHEMY_EVIDENCE_ROOT}/enlarge/realesrgan.webp`,
    );
  });
});
