import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslocoService } from '@jsverse/transloco';
import { GenerateResultsPanelComponent } from './generate-results-panel.component';
import { GenerationQueueService } from '../../../services/generation-queue.service';
import { ToastService } from '../../../services/toast.service';
import { DatabaseService } from '../../../services/database.service';
import {
  LocalGenerationJob,
  LocalGenerationJobStatus,
  StoredJobImage,
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

/** A stored result image, optionally carrying a reported aesthetic score. */
function resultImage(
  localId: string,
  imageId: string,
  aesthetic?: number,
): StoredJobImage {
  return {
    localId,
    imageId,
    kind: 'result',
    blob: new Blob(['x']),
    mimeType: 'image/webp',
    metadata: {
      seed: imageId,
      model: 'a-model',
      genMetadata:
        aesthetic === undefined
          ? []
          : [
              {
                type: 'aesthetic_score',
                value: 'see_ref',
                ref: String(aesthetic),
              },
            ],
    },
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
  let getJobImages: ReturnType<typeof vi.fn>;
  let dbGet: ReturnType<typeof vi.fn>;
  let dbStore: ReturnType<typeof vi.fn>;

  /**
   * Let the thumbnail effect run and its stored-image read resolve, so the
   * `done` tiles (and with them the viewer's navigation set) exist.
   */
  async function loadThumbnails(): Promise<void> {
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(async () => {
    pendingJobs = signal<LocalGenerationJob[]>([]);
    finishedJobs = signal<LocalGenerationJob[]>([]);
    cancel = vi.fn().mockResolvedValue(undefined);
    retry = vi.fn().mockResolvedValue('retry-1');
    deleteJob = vi.fn().mockResolvedValue(undefined);
    toastSuccess = vi.fn();
    getJobImages = vi.fn().mockResolvedValue([]);
    dbGet = vi.fn().mockReturnValue(undefined);
    dbStore = vi.fn();
    // jsdom has no object-URL support and the grid makes one per thumbnail.
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();

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
            getJobImages,
          },
        },
        {
          provide: ToastService,
          useValue: { success: toastSuccess, warning: vi.fn() },
        },
        {
          provide: DatabaseService,
          useValue: { get: dbGet, store: dbStore },
        },
        {
          provide: TranslocoService,
          useValue: { translate: (key: string) => key },
        },
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
    await component.cancelJob('a');
    expect(cancel).toHaveBeenCalledWith('a');
  });

  it('retries an errored job and notifies', async () => {
    await component.retryJob('b');
    expect(retry).toHaveBeenCalledWith('b');
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('deletes a job through the queue', async () => {
    await component.deleteJob('c');
    expect(deleteJob).toHaveBeenCalledWith('c');
  });

  it('expands pending and finished jobs into grid tiles', () => {
    pendingJobs.set([
      {
        ...job('p', 'processing'),
        request: { prompt: 'x', params: { n: 2, width: 512, height: 768 } },
      },
    ]);
    finishedJobs.set([job('e', 'error'), job('x', 'cancelled')]);

    const tiles = component.tiles();
    // 2 generating tiles (batch of 2) + 1 error tile + 1 cancelled tile.
    expect(tiles.map((t) => t.kind)).toEqual([
      'generating',
      'generating',
      'error',
      'cancelled',
    ]);
    expect(tiles[0].aspect).toBe('512/768');
  });

  it('opens and closes the viewer', () => {
    expect(component.viewerTile()).toBeNull();
    finishedJobs.set([job('f', 'done')]);
    getJobImages.mockResolvedValue([resultImage('f', 'img-1')]);

    component.openViewer({
      key: 'k',
      kind: 'done',
      jobLocalId: 'j',
      aspect: '1/1',
      dims: '',
      url: 'blob:x',
    });
    expect(component.viewerKey()).toBe('k');
    component.closeViewer();
    expect(component.viewerKey()).toBeNull();
  });

  it('ignores a viewer request for a tile with no image', () => {
    component.openViewer({
      key: 'e',
      kind: 'error',
      jobLocalId: 'j',
      aspect: '1/1',
      dims: '',
    });
    expect(component.viewerKey()).toBeNull();
  });

  describe('mobile tile flip', () => {
    const tile = (key: string) => ({
      key,
      kind: 'done' as const,
      jobLocalId: key,
      aspect: '1/1',
      dims: '',
      url: 'blob:x',
    });

    it('keeps only one tile flipped at a time', () => {
      component.flipTile(tile('a'));
      expect(component.isFlipped(tile('a'))).toBe(true);

      component.flipTile(tile('b'));

      expect(component.isFlipped(tile('a'))).toBe(false);
      expect(component.isFlipped(tile('b'))).toBe(true);
    });

    it('unflips when select mode is entered', () => {
      component.flipTile(tile('a'));

      component.toggleSelectMode();

      expect(component.selectMode()).toBe(true);
      expect(component.flippedTile()).toBeNull();
    });

    it('unflips when the viewer opens', () => {
      component.flipTile(tile('a'));

      component.openViewer(tile('a'));

      expect(component.flippedTile()).toBeNull();
    });
  });

  describe('show-prompts overlay', () => {
    it('defaults to on with no stored preference', () => {
      expect(component.showPrompts()).toBe(true);
    });

    it('honours a stored opt-out', () => {
      dbGet.mockImplementation((key: string) =>
        key === 'aihorde.generate.show_prompts' ? false : undefined,
      );
      const fresh = TestBed.createComponent(GenerateResultsPanelComponent);

      expect(fresh.componentInstance.showPrompts()).toBe(false);
      fresh.destroy();
    });

    it('persists each toggle', () => {
      component.toggleShowPrompts();

      expect(component.showPrompts()).toBe(false);
      expect(dbStore).toHaveBeenCalledWith(
        'aihorde.generate.show_prompts',
        false,
      );
    });
  });

  describe('effective column count', () => {
    it('uses the stored preference while the grid is unmeasured', () => {
      component.imagesPerRow.set(5);

      expect(component.effectiveColumns()).toBe(5);
      expect(component.tileWidth()).toBe(0);
      expect(component.compactTiles()).toBe(false);
      expect(component.tileWidthVar()).toBeNull();
    });

    it('clamps columns so tiles never fall below the minimum width', () => {
      component.imagesPerRow.set(5);
      // 420px would give five ~76px tiles; only two fit at 140px minimum.
      component.gridWidth.set(420);

      expect(component.effectiveColumns()).toBe(2);
      expect(component.tileWidth()).toBe(202);
      expect(component.gridColumns()).toBe('repeat(2, minmax(0, 1fr))');
    });

    it('keeps the preference when the grid is wide enough', () => {
      component.imagesPerRow.set(6);
      component.gridWidth.set(1100);

      expect(component.effectiveColumns()).toBe(6);
      expect(component.tileWidth()).toBe(170);
      expect(component.compactTiles()).toBe(false);
    });

    it('switches the tile chrome to compact once tiles get small', () => {
      component.imagesPerRow.set(6);
      component.gridWidth.set(1000);

      expect(component.effectiveColumns()).toBe(6);
      expect(component.compactTiles()).toBe(true);
    });

    it('never drops below a single column', () => {
      component.imagesPerRow.set(4);
      component.gridWidth.set(90);

      expect(component.effectiveColumns()).toBe(1);
    });

    it('marks roomy tiles as non-compact and exposes their width', () => {
      component.imagesPerRow.set(2);
      component.gridWidth.set(1000);

      expect(component.compactTiles()).toBe(false);
      expect(component.tileWidthVar()).toBe('492px');
    });
  });

  describe('viewer navigation', () => {
    beforeEach(async () => {
      getJobImages.mockResolvedValue([
        resultImage('f', 'low', 1),
        resultImage('f', 'high', 9),
      ]);
      finishedJobs.set([job('f', 'done')]);
      await loadThumbnails();
    });

    it('navigates the done tiles in the order the grid shows them', () => {
      expect(component.viewerTiles().map((t) => t.seed)).toEqual([
        'low',
        'high',
      ]);

      component.openViewer(component.viewerTiles()[0]);
      component.viewerNext();

      expect(component.viewerTile()?.seed).toBe('high');
      expect(component.viewerIndex()).toBe(1);
      expect(component.viewerCount()).toBe(2);
    });

    it('follows the aesthetic sort rather than the job order', () => {
      component.toggleSort();

      expect(component.viewerTiles().map((t) => t.seed)).toEqual([
        'high',
        'low',
      ]);

      component.openViewer(component.viewerTiles()[0]);
      component.viewerNext();

      expect(component.viewerTile()?.seed).toBe('low');
    });

    it('wraps around at both ends', () => {
      component.openViewer(component.viewerTiles()[0]);

      component.viewerPrev();

      expect(component.viewerTile()?.seed).toBe('high');
    });
  });

  describe('deleting from the viewer', () => {
    beforeEach(async () => {
      // The thumbnail effect reads the finished jobs in order, so one queued
      // response per job keeps each tile's images its own.
      getJobImages
        .mockResolvedValueOnce([resultImage('a', 'a-img')])
        .mockResolvedValueOnce([resultImage('b', 'b-img')]);
      finishedJobs.set([job('a', 'done'), job('b', 'done')]);
      await loadThumbnails();
    });

    it('advances to the next surviving image', async () => {
      component.openViewer(component.viewerTiles()[0]);
      component.requestDelete(['a']);

      await component.confirmDelete();

      expect(deleteJob).toHaveBeenCalledWith('a');
      expect(component.viewerKey()).toBe('b-b-img');
    });

    it('closes the viewer when nothing survives', async () => {
      component.openViewer(component.viewerTiles()[0]);
      component.requestDelete(['a', 'b']);

      await component.confirmDelete();

      expect(component.viewerKey()).toBeNull();
    });

    it('leaves the viewer alone when another job is deleted', async () => {
      component.openViewer(component.viewerTiles()[0]);
      component.requestDelete(['b']);

      await component.confirmDelete();

      expect(component.viewerKey()).toBe('a-a-img');
    });
  });

  describe('viewer tap and swipe', () => {
    const pointer = (x: number, type = 'touch'): PointerEvent =>
      ({ clientX: x, pointerType: type }) as PointerEvent;

    beforeEach(async () => {
      getJobImages.mockResolvedValue([
        resultImage('f', 'one'),
        resultImage('f', 'two'),
      ]);
      finishedJobs.set([job('f', 'done')]);
      await loadThumbnails();
      component.openViewer(component.viewerTiles()[0]);
    });

    it('closes on a clean tap of the image', () => {
      component.onViewerPointerDown(pointer(100));
      component.onViewerPointerUp(pointer(102));

      component.onViewerImageClick();

      expect(component.viewerKey()).toBeNull();
    });

    it('navigates on a swipe and does not also close', () => {
      component.onViewerPointerDown(pointer(300));
      component.onViewerPointerUp(pointer(200));

      expect(component.viewerTile()?.seed).toBe('two');

      component.onViewerImageClick();

      expect(component.viewerKey()).not.toBeNull();
      expect(component.viewerTile()?.seed).toBe('two');
    });

    it('does not navigate on a mouse drag, and the drag does not close', () => {
      component.onViewerPointerDown(pointer(300, 'mouse'));
      component.onViewerPointerUp(pointer(200, 'mouse'));

      expect(component.viewerTile()?.seed).toBe('one');

      component.onViewerImageClick();

      expect(component.viewerKey()).not.toBeNull();
    });

    it('ignores a drag shorter than the swipe threshold', () => {
      component.onViewerPointerDown(pointer(300));
      component.onViewerPointerUp(pointer(280));

      expect(component.viewerTile()?.seed).toBe('one');
    });
  });

  describe('pinned metadata', () => {
    beforeEach(async () => {
      getJobImages.mockResolvedValue([
        resultImage('f', 'one'),
        resultImage('f', 'two'),
      ]);
      finishedJobs.set([job('f', 'done')]);
      await loadThumbnails();
    });

    it('persists the pin and drops the panel when unpinned', () => {
      component.openViewer(component.viewerTiles()[0]);
      component.toggleMeta(component.viewerTiles()[0]);
      expect(component.metaOpen()).toBe(true);

      component.toggleMetaPin();

      expect(component.metaPinned()).toBe(true);
      expect(dbStore).toHaveBeenCalledWith(
        'aihorde.generate.meta_pinned',
        true,
      );

      component.toggleMetaPin();

      expect(component.metaPinned()).toBe(false);
      expect(component.metaOpen()).toBe(false);
    });

    it('shows the panel as soon as a pinned viewer opens', async () => {
      dbGet.mockImplementation((key: string) =>
        key === 'aihorde.generate.meta_pinned' ? true : undefined,
      );
      const fresh = TestBed.createComponent(GenerateResultsPanelComponent);
      const pinned = fresh.componentInstance;
      fresh.detectChanges();
      await Promise.resolve();
      await Promise.resolve();
      fresh.detectChanges();

      pinned.openViewer(pinned.viewerTiles()[0]);

      expect(pinned.metaOpen()).toBe(true);
      expect(pinned.metaTile()?.seed).toBe('one');
      fresh.destroy();
    });

    it('follows the viewer to the next image', () => {
      component.openViewer(component.viewerTiles()[0]);
      component.toggleMeta(component.viewerTiles()[0]);
      expect(component.metaTile()?.seed).toBe('one');

      component.viewerNext();

      expect(component.metaTile()?.seed).toBe('two');
    });

    it('describes the opening tile when the viewer is closed', () => {
      component.openMeta(component.viewerTiles()[1]);

      expect(component.metaTile()?.seed).toBe('two');
    });
  });

  it('opens the metadata panel in replace mode for "load settings"', () => {
    finishedJobs.set([job('f', 'done')]);
    component.metaMode.set('overlay');

    component.openLoadSettings({
      key: 'k',
      kind: 'done',
      jobLocalId: 'f',
      aspect: '1/1',
      dims: '',
    });

    expect(component.metaOpen()).toBe(true);
    expect(component.metaMode()).toBe('replace');
  });

  it('forwards a metadata selection with the tile request attached', async () => {
    const emitted: { request: unknown; keys: string[] }[] = [];
    component.applyMeta.subscribe((event) =>
      emitted.push({ request: event.request, keys: event.keys }),
    );
    getJobImages.mockResolvedValue([resultImage('f', 'seed-9')]);
    finishedJobs.set([job('f', 'done')]);
    await loadThumbnails();
    component.openMeta(component.viewerTiles()[0]);

    component.onMetaApply({
      localId: 'f',
      keys: ['prompt'],
      mode: 'overlay',
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].keys).toEqual(['prompt']);
    // The returned seed is folded into the applied request.
    expect(emitted[0].request).toEqual({
      prompt: 'a prompt',
      params: { seed: 'seed-9' },
    });
    expect(component.metaTile()).toBeNull();
  });
});
