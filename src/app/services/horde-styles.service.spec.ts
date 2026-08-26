import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  HordeStylesService,
  indexStyleCategories,
} from './horde-styles.service';

const STYLES_URL =
  'https://raw.githubusercontent.com/Haidra-Org/AI-Horde-Styles/main/styles.json';
const CATEGORIES_URL =
  'https://raw.githubusercontent.com/Haidra-Org/AI-Horde-Styles/main/categories.json';

describe('indexStyleCategories', () => {
  it('inverts the category map and drops names missing from the catalogue', () => {
    const catalog = {
      alpha: { prompt: '{p}{np}' },
      beta: { prompt: '{p}{np}' },
    };
    const categories = {
      featured: ['alpha', 'ghost'],
      new: ['alpha', 'beta'],
    };

    const index = indexStyleCategories(catalog, categories);

    expect(index.get('alpha')).toEqual(['featured', 'new']);
    expect(index.get('beta')).toEqual(['new']);
    expect(index.has('ghost')).toBe(false);
  });
});

describe('HordeStylesService', () => {
  let service: HordeStylesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HordeStylesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('lists styles with the categories they belong to', async () => {
    const promise = firstValueFrom(service.getStyles());

    http.expectOne(STYLES_URL).flush({
      flux: { prompt: '{p}{np}', model: 'Flux.1' },
      raw: { prompt: '{p}{np}', model: 'stable_diffusion' },
    });
    http.expectOne(CATEGORIES_URL).flush({ featured: ['flux'] });

    const styles = await promise;
    const flux = styles.find((s) => s.name === 'flux');
    const raw = styles.find((s) => s.name === 'raw');
    expect(flux?.categories).toEqual(['featured']);
    expect(raw?.categories).toEqual([]);
  });

  it('groups categories and drops style names missing from the catalogue', async () => {
    const promise = firstValueFrom(service.getCategoryGroups());

    http.expectOne(STYLES_URL).flush({ flux: { prompt: '{p}{np}' } });
    http
      .expectOne(CATEGORIES_URL)
      .flush({ featured: ['flux', 'ghost'], empty: ['ghost'] });

    const groups = await promise;
    expect(groups).toEqual([{ category: 'featured', styleNames: ['flux'] }]);
  });

  it('resolves to an empty catalogue when the fetch fails', async () => {
    const promise = firstValueFrom(service.getStyles());

    http.expectOne(STYLES_URL).error(new ProgressEvent('error'));
    http.expectOne(CATEGORIES_URL).flush({});

    expect(await promise).toEqual([]);
  });
});
