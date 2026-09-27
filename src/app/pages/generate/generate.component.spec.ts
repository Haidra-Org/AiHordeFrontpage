import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal, computed, signal } from '@angular/core';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { convertToParamMap, provideRouter } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { ActiveModel } from '../../types/active-model';
import en from '../../../assets/i18n/en.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateComponent } from './generate.component';
import { AiHordeService } from '../../services/ai-horde.service';
import { GenerationQueueService } from '../../services/generation-queue.service';
import { ToastService } from '../../services/toast.service';
import { StudioHandoffService } from '../../services/studio-handoff.service';
import { TranslatorService } from '../../services/translator.service';
import { HordeStylesService } from '../../services/horde-styles.service';
import { StyleUsageService } from '../../services/style-usage.service';
import { TutorialEngineService } from '../../services/tutorial-engine.service';
import { GsHelpDockService } from '../../services/gs-help-dock.service';
import { GsTryItService } from '../../services/gs-try-it.service';
import { GlossaryService } from '../../services/glossary.service';
import { STUDIO_CONTROLS } from '../../content/studio-controls';
import { HIGHLIGHT_CLASS } from '../../services/tutorial-anchor.service';
import {
  ModelBaselineMap,
  ModelReferenceService,
  baselineSupportsQrCode,
  baselineSupportsRemix,
} from '../../services/model-reference.service';
import { ImageGenerationRequest } from '../../types/generation';
import { LocalGenerationJob } from '../../types/generation-job';
import {
  DEFAULT_GENERATE_FORM_VALUE,
  GenerateFormValue,
  buildImageRequest,
} from './generate-form.model';
import {
  studioLinkFromText,
  studioLinkParams,
  studioPayloadFromImage,
} from './studio-link';
import { webpFile } from '../../testing/webp-fixture';
import { StudioControlHistoryService } from './studio-control-history.service';
import { PromptHistoryDbService } from '../../services/prompt-history-db.service';
import {
  LicensingService,
  type LicensingFact,
  type NamedLicensingFact,
} from '../../services/licensing.service';

