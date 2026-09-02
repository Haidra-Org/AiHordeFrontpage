import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LICENSING_RETRY_MS,
  LICENSING_TTL_MS,
  LicensingService,
  annotatorAssetName,
  coerceAssetPage,
  coerceLicenseDefinition,
  controlnetAssetName,
  postProcessorCategory,
  prohibitedFacts,
  worstLicensingFact,
  type LicensingStatus,
  type NamedLicensingFact,
} from './licensing.service';

const LICENSING_URL =
  'https://models.aihorde.net/api/model_references/v2/licensing';
const CACHE_KEY = 'aihorde.licensing';
const CACHE_VERSION = 1;
const OPENRAIL_DEFINITION_URL = `${LICENSING_URL}/licenses/OpenRAIL-M`;

function assetsUrl(category: string, offset = 0): string {
  return `${LICENSING_URL}/assets?category=${category}&limit=500&offset=${offset}`;
}

/** One asset as the export publishes it, trimmed to the fields the site reads. */
function asset(
  identifier: string,
  licensing: Record<string, unknown>,
  definitionUrls: Record<string, string> = {},
): Record<string, unknown> {
  return {
    asset_identifier: identifier,
    display_name: identifier.split(':')[1],
    licensing,
    definition_urls: definitionUrls,
  };
}

const MODEL_PAGE = {
  items: [
    asset(
      'image_generation:Deliberate',
      {
        license_expression: 'OpenRAIL-M',
        license_ids: ['OpenRAIL-M'],
        commercial_use: 'allowed_with_conditions',
        obligations: ['include_license', 'responsible_use_restrictions'],
      },
      { 'OpenRAIL-M': '/model_references/v2/licensing/licenses/OpenRAIL-M' },
    ),
    asset('image_generation:Stable Cascade 1.0', {
      license_expression: 'LicenseRef-Stable-Cascade-NC-Community',
      license_ids: ['LicenseRef-Stable-Cascade-NC-Community'],
      commercial_use: 'prohibited',
      obligations: [],
    }),
    { asset_identifier: 'image_generation:Broken' },
  ],
  total: 2,
  offset: 0,
  limit: 500,
  metadata: { schema_version: 1, revision: 5, updated_at: 1787893046 },
};

const CONTROLNET_PAGE = {
  items: [
    asset('controlnet:control_openpose', {
      license_expression: 'OpenRAIL-M',
      license_ids: ['OpenRAIL-M'],
      commercial_use: 'allowed_with_conditions',
      obligations: ['include_license'],
    }),
    asset('controlnet:control_openpose_sd2', {
      license_expression: 'LicenseRef-thibaud-controlnet-sd21',
      license_ids: ['LicenseRef-thibaud-controlnet-sd21'],
      commercial_use: 'unknown',
      obligations: [],
    }),
    asset('controlnet:control_hough', {
      license_expression: 'OpenRAIL-M',
      license_ids: ['OpenRAIL-M'],
      commercial_use: 'allowed_with_conditions',
      obligations: [],
    }),
  ],
  total: 3,
};

const ANNOTATOR_PAGE = {
  items: [
    asset('controlnet_annotator:annotator_openpose', {
      license_expression: 'LicenseRef-OpenPose-NonCommercial',
      license_ids: ['LicenseRef-OpenPose-NonCommercial'],
      commercial_use: 'prohibited',
      obligations: [],
    }),
    asset('controlnet_annotator:annotator_mlsd', {
      license_expression: 'Apache-2.0',
      license_ids: ['Apache-2.0'],
      commercial_use: 'allowed',
      obligations: ['include_license'],
    }),
  ],
  total: 2,
};

const ESRGAN_PAGE = {
  items: [
    asset('esrgan:RealESRGAN_x2plus', {
      license_expression: 'LicenseRef-S-Lab-1.0',
      license_ids: ['LicenseRef-S-Lab-1.0'],
      commercial_use: 'prohibited',
      obligations: [],
    }),
  ],
  total: 1,
};

function setup(): {
  service: LicensingService;
  http: HttpTestingController;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(LicensingService),
    http: TestBed.inject(HttpTestingController),
  };
}

/** Answer whatever licence definitions the assets just read asked for. */
function flushDefinitions(http: HttpTestingController): void {
  for (const request of http.match(
    (candidate) => candidate.url.indexOf('/licenses/') !== -1,
  )) {
    request.flush({ name: 'A licence', canonical_url: 'https://licence' });
  }
}

