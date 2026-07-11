import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  applyStyle,
  applyStylePrompt,
  HordeStylePreset,
  HordeStylesService,
  indexStyleCategories,
} from './horde-styles.service';

const STYLES_URL =
  'https://raw.githubusercontent.com/Haidra-Org/AI-Horde-Styles/main/styles.json';
const CATEGORIES_URL =
  'https://raw.githubusercontent.com/Haidra-Org/AI-Horde-Styles/main/categories.json';

describe('applyStylePrompt', () => {
  it('injects the positive prompt and drops an empty {np}', () => {
    expect(applyStylePrompt('{p}{np}', 'a fox', '')).toBe('a fox');
  });

  it('folds a negative prompt into a bare {np} with the horde separator', () => {
    expect(applyStylePrompt('{p}{np}', 'a fox', 'blurry')).toBe(
      'a fox ### blurry',
    );
  });

  it('does not double the separator when the template already spells ###', () => {
    expect(applyStylePrompt('{p} ### {np}', 'a fox', 'blurry')).toBe(
      'a fox ### blurry',
    );
  });

  it('places {np} inline when the template positions it mid-string', () => {
    expect(
      applyStylePrompt('art deco {p}, ornate {np}', 'a fox', 'blurry'),
    ).toBe('art deco a fox, ornate ### blurry');
  });

  it('appends a negative when the template omits {np} entirely', () => {
    expect(applyStylePrompt('vintage {p}', 'a fox', 'blurry')).toBe(
      'vintage a fox ### blurry',
    );
  });

  it('leaves a template without {np} unchanged when there is no negative', () => {
    expect(applyStylePrompt('vintage {p}', 'a fox', '')).toBe('vintage a fox');
  });

  it('prepends the positive prompt when the template omits {p}', () => {
    expect(applyStylePrompt('masterpiece', 'a fox', '')).toBe(
      'a fox masterpiece',
    );
  });
});

describe('applyStyle', () => {
  it('forces declared params and maps loras', () => {
    const preset: HordeStylePreset = {
      prompt: '{p}{np}',
      model: 'SDXL 1.0',
      steps: 8,
      width: 1024,
      height: 1024,
      cfg_scale: 2,
      sampler_name: 'k_dpmpp_sde',
      karras: false,
      loras: [{ name: '247778', is_version: true }],
    };

    const applied = applyStyle(preset, 'a castle', 'blurry');

    expect(applied.prompt).toBe('a castle ### blurry');
    expect(applied.forcedParams).toEqual({
      model: 'SDXL 1.0',
      steps: 8,
      width: 1024,
      height: 1024,
      cfg_scale: 2,
      sampler_name: 'k_dpmpp_sde',
      karras: false,
      loras: [{ name: '247778', is_version: true }],
    });
  });

  it('omits undeclared params and carries lora/ti strengths through', () => {
    const preset: HordeStylePreset = {
      prompt: 'sketch of {p}',
      loras: [{ name: 'MyLora', model: 0.8, clip: 0.5 }],
      tis: [{ name: '7808', inject_ti: 'negprompt', strength: 0.6 }],
    };

    const applied = applyStyle(preset, 'a fox', '');

    expect(applied.prompt).toBe('sketch of a fox');
    expect(applied.forcedParams.model).toBeUndefined();
    expect(applied.forcedParams.steps).toBeUndefined();
    expect(applied.forcedParams.loras).toEqual([
      { name: 'MyLora', model: 0.8, clip: 0.5 },
    ]);
    expect(applied.forcedParams.tis).toEqual([
      { name: '7808', inject_ti: 'negprompt', strength: 0.6 },
    ]);
  });
});

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
