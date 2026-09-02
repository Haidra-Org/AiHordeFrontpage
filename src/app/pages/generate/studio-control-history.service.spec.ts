import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_GENERATE_FORM_VALUE } from './generate-form.model';
import {
  StudioControlCheckpoint,
  StudioControlHistoryService,
} from './studio-control-history.service';

function checkpoint(id: string, createdAt: number): StudioControlCheckpoint {
  return {
    id,
    createdAt,
    action: 'settings',
    form: { ...DEFAULT_GENERATE_FORM_VALUE, prompt: id },
    source: {
      mode: 'img2img',
      sourceBlob: new Blob([id], { type: 'image/webp' }),
      maskBlob: null,
      valid: true,
      validationMessage: null,
    },
  };
}

describe('StudioControlHistoryService', () => {
  let service: StudioControlHistoryService;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    TestBed.configureTestingModule({});
    service = TestBed.inject(StudioControlHistoryService);
  });

  it('keeps a complete checkpoint across service instances', async () => {
    await service.push(checkpoint('draft', 1));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reopened = TestBed.inject(StudioControlHistoryService);
    const restored = await reopened.list();

    expect(restored[0].form.prompt).toBe('draft');
    // fake-indexeddb does not reproduce the browser's Blob prototype, but it
    // still proves the binary field survived the structured-clone round trip.
    expect(restored[0].source.sourceBlob).toBeTruthy();
  });

  it('lists newest checkpoints first and removes only the restored one', async () => {
    await service.push(checkpoint('old', 1));
    await service.push(checkpoint('new', 2));

    expect((await service.list()).map((entry) => entry.id)).toEqual([
      'new',
      'old',
    ]);

    await service.remove('new');

    expect((await service.list()).map((entry) => entry.id)).toEqual(['old']);
  });

  it('bounds retained history without adding a time limit', async () => {
    for (let index = 0; index < 12; index++) {
      await service.push(checkpoint(`draft-${index}`, index));
    }

    const retained = await service.list();
    expect(retained).toHaveLength(10);
    expect(retained[0].id).toBe('draft-11');
    expect(retained.at(-1)?.id).toBe('draft-2');
  });
});