/** A fact with only the status the assertion is about. */
function named(name: string, status: LicensingStatus): NamedLicensingFact {
  return {
    name,
    fact: {
      status,
      licenseId: 'X',
      licenseName: null,
      licenseUrl: null,
      obligations: [],
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('coerceAssetPage', () => {
  it('reads the fields a licence line shows, and skips what it cannot read', () => {
    const assets = coerceAssetPage(MODEL_PAGE);

    expect([...assets.keys()]).toEqual([
      'image_generation:Deliberate',
      'image_generation:Stable Cascade 1.0',
    ]);
    expect(assets.get('image_generation:Deliberate')).toEqual({
      status: 'allowed_with_conditions',
      licenseId: 'OpenRAIL-M',
      licenseIds: ['OpenRAIL-M'],
      obligations: ['include_license', 'responsible_use_restrictions'],
      definitionUrls: {
        'OpenRAIL-M': '/model_references/v2/licensing/licenses/OpenRAIL-M',
      },
    });
  });

  it('folds a status it does not know onto unknown, and a new condition onto other', () => {
    const assets = coerceAssetPage({
      items: [
        asset('esrgan:Odd', {
          license_expression: 'MIT',
          license_ids: ['MIT'],
          commercial_use: 'maybe',
          obligations: ['attribution', 'something_new'],
        }),
      ],
    });

    expect(assets.get('esrgan:Odd')?.status).toBe('unknown');
    expect(assets.get('esrgan:Odd')?.obligations).toEqual([
      'attribution',
      'other',
    ]);
  });

  it('tolerates a payload that is not a page', () => {
    expect(coerceAssetPage(null).size).toBe(0);
    expect(coerceAssetPage({ items: 'nope' }).size).toBe(0);
  });
});

describe('coerceLicenseDefinition', () => {
  it('keeps the name and the address of the text', () => {
    expect(
      coerceLicenseDefinition({
        name: 'CreativeML Open RAIL-M',
        canonical_url: 'https://example.invalid/rail',
        spdx_identifier: null,
      }),
    ).toEqual({
      name: 'CreativeML Open RAIL-M',
      canonicalUrl: 'https://example.invalid/rail',
    });
    expect(coerceLicenseDefinition({ name: '', canonical_url: '' })).toEqual({
      name: null,
      canonicalUrl: null,
    });
    expect(coerceLicenseDefinition(null)).toBeNull();
  });
});

describe('asset name conventions', () => {
  it('maps a control type onto its ControlNet model, SD2 apart', () => {
    expect(controlnetAssetName('openpose', 'stable_diffusion_1')).toBe(
      'control_openpose',
    );
    expect(controlnetAssetName('openpose', null)).toBe('control_openpose');
    expect(controlnetAssetName('openpose', 'stable_diffusion_2')).toBe(
      'control_openpose_sd2',
    );
  });

  it('maps a control type onto its detector, hough and mlsd being one', () => {
    expect(annotatorAssetName('openpose')).toBe('annotator_openpose');
    expect(annotatorAssetName('hough')).toBe('annotator_mlsd');
    expect(annotatorAssetName('mlsd')).toBe('annotator_mlsd');
  });

  it('files each post-processor under the project its weights came from', () => {
    expect(postProcessorCategory('CodeFormers')).toBe('codeformer');
    expect(postProcessorCategory('GFPGAN')).toBe('gfpgan');
    expect(postProcessorCategory('GFPGANv1.3')).toBe('gfpgan');
    expect(postProcessorCategory('RestoreFormer')).toBe('gfpgan');
    expect(postProcessorCategory('RealESRGAN_x4plus')).toBe('esrgan');
    expect(postProcessorCategory('4x_AnimeSharp')).toBe('esrgan');
  });
});

describe('worstLicensingFact', () => {
  it('names the model that leaves the reader with the most doubt', () => {
    expect(
      worstLicensingFact([
        named('A', 'allowed'),
        named('B', 'prohibited'),
        named('C', 'unknown'),
      ])?.name,
    ).toBe('B');
    expect(
      worstLicensingFact([
        named('A', 'allowed'),
        named('B', 'allowed_with_conditions'),
        named('C', 'unknown'),
      ])?.name,
    ).toBe('C');
  });

  it('keeps the first entry when nothing outranks it, and answers an empty list', () => {
    expect(
      worstLicensingFact([named('A', 'allowed'), named('B', 'allowed')])?.name,
    ).toBe('A');
    expect(worstLicensingFact([])).toBeNull();
  });

  it('picks out the licences that forbid commercial use', () => {
    expect(
      prohibitedFacts([named('A', 'allowed'), named('B', 'prohibited')]).map(
        (entry) => entry.name,
      ),
    ).toEqual(['B']);
  });
});

describe('LicensingService', () => {
  it('answers with the licence a category publishes, once it has answered', () => {
    const { service, http } = setup();
    const fact = service.commercialUse('image_generation', 'Deliberate');

    expect(fact()).toBeNull();
    http.expectOne(assetsUrl('image_generation')).flush(MODEL_PAGE);
    flushDefinitions(http);

    expect(fact()?.status).toBe('allowed_with_conditions');
    expect(fact()?.licenseId).toBe('OpenRAIL-M');
    expect(fact()?.obligations).toEqual([
      'include_license',
      'responsible_use_restrictions',
    ]);
  });

  it('links the licence definition once it has been read', () => {
    const { service, http } = setup();
    const fact = service.commercialUse('image_generation', 'Deliberate');
    http.expectOne(assetsUrl('image_generation')).flush(MODEL_PAGE);

    // Until the definition lands the API's own address for it stands in.
    expect(fact()?.licenseUrl).toBe(
      `https://models.aihorde.net/api${'/model_references/v2/licensing/licenses/OpenRAIL-M'}`,
    );
    http.expectOne(OPENRAIL_DEFINITION_URL).flush({
      name: 'CreativeML Open RAIL-M',
      canonical_url: 'https://example.invalid/rail',
    });

    expect(fact()?.licenseName).toBe('CreativeML Open RAIL-M');
    expect(fact()?.licenseUrl).toBe('https://example.invalid/rail');
  });

  it('reads an asset the category does not list as not yet reviewed', () => {
    const { service, http } = setup();
    const fact = service.commercialUse('image_generation', 'Nobody knows');
    http.expectOne(assetsUrl('image_generation')).flush(MODEL_PAGE);
    flushDefinitions(http);

    expect(fact()).toEqual({
      status: 'unknown',
      licenseId: '',
      licenseName: null,
      licenseUrl: null,
      obligations: [],
    });
  });

  it('says nothing when the fetch fails, and asks again after the backoff', () => {
    const { service, http } = setup();
    const fact = service.commercialUse('image_generation', 'Deliberate');
    http
      .expectOne(assetsUrl('image_generation'))
      .error(new ProgressEvent('failed'));

    expect(fact()).toBeNull();

    service.commercialUse('image_generation', 'Deliberate');
    http.expectNone(assetsUrl('image_generation'));

    const later = Date.now() + LICENSING_RETRY_MS + 1;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    service.commercialUse('image_generation', 'Deliberate');
    http.expectOne(assetsUrl('image_generation')).flush(MODEL_PAGE);
    flushDefinitions(http);

    expect(fact()?.status).toBe('allowed_with_conditions');
  });

  it('walks the pages a category is split over', () => {
    const { service, http } = setup();
    const fact = service.commercialUse('image_generation', 'Second page');
    http.expectOne(assetsUrl('image_generation')).flush({
      items: MODEL_PAGE.items,
      total: 501,
      offset: 0,
      limit: 500,
    });
    http.expectOne(assetsUrl('image_generation', 500)).flush({
      items: [
        asset('image_generation:Second page', {
          license_expression: 'MIT',
          license_ids: ['MIT'],
          commercial_use: 'allowed',
          obligations: [],
        }),
      ],
      total: 501,
      offset: 500,
      limit: 500,
    });
    flushDefinitions(http);

    expect(fact()?.status).toBe('allowed');
    expect(
      service.commercialUse('image_generation', 'Deliberate')()?.status,
    ).toBe('allowed_with_conditions');
  });

  it('gives a control type its ControlNet model and its detector', () => {
    const { service, http } = setup();
    const facts = service.controlTypeFacts('openpose', null, false);
    http.expectOne(assetsUrl('controlnet')).flush(CONTROLNET_PAGE);
    http.expectOne(assetsUrl('controlnet_annotator')).flush(ANNOTATOR_PAGE);
    flushDefinitions(http);

    expect(facts().map((entry) => [entry.name, entry.fact.status])).toEqual([
      ['control_openpose', 'allowed_with_conditions'],
      ['annotator_openpose', 'prohibited'],
    ]);
  });

  it('leaves the detector out when the reader supplies the map', () => {
    const { service, http } = setup();
    const facts = service.controlTypeFacts('openpose', null, true);
    http.expectOne(assetsUrl('controlnet')).flush(CONTROLNET_PAGE);
    http.expectNone(assetsUrl('controlnet_annotator'));
    flushDefinitions(http);

    expect(facts().map((entry) => entry.name)).toEqual(['control_openpose']);
  });

  it('takes the SD2 ControlNet on an SD2 model, and reads hough as mlsd', () => {
    const { service, http } = setup();
    const sd2 = service.controlTypeFacts(
      'openpose',
      'stable_diffusion_2',
      true,
    );
    const hough = service.controlTypeFacts('hough', null, false);
    http.expectOne(assetsUrl('controlnet')).flush(CONTROLNET_PAGE);
    http.expectOne(assetsUrl('controlnet_annotator')).flush(ANNOTATOR_PAGE);
    flushDefinitions(http);

    expect(sd2().map((entry) => entry.name)).toEqual(['control_openpose_sd2']);
    expect(hough().map((entry) => entry.name)).toEqual([
      'control_hough',
      'annotator_mlsd',
    ]);
  });

  it('says nothing about an asset the reference does not list at all', () => {
    const { service, http } = setup();
    const facts = service.controlTypeFacts('pyracanny', null, false);
    http.expectOne(assetsUrl('controlnet')).flush(CONTROLNET_PAGE);
    http.expectOne(assetsUrl('controlnet_annotator')).flush(ANNOTATOR_PAGE);
    flushDefinitions(http);

    expect(facts()).toEqual([]);
  });

  it('persists what it read, with the export revision it read at', () => {
    const { service, http } = setup();
    service.commercialUse('image_generation', 'Deliberate');
    http.expectOne(assetsUrl('image_generation')).flush(MODEL_PAGE);
    flushDefinitions(http);

    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    expect(cached.version).toBe(CACHE_VERSION);
    expect(cached.revision).toBe(5);
    expect(cached.updatedAt).toBe(1787893046);
    expect(cached.categories).toEqual(['image_generation']);
    expect(cached.assets['image_generation:Deliberate'].licenseId).toBe(
      'OpenRAIL-M',
    );
  });

  it('serves a fresh persisted copy without a request', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        version: CACHE_VERSION,
        fetchedAt: Date.now(),
        revision: 5,
        updatedAt: 1787893046,
        categories: ['esrgan'],
        assets: {
          'esrgan:RealESRGAN_x2plus': {
            status: 'prohibited',
            licenseId: 'LicenseRef-S-Lab-1.0',
            licenseIds: ['LicenseRef-S-Lab-1.0'],
            obligations: [],
            definitionUrls: {},
          },
        },
        licenses: {
          'LicenseRef-S-Lab-1.0': {
            name: 'S-Lab 1.0',
            canonicalUrl: 'https://example.invalid/slab',
          },
        },
      }),
    );
    const { service, http } = setup();
    const fact = service.commercialUse('esrgan', 'RealESRGAN_x2plus');

    http.expectNone(assetsUrl('esrgan'));
    expect(fact()?.status).toBe('prohibited');
    expect(fact()?.licenseName).toBe('S-Lab 1.0');
    expect(fact()?.licenseUrl).toBe('https://example.invalid/slab');
  });

  it('reads a persisted copy again once it is older than the TTL', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        version: CACHE_VERSION,
        fetchedAt: Date.now() - LICENSING_TTL_MS - 1,
        revision: 4,
        updatedAt: 1,
        categories: ['esrgan'],
        assets: {
          'esrgan:RealESRGAN_x2plus': {
            status: 'allowed',
            licenseId: 'MIT',
            licenseIds: ['MIT'],
            obligations: [],
            definitionUrls: {},
          },
        },
        licenses: {},
      }),
    );
    const { service, http } = setup();
    const fact = service.commercialUse('esrgan', 'RealESRGAN_x2plus');

    expect(fact()?.status).toBe('allowed');
    http.expectOne(assetsUrl('esrgan')).flush(ESRGAN_PAGE);
    flushDefinitions(http);

    expect(fact()?.status).toBe('prohibited');
  });

  it('drops a persisted copy written by an older shape', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        fetchedAt: Date.now(),
        categories: ['esrgan'],
        assets: {},
        licenses: {},
      }),
    );
    const { service, http } = setup();
    const fact = service.commercialUse('esrgan', 'RealESRGAN_x2plus');

    expect(fact()).toBeNull();
    http.expectOne(assetsUrl('esrgan')).flush(ESRGAN_PAGE);
    flushDefinitions(http);

    expect(fact()?.status).toBe('prohibited');
  });
});
