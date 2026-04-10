import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { GenerationsTabComponent } from './generations-tab.component';
import { AuthService } from '../../services/auth.service';
import { AiHordeService } from '../../services/ai-horde.service';
import { HordeUser } from '../../types/horde-user';
import {
  TrackedGeneration,
  GenerationOutput,
  GenerationStatusResponse,
  GenerationCheckResponse,
  GenerationMetadataStable,
  TextGenerationStatusResponse,
  AlchemyStatusResponse,
  ImageGenerationRequest,
} from '../../types/generation';

// ---------------------------------------------------------------------------
// Factories for test data
// ---------------------------------------------------------------------------

function makeCheck(
  overrides: Partial<GenerationCheckResponse> = {},
): GenerationCheckResponse {
  return {
    finished: 0,
    processing: 0,
    restarted: 0,
    waiting: 1,
    done: false,
    faulted: false,
    wait_time: 30,
    queue_position: 5,
    kudos: 10,
    is_possible: true,
    ...overrides,
  };
}

function makeOutput(
  overrides: Partial<GenerationOutput> = {},
): GenerationOutput {
  return {
    img: 'https://example.com/img1.webp',
    seed: '12345',
    id: 'out-1',
    censored: false,
    model: 'stable_diffusion',
    state: 'ok',
    worker_id: 'w-1',
    worker_name: 'TestWorker',
    ...overrides,
  };
}

function makeImageResult(
  outputs: GenerationOutput[],
  checkOverrides: Partial<GenerationCheckResponse> = {},
): GenerationStatusResponse {
  return {
    ...makeCheck({
      done: true,
      finished: outputs.length,
      waiting: 0,
      ...checkOverrides,
    }),
    generations: outputs,
  };
}

