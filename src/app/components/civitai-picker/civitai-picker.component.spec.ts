import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CivitaiPickerComponent } from './civitai-picker.component';
import {
  CivitaiModel,
  CivitaiModelVersion,
  CivitaiService,
} from '../../services/civitai.service';
import { CivitaiCacheService } from '../../services/civitai-cache.service';
import { DatabaseService } from '../../services/database.service';
import type { LoraSelection, TiSelection } from '../../types/civitai-asset';

function version(
  id: number,
  extra: Partial<CivitaiModelVersion> = {},
): CivitaiModelVersion {
  return {
    id,
    modelId: null,
    modelName: null,
    name: `v${id}`,
    baseModel: 'SD 1.5',
    baseModelType: null,
    publishedAt: '2025-01-01T00:00:00Z',
    index: 0,
    trainedWords: ['trigger'],
    fileSizeKb: 1000,
    fileName: 'x.safetensors',
    sha256: null,
    nsfwLevel: 1,
    availability: 'Public',
    paidAccess: false,
    images: [],
    ...extra,
  };
}

function model(id: number, extra: Partial<CivitaiModel> = {}): CivitaiModel {
  return {
    id,
    name: `Model ${id}`,
    type: 'LORA',
    rawType: 'LORA',
    creator: 'alice',
    nsfw: false,
    nsfwLevel: 1,
    poi: false,
    minor: false,
    downloadCount: 10,
    thumbsUp: 2,
    thumbsDown: 0,
    tags: [],
    baseModels: ['SD 1.5'],
    availability: 'Public',
    preview: null,
    versions: [version(id * 10)],
    ...extra,
  };
}

