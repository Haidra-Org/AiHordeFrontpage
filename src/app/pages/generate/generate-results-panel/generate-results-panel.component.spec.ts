import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateResultsPanelComponent } from './generate-results-panel.component';
import { GenerationQueueService } from '../../../services/generation-queue.service';
import { ToastService } from '../../../services/toast.service';
import {
  LocalGenerationJob,
  LocalGenerationJobStatus,
} from '../../../types/generation-job';

function job(
  localId: string,
  status: LocalGenerationJobStatus,
): LocalGenerationJob {
  return {
    localId,
    status,
    createdAt: 0,
    updatedAt: 0,
    request: { prompt: 'a prompt' },
    resultImageIds: [],
  };
}

describe('GenerateResultsPanelComponent', () => {
  let fixture: ComponentFixture<GenerateResultsPanelComponent>;
  let component: GenerateResultsPanelComponent;
  let pendingJobs: ReturnType<typeof signal<LocalGenerationJob[]>>;
  let finishedJobs: ReturnType<typeof signal<LocalGenerationJob[]>>;
  let cancel: ReturnType<typeof vi.fn>;
  let retry: ReturnType<typeof vi.fn>;
  let deleteJob: ReturnType<typeof vi.fn>;
  let toastSuccess: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    pendingJobs = signal<LocalGenerationJob[]>([]);
    finishedJobs = signal<LocalGenerationJob[]>([]);
    cancel = vi.fn().mockResolvedValue(undefined);
    retry = vi.fn().mockResolvedValue('retry-1');
    deleteJob = vi.fn().mockResolvedValue(undefined);
    toastSuccess = vi.fn();

    await TestBed.configureTestingModule({
      imports: [GenerateResultsPanelComponent],
      providers: [
        {
          provide: GenerationQueueService,
          useValue: {
            pendingJobs,
            finishedJobs,
            cancel,
            retry,
            deleteJob,
            getJobImages: vi.fn().mockResolvedValue([]),
          },
        },
        { provide: ToastService, useValue: { success: toastSuccess } },
      ],
    })
      .overrideComponent(GenerateResultsPanelComponent, {
        set: { template: '' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(GenerateResultsPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('surfaces the queue pending and finished signals', () => {
    pendingJobs.set([job('p', 'processing')]);
    finishedJobs.set([job('f', 'done')]);

    expect(component.pendingJobs().map((j) => j.localId)).toEqual(['p']);
    expect(component.finishedJobs().map((j) => j.localId)).toEqual(['f']);
  });

  it('cancels a pending job through the queue', async () => {
    await component.cancel(job('a', 'waiting'));
    expect(cancel).toHaveBeenCalledWith('a');
  });

  it('retries an errored job and notifies', async () => {
    await component.retry(job('b', 'error'));
    expect(retry).toHaveBeenCalledWith('b');
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('deletes a job through the queue', async () => {
    await component.remove(job('c', 'done'));
    expect(deleteJob).toHaveBeenCalledWith('c');
  });

  it('opens and closes the lightbox view', () => {
    expect(component.lightbox()).toBeNull();
    component.openLightbox({
      imageId: 'i1',
      url: 'blob:x',
      mimeType: 'image/webp',
      metadata: { seed: '7', model: 'test' },
    });
    expect(component.lightbox()?.seed).toBe('7');
    component.closeLightbox();
    expect(component.lightbox()).toBeNull();
  });
});
