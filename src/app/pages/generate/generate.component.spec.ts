import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateComponent } from './generate.component';
import { AiHordeService } from '../../services/ai-horde.service';
import { GenerationQueueService } from '../../services/generation-queue.service';
import { ToastService } from '../../services/toast.service';
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
      component.form.patchValue({ styleName: 'Test' });

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
        styleName: 'Test',
      });

      await component.onCreate();

      const opts = enqueue.mock.calls[0][2] as { styleName?: string };
      expect(opts.styleName).toBe('Test');
      expect(styleIncrement).toHaveBeenCalledTimes(1);
      expect(styleIncrement).toHaveBeenCalledWith('Test');
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
        styleName: 'Test',
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
});

/**
 * The results pane has to be a real element for the scrolling and focusing that
 * targets it, so these stand the studio up with a template holding just that
 * pane (with the tabindex the real one carries).
 */
async function createPaneOnlyStudio(): Promise<void> {
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
    fixture.componentInstance.form.patchValue({
      model: 'sdxl model',
      sourceMode: 'controlnet',
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
    ).toEqual(expect.arrayContaining(['mask_baseline', 'hires_with_mask']));

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
