import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { GenerateResultsPanelComponent } from './generate-results-panel.component';
import { GenerationQueueService } from '../../../services/generation-queue.service';
import { ToastService } from '../../../services/toast.service';
import { DatabaseService } from '../../../services/database.service';
import { Router, provideRouter } from '@angular/router';
import { StudioHandoffService } from '../../../services/studio-handoff.service';
import { TutorialEngineService } from '../../../services/tutorial-engine.service';
import { GsHelpDockService } from '../../../services/gs-help-dock.service';
import { WorkerPoolService } from '../../../services/worker-pool.service';
import { HordeWorker } from '../../../types/horde-worker';
import {
  LocalGenerationJob,
  LocalGenerationJobStatus,
  StoredJobImage,
} from '../../../types/generation-job';
import en from '../../../../assets/i18n/en.json';
import { studioLinkFromText } from '../studio-link';
import { DOCS_IMAGE } from '../../../content/docs-links';

const TRANSLATIONS = en as Record<string, string>;

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
  let toastError: ReturnType<typeof vi.fn>;
  let getJobImages: ReturnType<typeof vi.fn>;
  let dbGet: ReturnType<typeof vi.fn>;
  let dbStore: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let handoff: { set: ReturnType<typeof vi.fn> };

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
    toastError = vi.fn();
    getJobImages = vi.fn().mockResolvedValue([]);
    dbGet = vi.fn().mockReturnValue(undefined);
    dbStore = vi.fn();
    navigate = vi.fn().mockResolvedValue(true);
    handoff = { set: vi.fn() };
    // jsdom has no object-URL support and the grid makes one per thumbnail.
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();

    await TestBed.configureTestingModule({
      imports: [GenerateResultsPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
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
          useValue: {
            success: toastSuccess,
            warning: vi.fn(),
            error: toastError,
          },
        },
        {
          provide: DatabaseService,
          useValue: { get: dbGet, store: dbStore },
        },
        {
          // Only the address building is exercised here; the studio's own
          // routes are not loaded, so the tree is serialized by hand.
          provide: Router,
          useValue: {
            navigate,
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
        { provide: StudioHandoffService, useValue: handoff },
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
    // 2 claimed tiles (batch of 2) + 1 error tile + 1 cancelled tile.
    expect(tiles.map((t) => t.kind)).toEqual([
      'claimed',
      'claimed',
      'error',
      'cancelled',
    ]);
    expect(tiles[0].aspect).toBe('512/768');
  });

  it('uses lifecycle counts to show mixed batch progress', () => {
    pendingJobs.set([
      {
        ...job('mixed', 'processing'),
        request: { prompt: 'x', params: { n: 4 } },
        finishedCount: 1,
        processingCount: 1,
        waitingCount: 2,
      },
    ]);

    expect(component.tiles().map((tile) => tile.kind)).toEqual([
      'finished-pending',
      'claimed',
      'queued',
      'queued',
    ]);
    expect(
      component.tiles().every((tile) => tile.applyRequest?.prompt === 'x'),
    ).toBe(true);
  });

  it('opens the submitted settings from an in-flight tile', () => {
    pendingJobs.set([job('pending', 'queued')]);
    const tile = component.tiles()[0];

    component.openLoadSettings(tile);

    expect(component.metaTile()?.applyRequest).toBe(tile.request);
    expect(component.metaMode()).toBe('replace');
  });

  it('anchors the Actions menu to its button and toggles its open state', () => {
    pendingJobs.set([job('pending', 'queued')]);
    const tile = component.tiles()[0];
    const button = document.createElement('button');
    const event = {
      currentTarget: button,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent;

    component.openTileMenu(tile, event);

    expect(component.tileMenu()).toMatchObject({
      tile,
      source: 'button',
      anchor: button,
    });
    expect(component.isTileMenuButtonOpen(tile)).toBe(true);

    component.openTileMenu(tile, event);

    expect(component.tileMenu()).toBeNull();
    expect(component.isTileMenuButtonOpen(tile)).toBe(false);
  });

  it('opens the View menu, closes it on Escape and marks the retention note read', () => {
    expect(sessionStorage.getItem('aihorde.studio.retention_seen')).toBe('1');

    component.toggleViewMenu();
    expect(component.viewMenuOpen()).toBe(true);

    component.onDocumentEscape();
    expect(component.viewMenuOpen()).toBe(false);
  });

  it('clamps racing lifecycle counts to the requested batch size', () => {
    pendingJobs.set([
      {
        ...job('racing', 'processing'),
        request: { prompt: 'x', params: { n: 2 } },
        finishedCount: 1,
        processingCount: 3,
        waitingCount: 4,
      },
    ]);

    expect(component.tiles().map((tile) => tile.kind)).toEqual([
      'finished-pending',
      'claimed',
    ]);
  });

  it('shows a notice tile for every dropped CSAM filter image', () => {
    finishedJobs.set([{ ...job('c', 'done'), csamCensoredCount: 2 }]);

    expect(component.tiles().map((tile) => tile.kind)).toEqual([
      'censored',
      'censored',
    ]);
  });

  it('keeps CSAM evidence cards visible in the errors filter', () => {
    finishedJobs.set([{ ...job('c', 'done'), csamCensoredCount: 2 }]);
    component.errorsOnly.set(true);

    expect(component.hasErrors()).toBe(true);
    expect(component.visibleTiles().map((tile) => tile.kind)).toEqual([
      'censored',
      'censored',
    ]);
  });

  it('labels a tile with the positive half of the stored prompt', () => {
    // The stored prompt is whatever was submitted, and nothing guarantees the
    // horde separator was written with spaces around it: the tile label has to
    // split on the marker itself, as the form does when loading a past request.
    pendingJobs.set([
      {
        ...job('spaced', 'processing'),
        request: { prompt: 'a cat ### blurry' },
      },
      { ...job('tight', 'processing'), request: { prompt: 'a cat###blurry' } },
    ]);

    expect(component.tiles().map((t) => t.prompt)).toEqual(['a cat', 'a cat']);
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

  describe('tile quick actions', () => {
    it('defaults to off with no stored preference', () => {
      expect(component.showQuickActions()).toBe(false);
    });

    it('honours a stored opt-in', () => {
      dbGet.mockImplementation((key: string) =>
        key === 'aihorde.generate.show_quick_actions' ? true : undefined,
      );
      const fresh = TestBed.createComponent(GenerateResultsPanelComponent);

      expect(fresh.componentInstance.showQuickActions()).toBe(true);
      fresh.destroy();
    });

    it('persists each toggle', () => {
      component.toggleShowQuickActions();

      expect(component.showQuickActions()).toBe(true);
      expect(dbStore).toHaveBeenCalledWith(
        'aihorde.generate.show_quick_actions',
        true,
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

    it('requires confirmation before removing the generation', () => {
      component.openViewer(component.viewerTiles()[0]);

      component.requestViewerDelete('a');

      expect(component.viewerDeletePending()).toBe('a');
      expect(component.viewerKey()).toBe('a-a-img');
      expect(component.undoPending()).toBe(false);
      expect(toastSuccess).not.toHaveBeenCalled();
    });

    it('advances to the next surviving image after confirmation', () => {
      component.openViewer(component.viewerTiles()[0]);
      component.requestViewerDelete('a');

      component.confirmViewerDelete();

      expect(component.viewerDeletePending()).toBeNull();
      expect(component.viewerKey()).toBe('b-b-img');
      // Still recoverable: nothing has reached the queue yet.
      expect(deleteJob).not.toHaveBeenCalled();
    });

    it('keeps the viewer unchanged when confirmation is cancelled', () => {
      component.openViewer(component.viewerTiles()[0]);
      component.requestViewerDelete('a');

      component.cancelViewerDelete();

      expect(component.viewerDeletePending()).toBeNull();
      expect(component.viewerKey()).toBe('a-a-img');
      expect(component.undoPending()).toBe(false);
    });

    it('closes the viewer when the confirmed job has no surviving image', () => {
      finishedJobs.set([job('a', 'done')]);
      component.openViewer(component.viewerTiles()[0]);
      component.requestViewerDelete('a');

      component.confirmViewerDelete();

      expect(component.viewerKey()).toBeNull();
    });

    it('leaves the viewer alone when another job is deleted', () => {
      component.openViewer(component.viewerTiles()[0]);

      component.requestDelete(['b']);

      expect(component.viewerKey()).toBe('a-a-img');
    });
  });

  describe('soft delete and undo', () => {
    beforeEach(async () => {
      getJobImages
        .mockResolvedValueOnce([resultImage('a', 'a-img')])
        .mockResolvedValueOnce([resultImage('b', 'b-img')]);
      finishedJobs.set([job('a', 'done'), job('b', 'done')]);
      await loadThumbnails();
    });

    it('removes the tiles at once and offers an undo', () => {
      component.requestDelete(['a']);

      expect(component.tiles().map((t) => t.jobLocalId)).toEqual(['b']);
      expect(component.undoPending()).toBe(true);
      expect(deleteJob).not.toHaveBeenCalled();
      const [key, options] = toastSuccess.mock.calls[0] as [
        string,
        { action?: { label: string; run: () => void } },
      ];
      expect(key).toBe('generate.results.deleted_undo');
      expect(options.action?.label).toBe('generate.results.undo');
    });

    it('restores exactly what was removed when undone', () => {
      component.requestDelete(['a']);

      component.undoDelete();

      expect(component.tiles().map((t) => t.jobLocalId)).toEqual(['a', 'b']);
      expect(component.undoPending()).toBe(false);
      expect(deleteJob).not.toHaveBeenCalled();
    });

    it('restores through the toast action', () => {
      component.requestDelete(['a']);
      const [, options] = toastSuccess.mock.calls[0] as [
        string,
        { action: { run: () => void } },
      ];

      options.action.run();

      expect(component.undoPending()).toBe(false);
      expect(component.tiles()).toHaveLength(2);
    });

    it('commits the deletion when the undo window lapses', async () => {
      vi.useFakeTimers();
      component.requestDelete(['a', 'b']);

      await vi.advanceTimersByTimeAsync(6000);

      expect(deleteJob).toHaveBeenCalledWith('a');
      expect(deleteJob).toHaveBeenCalledWith('b');
      expect(component.undoPending()).toBe(false);
      vi.useRealTimers();
    });

    it('commits the previous deletion when a new one starts', async () => {
      component.requestDelete(['a']);

      component.requestDelete(['b']);
      await Promise.resolve();
      await Promise.resolve();

      expect(deleteJob).toHaveBeenCalledWith('a');
      expect(deleteJob).not.toHaveBeenCalledWith('b');
      expect(component.undoPending()).toBe(true);
    });

    it('leaves select mode and clears the marks', () => {
      component.toggleSelectMode();
      component.toggleSelected('a');

      component.requestDeleteSelected();

      expect(component.selectMode()).toBe(false);
      expect(component.selectedCount()).toBe(0);
      expect(component.undoPending()).toBe(true);
    });

    it('ignores an empty delete request', () => {
      component.requestDelete([]);

      expect(component.undoPending()).toBe(false);
      expect(toastSuccess).not.toHaveBeenCalled();
    });
  });

  describe('download selected', () => {
    beforeEach(async () => {
      getJobImages
        .mockResolvedValueOnce([resultImage('a', 'a-img')])
        .mockResolvedValueOnce([resultImage('b', 'b-img')]);
      finishedJobs.set([
        { ...job('a', 'done'), resultImageIds: ['a-img'] },
        { ...job('b', 'done'), resultImageIds: ['b-img'] },
      ]);
      await loadThumbnails();
    });

    it('reports whether the selection holds anything downloadable', () => {
      expect(component.hasSelectedResults()).toBe(false);

      component.toggleSelected('a');

      expect(component.hasSelectedResults()).toBe(true);
    });

    it('zips only the selected jobs', async () => {
      component.toggleSelected('b');
      getJobImages.mockResolvedValue([resultImage('b', 'b-img')]);
      getJobImages.mockClear();

      await component.downloadSelected();

      expect(getJobImages.mock.calls.map((call) => call[0])).toEqual(['b']);
    });
  });

  describe('image copy and share availability', () => {
    it('hides both when the platform offers neither', () => {
      // jsdom has no ClipboardItem and no navigator.share.
      expect(component.canCopyImage).toBe(false);
      expect(component.canShareImage).toBe(false);
    });

    it('does nothing when copy is unsupported', async () => {
      await component.copyImage({
        key: 'k',
        kind: 'done',
        jobLocalId: 'a',
        aspect: '1/1',
        dims: '',
      });

      expect(getJobImages).not.toHaveBeenCalled();
    });

    it('names a shared file after the image type it actually holds', async () => {
      const shared: File[] = [];
      // Whether the platform shares at all is read once when the component is
      // built, so the stubs go on before a second instance is created.
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: vi.fn((data: ShareData) => {
          shared.push(...(data.files ?? []));
          return Promise.resolve();
        }),
      });
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: vi.fn(() => true),
      });
      const sharing = TestBed.createComponent(GenerateResultsPanelComponent);
      try {
        getJobImages.mockResolvedValue([
          {
            ...resultImage('g', 'img'),
            blob: new Blob(['x'], { type: 'image/gif' }),
            mimeType: 'image/gif',
          },
        ]);
        finishedJobs.set([job('g', 'done')]);
        sharing.detectChanges();
        await Promise.resolve();
        await Promise.resolve();

        await sharing.componentInstance.shareImage(
          sharing.componentInstance.viewerTiles()[0],
        );

        expect(shared.map((file) => file.name)).toEqual(['horde-img.gif']);
      } finally {
        sharing.destroy();
        Reflect.deleteProperty(navigator, 'share');
        Reflect.deleteProperty(navigator, 'canShare');
      }
    });
  });

  describe('handing an image on', () => {
    beforeEach(async () => {
      getJobImages.mockResolvedValue([resultImage('f', 'img')]);
      finishedJobs.set([job('f', 'done')]);
      await loadThumbnails();
    });

    it('asks the parent to attach a result as the source image', () => {
      const emitted: unknown[] = [];
      component.controlAction.subscribe((event) => emitted.push(event));
      component.openViewer(component.viewerTiles()[0]);

      component.reuseAsSource(component.viewerTiles()[0]);

      expect(emitted).toEqual([
        { action: 'source', localId: 'f', imageId: 'img' },
      ]);
      expect(component.viewerKey()).not.toBeNull();
    });

    it('pins the seed the worker returned when a variation is asked for', () => {
      const emitted: { seed: string | null; localId: string }[] = [];
      component.controlAction.subscribe((event) =>
        emitted.push({ seed: event.seed, localId: event.localId }),
      );
      component.openViewer(component.viewerTiles()[0]);

      component.makeVariation(component.viewerTiles()[0]);

      expect(emitted).toEqual([{ seed: 'img', localId: 'f' }]);
      expect(component.viewerKey()).not.toBeNull();
    });

    it('closes the launching result surface only after the action is applied', () => {
      component.openViewer(component.viewerTiles()[0]);

      component.finishControlAction();

      expect(component.viewerKey()).toBeNull();
    });

    it('lets the seed go when only the settings are copied', () => {
      const emitted: (string | null)[] = [];
      component.controlAction.subscribe((event) => emitted.push(event.seed));

      component.copySettings(component.viewerTiles()[0]);

      expect(emitted).toEqual([null]);
    });

    it('sends the request with the returned seed already folded in', () => {
      const emitted: unknown[] = [];
      component.controlAction.subscribe((event) => emitted.push(event.request));

      component.makeVariation(component.viewerTiles()[0]);

      expect(emitted).toEqual([
        { prompt: 'a prompt', params: { seed: 'img' } },
      ]);
    });

    it('routes the three actions from the metadata panel to the same places', () => {
      const actions: string[] = [];
      component.controlAction.subscribe((event) => actions.push(event.action));
      const tile = component.viewerTiles()[0];

      component.onQuickAction('variation', tile);
      component.onQuickAction('copy', tile);
      component.onQuickAction('source', tile);

      expect(actions).toEqual(['variation', 'settings', 'source']);
    });

    it('parks the blob and navigates when sending to alchemy', async () => {
      component.openViewer(component.viewerTiles()[0]);

      await component.sendToAlchemy(component.viewerTiles()[0]);

      expect(handoff.set).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/generate/alchemy']);
      expect(component.viewerKey()).toBeNull();
    });
  });

  describe('style provenance', () => {
    beforeEach(async () => {
      getJobImages
        .mockResolvedValueOnce([resultImage('a', 'a-img')])
        .mockResolvedValueOnce([resultImage('b', 'b-img')])
        .mockResolvedValueOnce([resultImage('c', 'c-img')]);
      finishedJobs.set([
        { ...job('a', 'done'), styleName: 'Anime' },
        { ...job('b', 'done'), styleName: 'Anime' },
        { ...job('c', 'done'), styleName: 'Photo' },
      ]);
      await loadThumbnails();
    });

    it('lists the styles on screen with their tile counts', () => {
      expect(component.styleOptions()).toEqual([
        { key: 'curated:Anime', name: 'Anime', count: 2 },
        { key: 'curated:Photo', name: 'Photo', count: 1 },
      ]);
    });

    it('filters the grid to one style', () => {
      component.styleFilter.set('curated:Anime');

      expect(component.visibleTiles().map((t) => t.jobLocalId)).toEqual([
        'a',
        'b',
      ]);
      expect(component.filteredOut()).toBe(false);
    });

    it('reports an empty filter result like the other filters do', () => {
      component.styleFilter.set('curated:Nothing');

      expect(component.visibleTiles()).toHaveLength(0);
      expect(component.filteredOut()).toBe(true);
    });

    it('carries the style into the metadata provenance', () => {
      expect(component.viewerTiles()[0].provenance?.styleName).toBe('Anime');
    });

    it('offers no style control when no job recorded one', async () => {
      finishedJobs.set([job('z', 'done')]);
      await loadThumbnails();

      expect(component.styleOptions()).toEqual([]);
    });
  });

  describe('copying an address for a result', () => {
    let written: string[];

    beforeEach(async () => {
      written = [];
      vi.stubGlobal('isSecureContext', true);
      vi.stubGlobal('navigator', {
        clipboard: {
          writeText: (text: string) => {
            written.push(text);
            return Promise.resolve();
          },
        },
      } as unknown as Navigator);
      getJobImages.mockResolvedValue([resultImage('a', 'a-img')]);
      finishedJobs.set([
        {
          ...job('a', 'done'),
          styleName: 'Anime',
          request: { prompt: 'a fox', params: { steps: 30 } },
        },
      ]);
      await loadThumbnails();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('carries the seed the horde returned, so the picture comes back', async () => {
      await component.copyImageLink(component.visibleTiles()[0]);

      expect(written).toHaveLength(1);
      const payload = studioLinkFromText(written[0]);
      expect(payload?.request.params?.seed).toBe('a-img');
      expect(payload?.request.prompt).toBe('a fox');
      expect(payload?.styleKey).toBe('curated:Anime');
      expect(toastSuccess).toHaveBeenCalledWith('generate.link.copied', {
        transloco: true,
      });
    });

    it('lets the seed go for the settings on their own', async () => {
      await component.copySettingsLink(component.visibleTiles()[0]);

      const payload = studioLinkFromText(written[0]);
      expect(payload?.request.params?.seed).toBeUndefined();
      expect(payload?.request.params?.steps).toBe(30);
    });

    it('refuses a request too long to carry, and says where to go instead', async () => {
      const tile = component.visibleTiles()[0];
      // Nothing repeats, so the prompt cannot be packed down to a carryable size.
      const prompt = Array.from({ length: 2000 }, (_, index) =>
        ((index * 2654435761) % 1e9).toString(36),
      ).join(' ');
      await component.copyImageLink({ ...tile, applyRequest: { prompt } });

      expect(written).toHaveLength(0);
      expect(toastError).toHaveBeenCalledWith('generate.link.too_large', {
        transloco: true,
      });
    });
  });

  describe('completion announcement', () => {
    it('announces newly finished images once the count settles', async () => {
      vi.useFakeTimers();
      getJobImages.mockResolvedValue([
        resultImage('f', 'one'),
        resultImage('f', 'two'),
      ]);
      finishedJobs.set([job('f', 'done')]);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      await vi.advanceTimersByTimeAsync(600);

      expect(component.readyAnnouncement()).toBe(
        'generate.results.announce_ready',
      );
      vi.useRealTimers();
    });

    it('says nothing for history restored on load', async () => {
      fixture.detectChanges();
      await Promise.resolve();

      expect(component.readyAnnouncement()).toBe('');
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

  it('offers starter prompts only while the grid is empty', () => {
    expect(component.showStarters()).toBe(true);
    expect(new Set(component.starterPrompts).size).toBe(
      component.starterPrompts.length,
    );

    finishedJobs.set([job('e', 'error')]);

    expect(component.showStarters()).toBe(false);
  });

  it('asks the parent to use a starter prompt', () => {
    const used: string[] = [];
    component.usePrompt.subscribe((prompt) => used.push(prompt));

    component.usePrompt.emit('a misty mountain lake');

    expect(used).toEqual(['a misty mountain lake']);
  });

  it('sends an empty pane to the reading rather than to one page of it', () => {
    // A reader who has generated nothing yet does not know which of their
    // questions a page about this screen would answer, so the way in from the
    // empty pane is the whole shelf. The bar keeps its link to the reference.
    expect(component.docsLink).toBe('/docs/image');
    expect(component.referenceLink).toBe('/docs/image/settings');
    expect(TRANSLATIONS['generate.results.open_reference']).toBeTruthy();
    expect(TRANSLATIONS['generate.results.empty_learn']).toBeTruthy();
    expect('guideOpen' in component).toBe(false);
  });

  it('offers the set-aside settings back, and only while they are away', () => {
    const engine = TestBed.inject(TutorialEngineService);
    let held = true;
    engine.registerHost({
      applyFields: () => undefined,
      currentSourceMode: () => 'none',
      setSourceMode: () => undefined,
      openFieldGroup: () => false,
      openBulkApply: () => undefined,
      setAside: () => undefined,
      hasSetAside: () => held,
      restoreSetAside: () => {
        held = false;
        return true;
      },
    });

    expect(component.settingsSetAside()).toBe(true);
    expect(TRANSLATIONS['generate.learn.set_aside_offer']).toBeTruthy();
    expect(TRANSLATIONS['generate.learn.set_aside_restore']).toBeTruthy();

    component.restoreSetAsideSettings();

    expect(component.settingsSetAside()).toBe(false);
  });

  it('carries the tutorial completion note until it is dismissed', () => {
    const engine = TestBed.inject(TutorialEngineService);
    void engine.start('txt2img');
    engine.goTo(engine.total() - 1);
    engine.notifySubmitted();

    expect(component.tutorialCompleted()).toBe(true);

    component.dismissTutorialNote();

    expect(component.tutorialCompleted()).toBe(false);
  });

  it('closes a walkthrough with no offer of somewhere else', () => {
    const engine = TestBed.inject(TutorialEngineService);
    void engine.start('txt2img');
    engine.goTo(engine.total() - 1);
    engine.notifySubmitted();

    expect(component.finishedTutorialRelated()).toBeNull();
  });

  it('gives the pane header to the tutorial while one is open, and takes it back', () => {
    // The template is stubbed here, so the header's inputs are read off the
    // component: what it names, where it is, whether it offers worlds.
    const engine = TestBed.inject(TutorialEngineService);
    void engine.start('concepts_images');
    engine.goTo(1);

    expect(component.tutorialOpen()).toBe(true);
    expect(component.tutorialTaskKey()).toBe(
      'generate.learn.flows.concepts_images.task_name',
    );
    expect(component.tutorialStep()).toBe(2);
    // A track is not drawn in a world, so it offers no world switch.
    expect(component.tutorialHasWorlds()).toBe(false);

    component.leaveTutorial();

    expect(component.tutorialOpen()).toBe(false);
    expect(engine.parked()).toBe(true);
  });

  it('names a technique tutorial by its task and offers the worlds', () => {
    const engine = TestBed.inject(TutorialEngineService);
    void engine.start('txt2img');

    expect(component.tutorialTaskKey()).toBe(
      'generate.tutorials.flows.txt2img.task_name',
    );
    expect(component.tutorialHasWorlds()).toBe(true);
  });

  it('gives the pane to the work as soon as there is any', () => {
    pendingJobs.set([job('p', 'processing')]);

    expect(component.showStarters()).toBe(false);
  });

  describe('the docked reference entry', () => {
    let dock: GsHelpDockService;

    beforeEach(() => {
      dock = TestBed.inject(GsHelpDockService);
      dock.close();
    });

    it('takes the pane for the setting a note sent it, and gives it back', () => {
      expect(component.helpDockTopic()).toBeNull();

      dock.open('steps');

      expect(component.helpDockTopic()).toBe('steps');
      expect(component.helpDockOpen()).toBe(true);

      component.closeHelpDock();

      expect(component.helpDockTopic()).toBeNull();
    });

    it('leaves a running tutorial running behind it', () => {
      const engine = TestBed.inject(TutorialEngineService);
      void engine.start('txt2img');

      dock.open('cfg');

      // The pane yields, the flow does not: closing the entry puts the steps
      // back where the reader left them.
      expect(engine.active()).toBe(true);
      expect(component.tutorialOpen()).toBe(true);

      component.closeHelpDock();

      expect(engine.active()).toBe(true);
      engine.stop();
    });

    it('stands down when a tutorial starts behind it', () => {
      const engine = TestBed.inject(TutorialEngineService);
      dock.open('steps');

      void engine.start('txt2img');

      expect(component.helpDockTopic()).toBeNull();
      engine.stop();
    });
  });
  describe('a queued job nobody can take', () => {
    function queuedJob(isPossible: boolean | undefined): LocalGenerationJob {
      return {
        ...job('impossible-1', 'queued'),
        request: {
          prompt: 'a prompt',
          models: ['Some Model'],
          params: { width: 1024, height: 1024 },
        },
        queuePosition: 3,
        waitTime: 42,
        isPossible,
      };
    }

    function poolWith(models: string[]): HordeWorker[] {
      return [
        {
          type: 'image',
          name: 'w',
          id: 'w-1',
          online: true,
          requests_fulfilled: 0,
          kudos_rewards: 0,
          performance: '1',
          threads: 1,
          uptime: 0,
          maintenance_mode: false,
          paused: false,
          nsfw: true,
          trusted: true,
          flagged: false,
          suspicious: 0,
          uncompleted_jobs: 0,
          models,
          bridge_agent: 'test',
          max_pixels: 1_048_576,
        },
      ];
    }

    it("carries the horde's answer onto the tile", () => {
      pendingJobs.set([queuedJob(false)]);

      expect(component.tiles()[0].isPossible).toBe(false);
    });

    it('names the setting that shut every worker out', () => {
      TestBed.inject(WorkerPoolService).workers.set(poolWith(['Another']));
      pendingJobs.set([queuedJob(false)]);

      const fit = component.tiles()[0].feasibility;
      expect(fit?.blockedBy).toBe('model');
      expect(TRANSLATIONS[fit!.message.key]).toContain('may be temporary');
    });

    it('says nothing about who can take it while the workers are unknown', () => {
      pendingJobs.set([queuedJob(false)]);

      expect(component.tiles()[0].feasibility).toBeNull();
    });

    it('leaves a job the horde has not judged unmarked', () => {
      pendingJobs.set([queuedJob(undefined)]);

      expect(component.tiles()[0].isPossible).toBeUndefined();
    });

    it('shares one answer across a batch rather than asking per tile', () => {
      TestBed.inject(WorkerPoolService).workers.set(poolWith(['Some Model']));
      pendingJobs.set([
        {
          ...queuedJob(true),
          request: {
            prompt: 'a prompt',
            models: ['Some Model'],
            params: { width: 1024, height: 1024, n: 3 },
          },
        },
      ]);

      const tiles = component.tiles();
      expect(tiles).toHaveLength(3);
      expect(new Set(tiles.map((tile) => tile.feasibility))).toHaveProperty(
        'size',
        1,
      );
      expect(tiles[0].feasibility?.eligible).toBe(1);
    });

    it('opens and closes the explanation for one job at a time', () => {
      component.toggleWaitWhy('impossible-1');
      expect(component.waitWhyFor()).toBe('impossible-1');

      component.toggleWaitWhy('other');
      expect(component.waitWhyFor()).toBe('other');

      component.toggleWaitWhy('other');
      expect(component.waitWhyFor()).toBeNull();
    });

    it('closes the status explanation with Escape and restores its opener', async () => {
      const opener = document.createElement('button');
      const focus = vi.spyOn(opener, 'focus');
      component.toggleWaitWhy('impossible-1-p0', opener);

      component.onDocumentEscape();
      await Promise.resolve();

      expect(component.waitWhyFor()).toBeNull();
      expect(focus).toHaveBeenCalled();
    });
  });
});

describe('GenerateResultsPanelComponent empty pane', () => {
  let fixture: ComponentFixture<GenerateResultsPanelComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();

    await TestBed.configureTestingModule({
      // What the pane draws with nothing in it is the claim, so the real
      // template and the real copy are both loaded.
      imports: [
        GenerateResultsPanelComponent,
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
          provide: GenerationQueueService,
          useValue: {
            pendingJobs: signal<LocalGenerationJob[]>([]),
            finishedJobs: signal<LocalGenerationJob[]>([]),
            cancel: vi.fn(),
            retry: vi.fn(),
            deleteJob: vi.fn(),
            getJobImages: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
        },
        {
          provide: DatabaseService,
          useValue: { get: vi.fn().mockReturnValue(undefined), store: vi.fn() },
        },
        { provide: StudioHandoffService, useValue: { set: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GenerateResultsPanelComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('offers the reading and a few prompts to depart from', () => {
    const empty = host.querySelector('.gs-empty');

    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain(
      TRANSLATIONS['generate.results.empty_learn'],
    );
    expect(empty!.querySelector('.gs-guide-cta')?.getAttribute('href')).toBe(
      DOCS_IMAGE,
    );

    const starters = empty!.querySelectorAll<HTMLElement>('.gs-chip--starter');
    expect(starters).toHaveLength(
      fixture.componentInstance.starterPrompts.length,
    );
    for (const [
      index,
      starter,
    ] of fixture.componentInstance.starterPrompts.entries()) {
      expect(starters[index].textContent).toContain(
        TRANSLATIONS[`generate.results.starters.${starter}.label`],
      );
    }
  });
});

describe('GenerateResultsPanelComponent adopted generations', () => {
  let fixture: ComponentFixture<GenerateResultsPanelComponent>;
  let host: HTMLElement;

  const adopted: LocalGenerationJob = {
    localId: 'adopted-1',
    status: 'done',
    createdAt: 0,
    updatedAt: 0,
    request: { prompt: '' },
    adopted: true,
    hordeId: 'elsewhere-1',
    resultImageIds: ['out-1'],
  };

  beforeEach(async () => {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();

    await TestBed.configureTestingModule({
      // What the tile says and what it withholds are both claims about the
      // rendered markup, so the real template and the real copy are loaded.
      imports: [
        GenerateResultsPanelComponent,
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
          provide: GenerationQueueService,
          useValue: {
            jobs: signal<LocalGenerationJob[]>([adopted]),
            pendingJobs: signal<LocalGenerationJob[]>([]),
            finishedJobs: signal<LocalGenerationJob[]>([adopted]),
            cancel: vi.fn(),
            retry: vi.fn(),
            deleteJob: vi.fn(),
            getJobImages: vi
              .fn()
              .mockResolvedValue([resultImage('adopted-1', 'out-1')]),
          },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
        },
        {
          provide: DatabaseService,
          useValue: { get: vi.fn().mockReturnValue(undefined), store: vi.fn() },
        },
        { provide: StudioHandoffService, useValue: { set: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GenerateResultsPanelComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('marks the tile as coming from another session', () => {
    expect(host.querySelector('.gs-tile-adopted')?.textContent).toContain(
      TRANSLATIONS['generate.results.adopted_line'],
    );
    expect(fixture.componentInstance.tiles()[0].adopted).toBe(true);
  });

  it('withholds everything that would read a request back', () => {
    const menu = host.querySelector('.gs-flip-menu');

    expect(menu).not.toBeNull();
    expect(menu!.textContent).not.toContain(
      TRANSLATIONS['generate.results.make_variation'],
    );
    expect(menu!.textContent).not.toContain(
      TRANSLATIONS['generate.results.menu_load'],
    );
    expect(menu!.textContent).not.toContain(
      TRANSLATIONS['generate.results.copy_settings'],
    );
    expect(menu!.textContent).not.toContain(
      TRANSLATIONS['generate.link.copy_settings'],
    );
    // What still works on a picture nobody here asked for.
    expect(menu!.textContent).toContain(
      TRANSLATIONS['generate.results.download'],
    );
    expect(menu!.textContent).toContain(TRANSLATIONS['generate.results.reuse']);
    expect(menu!.textContent).toContain(
      TRANSLATIONS['generate.results.delete'],
    );
  });
});
