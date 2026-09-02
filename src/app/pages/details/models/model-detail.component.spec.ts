import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { computed, signal } from '@angular/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import en from '../../../../assets/i18n/en.json';
import {
  imageSettingRows,
  midpoint,
  ModelDetailComponent,
  recommendedRequest,
  textSettingRows,
} from './model-detail.component';
import { AiHordeService } from '../../../services/ai-horde.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { ModelReferenceService } from '../../../services/model-reference.service';
import { TranslatorService } from '../../../services/translator.service';
import {
  LicensingService,
  type LicensingFact,
} from '../../../services/licensing.service';
import { parseStudioLink } from '../../generate/studio-link';
import { detailsRoutes } from '../details.routes';

const IMAGE_RECORD = {
  name: 'Deliberate',
  baseline: 'stable_diffusion_1',
  type: 'ckpt',
  description: 'A generalist model.',
  version: '2',
  style: 'generalist',
  nsfw: false,
  inpainting: false,
  homepage: 'https://civitai.com/models/4823',
  showcases: ['https://example.invalid/one.webp'],
  trigger: ['deliberate style'],
  tags: ['photorealistic'],
  size_on_disk_bytes: 2132780730,
  min_bridge_version: null,
  requirements: {
    min_steps: 20,
    max_steps: 30,
    min_cfg_scale: 6,
    max_cfg_scale: 8,
    clip_skip: 2,
    samplers: ['k_dpmpp_sde'],
    schedulers: ['karras'],
  },
  downloads: [],
  optimization: null,
};

const WORKERS = [
  { id: 'w1', name: 'Alpha', type: 'image', models: ['Deliberate'] },
  { id: 'w2', name: 'Beta', type: 'image', models: ['Something Else'] },
];

/**
 * What the licensing export answers for this model on the next page opened.
 * Null is the answer before it has been read, which draws no row at all.
 */
let licensingFact: LicensingFact | null = null;

function configure(): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [
      ModelDetailComponent,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: 'details', children: detailsRoutes }]),
      {
        provide: AiHordeService,
        useValue: {
          getImageModels: () =>
            of([
              {
                name: 'Deliberate',
                count: 3,
                queued: 1_500_000,
                jobs: 2,
                eta: 45,
                performance: 2_000_000,
                type: 'image',
              },
            ]),
          getTextModels: () => of([]),
          getImageModelStats: () =>
            of({ day: {}, month: { Deliberate: 400 }, total: {} }),
          getTextModelStats: () => of({ day: {}, month: {}, total: {} }),
        },
      },
      {
        provide: AdminWorkerService,
        useValue: { getWorkers: () => of(WORKERS) },
      },
      {
        provide: ModelReferenceService,
        useValue: {
          names: signal(['Deliberate']),
          textNames: signal(['some/text-model']),
          records: signal(new Map([['Deliberate', IMAGE_RECORD]])),
          textRecords: signal(new Map()),
          load: () => undefined,
          loadText: () => undefined,
          recordFor: (name: string) =>
            name === 'Deliberate' ? IMAGE_RECORD : null,
          textRecordFor: () => null,
        },
      },
      { provide: TranslatorService, useValue: { get: () => of('') } },
      {
        provide: LicensingService,
        useValue: { commercialUse: () => computed(() => licensingFact) },
      },
    ],
  });
}

/** Open the page through the router, so it reads the address it is written for. */
async function open(path: string): Promise<RouterTestingHarness> {
  configure();
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(path, ModelDetailComponent);
  harness.detectChanges();
  await harness.fixture.whenStable();
  harness.detectChanges();
  return harness;
}

describe('midpoint', () => {
  it('takes the middle of a range and the one end of a half one', () => {
    expect(midpoint(20, 30)).toBe(25);
    expect(midpoint(1, 4)).toBe(2.5);
    expect(midpoint(8, undefined)).toBe(8);
    expect(midpoint(undefined, undefined)).toBeNull();
  });
});

describe('recommendedRequest', () => {
  it('names the model and takes the middle of every range', () => {
    const request = recommendedRequest('Deliberate', IMAGE_RECORD.requirements);

    expect(request.models).toEqual(['Deliberate']);
    expect(request.params?.steps).toBe(25);
    expect(request.params?.cfg_scale).toBe(7);
    expect(request.params?.clip_skip).toBe(2);
    expect(request.params?.sampler_name).toBe('k_dpmpp_sde');
    expect(request.params?.scheduler).toBe('karras');
  });

  it('prefers an exact guidance to a range, and drops a scheduler the form has no name for', () => {
    const request = recommendedRequest('X', {
      cfg_scale: 3,
      min_cfg_scale: 1,
      max_cfg_scale: 9,
      schedulers: ['not_a_scheduler'],
    });

    expect(request.params?.cfg_scale).toBe(3);
    expect(request.params?.scheduler).toBeUndefined();
  });

  it('carries only the model when nothing is recommended', () => {
    const request = recommendedRequest('X', null);

    expect(request.models).toEqual(['X']);
    expect(request.params).toBeUndefined();
  });
});