function makeTracked(
  overrides: Partial<TrackedGeneration> = {},
): TrackedGeneration {
  return {
    id: 'gen-1',
    type: 'image',
    check: null,
    result: null,
    done: false,
    faulted: false,
    firstSeenAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test scenarios — each describes a list of TrackedGenerations to render
// ---------------------------------------------------------------------------

interface Scenario {
  name: string;
  generations: TrackedGeneration[];
}

const scenarios: Scenario[] = [
  {
    name: 'single completed image (1 output)',
    generations: [
      makeTracked({
        id: 'img-single',
        done: true,
        result: makeImageResult([makeOutput({ id: 'out-a' })]),
      }),
    ],
  },
  {
    name: 'batch of 2 completed images',
    generations: [
      makeTracked({
        id: 'img-batch',
        done: true,
        result: makeImageResult([
          makeOutput({ id: 'out-a', seed: '111' }),
          makeOutput({ id: 'out-b', seed: '222' }),
        ]),
      }),
    ],
  },
  {
    name: 'censored output',
    generations: [
      makeTracked({
        id: 'img-censored',
        done: true,
        result: makeImageResult([
          makeOutput({ id: 'out-c', censored: true, state: 'censored' }),
        ]),
      }),
    ],
  },
  {
    name: 'output with gen_metadata (lora download_failed)',
    generations: [
      makeTracked({
        id: 'img-meta-warn',
        done: true,
        result: makeImageResult([
          makeOutput({
            id: 'out-d',
            gen_metadata: [
              { type: 'lora', value: 'download_failed', ref: 'civitai:12345' },
            ],
          }),
        ]),
      }),
    ],
  },
  {
    name: 'output with danger metadata (nsfw)',
    generations: [
      makeTracked({
        id: 'img-meta-danger',
        done: true,
        result: makeImageResult([
          makeOutput({
            id: 'out-e',
            gen_metadata: [{ type: 'censorship', value: 'nsfw' }],
          }),
        ]),
      }),
    ],
  },
  {
    name: 'output with multiple metadata entries',
    generations: [
      makeTracked({
        id: 'img-meta-multi',
        done: true,
        result: makeImageResult([
          makeOutput({
            id: 'out-f',
            gen_metadata: [
              { type: 'lora', value: 'download_failed', ref: 'civitai:999' },
              { type: 'ti', value: 'parse_failed' },
              {
                type: 'information',
                value: 'see_ref',
                ref: 'Some helpful info',
              },
            ],
          }),
        ]),
      }),
    ],
  },
  {
    name: 'output without gen_metadata',
    generations: [
      makeTracked({
        id: 'img-no-meta',
        done: true,
        result: makeImageResult([
          makeOutput({ id: 'out-g', gen_metadata: undefined }),
        ]),
      }),
    ],
  },
  {
    name: 'partially completed batch (1 done, 1 still processing)',
    generations: [
      makeTracked({
        id: 'img-partial',
        done: false,
        check: makeCheck({ finished: 1, processing: 1, waiting: 0 }),
      }),
    ],
  },
  {
    name: 'generation still waiting',
    generations: [
      makeTracked({
        id: 'img-waiting',
        done: false,
        check: makeCheck({
          finished: 0,
          processing: 0,
          waiting: 2,
          wait_time: 120,
          queue_position: 15,
        }),
      }),
    ],
  },
  {
    name: 'faulted generation',
    generations: [
      makeTracked({
        id: 'img-faulted',
        done: false,
        faulted: true,
        check: makeCheck({ faulted: true }),
      }),
    ],
  },
  {
    name: 'generation where is_possible is false',
    generations: [
      makeTracked({
        id: 'img-impossible',
        done: false,
        check: makeCheck({ is_possible: false }),
      }),
    ],
  },
  {
    name: 'done but result not yet fetched',
    generations: [
      makeTracked({
        id: 'img-done-no-result',
        done: true,
        check: makeCheck({ done: true, finished: 1, waiting: 0 }),
        result: null,
      }),
    ],
  },
  {
    name: 'no generations at all',
    generations: [],
  },
  {
    name: 'mixed types (image + text + alchemy)',
    generations: [
      makeTracked({
        id: 'img-mix',
        type: 'image',
        done: true,
        result: makeImageResult([makeOutput({ id: 'mix-out' })]),
      }),
      makeTracked({
        id: 'txt-mix',
        type: 'text',
        done: true,
        result: {
          finished: 1,
          processing: 0,
          restarted: 0,
          waiting: 0,
          done: true,
          faulted: false,
          wait_time: 0,
          queue_position: 0,
          kudos: 5,
          is_possible: true,
          generations: [
            {
              text: 'Hello world',
              model: 'koboldcpp',
              seed: 42,
              state: 'ok',
              worker_id: 'w-2',
              worker_name: 'TextWorker',
            },
          ],
        } as TextGenerationStatusResponse,
      }),
      makeTracked({
        id: 'alch-mix',
        type: 'alchemy',
        done: true,
        result: {
          state: 'done',
          forms: [{ form: 'caption', state: 'done' }],
        } as AlchemyStatusResponse,
      }),
    ],
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GenerationsTabComponent', () => {
  let fixture: ComponentFixture<GenerationsTabComponent>;
  let component: GenerationsTabComponent;
  let el: HTMLElement;

  const mockUser = signal<HordeUser | null>(null);

  const mockAuth = {
    currentUser: mockUser,
    isLoading: signal(false),
    isLoggedIn: signal(false),
    isInitialized: signal(true),
    getStoredApiKey: vi.fn().mockReturnValue(null),
    updateCurrentUserActiveGenerations: vi.fn(),
  };

  const mockHorde = {
    submitImageGeneration: vi.fn().mockReturnValue(of(null)),
    checkImageGeneration: vi.fn().mockReturnValue(of(null)),
    getImageGenerationStatus: vi.fn().mockReturnValue(of(null)),
    getTextGenerationStatus: vi.fn().mockReturnValue(of(null)),
    getAlchemyStatus: vi.fn().mockReturnValue(of(null)),
    getUserById: vi.fn().mockReturnValue(of(null)),
    getSelfUserByApiKeyUncached: vi.fn().mockReturnValue(of(null)),
    getImageModels: vi.fn().mockReturnValue(of([])),
  };

  beforeEach(async () => {
    // Reset mock return values
    mockHorde.getImageModels.mockReturnValue(of([]));
    mockHorde.getUserById.mockReturnValue(of(null));
    mockHorde.getSelfUserByApiKeyUncached.mockReturnValue(of(null));
    mockHorde.submitImageGeneration.mockReturnValue(of(null));
    mockHorde.checkImageGeneration.mockReturnValue(of(null));
    mockHorde.getImageGenerationStatus.mockReturnValue(of(null));
    mockHorde.getTextGenerationStatus.mockReturnValue(of(null));
    mockHorde.getAlchemyStatus.mockReturnValue(of(null));
    mockAuth.getStoredApiKey.mockReturnValue(null);

    await TestBed.configureTestingModule({
      imports: [
        GenerationsTabComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuth },
        { provide: AiHordeService, useValue: mockHorde },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GenerationsTabComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // -----------------------------------------------------------------------
  // Helper: set generations and detect changes
  // -----------------------------------------------------------------------
  function setGenerations(gens: TrackedGeneration[]): void {
    component.trackedGenerations.set(gens);
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Structural sanity
  // -----------------------------------------------------------------------
  it('should create the component', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display the purpose info banner', () => {
    fixture.detectChanges();
    const banner = el.querySelector('[role="note"]');
    expect(banner).not.toBeNull();
    expect(banner!.classList).toContain('alert--info');
  });

  it('should display the expiry warning banner', () => {
    fixture.detectChanges();
    const banners = el.querySelectorAll('[role="alert"]');
    const warning = Array.from(banners).find((b) =>
      b.classList.contains('alert--warning'),
    );
    expect(warning).not.toBeNull();
  });

  it('should contain a routerLink to /guis', () => {
    fixture.detectChanges();
    const link = el.querySelector('a[href="/guis"]');
    expect(link).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------
  it('should show empty-state messages when no generations', () => {
    setGenerations([]);
    const textContent = el.textContent ?? '';
    expect(textContent).toContain('profile.generations.no_image');
    expect(textContent).toContain('profile.generations.no_text');
    expect(textContent).toContain('profile.generations.no_alchemy');
  });

  // -----------------------------------------------------------------------
  // Parameterized scenario tests for IMAGE generations
  // -----------------------------------------------------------------------
  describe('image generation scenarios', () => {
    for (const scenario of scenarios) {
      describe(`scenario: ${scenario.name}`, () => {
        beforeEach(() => {
          setGenerations(scenario.generations);
        });

        it('should render a generation ID span for every tracked generation', () => {
          const copyButtons = el.querySelectorAll(
            'button[aria-label^="profile.generations.copy_id"]',
          );
          expect(copyButtons.length).toBe(scenario.generations.length);
        });

        it('should display generation IDs', () => {
          if (scenario.generations.length === 0) {
            // No generations to check
            return;
          }
          for (const gen of scenario.generations) {
            const found = el.textContent?.includes(gen.id);
            expect(found).toBe(true);
          }
        });
      });
    }
  });

  // -----------------------------------------------------------------------
  // Single image output
  // -----------------------------------------------------------------------
  describe('single completed image', () => {
    const gen = makeTracked({
      id: 'test-single',
      done: true,
      result: makeImageResult([makeOutput({ id: 'out-1', model: 'SDXL' })]),
    });

    beforeEach(() => setGenerations([gen]));

    it('should render one image element', () => {
      const imgs = el.querySelectorAll('img[alt="Generated image"]');
      expect(imgs.length).toBe(1);
    });

    it('should show the model name', () => {
      expect(el.textContent).toContain('SDXL');
    });

    it('should show the done status', () => {
      expect(el.textContent).toContain('profile.generations.status.done');
    });

    it('should not show censored label', () => {
      expect(el.textContent).not.toContain(
        'profile.generations.output.censored',
      );
    });

    it('should not show metadata section', () => {
      expect(el.textContent).not.toContain(
        'profile.generations.metadata_heading',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Batch of 2 images
  // -----------------------------------------------------------------------
  describe('batch of 2 completed images', () => {
    const gen = makeTracked({
      id: 'test-batch',
      done: true,
      result: makeImageResult([
        makeOutput({ id: 'out-a', seed: '111', model: 'ModelA' }),
        makeOutput({ id: 'out-b', seed: '222', model: 'ModelB' }),
      ]),
    });

    beforeEach(() => setGenerations([gen]));

    it('should render two image elements', () => {
      const imgs = el.querySelectorAll('img[alt="Generated image"]');
      expect(imgs.length).toBe(2);
    });

    it('should display both seeds', () => {
      expect(el.textContent).toContain('111');
      expect(el.textContent).toContain('222');
    });

    it('should display the count badge', () => {
      // The image section heading has a count span
      expect(el.textContent).toContain('(1)');
    });
  });

  // -----------------------------------------------------------------------
  // Censored output
  // -----------------------------------------------------------------------
  describe('censored output', () => {
    const gen = makeTracked({
      id: 'test-censored',
      done: true,
      result: makeImageResult([
        makeOutput({
          id: 'out-c',
          censored: true,
          state: 'censored',
          img: '',
        }),
      ]),
    });

    beforeEach(() => setGenerations([gen]));

    it('should display the censored label', () => {
      expect(el.textContent).toContain('profile.generations.output.censored');
    });

    it('should show the state as censored', () => {
      const stateSpans = el.querySelectorAll('.text-red-400');
      const states = Array.from(stateSpans).map((s) => s.textContent?.trim());
      expect(states).toContain('censored');
    });

    it('should not render an image tag for empty img URL', () => {
      // state is not 'ok', so no image tag rendered
      const imgs = el.querySelectorAll('img[alt="Generated image"]');
      expect(imgs.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // gen_metadata — warning level
  // -----------------------------------------------------------------------
  describe('gen_metadata with warning (lora download_failed)', () => {
    const gen = makeTracked({
      id: 'test-meta-warn',
      done: true,
      result: makeImageResult([
        makeOutput({
          id: 'out-d',
          gen_metadata: [
            { type: 'lora', value: 'download_failed', ref: 'civitai:12345' },
          ],
        }),
      ]),
    });

    beforeEach(() => setGenerations([gen]));

    it('should display the diagnostics heading', () => {
      expect(el.textContent).toContain('profile.generations.metadata_heading');
    });

    it('should show the metadata type', () => {
      expect(el.textContent?.toUpperCase()).toContain('LORA');
    });

    it('should show the human-readable value label', () => {
      expect(el.textContent).toContain('Download Failed');
    });

    it('should display the ref string', () => {
      expect(el.textContent).toContain('civitai:12345');
    });

    it('should apply warning border class', () => {
      const metaBadges = el.querySelectorAll('.border-yellow-500');
      expect(metaBadges.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // gen_metadata — danger level
  // -----------------------------------------------------------------------
  describe('gen_metadata with danger (nsfw)', () => {
    const gen = makeTracked({
      id: 'test-meta-danger',
      done: true,
      result: makeImageResult([
        makeOutput({
          id: 'out-e',
          gen_metadata: [{ type: 'censorship', value: 'nsfw' }],
        }),
      ]),
    });

    beforeEach(() => setGenerations([gen]));

    it('should apply danger border class', () => {
      const metaBadges = el.querySelectorAll('.border-red-500');
      expect(metaBadges.length).toBeGreaterThan(0);
    });

    it('should show NSFW Detected label', () => {
      expect(el.textContent).toContain('NSFW Detected');
    });
  });

  // -----------------------------------------------------------------------
  // gen_metadata — multiple entries
  // -----------------------------------------------------------------------
  describe('gen_metadata with multiple entries', () => {
    const gen = makeTracked({
      id: 'test-meta-multi',
      done: true,
      result: makeImageResult([
        makeOutput({
          id: 'out-f',
          gen_metadata: [
            { type: 'lora', value: 'download_failed', ref: 'civitai:999' },
            { type: 'ti', value: 'parse_failed' },
            { type: 'information', value: 'see_ref', ref: 'Some info' },
          ],
        }),
      ]),
    });

    beforeEach(() => setGenerations([gen]));

    it('should render three metadata badges', () => {
      const badges = el.querySelectorAll('.inline-flex.items-center');
      expect(badges.length).toBe(3);
    });

    it('should show all metadata types', () => {
      const upper = el.textContent?.toUpperCase() ?? '';
      expect(upper).toContain('LORA');
      expect(upper).toContain('TI');
      expect(upper).toContain('INFORMATION');
    });

    it('should show all value labels', () => {
      expect(el.textContent).toContain('Download Failed');
      expect(el.textContent).toContain('Parse Failed');
      expect(el.textContent).toContain('See Reference');
    });

    it('should display ref only for entries that have one', () => {
      expect(el.textContent).toContain('civitai:999');
      expect(el.textContent).toContain('Some info');
    });
  });

  // -----------------------------------------------------------------------
  // No gen_metadata
  // -----------------------------------------------------------------------
  describe('output without gen_metadata', () => {
    const gen = makeTracked({
      id: 'test-no-meta',
      done: true,
      result: makeImageResult([
        makeOutput({ id: 'out-g', gen_metadata: undefined }),
      ]),
    });

    beforeEach(() => setGenerations([gen]));

    it('should not show diagnostics heading', () => {
      expect(el.textContent).not.toContain(
        'profile.generations.metadata_heading',
      );
    });

    it('should not render any metadata badges', () => {
      const badges = el.querySelectorAll('.inline-flex.items-center');
      expect(badges.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Partially completed batch
  // -----------------------------------------------------------------------
  describe('partially completed batch', () => {
    const gen = makeTracked({
      id: 'test-partial',
      done: false,
      check: makeCheck({ finished: 1, processing: 1, waiting: 0 }),
    });

    beforeEach(() => setGenerations([gen]));

    it('should show processing status', () => {
      expect(el.textContent).toContain('profile.generations.status.processing');
    });

    it('should display check detail grid', () => {
      expect(el.textContent).toContain('profile.generations.detail.finished');
      expect(el.textContent).toContain('profile.generations.detail.processing');
    });

    it('should show finished count of 1', () => {
      const text = el.textContent ?? '';
      // "Finished: 1" and "Processing: 1"
      expect(text).toContain('1');
    });

    it('should not render any images (no result)', () => {
      const imgs = el.querySelectorAll('img[alt="Generated image"]');
      expect(imgs.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Waiting generation
  // -----------------------------------------------------------------------
  describe('generation still waiting', () => {
    const gen = makeTracked({
      id: 'test-waiting',
      done: false,
      check: makeCheck({
        finished: 0,
        processing: 0,
        waiting: 2,
        wait_time: 120,
        queue_position: 15,
      }),
    });

    beforeEach(() => setGenerations([gen]));

    it('should show queue position', () => {
      expect(el.textContent).toContain('profile.generations.queue_position');
    });

    it('should show wait time', () => {
      expect(el.textContent).toContain('profile.generations.wait_time');
    });
  });

  // -----------------------------------------------------------------------
  // Faulted generation
  // -----------------------------------------------------------------------
  describe('faulted generation', () => {
    const gen = makeTracked({
      id: 'test-faulted',
      done: false,
      faulted: true,
      check: makeCheck({ faulted: true }),
    });

    beforeEach(() => setGenerations([gen]));

    it('should show faulted status', () => {
      expect(el.textContent).toContain('profile.generations.status.faulted');
    });

    it('should not show done status text', () => {
      // The template uses @if/@else if — done and faulted are mutually exclusive.
      expect(el.textContent).not.toContain('profile.generations.status.done');
    });

    it('should render the faulted status in a red span', () => {
      const statusSpan = el.querySelector('.text-red-400.text-sm.font-medium');
      expect(statusSpan).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // is_possible = false
  // -----------------------------------------------------------------------
  describe('generation where is_possible is false', () => {
    const gen = makeTracked({
      id: 'test-impossible',
      done: false,
      check: makeCheck({ is_possible: false }),
    });

    beforeEach(() => setGenerations([gen]));

    it('should display the not-possible danger alert', () => {
      const dangerAlerts = el.querySelectorAll('.alert--danger');
      expect(dangerAlerts.length).toBeGreaterThan(0);
    });

    it('should show not_possible text', () => {
      expect(el.textContent).toContain('profile.generations.not_possible');
    });

    it('should show "No" for is_possible field', () => {
      expect(el.textContent).toContain('No');
    });
  });

  // -----------------------------------------------------------------------
  // Done but result not yet fetched — "View Result" button
  // -----------------------------------------------------------------------
  describe('done but result not yet fetched', () => {
    const gen = makeTracked({
      id: 'test-done-no-result',
      done: true,
      check: makeCheck({ done: true, finished: 1, waiting: 0 }),
      result: null,
    });

    beforeEach(() => setGenerations([gen]));

    it('should show View Result button', () => {
      expect(el.textContent).toContain('profile.generations.view_result');
    });

    it('should not show View Response JSON button (no result)', () => {
      expect(el.textContent).not.toContain(
        'profile.generations.show_response_json',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Response JSON toggle
  // -----------------------------------------------------------------------
  describe('response JSON toggle', () => {
    const gen = makeTracked({
      id: 'test-response-json',
      done: true,
      result: makeImageResult([makeOutput({ id: 'out-rj' })]),
    });

    beforeEach(() => setGenerations([gen]));

    it('should show "View Response JSON" button when result exists', () => {
      expect(el.textContent).toContain(
        'profile.generations.show_response_json',
      );
    });

    it('should not show response JSON pre block initially', () => {
      const details = el.querySelectorAll('details');
      // Only the sent request details (if any) — none open initially
      const responseJsonBlocks = Array.from(details).filter((d) =>
        d.textContent?.includes('profile.generations.response_json_label'),
      );
      expect(responseJsonBlocks.length).toBe(0);
    });

    it('should show response JSON pre block after toggle', () => {
      component.toggleResponseJson('test-response-json');
      fixture.detectChanges();

      const details = el.querySelectorAll('details');
      const responseJsonBlocks = Array.from(details).filter((d) =>
        d.textContent?.includes('profile.generations.response_json_label'),
      );
      expect(responseJsonBlocks.length).toBe(1);
    });

    it('should hide response JSON pre block after second toggle', () => {
      component.toggleResponseJson('test-response-json');
      fixture.detectChanges();
      component.toggleResponseJson('test-response-json');
      fixture.detectChanges();

      const details = el.querySelectorAll('details');
      const responseJsonBlocks = Array.from(details).filter((d) =>
        d.textContent?.includes('profile.generations.response_json_label'),
      );
      expect(responseJsonBlocks.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Sent request toggle
  // -----------------------------------------------------------------------
  describe('sent request toggle', () => {
    const gen = makeTracked({
      id: 'test-sent-req',
      done: false,
      sentRequest: {
        prompt: 'test prompt',
        models: ['stable_diffusion'],
        params: { steps: 25 },
        nsfw: false,
        censor_nsfw: true,
        r2: true,
      },
    });

    beforeEach(() => setGenerations([gen]));

    it('should show "Show Request" button', () => {
      expect(el.textContent).toContain('profile.generations.show_request');
    });

    it('should not show request JSON initially', () => {
      expect(el.textContent).not.toContain(
        'profile.generations.sent_request_label',
      );
    });

    it('should show request JSON after toggle', () => {
      component.toggleSentRequest('test-sent-req');
      fixture.detectChanges();
      expect(el.textContent).toContain(
        'profile.generations.sent_request_label',
      );
      expect(el.textContent).toContain('test prompt');
    });

    it('should show "Hide Request" text when expanded', () => {
      component.toggleSentRequest('test-sent-req');
      fixture.detectChanges();
      expect(el.textContent).toContain('profile.generations.hide_request');
    });
  });

  // -----------------------------------------------------------------------
  // Mixed types (image + text + alchemy)
  // -----------------------------------------------------------------------
  describe('mixed generation types', () => {
    const gens: TrackedGeneration[] = [
      makeTracked({
        id: 'img-mix',
        type: 'image',
        done: true,
        result: makeImageResult([makeOutput({ id: 'mix-img-out' })]),
      }),
      makeTracked({
        id: 'txt-mix',
        type: 'text',
        done: true,
        result: {
          finished: 1,
          processing: 0,
          restarted: 0,
          waiting: 0,
          done: true,
          faulted: false,
          wait_time: 0,
          queue_position: 0,
          kudos: 5,
          is_possible: true,
          generations: [
            {
              text: 'Generated text output',
              model: 'koboldcpp',
              seed: 42,
              state: 'ok',
              worker_id: 'w-2',
              worker_name: 'TxtWorker',
            },
          ],
        } as TextGenerationStatusResponse,
      }),
      makeTracked({
        id: 'alch-mix',
        type: 'alchemy',
        done: true,
        result: {
          state: 'done',
          forms: [{ form: 'caption', state: 'done' }],
        } as AlchemyStatusResponse,
      }),
    ];

    beforeEach(() => setGenerations(gens));

    it('should show image section count (1)', () => {
      expect(el.textContent).toContain('(1)');
    });

    it('should render an image tag', () => {
      const imgs = el.querySelectorAll('img[alt="Generated image"]');
      expect(imgs.length).toBe(1);
    });

    it('should render text output', () => {
      expect(el.textContent).toContain('Generated text output');
    });

    it('should render alchemy form result', () => {
      expect(el.textContent).toContain('caption');
    });

    it('should show all three generation IDs', () => {
      expect(el.textContent).toContain('img-mix');
      expect(el.textContent).toContain('txt-mix');
      expect(el.textContent).toContain('alch-mix');
    });
  });

  // -----------------------------------------------------------------------
  // Text generation — response JSON
  // -----------------------------------------------------------------------
  describe('text generation with response JSON toggle', () => {
    const gen = makeTracked({
      id: 'txt-json-test',
      type: 'text',
      done: true,
      result: {
        finished: 1,
        processing: 0,
        restarted: 0,
        waiting: 0,
        done: true,
        faulted: false,
        wait_time: 0,
        queue_position: 0,
        kudos: 5,
        is_possible: true,
        generations: [
          {
            text: 'Some text',
            model: 'm',
            seed: 1,
            state: 'ok',
            worker_id: 'w',
            worker_name: 'W',
          },
        ],
      } as TextGenerationStatusResponse,
    });

    beforeEach(() => setGenerations([gen]));

    it('should have response JSON button for text gen', () => {
      expect(el.textContent).toContain(
        'profile.generations.show_response_json',
      );
    });

    it('should toggle response JSON for text generation', () => {
      component.toggleResponseJson('txt-json-test');
      fixture.detectChanges();
      expect(el.textContent).toContain(
        'profile.generations.response_json_label',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Alchemy generation — response JSON
  // -----------------------------------------------------------------------
  describe('alchemy generation with response JSON toggle', () => {
    const gen = makeTracked({
      id: 'alch-json-test',
      type: 'alchemy',
      done: true,
      result: {
        state: 'done',
        forms: [{ form: 'caption', state: 'done' }],
      } as AlchemyStatusResponse,
    });

    beforeEach(() => setGenerations([gen]));

    it('should have response JSON button for alchemy gen', () => {
      expect(el.textContent).toContain(
        'profile.generations.show_response_json',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Component method tests (unit-style)
  // -----------------------------------------------------------------------
  describe('component methods', () => {
    describe('refresh user generations', () => {
      function setCurrentUser(user: HordeUser | null): void {
        const currentUserSignal = mockAuth.currentUser;
        currentUserSignal.set(user);
      }

      function makeUser(overrides: Partial<HordeUser> = {}): HordeUser {
        return {
          username: 'test-user',
          id: 123,
          kudos: 100,
          ...overrides,
        };
      }

      beforeEach(() => {
        mockHorde.getSelfUserByApiKeyUncached.mockClear();
        mockHorde.getUserById.mockClear();
        mockAuth.updateCurrentUserActiveGenerations.mockClear();
        component.trackedGenerations.set([]);
      });

      it('should use uncached authenticated self lookup and sync auth state', () => {
        setCurrentUser(makeUser({ id: 32582 }));
        mockAuth.getStoredApiKey.mockReturnValue('api-key');
        mockHorde.getSelfUserByApiKeyUncached.mockReturnValue(
          of(
            makeUser({
              id: 32582,
              active_generations: {
                image: ['img-1', 'img-1'],
                text: ['txt-1'],
                alchemy: ['alc-1'],
              },
            }),
          ),
        );

        component.refreshUserGenerations();

        expect(mockHorde.getSelfUserByApiKeyUncached).toHaveBeenCalledWith(
          'api-key',
        );
        expect(mockHorde.getSelfUserByApiKeyUncached).toHaveBeenCalledTimes(1);
        expect(mockHorde.getUserById).not.toHaveBeenCalled();
        expect(
          mockAuth.updateCurrentUserActiveGenerations,
        ).toHaveBeenCalledWith({
          image: ['img-1', 'img-1'],
          text: ['txt-1'],
          alchemy: ['alc-1'],
        });

        const tracked = component.trackedGenerations();
        expect(tracked.length).toBe(3);
        expect(tracked.map((g) => g.id)).toEqual(
          expect.arrayContaining(['img-1', 'txt-1', 'alc-1']),
        );
        expect(component.refreshingGenerations()).toBe(false);
      });

      it('should skip polling when no current user is available', () => {
        setCurrentUser(null);
        mockAuth.getStoredApiKey.mockReturnValue('api-key');

        component.refreshUserGenerations();

        expect(mockHorde.getSelfUserByApiKeyUncached).not.toHaveBeenCalled();
        expect(
          mockAuth.updateCurrentUserActiveGenerations,
        ).not.toHaveBeenCalled();
        expect(component.refreshingGenerations()).toBe(false);
      });

      it('should skip polling when api key is missing', () => {
        setCurrentUser(makeUser());
        mockAuth.getStoredApiKey.mockReturnValue(null);

        component.refreshUserGenerations();

        expect(mockHorde.getSelfUserByApiKeyUncached).not.toHaveBeenCalled();
        expect(
          mockAuth.updateCurrentUserActiveGenerations,
        ).not.toHaveBeenCalled();
        expect(component.refreshingGenerations()).toBe(false);
      });

      it('should sync auth state even when active_generations is missing', () => {
        setCurrentUser(makeUser({ id: 77 }));
        mockAuth.getStoredApiKey.mockReturnValue('api-key');
        mockHorde.getSelfUserByApiKeyUncached.mockReturnValue(
          of(makeUser({ id: 77 })),
        );

        component.refreshUserGenerations();

        expect(
          mockAuth.updateCurrentUserActiveGenerations,
        ).toHaveBeenCalledWith(undefined);
        expect(component.trackedGenerations().length).toBe(0);
        expect(component.refreshingGenerations()).toBe(false);
      });
    });

    describe('request model handling', () => {
      it('should omit models when model is blank', () => {
        mockAuth.getStoredApiKey.mockReturnValue('api-key');
        mockHorde.submitImageGeneration.mockReturnValue(
          of({ id: 'gen-model-blank', kudos: 1 }),
        );

        component.form.patchValue({
          prompt: 'test prompt',
          model: '',
        });

        component.submitGeneration();

        expect(mockHorde.submitImageGeneration).toHaveBeenCalled();
        const request = mockHorde.submitImageGeneration.mock.calls.at(
          -1,
        )![1] as ImageGenerationRequest;
        expect(request.models).toBeUndefined();
      });

      it('should omit models when model is whitespace-only', () => {
        mockAuth.getStoredApiKey.mockReturnValue('api-key');
        mockHorde.submitImageGeneration.mockReturnValue(
          of({ id: 'gen-model-space', kudos: 1 }),
        );

        component.form.patchValue({
          prompt: 'test prompt',
          model: '   ',
        });

        component.submitGeneration();

        const request = mockHorde.submitImageGeneration.mock.calls.at(
          -1,
        )![1] as ImageGenerationRequest;
        expect(request.models).toBeUndefined();
      });

      it('should include trimmed model when model is provided', () => {
        mockAuth.getStoredApiKey.mockReturnValue('api-key');
        mockHorde.submitImageGeneration.mockReturnValue(
          of({ id: 'gen-model-set', kudos: 1 }),
        );

        component.form.patchValue({
          prompt: 'test prompt',
          model: '  stable_diffusion  ',
        });

        component.submitGeneration();

        const request = mockHorde.submitImageGeneration.mock.calls.at(
          -1,
        )![1] as ImageGenerationRequest;
        expect(request.models).toEqual(['stable_diffusion']);
      });

      it('should include multiple comma-separated models', () => {
        mockAuth.getStoredApiKey.mockReturnValue('api-key');
        mockHorde.submitImageGeneration.mockReturnValue(
          of({ id: 'gen-model-multi', kudos: 1 }),
        );

        component.form.patchValue({
          prompt: 'test prompt',
          model: '  model-a, model-b  ,   model-c ',
        });

        component.submitGeneration();

        const request = mockHorde.submitImageGeneration.mock.calls.at(
          -1,
        )![1] as ImageGenerationRequest;
        expect(request.models).toEqual(['model-a', 'model-b', 'model-c']);
      });

      it('should ignore empty comma-separated model entries', () => {
        mockAuth.getStoredApiKey.mockReturnValue('api-key');
        mockHorde.submitImageGeneration.mockReturnValue(
          of({ id: 'gen-model-sparse', kudos: 1 }),
        );

        component.form.patchValue({
          prompt: 'test prompt',
          model: 'model-a, , , model-b,   ',
        });

        component.submitGeneration();

        const request = mockHorde.submitImageGeneration.mock.calls.at(
          -1,
        )![1] as ImageGenerationRequest;
        expect(request.models).toEqual(['model-a', 'model-b']);
      });
    });

    it('getMetadataLabel should return human-readable labels', () => {
      const cases: [GenerationMetadataStable, string][] = [
        [{ type: 'lora', value: 'download_failed' }, 'Download Failed'],
        [{ type: 'ti', value: 'parse_failed' }, 'Parse Failed'],
        [{ type: 'censorship', value: 'csam' }, 'CSAM Detected'],
        [{ type: 'censorship', value: 'nsfw' }, 'NSFW Detected'],
        [{ type: 'information', value: 'see_ref' }, 'See Reference'],
        [{ type: 'lora', value: 'baseline_mismatch' }, 'Baseline Mismatch'],
      ];

      for (const [meta, expected] of cases) {
        expect(component.getMetadataLabel(meta)).toBe(expected);
      }
    });

    it('isMetadataWarning should identify warning-level metadata', () => {
      expect(
        component.isMetadataWarning({ type: 'lora', value: 'download_failed' }),
      ).toBe(true);
      expect(
        component.isMetadataWarning({ type: 'ti', value: 'parse_failed' }),
      ).toBe(true);
      expect(
        component.isMetadataWarning({
          type: 'lora',
          value: 'baseline_mismatch',
        }),
      ).toBe(true);
      expect(
        component.isMetadataWarning({ type: 'censorship', value: 'nsfw' }),
      ).toBe(false);
    });

    it('isMetadataDanger should identify danger-level metadata', () => {
      expect(
        component.isMetadataDanger({ type: 'censorship', value: 'csam' }),
      ).toBe(true);
      expect(
        component.isMetadataDanger({ type: 'censorship', value: 'nsfw' }),
      ).toBe(true);
      expect(
        component.isMetadataDanger({ type: 'lora', value: 'download_failed' }),
      ).toBe(false);
    });

    it('formatWaitTime should format seconds correctly', () => {
      expect(component.formatWaitTime(30)).toBe('30s');
      expect(component.formatWaitTime(60)).toBe('1m');
      expect(component.formatWaitTime(90)).toBe('1m 30s');
      expect(component.formatWaitTime(0)).toBe('0s');
    });

    it('getLastRefreshedTimeLabel should return null when no refresh occurred yet', () => {
      component.lastRefreshedAt.set(null);

      expect(component.getLastRefreshedTimeLabel()).toBeNull();
    });

    it('getLastRefreshedTimeLabel should format stored refresh timestamp', () => {
      const timestamp = Date.UTC(2025, 0, 1, 9, 10, 11);
      component.lastRefreshedAt.set(timestamp);

      expect(component.getLastRefreshedTimeLabel()).toBe(
        new Date(timestamp).toLocaleTimeString(),
      );
    });

    it('copyGenerationId should set copied id and clear it after timeout', async () => {
      vi.useFakeTimers();
      const writeText = vi.fn().mockResolvedValue(undefined);

      vi.stubGlobal('isSecureContext', true);
      vi.stubGlobal('navigator', {
        clipboard: { writeText },
      } as unknown as Navigator);

      await component.copyGenerationId('gen-copy');

      expect(writeText).toHaveBeenCalledWith('gen-copy');
      expect(component.copiedGenerationId()).toBe('gen-copy');

      vi.advanceTimersByTime(2000);

      expect(component.copiedGenerationId()).toBeNull();

      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('copyGenerationId should keep copied state unchanged when copy fails', async () => {
      const doc = document as Document & {
        execCommand?: (commandId: string) => boolean;
      };
      if (!doc.execCommand) {
        Object.defineProperty(doc, 'execCommand', {
          value: () => false,
          configurable: true,
          writable: true,
        });
      }
      const execSpy = vi.spyOn(doc, 'execCommand').mockReturnValue(false);
      const writeText = vi.fn().mockRejectedValue(new Error('denied'));

      vi.stubGlobal('isSecureContext', true);
      vi.stubGlobal('navigator', {
        clipboard: { writeText },
      } as unknown as Navigator);

      component.copiedGenerationId.set('existing-copy');

      await component.copyGenerationId('gen-copy');

      expect(component.copiedGenerationId()).toBe('existing-copy');
      expect(execSpy).toHaveBeenCalledWith('copy');

      vi.unstubAllGlobals();
    });

    it('getResponseJson should strip long base64-like strings', () => {
      const gen = makeTracked({
        id: 'test-strip',
        done: true,
        result: makeImageResult([
          makeOutput({ id: 'out-strip', img: 'A'.repeat(300) }),
        ]),
      });
      const json = component.getResponseJson(gen);
      expect(json).toContain('[base64 data omitted]');
      expect(json).not.toContain('A'.repeat(300));
    });

    it('getResponseJson should preserve image URLs even when long', () => {
      const longUrl = `https://example.com/img.webp?token=${'A'.repeat(400)}`;
      const gen = makeTracked({
        id: 'test-short',
        done: true,
        result: makeImageResult([
          makeOutput({ id: 'out-short', img: longUrl }),
        ]),
      });
      const json = component.getResponseJson(gen);
      expect(json).toContain(longUrl);
      expect(json).not.toContain('[base64 data omitted]');
    });

    it('getOutputImageSrc should convert raw base64 payload to data URL', () => {
      const rawBase64 = `iVBORw0KGgo${'A'.repeat(301)}`;
      const output = makeOutput({ img: rawBase64 });

      expect(component.getOutputImageSrc(output)).toBe(
        `data:image/png;base64,${rawBase64}`,
      );
      expect(component.getOutputImageLink(output)).toBeNull();
    });

    it('getOutputImageSrc should keep URL payload unchanged', () => {
      const output = makeOutput({ img: 'https://example.com/generated.webp' });

      expect(component.getOutputImageSrc(output)).toBe(
        'https://example.com/generated.webp',
      );
      expect(component.getOutputImageLink(output)).toBe(
        'https://example.com/generated.webp',
      );
    });

    it('getResponseJson should return empty string when no result', () => {
      const gen = makeTracked({ id: 'test-null', result: null });
      expect(component.getResponseJson(gen)).toBe('');
    });

    it('getGenerationOutputs should return outputs for image gens', () => {
      const outputs = [makeOutput({ id: 'a' }), makeOutput({ id: 'b' })];
      const gen = makeTracked({
        id: 'test-outputs',
        type: 'image',
        result: makeImageResult(outputs),
      });
      expect(component.getGenerationOutputs(gen).length).toBe(2);
    });

    it('getGenerationOutputs should return empty for text type', () => {
      const gen = makeTracked({ id: 'test-text', type: 'text', result: null });
      expect(component.getGenerationOutputs(gen).length).toBe(0);
    });

    it('toggleResponseJson should toggle expansion state', () => {
      expect(component.isResponseExpanded('x')).toBe(false);
      component.toggleResponseJson('x');
      expect(component.isResponseExpanded('x')).toBe(true);
      component.toggleResponseJson('x');
      expect(component.isResponseExpanded('x')).toBe(false);
    });

    it('toggleSentRequest should toggle expansion state', () => {
      expect(component.isSentRequestExpanded('y')).toBe(false);
      component.toggleSentRequest('y');
      expect(component.isSentRequestExpanded('y')).toBe(true);
      component.toggleSentRequest('y');
      expect(component.isSentRequestExpanded('y')).toBe(false);
    });
  });
});