describe('GenerateComponent', () => {
  let fixture: ComponentFixture<GenerateComponent>;
  let component: GenerateComponent;
  let estimateKudos: ReturnType<typeof vi.fn>;
  let enqueue: ReturnType<typeof vi.fn>;
  let toastSuccess: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let styleIncrement: ReturnType<typeof vi.fn>;
  let getJobImages: ReturnType<typeof vi.fn>;
  let jobs: WritableSignal<LocalGenerationJob[]>;
  let finishedJobs: WritableSignal<LocalGenerationJob[]>;
  let baselines: WritableSignal<ModelBaselineMap | null>;
  let linkQuery: Record<string, string>;
  let navigate: ReturnType<typeof vi.fn>;
  let historyPush: ReturnType<typeof vi.fn>;
  let historyRemove: ReturnType<typeof vi.fn>;
  let imageModels: () => Observable<ActiveModel[]>;
  let lastAccepted: WritableSignal<{ localId: string; at: number } | null>;
  let sentRecord: ReturnType<typeof vi.fn>;
  let sentSeed: ReturnType<typeof vi.fn>;
  let queueReady: () => void;

  beforeEach(async () => {
    estimateKudos = vi.fn().mockResolvedValue(42);
    enqueue = vi.fn().mockResolvedValue('local-1');
    toastSuccess = vi.fn();
    toastError = vi.fn();
    styleIncrement = vi.fn();
    getJobImages = vi.fn().mockResolvedValue([]);
    jobs = signal<LocalGenerationJob[]>([]);
    finishedJobs = signal<LocalGenerationJob[]>([]);
    baselines = signal<ModelBaselineMap | null>(null);
    linkQuery = {};
    navigate = vi.fn().mockResolvedValue(true);
    historyPush = vi.fn().mockResolvedValue(undefined);
    historyRemove = vi.fn().mockResolvedValue(undefined);
    imageModels = () => of([]);
    lastAccepted = signal<{ localId: string; at: number } | null>(null);
    sentRecord = vi.fn().mockResolvedValue(undefined);
    sentSeed = vi.fn().mockResolvedValue(undefined);
    const ready = new Promise<void>((resolve) => {
      queueReady = resolve;
    });
    localStorage.clear();

    await TestBed.configureTestingModule({
      // The page words a refusal itself, so the real copy is loaded rather than
      // stubbed: a test asserting a sentence has to read the sentence shipped.
      imports: [
        GenerateComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          // The studio reads its opening settings off the address it was
          // reached by, so a test drives that address directly.
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParamMap() {
                return convertToParamMap(linkQuery);
              },
            },
          },
        },
        {
          // The studio's routes are not loaded here, so the tree the link
          // builder makes is serialized by hand.
          provide: Router,
          useValue: {
            navigate,
            url: '/generate',
            createUrlTree: (
              commands: string[],
              extras: { queryParams: Record<string, string> },
            ) => ({ commands, extras }),
            serializeUrl: (tree: {
              commands: string[];
              extras: { queryParams: Record<string, string> };
            }) =>
              `${tree.commands.join('/')}?${new URLSearchParams(
                tree.extras.queryParams,
              ).toString()}`,
          },
        },
        {
          provide: AiHordeService,
          useValue: {
            getImageModels: () => imageModels(),
            // The studio now carries the shared network-status notice, which
            // reads the horde's own numbers as soon as the page renders.
            get performance() {
              return of({});
            },
          },
        },
        {
          provide: GenerationQueueService,
          useValue: {
            hiddenJobs: signal([]),
            estimateKudos,
            enqueue,
            jobs,
            pendingJobs: signal([]),
            finishedJobs,
            getJobImages,
            lastAccepted,
            clock: signal(0),
            whenReady: () => ready,
          },
        },
        { provide: StyleUsageService, useValue: { increment: styleIncrement } },
        {
          provide: PromptHistoryDbService,
          useValue: { record: sentRecord, seedOnce: sentSeed },
        },
        {
          provide: StudioControlHistoryService,
          useValue: {
            list: vi.fn().mockResolvedValue([]),
            push: historyPush,
            remove: historyRemove,
          },
        },
        {
          // Stubbed rather than stubbing HttpClient, so a test can publish a
          // baseline map and drive the remix/QR gating directly.
          provide: ModelReferenceService,
          useValue: {
            names: signal(null),
            baselines,
            load: () => undefined,
            supportsRemix: (model: string) =>
              baselineSupportsRemix(baselines()?.[model] ?? null),
            supportsQrCode: (model: string) =>
              baselineSupportsQrCode(baselines()?.[model] ?? null),
          },
        },
        {
          provide: ToastService,
          useValue: { success: toastSuccess, error: toastError },
        },
        { provide: TranslatorService, useValue: { get: () => of('') } },
        {
          provide: HordeStylesService,
          useValue: {
            getStyles: () =>
              of([
                {
                  name: 'Test',
                  preset: { prompt: '{p}, masterpiece', model: 'flux' },
                  categories: ['fun'],
                },
              ]),
            getCategoryGroups: () =>
              of([{ category: 'fun', styleNames: ['Test'] }]),
          },
        },
      ],
    })
      .overrideComponent(GenerateComponent, { set: { template: '' } })
      .compileComponents();

    // The refusal dialog words a field's name itself, so the copy has to be in
    // hand before a test presses Generate.
    await firstValueFrom(TestBed.inject(TranslocoService).load('en'));

    fixture = TestBed.createComponent(GenerateComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('says so when the list of models will not load, and clears on a retry', () => {
    fixture.detectChanges();

    imageModels = () => throwError(() => new Error('unreachable'));
    component.retryConnection();
    expect(component.modelsFailed()).toBe(true);

    imageModels = () => of([{ name: 'flux', count: 2 }]);
    component.retryConnection();
    expect(component.modelsFailed()).toBe(false);
    expect(component.models()).toHaveLength(1);
  });

  it('holds the queued line until the horde has taken the request', async () => {
    fixture.detectChanges();
    toastSuccess.mockClear();
    component.form.controls.prompt.setValue('a cat');

    await component.onCreate();

    expect(enqueue).toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalledWith(
      'generate.form.enqueued',
      expect.anything(),
    );

    lastAccepted.set({ localId: 'local-1', at: 1 });
    fixture.detectChanges();

    expect(toastSuccess).toHaveBeenCalledWith('generate.form.enqueued', {
      transloco: true,
    });
  });

  it('debounces kudos estimation to a single call for rapid changes', () => {
    vi.useFakeTimers();
    // Ignore the one estimate the constructor kicks off on load.
    estimateKudos.mockClear();

    component.form.controls.steps.setValue(10);
    component.form.controls.steps.setValue(20);
    component.form.controls.cfg_scale.setValue(9);

    vi.advanceTimersByTime(1000);

    expect(estimateKudos).toHaveBeenCalledTimes(1);
  });

  it('estimates against a placeholder prompt when the prompt is blank', () => {
    vi.useFakeTimers();
    estimateKudos.mockClear();
    component.form.controls.prompt.setValue('');
    component.form.controls.steps.setValue(15);

    vi.advanceTimersByTime(1000);

    const request = estimateKudos.mock.calls[0][0] as ImageGenerationRequest;
    expect(request.prompt).toBe('_');
  });

  it('hands a style from the horde own list back for the horde to apply', async () => {
    fixture.detectChanges();
    component.registerStyle({
      source: 'native',
      key: 'native:style-1',
      id: 'style-1',
      name: 'Inky',
      prompt: '{p}, ink ### {np}, blurry',
      params: { steps: 8 },
      models: ['SDXL 1.0'],
    });
    component.form.patchValue({
      prompt: 'a cat',
      negativePrompt: 'blurry',
      styleName: 'native:style-1',
    });

    await component.onCreate();

    const request = enqueue.mock.calls.at(-1)?.[0] as ImageGenerationRequest;
    // Naming the style is what counts its use, pays its creator and lets a key
    // attached to it pay for the render; the horde fills its template itself.
    expect(request.style).toBe('style-1');
    expect(request.prompt).toBe('a cat ### blurry');
    expect(request.params?.steps).toBeUndefined();
    expect(request.models).toBeUndefined();
  });

  it('prices that style as the horde will run it', () => {
    fixture.detectChanges();
    vi.useFakeTimers();
    estimateKudos.mockClear();
    component.registerStyle({
      source: 'native',
      key: 'native:style-1',
      id: 'style-1',
      name: 'Inky',
      prompt: '{p}, ink ### {np}',
      params: { steps: 8 },
      models: ['SDXL 1.0'],
    });
    component.form.patchValue({
      prompt: 'a cat',
      styleName: 'native:style-1',
    });
    vi.advanceTimersByTime(1000);

    const request = estimateKudos.mock.calls.at(-1)?.[0] as
      | ImageGenerationRequest
      | undefined;
    // The dry run has to be the same request, or the price is for settings
    // nothing will run at.
    expect(request?.style).toBe('style-1');
    expect(request?.params?.steps).toBeUndefined();
  });

  it('goes on applying a preset here, where nothing on the horde knows it', async () => {
    fixture.detectChanges();
    component.registerStyle({
      source: 'curated',
      key: 'curated:Inky',
      name: 'Inky',
      prompt: '{p}, ink ### {np}',
      params: { steps: 8 },
      models: ['SDXL 1.0'],
    });
    component.form.patchValue({ prompt: 'a cat', styleName: 'curated:Inky' });

    await component.onCreate();

    const request = enqueue.mock.calls.at(-1)?.[0] as ImageGenerationRequest;
    expect(request.style).toBeUndefined();
    // The template's `###` stands whether or not a negative was typed, which
    // is how the horde reads the two halves apart.
    expect(request.prompt).toBe('a cat, ink ###');
    expect(request.params?.steps).toBe(8);
    expect(request.models).toEqual(['SDXL 1.0']);
  });

  it('prices a remix by the pictures it blends, not the source alone', async () => {
    estimateKudos.mockClear();
    component.form.controls.sourceMode.setValue('remix');

    component.onSourceState({
      mode: 'remix',
      sourceBlob: new Blob(['x'], { type: 'image/webp' }),
      maskBlob: null,
      extras: [
        { blob: new Blob(['y'], { type: 'image/webp' }), strength: 0.5 },
      ],
      valid: true,
      validationMessage: null,
    });
    await vi.waitFor(() => expect(estimateKudos).toHaveBeenCalled());

    const request = estimateKudos.mock.calls.at(-1)?.[0] as
      | ImageGenerationRequest
      | undefined;
    expect(request?.source_image).toBeTypeOf('string');
    expect(request?.extra_source_images).toHaveLength(1);
    expect(request?.extra_source_images?.[0].strength).toBe(0.5);
  });

  it('leaves the extras off an estimate for any other source mode', async () => {
    estimateKudos.mockClear();
    component.form.controls.sourceMode.setValue('img2img');

    component.onSourceState({
      mode: 'img2img',
      sourceBlob: new Blob(['x'], { type: 'image/webp' }),
      maskBlob: null,
      extras: [
        { blob: new Blob(['y'], { type: 'image/webp' }), strength: 0.5 },
      ],
      valid: true,
      validationMessage: null,
    });
    await vi.waitFor(() => expect(estimateKudos).toHaveBeenCalled());

    const request = estimateKudos.mock.calls.at(-1)?.[0] as
      | ImageGenerationRequest
      | undefined;
    expect(request?.extra_source_images).toBeUndefined();
  });

  it('surfaces a genuine zero estimate as 0, not the dash', async () => {
    vi.useFakeTimers();
    estimateKudos.mockResolvedValue(0);
    component.form.controls.steps.setValue(11);

    await vi.advanceTimersByTimeAsync(1000);

    expect(component.kudos()).toBe(0);
  });

  it('shows the dash state (null) when the estimate is unavailable', async () => {
    vi.useFakeTimers();
    estimateKudos.mockResolvedValue(null);
    component.form.controls.steps.setValue(12);

    await vi.advanceTimersByTimeAsync(1000);

    expect(component.kudos()).toBeNull();
  });

  it('shows the dash state (null) when the estimate rejects', async () => {
    vi.useFakeTimers();
    estimateKudos.mockRejectedValue(new Error('boom'));
    component.form.controls.steps.setValue(13);

    await vi.advanceTimersByTimeAsync(1000);

    expect(component.kudos()).toBeNull();
  });

  it('enqueues a request built from the form', async () => {
    component.form.patchValue({
      prompt: 'a castle on a hill',
      seed: '',
      post_processing: ['GFPGAN'],
    });

    await component.onCreate();

    expect(enqueue).toHaveBeenCalledTimes(1);
    const request = enqueue.mock.calls[0][0] as ImageGenerationRequest;
    expect(request.prompt).toBe('a castle on a hill');
    expect(request.params?.post_processing).toEqual(['GFPGAN']);
    expect(request.params?.seed).toBeUndefined();
  });

  it('sends straight away while review before sending is off', async () => {
    component.form.controls.prompt.setValue('a castle on a hill');

    await component.onCreate();

    expect(component.pendingReview()).toBeNull();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('holds the request for review instead of sending it', async () => {
    component.setReviewBeforeSend(true);
    component.form.controls.prompt.setValue('a castle on a hill');

    await component.onCreate();

    expect(enqueue).not.toHaveBeenCalled();
    expect(component.pendingReview()?.request.prompt).toBe(
      'a castle on a hill',
    );
  });

  it('sends nothing when the review is cancelled', async () => {
    component.setReviewBeforeSend(true);
    component.form.controls.prompt.setValue('a castle on a hill');
    await component.onCreate();

    component.cancelReview();

    expect(component.pendingReview()).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('sends the identical object the review was showing', async () => {
    component.setReviewBeforeSend(true);
    component.form.controls.prompt.setValue('a castle on a hill');
    await component.onCreate();
    const reviewed = component.pendingReview()?.request;

    // Changing the form after the review opened must not change what goes.
    component.form.controls.prompt.setValue('something else entirely');
    await component.confirmReview();

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toBe(reviewed);
    expect(component.pendingReview()).toBeNull();
  });

  it('remembers the review preference across visits', () => {
    component.setReviewBeforeSend(true);

    expect(localStorage.getItem('aihorde.generate.review_before_send')).toBe(
      'true',
    );
  });

  it('remembers the pinned Generate preference across visits', () => {
    component.setPinGenerate(true);

    expect(component.pinGenerate()).toBe(true);
    expect(localStorage.getItem('aihorde.generate.pinned_generate')).toBe(
      'true',
    );

    component.setPinGenerate(false);

    expect(component.pinGenerate()).toBe(false);
    expect(localStorage.getItem('aihorde.generate.pinned_generate')).toBe(
      'false',
    );
  });

  it('surfaces enqueue failures through the toast with error details', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    enqueue.mockRejectedValue(new Error('store generationJobs missing'));
    component.form.controls.prompt.setValue('a valid prompt');

    await component.onCreate();

    expect(toastError).toHaveBeenCalledTimes(1);
    const [key, options] = toastError.mock.calls[0] as [
      string,
      { transloco?: boolean; details?: string },
    ];
    expect(key).toBe('generate.form.enqueue_error');
    expect(options.transloco).toBe(true);
    expect(options.details).toBeTruthy();
    expect(options.details).toContain('store generationJobs missing');
    consoleError.mockRestore();
  });

  it('does not enqueue when the prompt is blank', async () => {
    component.form.controls.prompt.setValue('   ');

    await component.onCreate();

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('says what is standing in the way instead of doing nothing', async () => {
    component.form.controls.prompt.setValue('   ');

    await component.onCreate();

    expect(component.pendingBlockers()).toEqual([
      { anchor: 'prompt', key: 'generate.blockers.prompt_required' },
    ]);
    expect(component.form.controls.prompt.touched).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('names the range a number typed past a bound fell outside', async () => {
    component.form.controls.prompt.setValue('a castle on a hill');
    component.form.controls.steps.setValue(9000);

    await component.onCreate();

    expect(component.pendingBlockers()).toEqual([
      {
        anchor: 'steps',
        key: 'generate.blockers.range',
        params: { field: 'Steps', min: 1, max: 500 },
      },
    ]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('closes the dialog and points at the control a row named', () => {
    const goToField = vi.fn();
    // The panel itself is not rendered in this suite, so the query the page
    // reaches it through is stood in for.
    Object.defineProperty(component, 'formRef', {
      value: () => ({ goToField }),
    });
    component.pendingBlockers.set([
      { anchor: 'steps', key: 'generate.blockers.range' },
    ]);

    component.goToBlocker('steps');

    expect(component.pendingBlockers()).toBeNull();
    expect(goToField).toHaveBeenCalledWith('steps');
  });

  it('stands aside for a request that can be sent', async () => {
    component.form.controls.prompt.setValue('a castle on a hill');

    await component.onCreate();

    expect(component.pendingBlockers()).toBeNull();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('blocks enqueue and shows validation when the source section is invalid', async () => {
    component.form.patchValue({
      prompt: 'a valid prompt',
      sourceMode: 'controlnet',
    });
    component.sourceState.set({
      mode: 'controlnet',
      sourceBlob: null,
      maskBlob: null,
      valid: false,
      validationMessage: 'generate.source.error_no_image',
    });

    await component.onCreate();

    expect(enqueue).not.toHaveBeenCalled();
    expect(component.sourceValidationVisible()).toBe(true);
  });

  it('passes source and mask blobs to enqueue for a valid inpainting request', async () => {
    const sourceBlob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    const maskBlob = new Blob([new Uint8Array([2])], { type: 'image/png' });
    component.form.patchValue({
      prompt: 'inpaint here',
      sourceMode: 'inpainting',
      denoising_strength: 0.6,
    });
    component.sourceState.set({
      mode: 'inpainting',
      sourceBlob,
      maskBlob,
      valid: true,
      validationMessage: null,
    });

    await component.onCreate();

    expect(enqueue).toHaveBeenCalledTimes(1);
    const [request, sources] = enqueue.mock.calls[0] as [
      ImageGenerationRequest,
      { kind: string; blob: Blob; mimeType: string }[],
    ];
    expect(request.source_processing).toBe('inpainting');
    // The masked region is replaced outright: inpainting shows no strength
    // control, so the img2img slider's value does not ride along.
    expect(request.params?.denoising_strength).toBe(1);
    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.kind)).toEqual(['source', 'mask']);
    expect(sources[0].blob).toBe(sourceBlob);
    expect(sources[1].blob).toBe(maskBlob);
  });

  it('passes remix extras to enqueue alongside the source image', async () => {
    const sourceBlob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    const first = new Blob([new Uint8Array([2])], { type: 'image/webp' });
    const second = new Blob([new Uint8Array([3])], { type: 'image/webp' });
    component.form.patchValue({
      prompt: 'remix these',
      sourceMode: 'remix',
    });
    component.sourceState.set({
      mode: 'remix',
      sourceBlob,
      maskBlob: null,
      extras: [
        { blob: first, strength: 1 },
        { blob: second, strength: 0.5 },
      ],
      valid: true,
      validationMessage: null,
    });

    await component.onCreate();

    const [request, sources] = enqueue.mock.calls[0] as [
      ImageGenerationRequest,
      { kind: string; blob: Blob; index?: number; strength?: number }[],
    ];
    expect(request.source_processing).toBe('remix');
    expect(sources.map((source) => source.kind)).toEqual([
      'source',
      'extra_source',
      'extra_source',
    ]);
    expect(sources[1]).toMatchObject({ blob: first, index: 0, strength: 1 });
    expect(sources[2]).toMatchObject({ blob: second, index: 1, strength: 0.5 });
  });

  it('leaves remix extras out of enqueue when the mode is not remix', async () => {
    const sourceBlob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    component.form.patchValue({
      prompt: 'img2img',
      sourceMode: 'img2img',
    });
    component.sourceState.set({
      mode: 'img2img',
      sourceBlob,
      maskBlob: null,
      extras: [{ blob: new Blob([new Uint8Array([2])]), strength: 1 }],
      valid: true,
      validationMessage: null,
    });

    await component.onCreate();

    const sources = enqueue.mock.calls[0][1] as { kind: string }[];
    expect(sources.map((source) => source.kind)).toEqual(['source']);
  });

  describe('extras persistence', () => {
    const storageKey = 'aihorde.generate.form';

    const persistedValue = (): Partial<GenerateFormValue> => {
      const raw = localStorage.getItem(storageKey);
      return raw === null ? {} : (JSON.parse(raw) as GenerateFormValue);
    };

    it('keeps the webhook and worker routing out of storage by default', () => {
      vi.useFakeTimers();
      component.form.patchValue({
        webhook: 'https://example.com/hook',
        workers: ['worker-a'],
        workerBlacklist: true,
        qrText: 'https://aihorde.net',
      });
      vi.advanceTimersByTime(1000);

      expect(persistedValue()).toMatchObject({
        webhook: '',
        workers: [],
        workerBlacklist: false,
        // The QR text is creative input, not routing, so it always persists.
        qrText: 'https://aihorde.net',
      });
    });

    it('persists them once the user opts in', () => {
      vi.useFakeTimers();
      component.form.patchValue({
        rememberExtras: true,
        webhook: 'https://example.com/hook',
        workers: ['worker-a'],
        workerBlacklist: true,
      });
      vi.advanceTimersByTime(1000);

      expect(persistedValue()).toMatchObject({
        webhook: 'https://example.com/hook',
        workers: ['worker-a'],
        workerBlacklist: true,
      });
    });
  });

  describe('model capability gating', () => {
    it('stays permissive while the reference has not loaded', () => {
      component.form.controls.model.setValue('AlbedoBase XL (SDXL)');

      expect(component.remixSupported()).toBeNull();
      expect(component.qrSupported()).toBeNull();
    });

    it('stays permissive when no model is selected', () => {
      baselines.set({ 'Stable Cascade 1.0': 'stable_cascade' });

      expect(component.remixSupported()).toBeNull();
      expect(component.qrSupported()).toBeNull();
    });

    it('answers per baseline once the reference is known', () => {
      baselines.set({
        'Stable Cascade 1.0': 'stable_cascade',
        'AlbedoBase XL (SDXL)': 'stable_diffusion_xl',
      });

      component.form.controls.model.setValue('Stable Cascade 1.0');
      expect(component.remixSupported()).toBe(true);
      expect(component.qrSupported()).toBe(false);

      component.form.controls.model.setValue('AlbedoBase XL (SDXL)');
      expect(component.remixSupported()).toBe(false);
      expect(component.qrSupported()).toBe(true);
    });

    it('answers for the model a style pins, not the pick it replaces', () => {
      baselines.set({
        'Stable Cascade 1.0': 'stable_cascade',
        flux: 'flux_1',
      });
      component.form.controls.model.setValue('Stable Cascade 1.0');
      expect(component.remixSupported()).toBe(true);

      // The Test style pins 'flux', which is the model the request would run on.
      component.form.controls.styleName.setValue('curated:Test');

      expect(component.effectiveModel()).toBe('flux');
      expect(component.remixSupported()).toBe(false);
    });

    it('answers for the form again once the model is taken back from the style', () => {
      baselines.set({
        'Stable Cascade 1.0': 'stable_cascade',
        flux: 'flux_1',
      });
      component.form.patchValue({
        model: 'Stable Cascade 1.0',
        styleName: 'curated:Test',
      });
      expect(component.remixSupported()).toBe(false);

      component.form.controls.styleDetach.setValue({
        style: 'curated:Test',
        sections: ['model'],
      });

      expect(component.effectiveModel()).toBe('Stable Cascade 1.0');
      expect(component.remixSupported()).toBe(true);
    });

    it('strips a stale qrText from built requests when the model cannot serve it', () => {
      baselines.set({
        'Stable Cascade 1.0': 'stable_cascade',
        'AlbedoBase XL (SDXL)': 'stable_diffusion_xl',
      });
      component.form.patchValue({
        prompt: 'a castle on a hill',
        model: 'AlbedoBase XL (SDXL)',
        qrText: 'https://haidra.net',
      });

      component.openPreview();
      const supported = component.previewRequest() as ImageGenerationRequest;
      expect(supported.params?.workflow).toBe('qr_code');

      component.form.controls.model.setValue('Stable Cascade 1.0');
      component.openPreview();
      const unsupported = component.previewRequest() as ImageGenerationRequest;
      expect(unsupported.params?.workflow).toBeUndefined();
      expect(unsupported.params?.extra_texts).toBeUndefined();
    });
  });

  it('submits every setting the form holds, folded away or not', async () => {
    // The submitted values are the form's own. A setting made inside a group
    // the reader has since folded shut is still a setting they made, and the
    // panel never discards one behind their back.
    component.form.patchValue({
      prompt: 'a castle on a hill',
      post_processing: ['GFPGAN'],
      steps: 40,
      seed: '99',
    });

    await component.onCreate();

    const request = enqueue.mock.calls[0][0] as ImageGenerationRequest;
    expect(request.prompt).toBe('a castle on a hill');
    expect(request.params?.post_processing).toEqual(['GFPGAN']);
    expect(request.params?.steps).toBe(40);
    expect(request.params?.seed).toBe('99');
  });

  it('submits an attached source image', async () => {
    // The source card is one of the always-open ones, so a picture attached to
    // it reaches the request.
    const sourceBlob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    component.form.patchValue({
      prompt: 'a plain image',
      sourceMode: 'img2img',
      denoising_strength: 0.4,
    });
    component.sourceState.set({
      mode: 'img2img',
      sourceBlob,
      maskBlob: null,
      valid: true,
      validationMessage: null,
    });

    await component.onCreate();

    const [request, sources] = enqueue.mock.calls[0] as [
      ImageGenerationRequest,
      { blob: Blob }[],
    ];
    expect(request.source_processing).toBe('img2img');
    expect(request.params?.denoising_strength).toBe(0.4);
    expect(sources?.[0]?.blob).toBe(sourceBlob);
  });

  it('still resets the controlnet dials in simple mode', async () => {
    // Controlnet is advanced-only, so its control type stays out of what the
    // simple panel submits even when a past session left one behind.
    component.form.patchValue({
      prompt: 'a plain image',
      control_type: 'canny',
    });

    await component.onCreate();

    const request = enqueue.mock.calls[0][0] as ImageGenerationRequest;
    expect(request.params?.control_type).toBeUndefined();
  });

  it('applies a selected style to the built request', async () => {
    component.form.patchValue({
      prompt: 'a cat',
      styleName: 'curated:Test',
    });

    await component.onCreate();

    const request = enqueue.mock.calls[0][0] as ImageGenerationRequest;
    expect(request.prompt).toBe('a cat, masterpiece');
    expect(request.models).toEqual(['flux']);
  });

  it('exposes the style-forced params for hints once a style is selected', () => {
    component.form.controls.styleName.setValue('curated:Test');

    expect(component.forcedParams()?.model).toBe('flux');
  });

  describe('taking a past image forward', () => {
    const request: ImageGenerationRequest = {
      prompt: 'a lighthouse ### blurry',
      models: ['flux'],
      params: {
        steps: 30,
        cfg_scale: 6.5,
        seed: '4242',
        width: 832,
        height: 1216,
      },
    };

    it('waits for confirmation before a result replaces prepared settings', async () => {
      component.form.patchValue({ prompt: 'carefully prepared', steps: 12 });

      component.onResultControlAction({
        action: 'variation',
        request,
        localId: 'job-1',
        seed: '4242',
      });

      expect(component.pendingResultAction()?.action).toBe('variation');
      expect(component.form.controls.prompt.value).toBe('carefully prepared');

      component.confirmResultControlAction({ dontAskAgain: false });
      await vi.waitFor(() =>
        expect(component.form.controls.prompt.value).toBe('a lighthouse'),
      );
      expect(historyPush).toHaveBeenCalled();
    });

    it('lets the confirmation disable future prompts from Studio Options', async () => {
      component.onResultControlAction({
        action: 'settings',
        request,
        localId: 'job-1',
      });

      component.confirmResultControlAction({ dontAskAgain: true });
      await vi.waitFor(() =>
        expect(component.confirmResultActions()).toBe(false),
      );

      component.form.controls.prompt.setValue('another draft');
      component.onResultControlAction({
        action: 'settings',
        request,
        localId: 'job-1',
      });
      await vi.waitFor(() =>
        expect(component.form.controls.prompt.value).toBe('a lighthouse'),
      );
      expect(component.pendingResultAction()).toBeNull();
    });

    it('keeps undo available until it restores the previous settings', async () => {
      component.form.patchValue({ prompt: 'carefully prepared', steps: 12 });
      component.setConfirmResultActions(false);

      component.onResultControlAction({
        action: 'settings',
        request,
        localId: 'job-1',
      });
      await vi.waitFor(() =>
        expect(component.latestControlUndo()).not.toBeNull(),
      );

      await component.undoLastResultAction();

      expect(component.form.controls.prompt.value).toBe('carefully prepared');
      expect(component.form.controls.steps.value).toBe(12);
      expect(component.latestControlUndo()).toBeNull();
      expect(historyRemove).toHaveBeenCalled();
    });

    it('holds the form at the image seed for a variation', async () => {
      await component.onLoadSettings({
        request,
        localId: 'job-1',
        seed: '4242',
      });

      const value = component.form.getRawValue();
      expect(value.seed).toBe('4242');
      expect(value.prompt).toBe('a lighthouse');
      expect(value.steps).toBe(30);
      expect(value.width).toBe(832);
      expect(toastSuccess).toHaveBeenCalledWith(
        'generate.results.variation_loaded',
        expect.objectContaining({ messageParams: { seed: '4242' } }),
      );
    });

    it('leaves the seed to the horde when the settings are only copied', async () => {
      await component.onLoadSettings({ request, localId: 'job-1', seed: null });

      const value = component.form.getRawValue();
      expect(value.seed).toBe('');
      expect(value.steps).toBe(30);
      expect(toastSuccess).toHaveBeenCalledWith(
        'generate.results.settings_loaded',
        expect.anything(),
      );
    });

    it('reattaches the stored mask alongside the picture it was painted for', async () => {
      const source = new Blob(['s'], { type: 'image/webp' });
      const mask = new Blob(['m'], { type: 'image/png' });
      getJobImages.mockResolvedValue([
        {
          imageId: 'img-1',
          kind: 'source',
          blob: source,
          mimeType: 'image/webp',
        },
        { imageId: 'img-2', kind: 'mask', blob: mask, mimeType: 'image/png' },
      ]);
      const applySource = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(component, 'sourceImageRef', {
        value: () => ({ applySource }),
      });

      await component.onLoadSettings({
        request: {
          ...request,
          source_image: 'x',
          source_processing: 'img2img',
        },
        localId: 'job-1',
        seed: null,
      });

      expect(applySource).toHaveBeenCalledWith(source, mask);
    });

    it('reattaches a picture that never had a mask with none', async () => {
      const source = new Blob(['s'], { type: 'image/webp' });
      getJobImages.mockResolvedValue([
        {
          imageId: 'img-1',
          kind: 'source',
          blob: source,
          mimeType: 'image/webp',
        },
      ]);
      const applySource = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(component, 'sourceImageRef', {
        value: () => ({ applySource }),
      });

      await component.onLoadSettings({
        request: {
          ...request,
          source_image: 'x',
          source_processing: 'img2img',
        },
        localId: 'job-1',
        seed: null,
      });

      expect(applySource).toHaveBeenCalledWith(source, null);
    });
  });

  describe('applying a metadata selection', () => {
    const request: ImageGenerationRequest = {
      prompt: 'a lighthouse ### blurry',
      models: ['flux'],
      params: {
        steps: 30,
        cfg_scale: 6.5,
        seed: '4242',
        width: 832,
        height: 1216,
      },
    };

    it('resets unchecked parameters to their defaults in replace mode', async () => {
      component.form.patchValue({
        prompt: 'something else',
        steps: 12,
        width: 512,
        height: 512,
      });

      await component.onApplyMeta({
        request,
        localId: 'job-1',
        keys: ['prompt', 'steps'],
        mode: 'replace',
      });

      const value = component.form.getRawValue();
      expect(value.prompt).toBe('a lighthouse');
      expect(value.steps).toBe(30);
      // Unchecked: back to the form defaults, not the request's 832x1216.
      expect(value.width).toBe(1024);
      expect(value.height).toBe(1024);
      expect(toastSuccess).toHaveBeenCalledWith(
        'generate.results.meta_applied',
        expect.objectContaining({ messageParams: { count: 2 } }),
      );
    });

    it('leaves unchecked parameters on their current values in overlay mode', async () => {
      component.form.patchValue({
        prompt: 'keep me',
        steps: 12,
        width: 512,
        height: 512,
      });

      await component.onApplyMeta({
        request,
        localId: 'job-1',
        keys: ['width', 'height'],
        mode: 'overlay',
      });

      const value = component.form.getRawValue();
      expect(value.width).toBe(832);
      expect(value.height).toBe(1216);
      expect(value.prompt).toBe('keep me');
      expect(value.steps).toBe(12);
    });

    it('drops any selected style', async () => {
      component.form.patchValue({ styleName: 'curated:Test' });

      await component.onApplyMeta({
        request,
        localId: 'job-1',
        keys: ['prompt'],
        mode: 'overlay',
      });

      expect(component.form.controls.styleName.value).toBe('');
    });

    it('does nothing when the selection is empty', async () => {
      component.form.controls.prompt.setValue('untouched');

      await component.onApplyMeta({
        request,
        localId: 'job-1',
        keys: [],
        mode: 'replace',
      });

      expect(component.form.controls.prompt.value).toBe('untouched');
      expect(toastSuccess).not.toHaveBeenCalled();
    });

    it('clears the current source when a source-dependent key is applied', async () => {
      component.sourceState.set({
        mode: 'img2img',
        sourceBlob: new Blob([new Uint8Array([1])], { type: 'image/webp' }),
        maskBlob: null,
        valid: true,
        validationMessage: null,
      });

      await component.onApplyMeta({
        request: {
          ...request,
          source_processing: 'img2img',
          params: { ...request.params, denoising_strength: 0.4 },
        },
        localId: 'job-1',
        keys: ['sourceMode', 'denoising_strength'],
        mode: 'overlay',
      });

      expect(component.sourceState().sourceBlob).toBeNull();
      expect(component.form.controls.sourceMode.value).toBe('img2img');
      expect(component.form.controls.denoising_strength.value).toBe(0.4);
    });
  });

  describe('style provenance', () => {
    it('records the selected style on the job and counts the use', async () => {
      component.form.patchValue({
        prompt: 'a cat',
        styleName: 'curated:Test',
      });

      await component.onCreate();

      const opts = enqueue.mock.calls[0][2] as {
        styleName?: string;
        styleKey?: string;
      };
      expect(opts.styleName).toBe('Test');
      expect(opts.styleKey).toBe('curated:Test');
      expect(styleIncrement).toHaveBeenCalledTimes(1);
      expect(styleIncrement).toHaveBeenCalledWith('curated:Test');
    });

    it('records nothing when no style is selected', async () => {
      component.form.patchValue({ prompt: 'a cat' });

      await component.onCreate();

      expect(enqueue.mock.calls[0][2]).toBeUndefined();
      expect(styleIncrement).not.toHaveBeenCalled();
    });
  });

  describe('use as source', () => {
    it('switches to img2img and attaches the stored result', async () => {
      const blob = new Blob(['x'], { type: 'image/webp' });
      getJobImages.mockResolvedValue([
        { imageId: 'img-1', kind: 'result', blob, mimeType: 'image/webp' },
      ]);
      const applySource = vi.fn().mockResolvedValue(undefined);
      // The source section lives in the projected template, absent under the
      // stubbed one, so stand in for the view query.
      Object.defineProperty(component, 'sourceImageRef', {
        value: () => ({ applySource }),
      });

      await component.onUseAsSource({ localId: 'job-1', imageId: 'img-1' });

      expect(component.form.controls.sourceMode.value).toBe('img2img');
      expect(applySource).toHaveBeenCalledWith(blob);
      expect(toastSuccess).toHaveBeenCalledWith(
        'generate.results.reuse_done',
        expect.anything(),
      );
    });

    it('keeps an existing source mode rather than forcing img2img', async () => {
      const blob = new Blob(['x'], { type: 'image/webp' });
      getJobImages.mockResolvedValue([
        { imageId: 'img-1', kind: 'result', blob, mimeType: 'image/webp' },
      ]);
      Object.defineProperty(component, 'sourceImageRef', {
        value: () => ({ applySource: vi.fn().mockResolvedValue(undefined) }),
      });
      component.form.patchValue({ sourceMode: 'inpainting' });

      await component.onUseAsSource({ localId: 'job-1', imageId: 'img-1' });

      expect(component.form.controls.sourceMode.value).toBe('inpainting');
    });

    it('reports when the stored image is gone', async () => {
      getJobImages.mockResolvedValue([]);

      await component.onUseAsSource({ localId: 'job-1', imageId: 'img-1' });

      expect(toastError).toHaveBeenCalledWith(
        'generate.results.reuse_failed',
        expect.anything(),
      );
    });
  });

  it('sorts fetched models by worker count, descending', () => {
    const aiHorde = TestBed.inject(AiHordeService) as unknown as {
      getImageModels: () => unknown;
    };
    aiHorde.getImageModels = () =>
      of([
        { name: 'low', count: 1 },
        { name: 'high', count: 9 },
        { name: 'mid', count: 4 },
      ]);
    (component as unknown as { fetchModels(): void }).fetchModels();

    expect(component.models().map((m) => m.name)).toEqual([
      'high',
      'mid',
      'low',
    ]);
  });
  describe('images pasted or dropped on the studio', () => {
    it('switches the form into img2img before attaching', async () => {
      await component.onDroppedImage(
        new File(['x'], 'shot.png', { type: 'image/png' }),
      );

      const value = component.form.getRawValue();
      expect(value.sourceMode).toBe('img2img');
      // The source section is not rendered in this template-less harness, so the
      // attach itself cannot land and is reported as a failure.
      expect(toastError).toHaveBeenCalledWith('generate.source.attach_failed', {
        transloco: true,
      });
    });

    it('keeps an already-chosen source mode instead of forcing img2img', async () => {
      component.form.patchValue({ sourceMode: 'controlnet' });

      await component.onDroppedImage(
        new File(['x'], 'shot.png', { type: 'image/png' }),
      );

      expect(component.form.getRawValue().sourceMode).toBe('controlnet');
    });

    it('reports a non-image file rather than attaching it', () => {
      component.onRejectedImage();
      expect(toastError).toHaveBeenCalledWith('generate.source.not_an_image', {
        transloco: true,
      });
    });
  });

  describe('an image that carries its own settings', () => {
    const PARAMETERS = 'a fox in the snow\nSteps: 25, Model: Deliberate';

    /** Stand in for the source section, absent under the stubbed template. */
    function stubSourceSection(): ReturnType<typeof vi.fn> {
      const applyFile = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(component, 'sourceImageRef', {
        value: () => ({ applyFile }),
      });
      return applyFile;
    }

    async function offer(): Promise<void> {
      await component.onDroppedImage(webpFile(PARAMETERS));
    }

    it('asks rather than attaching when one is dropped on the page', async () => {
      await offer();

      expect(component.settingsOffer()?.payload.request.models).toEqual([
        'Deliberate',
      ]);
      // Nothing has been touched yet, not even the mode an attach would set.
      expect(component.form.getRawValue().sourceMode).toBe('none');
      expect(toastSuccess).not.toHaveBeenCalledWith(
        'generate.source.attached',
        expect.anything(),
      );
    });

    it('attaches the picture alone when that is the answer', async () => {
      const applyFile = stubSourceSection();
      await offer();

      await component.onSettingsChoice('source');

      expect(applyFile).toHaveBeenCalledWith(expect.any(File), {
        skipSettings: true,
      });
      expect(component.pendingLoad()).toBeNull();
      expect(component.settingsOffer()).toBeNull();
    });

    it('attaches the picture and puts its settings up for review', async () => {
      const applyFile = stubSourceSection();
      await offer();

      await component.onSettingsChoice('both');

      expect(applyFile).toHaveBeenCalledTimes(1);
      expect(component.pendingLoad()?.prompt).toBe('a fox in the snow');
      expect(component.pendingLoad()?.steps).toBe(25);
    });

    it('takes the settings and leaves the picture where it was', async () => {
      const applyFile = stubSourceSection();
      await offer();

      await component.onSettingsChoice('settings');

      expect(applyFile).not.toHaveBeenCalled();
      expect(component.form.getRawValue().sourceMode).toBe('none');
      expect(component.pendingLoad()?.prompt).toBe('a fox in the snow');
    });

    it('changes nothing when the question is dismissed', async () => {
      const applyFile = stubSourceSection();
      await offer();

      component.cancelSettingsOffer();

      expect(component.settingsOffer()).toBeNull();
      expect(applyFile).not.toHaveBeenCalled();
      expect(component.pendingLoad()).toBeNull();
    });

    it('takes the same question from the source card', async () => {
      const file = webpFile(PARAMETERS);
      const payload = await studioPayloadFromImage(file);

      component.onSourceSettingsOffer({ file, payload: payload! });

      expect(component.settingsOffer()?.file).toBe(file);
    });
  });

  describe('prompt history', () => {
    const job = (prompt: string, createdAt: number): LocalGenerationJob => ({
      localId: `job-${createdAt}`,
      status: 'done',
      createdAt,
      updatedAt: createdAt,
      request: { prompt },
      resultImageIds: [],
    });

    it('is empty until something has been generated', () => {
      expect(component.promptHistory()).toEqual([]);
    });

    it('derives newest-first distinct entries from the queue jobs', () => {
      jobs.set([
        job('a castle ### blurry', 300),
        job('a fox', 200),
        job('a castle ### blurry', 100),
      ]);

      expect(component.promptHistory()).toEqual([
        { prompt: 'a castle', negativePrompt: 'blurry' },
        { prompt: 'a fox', negativePrompt: '' },
      ]);
    });

    it('carries the saved jobs over to the sent prompts once the queue is ready', async () => {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(sentSeed).not.toHaveBeenCalled();

      jobs.set([job('a castle', 100)]);
      queueReady();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sentSeed).toHaveBeenCalledTimes(1);
      expect(sentSeed).toHaveBeenCalledWith([job('a castle', 100)]);
    });

    it('records each send under its prompt, negative and model', async () => {
      fixture.detectChanges();
      component.form.patchValue({
        prompt: 'a castle',
        negativePrompt: 'blurry',
        model: 'flux',
      });

      await component.onCreate();

      expect(enqueue).toHaveBeenCalledTimes(1);
      const request = enqueue.mock.calls[0][0] as ImageGenerationRequest;
      expect(sentRecord).toHaveBeenCalledWith(
        'a castle',
        'blurry',
        request.models?.[0] ?? '',
      );
    });

    it('records nothing when the send fails', async () => {
      fixture.detectChanges();
      enqueue.mockRejectedValueOnce(new Error('quota'));
      component.form.controls.prompt.setValue('a castle');

      await component.onCreate();

      expect(sentRecord).not.toHaveBeenCalled();
    });
  });

  describe('horde rejections', () => {
    const refused = (
      errorRc: string,
      errorMessage: string,
    ): LocalGenerationJob => ({
      localId: `refused-${errorRc}`,
      status: 'error',
      createdAt: 100,
      updatedAt: 100,
      request: { prompt: 'a fox' },
      resultImageIds: [],
      errorRc,
      errorMessage,
    });

    it('places the horde sentence at the control its code names', () => {
      jobs.set([
        refused('FlowShiftInapplicable', 'flow_shift is not applied.'),
      ]);
      fixture.detectChanges();

      expect(component.fieldRejection()).toEqual({
        anchor: 'flow_shift',
        message: 'flow_shift is not applied.',
      });
    });

    it('reads the knob out of a sentence the code does not name one in', () => {
      jobs.set([
        refused('SamplerKnobInapplicable', 'k_dpm_2 does not accept eta.'),
      ]);
      fixture.detectChanges();

      expect(component.fieldRejection()?.anchor).toBe('sampler_eta');
    });

    it('drops the sentence once that control is changed', () => {
      jobs.set([
        refused('FlowShiftInapplicable', 'flow_shift is not applied.'),
      ]);
      fixture.detectChanges();
      expect(component.fieldRejection()).not.toBeNull();

      component.form.controls.flow_shift.setValue(2.5);
      fixture.detectChanges();

      expect(component.fieldRejection()).toBeNull();
    });

    it('keeps the sentence while some other control is changed', () => {
      jobs.set([
        refused('FlowShiftInapplicable', 'flow_shift is not applied.'),
      ]);
      fixture.detectChanges();

      component.form.controls.steps.setValue(31);
      fixture.detectChanges();

      expect(component.fieldRejection()?.anchor).toBe('flow_shift');
    });

    it('leaves a code it does not model to the results tile alone', () => {
      jobs.set([refused('SomethingNew', 'The horde said no.')]);
      fixture.detectChanges();

      expect(component.fieldRejection()).toBeNull();
    });
  });

  describe('follow-along tutorial host', () => {
    it('writes only the fields a step names', () => {
      component.applyFields({ steps: 30 });

      const value = component.form.getRawValue();
      expect(value.steps).toBe(30);
      expect(value.prompt).toBe(DEFAULT_GENERATE_FORM_VALUE.prompt);
      expect(value.cfg_scale).toBe(DEFAULT_GENERATE_FORM_VALUE.cfg_scale);
    });

    it('enables a post-processor a value needs, keeping the rest', () => {
      component.form.controls.post_processing.setValue([
        'RealESRGAN_x4plus',
        'strip_background',
      ]);

      component.applyFields({ facefixer_strength: 0.75 }, ['GFPGAN']);

      const value = component.form.getRawValue();
      expect(value.post_processing).toEqual([
        'RealESRGAN_x4plus',
        'strip_background',
        'GFPGAN',
      ]);
      expect(value.facefixer_strength).toBe(0.75);
    });

    it('keeps the face fixer already chosen and only writes the strength', () => {
      component.form.controls.post_processing.setValue(['CodeFormers']);

      component.applyFields({ facefixer_strength: 0.75 }, ['GFPGAN']);

      const value = component.form.getRawValue();
      expect(value.post_processing).toEqual(['CodeFormers']);
      expect(value.facefixer_strength).toBe(0.75);
    });

    it('opens a bulk apply through the same review panel a preset uses', () => {
      component.openBulkApply({
        ...DEFAULT_GENERATE_FORM_VALUE,
        prompt: 'a lighthouse keeper',
        steps: 30,
      });

      expect(component.pendingLoadRequest()?.prompt).toBe(
        'a lighthouse keeper',
      );
      expect(component.pendingLoadRequest()?.params?.steps).toBe(30);
      // Named for what it is, so the panel does not claim to be loading a preset.
      expect(component.loadTitleKey()).toBe('generate.learn.bulk_title');
      // And nothing is written until the reader ticks it through.
      expect(component.form.getRawValue().prompt).toBe(
        DEFAULT_GENERATE_FORM_VALUE.prompt,
      );
    });

    it('restores the preset heading once the review panel is dismissed', () => {
      component.openBulkApply({ ...DEFAULT_GENERATE_FORM_VALUE });

      component.cancelLoad();

      expect(component.loadTitleKey()).toBe('generate.form.load_title');
    });

    it('tells the tutorial a generation was submitted', async () => {
      const engine = TestBed.inject(TutorialEngineService);
      void engine.start('txt2img');
      engine.goTo(engine.total() - 1);
      component.form.controls.prompt.setValue('a lighthouse keeper');

      await component.onCreate();

      expect(engine.active()).toBe(false);
      expect(engine.completed()).toBe(true);
    });
  });

  describe('settings set aside for a tutorial', () => {
    const setAsideKey = 'aihorde.generate.learn.set_aside';

    /** A panel carrying a style, a post-processor and an attached picture. */
    function fillPanel(): void {
      component.form.patchValue({
        styleName: 'curated:cinematic',
        steps: 40,
        post_processing: ['GFPGAN'],
        sourceMode: 'img2img',
      });
      component.sourceState.set({
        mode: 'img2img',
        sourceBlob: new Blob([new Uint8Array([1])]),
        maskBlob: null,
        valid: true,
        validationMessage: null,
      });
    }

    it('clears the style, the post-processing and the picture for txt2img', () => {
      fillPanel();

      component.setAside('txt2img', false);

      const value = component.form.getRawValue();
      expect(value.styleName).toBe('');
      expect(value.post_processing).toEqual([]);
      expect(value.steps).toBe(DEFAULT_GENERATE_FORM_VALUE.steps);
      expect(value.sourceMode).toBe('none');
      expect(component.sourceState().sourceBlob).toBeNull();
      expect(localStorage.getItem(setAsideKey)).toContain('curated:cinematic');
    });

    it('keeps the picture and its mode for a technique that works on one', () => {
      fillPanel();

      component.setAside('img2img', true);

      expect(component.form.getRawValue().styleName).toBe('');
      expect(component.form.getRawValue().sourceMode).toBe('img2img');
      expect(component.sourceState().sourceBlob).not.toBeNull();
    });

    it('does not save the cleared panel over the settings already put away', () => {
      fillPanel();
      component.setAside('txt2img', false);

      component.setAside('img2img', true);

      expect(localStorage.getItem(setAsideKey)).toContain('curated:cinematic');
      expect(component.hasSetAside()).toBe(true);
    });

    it('brings the settings back when asked, and only once', () => {
      fillPanel();
      component.setAside('txt2img', false);
      component.form.patchValue({ prompt: 'what the tutorial built' });

      expect(component.restoreSetAside()).toBe(true);

      const value = component.form.getRawValue();
      expect(value.styleName).toBe('curated:cinematic');
      expect(value.steps).toBe(40);
      expect(component.hasSetAside()).toBe(false);
      expect(component.restoreSetAside()).toBe(false);
    });

    it('drops a set that has sat here past its week', () => {
      fillPanel();
      component.setAside('txt2img', false);
      const stored = JSON.parse(
        localStorage.getItem(setAsideKey) ?? 'null',
      ) as { savedAt: number };
      localStorage.setItem(
        setAsideKey,
        JSON.stringify({
          ...stored,
          savedAt: stored.savedAt - 8 * 24 * 60 * 60 * 1000,
        }),
      );

      expect(component.hasSetAside()).toBe(false);
      expect(component.restoreSetAside()).toBe(false);
    });
  });

  describe('the reference entry on a phone', () => {
    // The sheet itself is exercised in the chassis's own spec; what belongs
    // here is that the studio reads the same topic the note wrote, which is
    // what puts the sheet on screen. (The template is blanked in this suite.)
    it('follows the setting a note asked to see', () => {
      const dock = TestBed.inject(GsHelpDockService);
      expect(component.helpDock.topic()).toBeNull();

      dock.open('steps');
      expect(component.helpDock.topic()).toBe('steps');

      component.helpDock.close();
      expect(component.helpDock.topic()).toBeNull();
    });

    it('gives the entry the results pane back when the panel had taken it', () => {
      // The docked entry lives in the results pane, and the widest panel draws
      // no results pane: opening one there has to make room for it or the press
      // does nothing a reader can see.
      const dock = TestBed.inject(GsHelpDockService);
      component.panelSize.set('full');

      dock.open('steps');
      TestBed.tick();

      expect(component.panelSize()).toBe('double');

      // Closing leaves the width where it is: a reader following notes reads
      // several, and going back to full between them takes the pane away again.
      dock.close();
      TestBed.tick();
      expect(component.panelSize()).toBe('double');
    });

    it('leaves a panel that already shows results at its width', () => {
      const dock = TestBed.inject(GsHelpDockService);
      component.panelSize.set('double');

      dock.open('cfg');
      TestBed.tick();

      expect(component.panelSize()).toBe('double');
    });

    it('is put away by the Back gesture where it is a sheet over the studio', () => {
      const dock = TestBed.inject(GsHelpDockService);
      component.isNarrow.set(true);

      dock.open('cfg');
      TestBed.tick();
      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(dock.topic()).toBeNull();
    });

    it('leaves Back alone where the entry is docked beside the panel', () => {
      const dock = TestBed.inject(GsHelpDockService);
      component.isNarrow.set(false);

      dock.open('cfg');
      TestBed.tick();
      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(dock.topic()).toBe('cfg');
    });
  });

  describe('the first-visit offer', () => {
    // The dialog itself is exercised in its own spec; what belongs here is when
    // the studio puts it on screen. (The template is blanked in this suite.)
    it('asks a reader who has not been here before', () => {
      expect(component.showWelcome()).toBe(true);
    });

    it('asks once: an answer stands for the rest of the visit', () => {
      component.closeWelcome();

      expect(component.showWelcome()).toBe(false);
    });

    it('leaves a reader who answered it before alone', () => {
      localStorage.setItem('aihorde.generate.learn.welcomed', 'true');

      const returning = TestBed.createComponent(GenerateComponent);

      expect(returning.componentInstance.showWelcome()).toBe(false);
      returning.destroy();
    });

    it('leaves a reader who declined it alone for the week they bought', () => {
      localStorage.setItem(
        'aihorde.generate.learn.welcomed_until',
        String(Date.now() + 60_000),
      );

      const declined = TestBed.createComponent(GenerateComponent);

      expect(declined.componentInstance.showWelcome()).toBe(false);
      declined.destroy();
    });

    it('asks again once that week has run out', () => {
      localStorage.setItem(
        'aihorde.generate.learn.welcomed_until',
        String(Date.now() - 60_000),
      );

      const returning = TestBed.createComponent(GenerateComponent);

      expect(returning.componentInstance.showWelcome()).toBe(true);
      returning.destroy();
    });

    it('stays out from under anything else over the page', () => {
      const dock = TestBed.inject(GsHelpDockService);

      dock.open('steps');
      expect(component.showWelcome()).toBe(false);
      dock.close();

      component.pendingBlockers.set([
        { anchor: 'prompt', key: 'generate.blockers.prompt_required' },
      ]);
      expect(component.showWelcome()).toBe(false);
      component.pendingBlockers.set(null);

      const engine = TestBed.inject(TutorialEngineService);
      void engine.start('txt2img');
      expect(component.showWelcome()).toBe(false);
      engine.stop();
    });

    it('retires for good once a picture has come back', () => {
      finishedJobs.set([
        {
          localId: 'done-1',
          status: 'done',
          createdAt: 0,
          updatedAt: 0,
          request: { prompt: 'a fox' },
          resultImageIds: ['i1'],
        },
      ]);
      TestBed.tick();

      expect(component.showWelcome()).toBe(false);
      expect(localStorage.getItem('aihorde.generate.learn.welcomed')).toBe(
        'true',
      );
    });
  });

  describe('an image sent over from alchemy', () => {
    it('attaches it as the source once the studio has rendered', async () => {
      const blob = new Blob(['x'], { type: 'image/webp' });
      const handoff = TestBed.inject(StudioHandoffService);
      handoff.set({ blob, mimeType: 'image/webp' });
      const applySource = vi.fn().mockResolvedValue(undefined);
      // The source section lives in the projected template, absent under the
      // stubbed one, so stand in for the view query.
      Object.defineProperty(component, 'sourceImageRef', {
        value: () => ({ applySource }),
      });

      fixture.detectChanges();
      await vi.waitFor(() => expect(applySource).toHaveBeenCalledWith(blob));

      expect(component.form.getRawValue().sourceMode).toBe('img2img');
      // Nothing is left behind, so a later visit never re-applies this picture.
      expect(handoff.has()).toBe(false);
      expect(toastSuccess).toHaveBeenCalledWith('generate.source.attached', {
        transloco: true,
      });
    });

    it('joins words sent over to whatever the prompt already says', async () => {
      const handoff = TestBed.inject(StudioHandoffService);
      component.form.controls.prompt.setValue('a portrait');
      handoff.set({ prompt: 'grey hair, sunglasses' });
      const applyPrompt = vi.fn();
      Object.defineProperty(component, 'formRef', {
        value: () => ({ applyPrompt }),
      });

      fixture.detectChanges();
      await fixture.whenStable();

      // The box changes under the reader, so the words go the way every
      // prompt from elsewhere goes: asked about, and undoable.
      expect(applyPrompt).toHaveBeenCalledWith(
        { prompt: 'a portrait, grey hair, sunglasses', negative: null },
        'handoff',
      );
      expect(handoff.has()).toBe(false);
      expect(component.form.getRawValue().sourceMode).toBe('none');
    });

    it('takes the words whole into an empty prompt', async () => {
      const handoff = TestBed.inject(StudioHandoffService);
      component.form.controls.prompt.setValue('  ');
      handoff.set({ prompt: 'grey hair, sunglasses' });
      const applyPrompt = vi.fn();
      Object.defineProperty(component, 'formRef', {
        value: () => ({ applyPrompt }),
      });

      fixture.detectChanges();
      await fixture.whenStable();

      expect(applyPrompt).toHaveBeenCalledWith(
        { prompt: 'grey hair, sunglasses', negative: null },
        'handoff',
      );
    });

    it('replaces the prompt where the words are the prompt themselves', async () => {
      const handoff = TestBed.inject(StudioHandoffService);
      component.form.controls.prompt.setValue('a portrait');
      handoff.set({ prompt: 'a snail cathedral', promptMode: 'set' });
      const applyPrompt = vi.fn();
      Object.defineProperty(component, 'formRef', {
        value: () => ({ applyPrompt }),
      });

      fixture.detectChanges();
      await fixture.whenStable();

      // A picture chosen off the home page brings the prompt that made it, so
      // nothing of the box's own words survives into it.
      expect(applyPrompt).toHaveBeenCalledWith(
        { prompt: 'a snail cathedral', negative: null },
        'handoff',
      );
      expect(handoff.has()).toBe(false);
    });

    it('leaves the form alone when nothing was sent', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.form.getRawValue().sourceMode).toBe('none');
      expect(toastSuccess).not.toHaveBeenCalledWith(
        'generate.source.attached',
        expect.anything(),
      );
    });
  });

  describe('try-it host', () => {
    it('applies a value armed by the routed reference page on arrival', async () => {
      Element.prototype.scrollIntoView = vi.fn();
      TestBed.inject(GsTryItService).arm({
        display: '40',
        anchorId: 'steps',
        fields: { steps: 40 },
      });

      const arrived = TestBed.createComponent(GenerateComponent);
      arrived.detectChanges();
      await arrived.whenStable();

      expect(arrived.componentInstance.form.getRawValue().steps).toBe(40);
      arrived.destroy();
    });
  });

  describe('preset load', () => {
    const preset = (): GenerateFormValue => ({
      ...DEFAULT_GENERATE_FORM_VALUE,
      prompt: 'a castle',
      steps: 42,
      n: 4,
      clip_skip: 3,
      tiling: true,
    });

    it('holds the picked preset as a request for review', () => {
      component.onApplyPreset(preset());
      expect(component.pendingLoadRequest()?.prompt).toBe('a castle');
    });

    it('keeps fields the review panel never offers and resets the declined ones', () => {
      const value = preset();
      component.onApplyPreset(value);

      component.onApplyPresetSelection(
        { localId: '', keys: ['prompt'], mode: 'replace' },
        ['prompt', 'steps'],
      );

      const applied = component.form.getRawValue();
      expect(applied.prompt).toBe('a castle');
      // Declined, so back to the default rather than the preset's 42.
      expect(applied.steps).toBe(DEFAULT_GENERATE_FORM_VALUE.steps);
      // Never on offer, so they come back with the preset.
      expect(applied.n).toBe(4);
      expect(applied.clip_skip).toBe(3);
      expect(applied.tiling).toBe(true);
      expect(component.pendingLoadRequest()).toBeNull();
    });

    it('writes only the ticked fields in overlay mode and drops the style', () => {
      component.form.patchValue({
        prompt: 'a fox',
        n: 2,
        styleName: 'curated:Test',
      });
      component.onApplyPreset(preset());

      component.onApplyPresetSelection(
        { localId: '', keys: ['steps'], mode: 'overlay' },
        ['prompt', 'steps'],
      );

      const applied = component.form.getRawValue();
      expect(applied.steps).toBe(42);
      expect(applied.prompt).toBe('a fox');
      expect(applied.n).toBe(2);
      expect(applied.styleName).toBe('');
    });

    it('takes the style from the preset in replace mode, not from the form', () => {
      component.form.patchValue({ styleName: 'curated:Test' });
      component.onApplyPreset(preset());

      component.onApplyPresetSelection(
        { localId: '', keys: ['prompt'], mode: 'replace' },
        ['prompt', 'steps'],
      );

      expect(component.form.getRawValue().styleName).toBe('');

      component.form.patchValue({ styleName: '' });
      component.onApplyPreset({ ...preset(), styleName: 'curated:Test' });

      component.onApplyPresetSelection(
        { localId: '', keys: ['prompt'], mode: 'replace' },
        ['prompt', 'steps'],
      );

      expect(component.form.getRawValue().styleName).toBe('curated:Test');
    });

    it('leaves the form alone when the review is dismissed', () => {
      component.form.patchValue({ prompt: 'a fox' });
      component.onApplyPreset(preset());

      component.cancelLoad();

      expect(component.pendingLoadRequest()).toBeNull();
      expect(component.form.getRawValue().prompt).toBe('a fox');
    });
  });

  describe('glossary: what this page is made of', () => {
    it('offers the eight areas of the panel for as long as the studio is up', () => {
      const glossary = TestBed.inject(GlossaryService);
      const context = glossary.pageContexts().get('generate-image');

      expect(context?.entries.map((entry) => entry.id)).toEqual([
        'prompt',
        'model',
        'size',
        'source',
        'sampling',
        'finishing',
        'horde',
        'workflows',
      ]);
      // The area's own mark and name, taken from the section identity.
      expect(context?.entries[4].iconName).toBe('sec-sampling');
      expect(context?.entries[4].titleKey).toBe('generate.sections.sampling');
      expect(context?.relevantTermIds).toEqual(
        expect.arrayContaining(['steps', 'kudos', 'worker', 'model']),
      );

      fixture.destroy();

      expect(glossary.pageContexts().has('generate-image')).toBe(false);
    });

    it('explains every unlabelled button and mark before the areas', () => {
      const context = TestBed.inject(GlossaryService)
        .pageContexts()
        .get('generate-image');

      expect(context?.controls?.map((control) => control.id)).toEqual(
        STUDIO_CONTROLS.map((control) => control.id),
      );
      // Named and drawn with the glyph the control itself wears.
      const reset = context?.controls?.find((entry) => entry.id === 'reset');
      expect(reset?.iconName).toBe('refresh-alt');
      expect(reset?.titleKey).toBe('help.glossary.controls.reset.title');
      // Read rather than pressed: the button is already on the screen.
      expect(reset?.action).toBeUndefined();
    });

    it('takes the reader to the card an entry names, and rings it', () => {
      const panel = document.createElement('div');
      panel.className = 'gs-panel';
      const card = document.createElement('div');
      card.className = 'gs-card gs-sec--sampling';
      card.scrollIntoView = vi.fn();
      panel.appendChild(card);
      document.body.appendChild(panel);

      const entry = TestBed.inject(GlossaryService)
        .pageContexts()
        .get('generate-image')
        ?.entries.find((candidate) => candidate.id === 'sampling');
      entry?.action?.();

      expect(card.scrollIntoView).toHaveBeenCalled();
      // The card is already wearing its own hue, so only the ring is added.
      expect(card.classList.contains(HIGHLIGHT_CLASS)).toBe(true);

      panel.remove();
    });
  });

  describe('settings carried in the address', () => {
    /** Stand the studio up again on a given address. */
    function openLink(query: Record<string, string>): void {
      fixture.destroy();
      linkQuery = query;
      fixture = TestBed.createComponent(GenerateComponent);
      component = fixture.componentInstance;
    }

    it('writes a model named openly, without asking first', () => {
      openLink({ model: 'Deliberate' });

      expect(component.form.controls.model.value).toBe('Deliberate');
      expect(component.pendingLoad()).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('offers a packed request for review rather than writing it in', () => {
      const request = buildImageRequest({
        ...DEFAULT_GENERATE_FORM_VALUE,
        prompt: 'a fox in the snow',
        steps: 42,
      });
      openLink({ ...studioLinkParams(request, null) });

      expect(component.pendingLoad()?.steps).toBe(42);
      expect(component.form.controls.steps.value).not.toBe(42);
    });

    it('heads a link that names its settings with that name', () => {
      const request = buildImageRequest({
        ...DEFAULT_GENERATE_FORM_VALUE,
        prompt: 'a snail cathedral',
      });
      openLink({
        ...studioLinkParams(request, null),
        title: 'Snail cathedral',
      });

      expect(component.pendingLoad()).not.toBeNull();
      expect(component.loadTitleKey()).toBe('generate.link.review_title_named');
      expect(component.loadTitleParams()).toEqual({ title: 'Snail cathedral' });
    });

    it('heads a link that names nothing as the link it is', () => {
      const request = buildImageRequest({
        ...DEFAULT_GENERATE_FORM_VALUE,
        prompt: 'a snail cathedral',
      });
      openLink({ ...studioLinkParams(request, null) });

      expect(component.loadTitleKey()).toBe('generate.link.review_title');
      expect(component.loadTitleParams()).toBeUndefined();
    });

    it('takes the name back out of the address with the request', () => {
      openLink({
        ...studioLinkParams(
          buildImageRequest({ ...DEFAULT_GENERATE_FORM_VALUE }),
          null,
        ),
        title: 'Snail cathedral',
      });

      const options = navigate.mock.calls[0][1] as {
        queryParams: Record<string, string>;
      };
      expect(options.queryParams).toEqual({});
    });

    it('takes the packed request back out of the address', () => {
      openLink({
        ...studioLinkParams(
          buildImageRequest({ ...DEFAULT_GENERATE_FORM_VALUE }),
          null,
        ),
        model: 'Deliberate',
      });

      expect(navigate).toHaveBeenCalledTimes(1);
      const options = navigate.mock.calls[0][1] as {
        queryParams: Record<string, string>;
        replaceUrl: boolean;
      };
      expect(options.queryParams).toEqual({ model: 'Deliberate' });
      expect(options.replaceUrl).toBe(true);
    });

    it('drops a style the horde no longer publishes, and says so', () => {
      openLink({ style: 'Retired' });

      expect(component.form.controls.styleName.value).toBe('');
      expect(toastError).toHaveBeenCalledWith('generate.link.style_gone', {
        transloco: true,
      });
    });

    it('keeps a style that is still published', () => {
      openLink({ style: 'Test' });

      expect(component.form.controls.styleName.value).toBe('curated:Test');
      expect(toastError).not.toHaveBeenCalled();
    });

    it('fetches a published style the address names by its id', () => {
      openLink({ styleId: 'abc-123' });

      const http = TestBed.inject(HttpTestingController);
      const request = http.expectOne((candidate) =>
        candidate.url.endsWith('/styles/image/abc-123'),
      );
      request.flush({
        id: 'abc-123',
        name: 'Ink Wash',
        prompt: 'ink wash of {p}',
        params: { steps: 12 },
        public: true,
        nsfw: false,
        use_count: 4,
        creator: 'someone#1',
      });

      expect(component.form.controls.styleName.value).toBe('native:abc-123');
      expect(component.styleRecords().get('native:abc-123')?.name).toBe(
        'Ink Wash',
      );
      expect(component.forcedParams()?.steps).toBe(12);
      expect(toastError).not.toHaveBeenCalled();
    });

    it('drops a published style the horde no longer serves, and says so', () => {
      openLink({ styleId: 'gone-1' });

      const http = TestBed.inject(HttpTestingController);
      http
        .expectOne((candidate) =>
          candidate.url.endsWith('/styles/image/gone-1'),
        )
        .flush(
          { message: 'not found' },
          { status: 404, statusText: 'Not Found' },
        );

      expect(component.form.controls.styleName.value).toBe('');
      expect(toastError).toHaveBeenCalledWith('generate.link.style_gone', {
        transloco: true,
      });
    });

    it('keeps the mode a sourced request came with, and asks for the picture', () => {
      const request = buildImageRequest(
        {
          ...DEFAULT_GENERATE_FORM_VALUE,
          prompt: 'a fox',
          sourceMode: 'img2img',
          steps: 24,
        },
        { hasSourceImage: true },
      );
      expect(request.source_processing).toBe('img2img');
      openLink({ ...studioLinkParams(request, null) });

      component.onApplyPresetSelection(
        { localId: 'link', keys: ['steps'], mode: 'replace' },
        ['steps'],
      );

      expect(component.form.controls.sourceMode.value).toBe('img2img');
      expect(component.linkSourceMissing()).toBe(true);
    });

    it('stops asking for the picture once one is added', () => {
      const request = buildImageRequest(
        {
          ...DEFAULT_GENERATE_FORM_VALUE,
          prompt: 'a fox',
          sourceMode: 'img2img',
        },
        { hasSourceImage: true },
      );
      openLink({ ...studioLinkParams(request, null) });
      component.onApplyPresetSelection(
        { localId: 'link', keys: ['steps'], mode: 'replace' },
        ['steps'],
      );

      component.onSourceState({
        mode: 'img2img',
        sourceBlob: new Blob(['x']),
        maskBlob: null,
        valid: true,
        validationMessage: null,
      });

      expect(component.linkSourceMissing()).toBe(false);
    });

    it('hands these settings over as an address, with the style named openly', async () => {
      const written: string[] = [];
      vi.stubGlobal('isSecureContext', true);
      vi.stubGlobal('navigator', {
        clipboard: {
          writeText: (text: string) => {
            written.push(text);
            return Promise.resolve();
          },
        },
      } as unknown as Navigator);
      component.form.controls.prompt.setValue('a fox in the snow');
      component.form.controls.styleName.setValue('curated:Test');

      await component.copyStudioLink();

      expect(written).toHaveLength(1);
      expect(written[0]).toContain('style=Test');
      const payload = studioLinkFromText(written[0]);
      expect(payload?.styleKey).toBe('curated:Test');
      expect(payload?.request.prompt).toBe('a fox in the snow');
      expect(toastSuccess).toHaveBeenCalledWith('generate.link.copied', {
        transloco: true,
      });
      vi.unstubAllGlobals();
    });

    it('refuses to hand over settings too long to carry', async () => {
      // Nothing repeats, so the prompt cannot be packed down to a carryable size.
      component.form.controls.prompt.setValue(
        Array.from({ length: 2000 }, (_, index) =>
          ((index * 2654435761) % 1e9).toString(36),
        ).join(' '),
      );

      await component.copyStudioLink();

      expect(toastError).toHaveBeenCalledWith('generate.link.too_large', {
        transloco: true,
      });
    });

    it('sends pasted settings through the review panel, not into the form', () => {
      component.onPasted({
        request: { prompt: 'a fox', params: { steps: 44 } },
        styleKey: null,
        kind: 'full',
      });

      expect(component.pasteOpen()).toBe(false);
      expect(component.pendingLoad()?.steps).toBe(44);
      expect(component.form.controls.steps.value).not.toBe(44);
    });

    it('writes a pasted address that only names a model', () => {
      component.onPasted({
        request: { prompt: '', models: ['Deliberate'] },
        styleKey: null,
        kind: 'simple',
      });

      expect(component.form.controls.model.value).toBe('Deliberate');
      expect(component.pendingLoad()).toBeNull();
    });

    it('leaves a plain preset dropping back to no source at all', () => {
      component.onApplyPreset({
        ...DEFAULT_GENERATE_FORM_VALUE,
        sourceMode: 'img2img',
      });
      component.onApplyPresetSelection(
        { localId: 'preset', keys: ['steps'], mode: 'replace' },
        ['steps'],
      );

      expect(component.form.controls.sourceMode.value).toBe('none');
      expect(component.linkSourceMissing()).toBe(false);
    });
  });
});

/**
 * The results pane has to be a real element for the scrolling and focusing that
 * targets it, so these stand the studio up with a template holding just that
 * pane (with the tabindex the real one carries).
 */
async function createPaneOnlyStudio(): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [
      GenerateComponent,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideRouter([]),
      {
        provide: AiHordeService,
        useValue: {
          getImageModels: () => of([]),
          get performance() {
            return of({});
          },
        },
      },
      {
        provide: GenerationQueueService,
        useValue: {
          hiddenJobs: signal([]),
          estimateKudos: vi.fn().mockResolvedValue(1),
          enqueue: vi.fn(),
          jobs: signal([]),
          pendingJobs: signal([]),
          finishedJobs: signal([]),
          getJobImages: vi.fn().mockResolvedValue([]),
          lastAccepted: signal(null),
          clock: signal(0),
          whenReady: () => Promise.resolve(),
        },
      },
      { provide: StyleUsageService, useValue: { increment: vi.fn() } },
      {
        provide: ToastService,
        useValue: { success: vi.fn(), error: vi.fn() },
      },
      { provide: TranslatorService, useValue: { get: () => of('') } },
      {
        provide: HordeStylesService,
        useValue: {
          getStyles: () => of([]),
          getCategoryGroups: () => of([]),
        },
      },
    ],
  })
    .overrideComponent(GenerateComponent, {
      set: {
        template: '<section #resultsPane tabindex="-1">results</section>',
      },
    })
    .compileComponents();
}

/**
 * The two bottom sheets are mounted by the real template, so this stands the
 * studio up with it rather than the blanked one the unit suites use.
 */
async function createWholeStudio(
  baselines: ModelBaselineMap | null = null,
): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [
      GenerateComponent,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: AiHordeService,
        useValue: {
          // Whatever baselines the test named are models a worker serves, so
          // the studio has something to send with and Generate stands up.
          getImageModels: () =>
            of(
              Object.keys(baselines ?? {}).map((name) => ({ name, count: 1 })),
            ),
          get performance() {
            return of({});
          },
        },
      },
      {
        provide: GenerationQueueService,
        useValue: {
          hiddenJobs: signal([]),
          estimateKudos: vi.fn().mockResolvedValue(1),
          enqueue: vi.fn(),
          jobs: signal([]),
          pendingJobs: signal([]),
          finishedJobs: signal([]),
          getJobImages: vi.fn().mockResolvedValue([]),
          lastAccepted: signal(null),
          clock: signal(0),
          whenReady: () => Promise.resolve(),
        },
      },
      { provide: StyleUsageService, useValue: { increment: vi.fn() } },
      {
        provide: ModelReferenceService,
        useValue: {
          names: signal(null),
          baselines: signal(baselines),
          requirements: signal(null),
          load: () => undefined,
          baselineFor: (model: string) => baselines?.[model] ?? null,
          requirementsFor: () => null,
          supportsRemix: (model: string) =>
            baselineSupportsRemix(baselines?.[model] ?? null),
          supportsQrCode: (model: string) =>
            baselineSupportsQrCode(baselines?.[model] ?? null),
        },
      },
      {
        provide: ToastService,
        useValue: { success: vi.fn(), error: vi.fn() },
      },
      { provide: TranslatorService, useValue: { get: () => of('') } },
      {
        provide: HordeStylesService,
        useValue: {
          getStyles: () => of([]),
          getCategoryGroups: () => of([]),
        },
      },
    ],
  }).compileComponents();
}

describe('GenerateComponent bottom sheets', () => {
  it('puts the tutorial steps in a sheet, and stands them down for a reference entry', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await createWholeStudio();

    const fixture = TestBed.createComponent(GenerateComponent);
    fixture.detectChanges();
    const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

    expect(el().querySelector('app-generate-learn-sheet')).toBeNull();

    void TestBed.inject(TutorialEngineService).start('txt2img');
    fixture.detectChanges();
    expect(el().querySelector('app-generate-learn-sheet')).not.toBeNull();

    // Both are sheets at the foot of one screen: the entry the reader just
    // asked for wins, and the steps come back when it closes.
    TestBed.inject(GsHelpDockService).open('steps');
    fixture.detectChanges();
    expect(el().querySelector('app-generate-learn-sheet')).toBeNull();

    TestBed.inject(GsHelpDockService).close();
    fixture.detectChanges();
    expect(el().querySelector('app-generate-learn-sheet')).not.toBeNull();

    fixture.destroy();
  });
});

describe('GenerateComponent request warnings', () => {
  it('is absent for a clean request and counts the warnings once one is earned', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await createWholeStudio({ 'sdxl model': 'stable_diffusion_xl' });

    const fixture = TestBed.createComponent(GenerateComponent);
    fixture.detectChanges();
    const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
    const indicator = (): HTMLButtonElement | null =>
      el().querySelector('.gs-lint-btn');

    expect(fixture.componentInstance.lintWarnings()).toEqual([]);
    expect(indicator()).toBeNull();

    // ControlNet on an SDXL model, with no image attached: two rules fire.
    // Denoise is pinned to 1 so the separate controlnet_denoise rule stays out
    // of the count this test measures.
    fixture.componentInstance.form.patchValue({
      model: 'sdxl model',
      sourceMode: 'controlnet',
      denoising_strength: 1,
    });
    fixture.detectChanges();

    expect(
      fixture.componentInstance.lintWarnings().map((warning) => warning.id),
    ).toEqual(['controlnet_baseline', 'source_required']);
    expect(indicator()?.textContent?.trim()).toBe('2');
    expect(indicator()?.getAttribute('aria-label')).toContain('2');
    expect(indicator()?.getAttribute('aria-expanded')).toBe('false');
    // The Generate button is never touched by any of this.
    const generate = el().querySelector('.gs-genbtn') as HTMLButtonElement;
    expect(generate.querySelector('.gs-lint-btn')).toBeNull();
    expect(generate.disabled).toBe(false);

    indicator()?.click();
    fixture.detectChanges();

    const popover = el().querySelector('.gs-lint-pop');
    expect(popover).not.toBeNull();
    expect(popover?.querySelectorAll('.gs-lint-item')).toHaveLength(2);
    expect(indicator()?.getAttribute('aria-expanded')).toBe('true');

    fixture.destroy();
  });

  it('warns about a masked request made from the simple panel', async () => {
    // The masked choices are reachable at the simple detail level, so the rules
    // that read them have to be evaluated against what simple mode submits.
    Element.prototype.scrollIntoView = vi.fn();
    await createWholeStudio({ 'flux model': 'flux_1' });

    const fixture = TestBed.createComponent(GenerateComponent);
    fixture.detectChanges();

    fixture.componentInstance.form.patchValue({
      model: 'flux model',
      sourceMode: 'img2img',
      maskEnabled: true,
      hires_fix: true,
    });
    fixture.detectChanges();

    expect(
      fixture.componentInstance.lintWarnings().map((warning) => warning.id),
    ).toEqual(expect.arrayContaining(['mask_baseline']));

    fixture.destroy();
  });

  it('reads a pinned setting off the style rather than the frozen control', async () => {
    // A style freezes the controls it pins without emptying them, so the panel
    // goes on holding the reader's own numbers. Advice given against those is
    // advice about settings the request will not carry.
    Element.prototype.scrollIntoView = vi.fn();
    await createWholeStudio({
      'flux model': 'flux_1',
      'sd model': 'stable_diffusion_1',
    });

    const fixture = TestBed.createComponent(GenerateComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.form.patchValue({
      model: 'flux model',
      sourceMode: 'img2img',
      maskEnabled: true,
    });
    fixture.detectChanges();
    expect(component.lintWarnings().map((warning) => warning.id)).toContain(
      'mask_baseline',
    );

    component.registerStyle({
      source: 'native',
      key: 'native:style-1',
      id: 'style-1',
      name: 'masks welcome',
      prompt: '{p} ### {np}',
      params: {},
      models: ['sd model'],
    });
    component.form.patchValue({ styleName: 'native:style-1' });
    fixture.detectChanges();

    expect(component.lintWarnings().map((warning) => warning.id)).not.toContain(
      'mask_baseline',
    );

    fixture.destroy();
  });

  it('warns about a canvas with no room to grow from the simple panel', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await createWholeStudio({ 'sdxl model': 'stable_diffusion_xl' });

    const fixture = TestBed.createComponent(GenerateComponent);
    fixture.detectChanges();

    fixture.componentInstance.form.patchValue({
      model: 'sdxl model',
      sourceMode: 'inpainting',
      outpaintEnabled: true,
      width: 1024,
      height: 1024,
    });
    fixture.detectChanges();
    // Stand in for the attachment the card would have emitted: the size asked
    // for matches the picture, so there is nothing to grow into.
    fixture.componentInstance.sourceState.set({
      mode: 'inpainting',
      sourceBlob: new Blob([new Uint8Array([1])], { type: 'image/webp' }),
      maskBlob: null,
      sourceWidth: 1024,
      sourceHeight: 1024,
      valid: true,
      validationMessage: null,
    });
    fixture.detectChanges();

    expect(
      fixture.componentInstance.lintWarnings().map((warning) => warning.id),
    ).toContain('outpaint_target');

    fixture.destroy();
  });
});

