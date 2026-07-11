import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateComponent } from './generate.component';
import { AiHordeService } from '../../services/ai-horde.service';
import { GenerationQueueService } from '../../services/generation-queue.service';
import { ToastService } from '../../services/toast.service';
import { TranslatorService } from '../../services/translator.service';
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
    component.form.controls.prompt.setValue('a valid prompt');
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
    expect(request.params?.denoising_strength).toBe(0.6);
    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.kind)).toEqual(['source', 'mask']);
    expect(sources[0].blob).toBe(sourceBlob);
    expect(sources[1].blob).toBe(maskBlob);
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