describe('setting rows', () => {
  it('prints a range as its two ends and leaves out what is absent', () => {
    const rows = imageSettingRows({ min_steps: 20, max_steps: 30 });

    expect(rows).toEqual([
      { labelKey: 'details.model_detail.setting.steps', value: '20 to 30' },
    ]);
  });

  it('has no rows at all when a model recommends nothing', () => {
    expect(imageSettingRows(null)).toEqual([]);
    expect(textSettingRows(null)).toEqual([]);
  });

  it('prints the sampling settings of a text model', () => {
    const rows = textSettingRows({
      name: 'x',
      display_name: null,
      model_name: null,
      baseline: null,
      parameters: null,
      description: null,
      version: null,
      style: null,
      nsfw: false,
      tags: [],
      url: null,
      instruct_format: null,
      settings: { temperature: 0.7, top_k: 40 },
    });

    expect(rows.map((row) => row.value)).toEqual(['0.7', '40']);
  });
});

describe('ModelDetailComponent', () => {
  let harness: RouterTestingHarness;
  let fixture: ComponentFixture<unknown>;
  let component: ModelDetailComponent;

  beforeEach(async () => {
    harness = await open('/details/models/image/Deliberate');
    fixture = harness.fixture;
    component = harness.routeDebugElement
      ?.componentInstance as ModelDetailComponent;
  });

  it('names the model, its family and what it was published with', () => {
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Deliberate');
    expect(text).toContain('SD 1.5');
    expect(text).toContain('A generalist model.');
    expect(text).toContain('2.0 GB');
  });

  it('shows the published sample and the trigger word', () => {
    const image = fixture.nativeElement.querySelector(
      '.model-detail-stage img',
    ) as HTMLImageElement;

    expect(image.getAttribute('src')).toBe('https://example.invalid/one.webp');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(fixture.nativeElement.textContent).toContain('deliberate style');
  });

  it('names only the workers actually running the model', () => {
    const links = [
      ...fixture.nativeElement.querySelectorAll('.model-detail-workers a'),
    ] as HTMLAnchorElement[];

    expect(links.map((link) => link.textContent?.trim())).toEqual(['Alpha']);
    expect(links[0].getAttribute('href')).toBe('/details/workers/id/w1');
  });

  it('prints the recommended settings as the reference gives them', () => {
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('20 to 30');
    expect(text).toContain('6 to 8');
    expect(text).toContain('k_dpmpp_sde');
  });

  it('opens the studio on a link the studio reads back as this model', () => {
    const address = component.studioAddress();
    expect(address).not.toBeNull();

    const query = new URLSearchParams(
      (address ?? '').slice((address ?? '').indexOf('?')),
    );
    const payload = parseStudioLink({
      get: (key: string) => query.get(key),
    } as never);

    expect(payload?.request.models).toEqual(['Deliberate']);
    expect(payload?.request.params?.steps).toBe(25);
    expect(payload?.request.params?.cfg_scale).toBe(7);
  });
});

describe('ModelDetailComponent on an address that names only a model', () => {
  it('reads the kind off the reference and rewrites the address', async () => {
    await open('/details/models/name/Deliberate');

    expect(TestBed.inject(Router).url).toBe('/details/models/image/Deliberate');
  });
});

describe('ModelDetailComponent licence row', () => {
  afterEach(() => {
    licensingFact = null;
  });

  it('says what the licence allows, links it and lists its conditions', async () => {
    licensingFact = {
      status: 'allowed_with_conditions',
      licenseId: 'OpenRAIL-M',
      licenseName: 'CreativeML Open RAIL-M',
      licenseUrl: 'https://example.invalid/rail',
      obligations: ['attribution', 'include_license'],
    };
    const harness = await open('/details/models/image/Deliberate');
    const host = harness.fixture.nativeElement as HTMLElement;
    const row = [...host.querySelectorAll('.model-detail-fact')].find(
      (entry) =>
        entry.querySelector('dt')?.textContent?.trim() === 'Commercial use',
    );

    expect(row).toBeDefined();
    const text = row!.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    expect(text).toContain('Allowed with conditions.');
    expect(text).toContain('CreativeML Open RAIL-M');
    expect(text).toContain(
      'Conditions: credit the authors, include the licence.',
    );
    const link = row!.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://example.invalid/rail');
    expect(link.textContent?.trim()).toBe('OpenRAIL-M');
  });

  it('draws no row while the export has not answered', async () => {
    const harness = await open('/details/models/image/Deliberate');
    const host = harness.fixture.nativeElement as HTMLElement;

    expect(host.textContent).not.toContain('Commercial use');
  });
});