describe('GenerateComponent skip link', () => {
  it('moves focus to the results pane', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await createPaneOnlyStudio();

    const fixture = TestBed.createComponent(GenerateComponent);
    fixture.detectChanges();
    const pane = fixture.nativeElement.querySelector('section') as HTMLElement;

    fixture.componentInstance.skipToResults(new MouseEvent('click'));

    expect(document.activeElement).toBe(pane);
    fixture.destroy();
  });
});

describe('GenerateComponent arrival with a tutorial armed', () => {
  /**
   * The pane the tutorial renders in is below the fold on a stacked layout, and
   * the test DOM reports every element as having no box at all, which is the
   * same answer.
   */
  it('brings the learn pane on screen', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await createPaneOnlyStudio();
    TestBed.inject(TutorialEngineService).arm('txt2img');

    const fixture = TestBed.createComponent(GenerateComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(scrollIntoView).toHaveBeenCalled();
    fixture.destroy();
  });

  it('leaves the page where it is when nothing is armed', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await createPaneOnlyStudio();

    const fixture = TestBed.createComponent(GenerateComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(scrollIntoView).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('leaves the page alone where the steps arrive as a sheet over the form', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    // The environment defines no matchMedia at all, which is the answer the
    // guard reads as "no sheet"; the narrow viewport has to be stood up.
    // CDK's media matcher (which the sheet's scroll strategy reaches through
    // the overlay layer) subscribes to the list it is handed, so the stand-in
    // carries the listener methods as well as the answer.
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('max-width'),
          media: query,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    await createPaneOnlyStudio();
    TestBed.inject(TutorialEngineService).arm('txt2img');

    const fixture = TestBed.createComponent(GenerateComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    // The sheet is already over the field the first step names; scrolling the
    // pane up would take it off the screen the steps were put there to share.
    expect(scrollIntoView).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    fixture.destroy();
  });
});

/**
 * A licence fact with only the fields the advisories read, so a test can say
 * what the reference answered without standing a fetch up.
 */
function fact(status: string, licenseId: string): LicensingFact {
  return {
    status,
    licenseId,
    licenseName: null,
    licenseUrl: null,
    obligations: [],
  } as LicensingFact;
}

/**
 * Stand the studio up with the licensing answers a test wants, keyed the way
 * the real service keys them.
 */
async function createStudioWithLicensing(
  assets: Record<string, LicensingFact>,
  controlFacts: readonly NamedLicensingFact[] = [],
): Promise<GenerateComponent> {
  await TestBed.configureTestingModule({
    imports: [
      GenerateComponent,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: AiHordeService,
        useValue: {
          getImageModels: () => of([]),
          get performance() {
            return of({});
          },
        },
      },
      {
        provide: GenerationQueueService,
        useValue: {
          hiddenJobs: signal([]),
          estimateKudos: vi.fn().mockResolvedValue(1),
          enqueue: vi.fn(),
          jobs: signal([]),
          pendingJobs: signal([]),
          finishedJobs: signal([]),
          getJobImages: vi.fn().mockResolvedValue([]),
          lastAccepted: signal(null),
          clock: signal(0),
          whenReady: () => Promise.resolve(),
        },
      },
      { provide: StyleUsageService, useValue: { increment: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: TranslatorService, useValue: { get: () => of('') } },
      {
        provide: HordeStylesService,
        useValue: { getStyles: () => of([]), getCategoryGroups: () => of([]) },
      },
      {
        provide: LicensingService,
        useValue: {
          commercialUse: (category: string, name: string) =>
            computed(() => assets[`${category}:${name}`] ?? null),
          controlTypeFacts: () => computed(() => controlFacts),
        },
      },
    ],
  })
    .overrideComponent(GenerateComponent, { set: { template: '' } })
    .compileComponents();

  const fixture = TestBed.createComponent(GenerateComponent);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('GenerateComponent licence advisories', () => {
  /** The advisories only, so the compatibility rules a case also fires are out. */
  function licences(component: GenerateComponent) {
    return component
      .lintWarnings()
      .filter((warning) => warning.id.startsWith('licensing_'));
  }

  it('says nothing while the reference has no answer', async () => {
    const component = await createStudioWithLicensing({});
    component.form.patchValue({
      model: 'Stable Cascade 1.0',
      post_processing: ['4x_AnimeSharp'],
    });

    expect(licences(component)).toEqual([]);
  });

  it('warns about a model whose licence forbids commercial use', async () => {
    const component = await createStudioWithLicensing({
      'image_generation:Deliberate': fact(
        'allowed_with_conditions',
        'OpenRAIL-M',
      ),
      'image_generation:Stable Cascade 1.0': fact(
        'prohibited',
        'LicenseRef-Stable-Cascade-NC-Community',
      ),
    });
    component.form.patchValue({
      model: 'Stable Cascade 1.0',
      extraModels: ['Deliberate'],
    });

    expect(licences(component)).toEqual([
      {
        id: 'licensing_model',
        section: 'model',
        anchor: 'model',
        key: 'generate.lint.licensing_prohibited',
        params: {
          what: 'Stable Cascade 1.0',
          licence: 'LicenseRef-Stable-Cascade-NC-Community',
        },
      },
    ]);
  });

  it('warns about a post-processor, at the control that chose it', async () => {
    const component = await createStudioWithLicensing({
      'esrgan:4x_AnimeSharp': fact('prohibited', 'CC-BY-NC-SA-4.0'),
      'codeformer:CodeFormers': fact('prohibited', 'LicenseRef-S-Lab-1.0'),
    });
    component.form.patchValue({ post_processing: ['CodeFormers'] });

    expect(licences(component).map((warning) => warning.anchor)).toEqual([
      'facefixer',
    ]);

    component.form.patchValue({
      post_processing: ['4x_AnimeSharp', 'CodeFormers'],
    });

    const [warning] = licences(component);
    expect(warning.anchor).toBe('upscaler');
    expect(warning.params['what']).toBe('4x_AnimeSharp, CodeFormers');
    expect(warning.params['licence']).toBe(
      'CC-BY-NC-SA-4.0, LicenseRef-S-Lab-1.0',
    );
  });

  it('warns about a detector the control type brings with it', async () => {
    const component = await createStudioWithLicensing({}, [
      {
        name: 'control_openpose',
        category: 'controlnet',
        fact: fact('allowed_with_conditions', 'OpenRAIL-M'),
      },
      {
        name: 'annotator_openpose',
        category: 'controlnet_annotator',
        fact: fact('prohibited', 'LicenseRef-OpenPose-NonCommercial'),
      },
    ]);
    component.form.patchValue({
      sourceMode: 'controlnet',
      control_type: 'openpose',
    });

    const [warning] = licences(component);
    expect(warning.id).toBe('licensing_control');
    expect(warning.anchor).toBe('control_type');
    expect(warning.params['what']).toBe('annotator_openpose');
  });
});
