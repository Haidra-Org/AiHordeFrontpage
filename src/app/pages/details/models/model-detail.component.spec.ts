import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { computed, signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { ScrollLockService } from '../../../helper/scroll-lock';
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
      {
        provide: ScrollLockService,
        useValue: { acquire: vi.fn(), release: vi.fn() },
      },
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
          getClassifiedTextModels: () => of([]),
          getChatTextModels: () => of([]),
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

describe('ModelDetailComponent text classification', () => {
  it.each([false, true, undefined])(
    'keeps backend classification %s separate from absent metadata',
    async (custom) => {
      configure();
      const name = 'Canonical.IQ4_XS::worker';
      vi.spyOn(
        TestBed.inject(AiHordeService),
        'getClassifiedTextModels',
      ).mockReturnValue(of([{ name, count: 2, custom }]));
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(
        `/details/models/text/${name}`,
        ModelDetailComponent,
      );
      await harness.fixture.whenStable();
      harness.detectChanges();
      const host = harness.fixture.nativeElement as HTMLElement;
      expect(host.querySelector('.models-mark--custom') !== null).toBe(
        custom === true,
      );
      expect(host.textContent?.includes('Classification unavailable')).toBe(
        custom === undefined,
      );
      expect(host.textContent).toContain(name);
      expect(host.textContent).not.toContain('No model is called');
    },
  );
});

describe('ModelDetailComponent chat jobs', () => {
  const name = 'koboldcpp/Some-Chat-Model';

  async function openText(
    chatModels: ReturnType<AiHordeService['getChatTextModels']>,
    count = 1,
  ): Promise<HTMLElement> {
    configure();
    vi.spyOn(
      TestBed.inject(AiHordeService),
      'getChatTextModels',
    ).mockReturnValue(chatModels);
    vi.spyOn(
      TestBed.inject(AiHordeService),
      'getClassifiedTextModels',
    ).mockReturnValue(of([{ name, count }]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      `/details/models/text/${encodeURIComponent(name)}`,
      ModelDetailComponent,
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness.fixture.nativeElement as HTMLElement;
  }

  it('shows how many chat workers serve the model, their largest limits and what they declared', async () => {
    const host = await openText(
      of([
        {
          name,
          count: 1,
          chat: {
            workers: 2,
            max_context_length: 16384,
            max_length: 1024,
            features: ['prompt_overflow_refused', 'seed', 'tools'],
            created: 0,
          },
        },
      ]),
    );
    const stat = host.querySelector('[data-model-chat-stat]');
    expect(stat?.textContent).toContain('Chat workers');
    expect(stat?.textContent).toContain('2');
    expect(stat?.textContent).toContain('up to 16,384 tokens of context');

    const card = host.querySelector('[data-model-chat]');
    expect(card?.textContent).toContain('16,384');
    expect(card?.textContent).toContain('1,024');
    const named = Array.from(
      card?.querySelectorAll('[data-chat-capability]') ?? [],
    ).map((el) => el.getAttribute('data-chat-capability'));
    expect(named).toEqual(['seed', 'tools', 'prompt_overflow_refused']);
    expect(card?.textContent).toContain('Refuses long prompts');
    expect(card?.querySelector('.worker-cap--off')).toBeNull();
    expect(
      card?.querySelector(
        '[data-chat-capability="prompt_overflow_refused"] app-icon[name="badge-check"]',
      ),
    ).not.toBeNull();
  });

  it('reports zero chat workers for a model missing from the chat list', async () => {
    const host = await openText(of([]));
    expect(host.querySelector('[data-model-chat-stat]')?.textContent).toContain(
      'no chat worker is online',
    );
    expect(host.querySelector('[data-model-chat]')).toBeNull();
  });

  it('does not call a model idle when only chat workers run it', async () => {
    const host = await openText(
      of([
        {
          name,
          count: 0,
          chat: {
            workers: 1,
            max_context_length: 4096,
            max_length: 256,
            features: [],
            created: 0,
          },
        },
      ]),
      0,
    );
    const summary = host.querySelector('.model-detail-summary')?.textContent;
    expect(summary).toContain('only chat workers are running it');
    expect(summary).not.toContain('nobody is running this model');
  });

  it('hides chat jobs when the chat list cannot be read', async () => {
    const host = await openText(throwError(() => new Error('offline')));
    expect(host.querySelector('[data-model-chat-stat]')).toBeNull();
    expect(host.querySelector('[data-model-chat]')).toBeNull();
  });

  it('does not show chat jobs on an image model', async () => {
    const harness = await open('/details/models/image/Deliberate');
    const host = harness.fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-model-chat]')).toBeNull();
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
    const [licence, explorer] = [
      ...row!.querySelectorAll<HTMLAnchorElement>('a'),
    ];
    expect(licence.getAttribute('href')).toBe('https://example.invalid/rail');
    expect(licence.textContent?.trim()).toBe('OpenRAIL-M');
    expect(explorer.getAttribute('href')).toBe(
      'https://reference.aihorde.net/categories/image_generation/model/Deliberate',
    );
    expect(explorer.textContent?.trim()).toBe('See the licence record');
  });

  it('draws no row while the export has not answered', async () => {
    const harness = await open('/details/models/image/Deliberate');
    const host = harness.fixture.nativeElement as HTMLElement;

    expect(host.textContent).not.toContain('Commercial use');
  });
});

describe('ModelDetailComponent sample viewer', () => {
  let harness: RouterTestingHarness;
  let component: ModelDetailComponent;
  let host: HTMLElement;
  const samples = [
    'https://example.invalid/one.webp',
    'https://example.invalid/two.webp',
  ];
  const record = signal({ ...IMAGE_RECORD, showcases: [...samples] });
  const dialog = () => host.querySelector<HTMLDialogElement>('dialog')!;
  const stage = () =>
    host.querySelector<HTMLButtonElement>('.model-detail-stage')!;
  const settle = async () => {
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  const openViewer = async () => {
    stage().focus();
    stage().click();
    await settle();
  };

  beforeEach(async () => {
    // jsdom has no native top layer; browser checks cover focus containment.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = true;
      }),
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = false;
        this.dispatchEvent(new Event('close'));
      }),
    });
    record.set({ ...IMAGE_RECORD, showcases: [...samples] });
    configure();
    vi.spyOn(
      TestBed.inject(ModelReferenceService),
      'recordFor',
    ).mockImplementation((name) => (name === 'Deliberate' ? record() : null));
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/details/models/image/Deliberate',
      ModelDetailComponent,
    );
    await settle();
    host = harness.fixture.nativeElement as HTMLElement;
    component = harness.routeDebugElement!
      .componentInstance as ModelDetailComponent;
  });

  afterEach(() => {
    harness?.fixture.destroy();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  it('places identity, samples and live actions before reference information', () => {
    expect(
      [...host.querySelector('.model-detail-columns')!.children].map(
        (el) => el.className,
      ),
    ).toEqual([
      'model-detail-identity',
      'model-detail-preview',
      'model-detail-summary',
      'model-detail-reference',
      'model-detail-main',
    ]);
    expect(host.querySelector('.model-detail-summary a')).not.toBeNull();
  });

  it('shows an explicit missing-sample note without repeating the family', async () => {
    record.set({ ...IMAGE_RECORD, showcases: [] });
    await settle();
    expect(stage()).toBeNull();
    expect(
      host.querySelector('.model-detail-preview')?.textContent?.trim(),
    ).toBe('No sample picture published');
    expect(host.querySelector('.model-detail-strip')).toBeNull();
  });

  it('omits the entire preview for text models, including those without metadata', async () => {
    vi.spyOn(
      TestBed.inject(AiHordeService),
      'getClassifiedTextModels',
    ).mockReturnValue(of([{ name: 'Custom.Text', count: 1, custom: true }]));
    await harness.navigateByUrl(
      '/details/models/text/Custom.Text',
      ModelDetailComponent,
    );
    await settle();
    expect(host.querySelector('.model-detail-preview')).toBeNull();
    expect(host.querySelector('.model-detail-title')?.textContent).toContain(
      'Custom.Text',
    );
    expect(host.textContent).not.toContain('No sample picture published');
  });

  it('opens with Close focused, locks scrolling and restores the trigger on close', async () => {
    const trigger = stage();
    await openViewer();
    expect(dialog().open).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Close the sample picture',
    );
    const lock = TestBed.inject(ScrollLockService);
    expect(lock.acquire).toHaveBeenCalledTimes(1);
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Close the sample picture"]',
      )!
      .click();
    await settle();
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('keeps image clicks open, but closes on backdrop and Escape', async () => {
    await openViewer();
    dialog().querySelector<HTMLImageElement>('img')!.click();
    expect(component.viewerOpen()).toBe(true);
    dialog().click();
    await settle();
    expect(dialog().open).toBe(false);
    await openViewer();
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    await settle();
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog().open).toBe(false);
  });

  it('wraps sample navigation and keeps thumbnails and the counter in sync', async () => {
    await openViewer();
    dialog().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    await settle();
    expect(dialog().querySelector('img')?.getAttribute('src')).toBe(samples[1]);
    expect(
      host.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label'),
    ).toBe('Show sample picture 2');
    expect(dialog().querySelector('[aria-live]')?.textContent?.trim()).toBe(
      '2 of 2',
    );
    dialog()
      .querySelector<HTMLButtonElement>('[aria-label="Next sample picture"]')!
      .click();
    await settle();
    expect(component.currentShowcase()).toBe(samples[0]);
  });

  it('omits navigation for a single sample', async () => {
    record.set({ ...IMAGE_RECORD, showcases: [samples[0]] });
    await settle();
    await openViewer();
    expect(dialog().querySelector('.model-detail-viewer-steps')).toBeNull();
    expect(host.querySelector('.model-detail-strip')).toBeNull();
  });

  it('recovers from a failed image without losing navigation or dismissal', async () => {
    await openViewer();
    dialog().querySelector('img')!.dispatchEvent(new Event('error'));
    await settle();
    expect(stage()).toBeNull();
    expect(dialog().textContent).toContain(
      'Sample picture could not be loaded',
    );
    dialog()
      .querySelector<HTMLButtonElement>('.model-detail-preview-note button')!
      .click();
    await settle();
    expect(stage()).not.toBeNull();
    expect(dialog().querySelector('img')?.getAttribute('src')).toBe(samples[0]);
    dialog().querySelector('img')!.dispatchEvent(new Event('error'));
    await settle();
    dialog()
      .querySelector<HTMLButtonElement>('[aria-label="Next sample picture"]')!
      .click();
    await settle();
    expect(dialog().querySelector('img')?.getAttribute('src')).toBe(samples[1]);
    component.closeViewer();
    expect(dialog().open).toBe(false);
  });

  it('clamps selection when samples change and closes when they disappear', async () => {
    await openViewer();
    component.showShowcase(1);
    record.set({ ...IMAGE_RECORD, showcases: [samples[0]] });
    await settle();
    expect(component.showcaseIndex()).toBe(0);
    expect(dialog().open).toBe(true);
    record.set({ ...IMAGE_RECORD, showcases: [] });
    await settle();
    expect(dialog().open).toBe(false);
    expect(TestBed.inject(ScrollLockService).release).toHaveBeenCalledTimes(1);
  });

  it('resets selection and failures and closes when the route reuses the component', async () => {
    await openViewer();
    component.showShowcase(1);
    await settle();
    dialog().querySelector('img')!.dispatchEvent(new Event('error'));
    await settle();
    await harness.navigateByUrl(
      '/details/models/text/Deliberate',
      ModelDetailComponent,
    );
    await settle();
    expect(component.viewerOpen()).toBe(false);
    expect(component.showcaseIndex()).toBe(0);
    expect(component.failedShowcases().size).toBe(0);
    expect(TestBed.inject(ScrollLockService).release).toHaveBeenCalledTimes(1);
  });

  it('releases the scroll lock when destroyed with the viewer open', async () => {
    await openViewer();
    harness.fixture.destroy();
    expect(TestBed.inject(ScrollLockService).release).toHaveBeenCalledTimes(1);
  });
});
