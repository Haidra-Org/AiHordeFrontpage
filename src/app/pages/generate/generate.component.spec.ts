import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateComponent } from './generate.component';
import { AiHordeService } from '../../services/ai-horde.service';
import { GenerationQueueService } from '../../services/generation-queue.service';
import { ToastService } from '../../services/toast.service';
import { TranslatorService } from '../../services/translator.service';
import { HordeStylesService } from '../../services/horde-styles.service';
import { StyleUsageService } from '../../services/style-usage.service';
import { TutorialEngineService } from '../../services/tutorial-engine.service';
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
} from './generate-form.model';

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
  let baselines: WritableSignal<ModelBaselineMap | null>;

  beforeEach(async () => {
    estimateKudos = vi.fn().mockResolvedValue(42);
    enqueue = vi.fn().mockResolvedValue('local-1');
    toastSuccess = vi.fn();
    toastError = vi.fn();
    styleIncrement = vi.fn();
    getJobImages = vi.fn().mockResolvedValue([]);
    jobs = signal<LocalGenerationJob[]>([]);
    baselines = signal<ModelBaselineMap | null>(null);
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [GenerateComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AiHordeService, useValue: { getImageModels: () => of([]) } },
        {
          provide: GenerationQueueService,
          useValue: {
            estimateKudos,
            enqueue,
            jobs,
            pendingJobs: signal([]),
            finishedJobs: signal([]),
            getJobImages,
          },
        },
        { provide: StyleUsageService, useValue: { increment: styleIncrement } },
        {
          // Stubbed rather than stubbing HttpClient, so a test can publish a
          // baseline map and drive the remix/QR gating directly.
          provide: ModelReferenceService,
          useValue: {
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

    fixture = TestBed.createComponent(GenerateComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
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

  it('enqueues a request built from the form and toasts on success', async () => {
    component.form.patchValue({
      mode: 'advanced',
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
    expect(toastSuccess).toHaveBeenCalled();
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

  it('blocks enqueue and shows validation when the source section is invalid', async () => {
    component.form.patchValue({
      mode: 'advanced',
      prompt: 'a valid prompt',
      sourceMode: 'controlnet',
    });
    component.sourceState.set({
      mode: 'controlnet',
      sourceBlob: null,
      maskBlob: null,
      valid: false,
    });

    await component.onCreate();

    expect(enqueue).not.toHaveBeenCalled();
    expect(component.sourceValidationVisible()).toBe(true);
  });

  it('passes source and mask blobs to enqueue for a valid inpainting request', async () => {
    const sourceBlob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    const maskBlob = new Blob([new Uint8Array([2])], { type: 'image/png' });
    component.form.patchValue({
      mode: 'advanced',
      prompt: 'inpaint here',
      sourceMode: 'inpainting',
      denoising_strength: 0.6,
    });
    component.sourceState.set({
      mode: 'inpainting',
      sourceBlob,
      maskBlob,
      valid: true,
    });

    await component.onCreate();

    expect(enqueue).toHaveBeenCalledTimes(1);
    const [request, sources] = enqueue.mock.calls[0] as [
      ImageGenerationRequest,
      { kind: string; blob: Blob; mimeType: string }[],
    ];
    expect(request.source_processing).toBe('inpainting');
    expect(request.params?.denoising_strength).toBe(0.6);
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
      mode: 'advanced',
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
      mode: 'advanced',
      prompt: 'img2img',
      sourceMode: 'img2img',
    });
    component.sourceState.set({
      mode: 'img2img',
      sourceBlob,
      maskBlob: null,
      extras: [{ blob: new Blob([new Uint8Array([2])]), strength: 1 }],
      valid: true,
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

    it('strips a stale qrText from built requests when the model cannot serve it', () => {
      baselines.set({
        'Stable Cascade 1.0': 'stable_cascade',
        'AlbedoBase XL (SDXL)': 'stable_diffusion_xl',
      });
      component.form.patchValue({
        mode: 'advanced',
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

  it('submits advanced-only fields at their defaults in simple mode', async () => {
    // Simple mode keeps the simple controls (prompt/model/size/batch/style) but
    // resets advanced-only fields, so a persisted advanced value cannot leak in.
    component.form.patchValue({
      mode: 'simple',
      prompt: 'a castle on a hill',
      post_processing: ['GFPGAN'],
      steps: 40,
      seed: '99',
    });

    await component.onCreate();

    const request = enqueue.mock.calls[0][0] as ImageGenerationRequest;
    expect(request.prompt).toBe('a castle on a hill');
    expect(request.params?.post_processing).toBeUndefined();
    expect(request.params?.steps).toBe(25);
    expect(request.params?.seed).toBeUndefined();
  });

  it('ignores a persisted source image in simple mode', async () => {
    const sourceBlob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    component.form.patchValue({
      mode: 'simple',
      prompt: 'a plain image',
      sourceMode: 'img2img',
    });
    component.sourceState.set({
      mode: 'img2img',
      sourceBlob,
      maskBlob: null,
      valid: true,
    });

    await component.onCreate();

    const [request, sources] = enqueue.mock.calls[0] as [
      ImageGenerationRequest,
      unknown,
    ];
    expect(request.source_processing).toBeUndefined();
    expect(sources).toBeUndefined();
  });

  it('applies a selected style to the built request', async () => {
    component.form.patchValue({
      mode: 'advanced',
      prompt: 'a cat',
      styleName: 'Test',
    });

    await component.onCreate();

    const request = enqueue.mock.calls[0][0] as ImageGenerationRequest;
    expect(request.prompt).toBe('a cat, masterpiece');
    expect(request.models).toEqual(['flux']);
  });

  it('exposes the style-forced params for hints once a style is selected', () => {
    component.form.controls.styleName.setValue('Test');

    expect(component.forcedParams()?.model).toBe('flux');
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
        mode: 'advanced',
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
        mode: 'advanced',
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

    it('opens the form in advanced mode and drops any selected style', async () => {
      component.form.patchValue({ mode: 'simple', styleName: 'Test' });

      await component.onApplyMeta({
        request,
        localId: 'job-1',
        keys: ['prompt'],
        mode: 'overlay',
      });

      expect(component.form.controls.mode.value).toBe('advanced');
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
        mode: 'advanced',
        prompt: 'a cat',
        styleName: 'Test',
      });

      await component.onCreate();

      const opts = enqueue.mock.calls[0][2] as { styleName?: string };
      expect(opts.styleName).toBe('Test');
      expect(styleIncrement).toHaveBeenCalledTimes(1);
      expect(styleIncrement).toHaveBeenCalledWith('Test');
    });

    it('records nothing when no style is selected', async () => {
      component.form.patchValue({ mode: 'advanced', prompt: 'a cat' });

      await component.onCreate();

      expect(enqueue.mock.calls[0][2]).toBeUndefined();
      expect(styleIncrement).not.toHaveBeenCalled();
    });
  });

  describe('use as source', () => {
    it('switches to advanced img2img and attaches the stored result', async () => {
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

      expect(component.form.controls.mode.value).toBe('advanced');
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
      component.form.patchValue({ mode: 'advanced', sourceMode: 'inpainting' });

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
    it('switches the form into advanced img2img before attaching', async () => {
      await component.onDroppedImage(
        new File(['x'], 'shot.png', { type: 'image/png' }),
      );

      const value = component.form.getRawValue();
      expect(value.mode).toBe('advanced');
      expect(value.sourceMode).toBe('img2img');
      // The source section is not rendered in this template-less harness, so the
      // attach itself cannot land and is reported as a failure.
      expect(toastError).toHaveBeenCalledWith('generate.source.attach_failed', {
        transloco: true,
      });
    });

    it('keeps an already-chosen source mode instead of forcing img2img', async () => {
      component.form.patchValue({ mode: 'advanced', sourceMode: 'controlnet' });

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
  });

  describe('follow-along tutorial host', () => {
    it('writes only the fields a step names', () => {
      component.applyFields({ steps: 30 });

      const value = component.form.getRawValue();
      expect(value.steps).toBe(30);
      expect(value.prompt).toBe(DEFAULT_GENERATE_FORM_VALUE.prompt);
      expect(value.cfg_scale).toBe(DEFAULT_GENERATE_FORM_VALUE.cfg_scale);
    });

    it('reports and sets the panel mode a step needs revealed', () => {
      expect(component.currentMode()).toBe(DEFAULT_GENERATE_FORM_VALUE.mode);

      component.setMode('advanced');

      expect(component.currentMode()).toBe('advanced');
      expect(component.form.controls.mode.value).toBe('advanced');
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

  describe('preset load', () => {
    const preset = (): GenerateFormValue => ({
      ...DEFAULT_GENERATE_FORM_VALUE,
      mode: 'advanced',
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
        styleName: 'Test',
        mode: 'simple',
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
      expect(applied.mode).toBe('advanced');
    });

    it('leaves the form alone when the review is dismissed', () => {
      component.form.patchValue({ prompt: 'a fox' });
      component.onApplyPreset(preset());

      component.cancelLoad();

      expect(component.pendingLoadRequest()).toBeNull();
      expect(component.form.getRawValue().prompt).toBe('a fox');
    });
  });
});

describe('GenerateComponent skip link', () => {
  /**
   * The skip link's only job is to land accessibility focus on the results pane,
   * which needs a real element, so this stands in a template holding just that
   * pane (with the tabindex the real one carries).
   */
  it('moves focus to the results pane', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await TestBed.configureTestingModule({
      imports: [GenerateComponent],
      providers: [
        { provide: AiHordeService, useValue: { getImageModels: () => of([]) } },
        {
          provide: GenerationQueueService,
          useValue: {
            estimateKudos: vi.fn().mockResolvedValue(1),
            enqueue: vi.fn(),
            jobs: signal([]),
            pendingJobs: signal([]),
            finishedJobs: signal([]),
            getJobImages: vi.fn().mockResolvedValue([]),
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

    const fixture = TestBed.createComponent(GenerateComponent);
    fixture.detectChanges();
    const pane = fixture.nativeElement.querySelector('section') as HTMLElement;

    fixture.componentInstance.skipToResults(new MouseEvent('click'));

    expect(document.activeElement).toBe(pane);
    fixture.destroy();
  });
});
