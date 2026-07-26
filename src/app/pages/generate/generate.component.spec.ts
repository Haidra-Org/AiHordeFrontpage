import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateComponent } from './generate.component';
import { AiHordeService } from '../../services/ai-horde.service';
import { GenerationQueueService } from '../../services/generation-queue.service';
import { ToastService } from '../../services/toast.service';
import { TranslatorService } from '../../services/translator.service';
import { HordeStylesService } from '../../services/horde-styles.service';
import { ImageGenerationRequest } from '../../types/generation';

describe('GenerateComponent', () => {
  let fixture: ComponentFixture<GenerateComponent>;
  let component: GenerateComponent;
  let estimateKudos: ReturnType<typeof vi.fn>;
  let enqueue: ReturnType<typeof vi.fn>;
  let toastSuccess: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    estimateKudos = vi.fn().mockResolvedValue(42);
    enqueue = vi.fn().mockResolvedValue('local-1');
    toastSuccess = vi.fn();
    toastError = vi.fn();
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [GenerateComponent],
      providers: [
        { provide: AiHordeService, useValue: { getImageModels: () => of([]) } },
        {
          provide: GenerationQueueService,
          useValue: {
            estimateKudos,
            enqueue,
            pendingJobs: signal([]),
            finishedJobs: signal([]),
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
});
