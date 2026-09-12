import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PromptDraftDbService,
  StoredPromptDraft,
} from './prompt-draft-db.service';

function makeDraft(
  id: string,
  createdAt: number,
  overrides: Partial<StoredPromptDraft> = {},
): StoredPromptDraft {
  return {
    id,
    createdAt,
    origin: 'alchemy',
    input: { caption: 'a dog' },
    pick: 'auto',
    model: 'm/1',
    seed: null,
    kudos: 2,
    anonymous: false,
    text: `draft ${id}`,
    ...overrides,
  };
}

describe('PromptDraftDbService', () => {
  let db: PromptDraftDbService;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    TestBed.configureTestingModule({});
    db = TestBed.inject(PromptDraftDbService);
  });

  it('lists what was put in it newest first, up to the limit asked for', async () => {
    await db.put(makeDraft('a', 100));
    await db.put(makeDraft('c', 300));
    await db.put(makeDraft('b', 200));

    expect((await db.list(10)).map((draft) => draft.id)).toEqual([
      'c',
      'b',
      'a',
    ]);
    expect((await db.list(2)).map((draft) => draft.id)).toEqual(['c', 'b']);
    expect(await db.list(0)).toEqual([]);
  });

  it('replaces a record written under an id it already holds', async () => {
    await db.put(makeDraft('a', 100));
    await db.put(makeDraft('a', 100, { text: 'rewritten' }));
    const stored = await db.list(10);
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('rewritten');
  });

  it('removes one draft and leaves the rest', async () => {
    await db.put(makeDraft('a', 100));
    await db.put(makeDraft('b', 200));
    await db.remove('a');
    expect((await db.list(10)).map((draft) => draft.id)).toEqual(['b']);
  });

  it('clears everything when the reader asks for that', async () => {
    await db.put(makeDraft('a', 100));
    await db.put(makeDraft('b', 200));
    await db.clear();
    expect(await db.list(10)).toEqual([]);
  });
});