describe('CivitaiPickerComponent', () => {
  let fixture: ComponentFixture<CivitaiPickerComponent>;
  let component: CivitaiPickerComponent;
  let searchModels: ReturnType<typeof vi.fn>;
  let putSearchResult: ReturnType<typeof vi.fn>;
  let store: ReturnType<typeof vi.fn>;

  function respond(items: CivitaiModel[], nextCursor: string | null = null) {
    searchModels.mockReturnValue(
      of({ kind: 'success', items, metadata: { nextCursor } }),
    );
  }

  beforeEach(async () => {
    searchModels = vi.fn();
    putSearchResult = vi.fn().mockResolvedValue(undefined);
    store = vi.fn();
    respond([]);

    await TestBed.configureTestingModule({
      imports: [
        CivitaiPickerComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
      providers: [
        {
          provide: CivitaiService,
          useValue: { searchModels, fetchModel: vi.fn() },
        },
        {
          provide: CivitaiCacheService,
          useValue: {
            putSearchResult,
            getModel: vi.fn().mockResolvedValue(null),
          },
        },
        { provide: DatabaseService, useValue: { get: () => false, store } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CivitaiPickerComponent);
    component = fixture.componentInstance;
  });

  function start(): void {
    fixture.detectChanges();
  }

  function lastParams(): Record<string, unknown> {
    return searchModels.mock.calls[searchModels.mock.calls.length - 1][0];
  }

  describe('choosing a LoRA', () => {
    it('pins the version rather than naming the model page', () => {
      start();
      const emitted: LoraSelection[][] = [];
      component.lorasChange.subscribe((next) => emitted.push(next));

      component.toggle(model(123));

      // Naming the model page leaves the horde to pick, so a saved request
      // quietly changes meaning when the author publishes an update.
      expect(emitted[0][0]).toMatchObject({
        name: '1230',
        is_version: true,
        label: 'Model 123',
        modelId: 123,
        versionLabel: 'v1230',
      });
    });

    it('prefers a version the chosen model can actually load', () => {
      start();
      fixture.componentRef.setInput('baseline', 'stable_diffusion_1');
      const emitted: LoraSelection[][] = [];
      component.lorasChange.subscribe((next) => emitted.push(next));

      component.toggle(
        model(5, {
          versions: [
            version(51, {
              baseModel: 'Pony',
              publishedAt: '2026-01-01T00:00:00Z',
            }),
            version(52, {
              baseModel: 'SD 1.5',
              publishedAt: '2025-01-01T00:00:00Z',
            }),
          ],
        }),
      );

      expect(emitted[0][0].name).toBe('52');
    });

    it('remembers the whole result as it is chosen', () => {
      start();
      const picked = model(7);

      component.toggle(picked);

      // Nothing would ever look up an entry that already knows its own name, so
      // if this did not happen the first time it mattered would be a reload
      // with no network, which is exactly when a fetch cannot save it.
      expect(putSearchResult).toHaveBeenCalledWith(picked);
    });

    it('takes a chosen LoRA out again', () => {
      const existing: LoraSelection = {
        name: '1230',
        model: 1,
        clip: 1,
        is_version: true,
      };
      fixture.componentRef.setInput('loras', [existing]);
      start();
      const emitted: LoraSelection[][] = [];
      component.lorasChange.subscribe((next) => emitted.push(next));

      const entry = model(123);
      expect(component.isAdded(entry)).toBe(true);
      component.toggle(entry);

      expect(emitted[0]).toEqual([]);
    });
  });

  describe('choosing an embedding', () => {
    it('names the model page and never a version', () => {
      start();
      component.setTab('ti');
      const emitted: TiSelection[][] = [];
      component.tisChange.subscribe((next) => emitted.push(next));

      component.toggle(
        model(7808, { type: 'TextualInversion', rawType: 'TextualInversion' }),
      );

      // The horde's embedding payload has no version field at all.
      expect(emitted[0][0]).toMatchObject({
        name: '7808',
        label: 'Model 7808',
      });
      expect(emitted[0][0]).not.toHaveProperty('is_version');
    });
  });

  describe('what may be shown', () => {
    it('drops a model flagged as depicting a minor, whatever else is set', () => {
      respond([model(1), model(2, { minor: true }), model(3)]);
      start();

      expect(component.results().map((m) => m.id)).toEqual([1, 3]);
    });

    it('covers a preview above the tamest rating until it is asked for', () => {
      start();
      expect(component.isCovered('u', 4)).toBe(true);
      expect(component.isCovered('u', 1)).toBe(false);

      component.reveal('u');
      expect(component.isCovered('u', 4)).toBe(false);
    });
  });

  describe('asking the catalogue', () => {
    it('says nothing about maturity until it is switched on', () => {
      start();
      expect(lastParams()['nsfw']).toBeUndefined();

      component.toggleMature();
      expect(lastParams()['nsfw']).toBe(true);
      expect(store).toHaveBeenCalledWith('aihorde.civitai.mature', true);
    });

    it('narrows to the family the chosen model belongs to', () => {
      fixture.componentRef.setInput('baseline', 'stable_diffusion_1');
      start();

      expect(lastParams()['baseModels']).toContain('SD 1.5');

      component.setBaseModel('all');
      // The escape has to actually stop filtering, not filter to something else.
      expect(lastParams()['baseModels']).toEqual([]);
    });

    it('starts a new list when the tab changes', () => {
      respond([model(1)], 'CURSOR');
      start();
      expect(component.results()).toHaveLength(1);

      respond([]);
      component.setTab('ti');

      expect(component.results()).toEqual([]);
      expect(component.cursor()).toBeNull();
      expect(lastParams()['type']).toBe('TextualInversion');
    });

    it('adds the next page to the one already shown', () => {
      respond([model(1)], 'CURSOR');
      start();

      respond([model(2)], null);
      component.onLoadMore();

      expect(component.results().map((m) => m.id)).toEqual([1, 2]);
      expect(component.cursor()).toBeNull();
    });
  });

  describe('adding by hand', () => {
    it('offers the version question only where the horde would accept it', () => {
      start();
      component.manualName.setValue('epi_noiseoffset');
      expect(component.canBeVersion()).toBe(false);

      component.manualName.setValue('1558543');
      expect(component.canBeVersion()).toBe(true);

      // An embedding has no version to name, so the question never applies.
      component.setTab('ti');
      expect(component.canBeVersion()).toBe(false);
    });

    it('adds a named asset the catalogue cannot reach', () => {
      start();
      const emitted: LoraSelection[][] = [];
      component.lorasChange.subscribe((next) => emitted.push(next));

      component.manualName.setValue('epi_noiseoffset');
      component.addManual();

      expect(emitted[0][0]).toMatchObject({
        name: 'epi_noiseoffset',
        origin: 'manual',
      });
      expect(emitted[0][0]).not.toHaveProperty('is_version');
    });

    it('keeps the version flag when the name can carry one', () => {
      start();
      const emitted: LoraSelection[][] = [];
      component.lorasChange.subscribe((next) => emitted.push(next));

      component.manualName.setValue('1558543');
      component.setManualIsVersion(true);
      component.addManual();

      expect(emitted[0][0]).toMatchObject({
        name: '1558543',
        is_version: true,
      });
    });
  });
});
