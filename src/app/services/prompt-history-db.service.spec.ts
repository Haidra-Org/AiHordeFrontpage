import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PromptHistoryDbService,
  sentPromptKey,
  sentPromptsFromJobs,
} from './prompt-history-db.service';
import type { LocalGenerationJob } from '../types/generation-job';

function job(
  prompt: string,
  createdAt: number,
  model = 'flux',
): LocalGenerationJob {
  return {
    localId: `job-${createdAt}`,
    status: 'done',
    createdAt,
    updatedAt: createdAt,
    request: { prompt, models: [model] },
    resultImageIds: [],
  };
}

describe('sentPromptKey', () => {
  it('is stable and tells the prompt and negative apart', () => {
    expect(sentPromptKey('a fox', 'blurry')).toBe(
      sentPromptKey('a fox', 'blurry'),
    );
    expect(sentPromptKey('a fox', '')).not.toBe(sentPromptKey('a fox', 'x'));
    expect(sentPromptKey('ab', 'c')).not.toBe(sentPromptKey('a', 'bc'));
  });
});

describe('sentPromptsFromJobs', () => {
  it('counts every job that sent a prompt and keeps the newest model', () => {
    const records = sentPromptsFromJobs([
      job('a castle ### blurry', 300, 'sdxl'),
      job('a fox', 200),
      job('a castle ### blurry', 100, 'flux'),
      job('   ', 50),
    ]);

    expect(records).toHaveLength(2);
    const castle = records.find((record) => record.prompt === 'a castle');
    expect(castle).toEqual({
      key: sentPromptKey('a castle', 'blurry'),
      prompt: 'a castle',
      negative: 'blurry',
      model: 'sdxl',
      firstSentAt: 100,
      lastSentAt: 300,
      count: 2,
    });
  });
});

describe('PromptHistoryDbService', () => {
  let db: PromptHistoryDbService;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    TestBed.configureTestingModule({});
    db = TestBed.inject(PromptHistoryDbService);
  });

  it('keeps one entry per prompt and negative, counting each send', async () => {
    await db.record('a fox', 'blurry', 'flux', 100);
    await db.record('a fox', 'blurry', 'sdxl', 200);
    await db.record('a fox', '', 'flux', 150);

    const all = await db.listAll();
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual({
      key: sentPromptKey('a fox', 'blurry'),
      prompt: 'a fox',
      negative: 'blurry',
      model: 'sdxl',
      firstSentAt: 100,
      lastSentAt: 200,
      count: 2,
    });
    expect(all[1].count).toBe(1);
    expect(db.size()).toBe(2);
  });

  it('orders entries by when they were last sent', async () => {
    await db.record('first', '', 'm', 100);
    await db.record('second', '', 'm', 200);
    await db.record('first', '', 'm', 300);

    expect((await db.listAll()).map((entry) => entry.prompt)).toEqual([
      'first',
      'second',
    ]);
  });

  it('ignores an empty prompt', async () => {
    await db.record('  ', 'blurry', 'flux', 100);
    expect(await db.listAll()).toEqual([]);
  });

  it('seeds from the saved jobs once and never again', async () => {
    await db.seedOnce([job('a castle', 100), job('a castle', 200)]);
    expect(await db.listAll()).toHaveLength(1);
    expect((await db.listAll())[0].count).toBe(2);

    // A later page load finds the marker and leaves the store alone, even when
    // the jobs have changed since.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reopened = TestBed.inject(PromptHistoryDbService);
    await reopened.seedOnce([job('a castle', 300), job('a lighthouse', 400)]);

    const all = await reopened.listAll();
    expect(all.map((entry) => entry.prompt)).toEqual(['a castle']);
    expect(all[0].count).toBe(2);
  });

  it('leaves a prompt already recorded as it is when seeding', async () => {
    await db.record('a castle', '', 'sdxl', 500);
    await db.seedOnce([job('a castle', 100), job('a fox', 200)]);

    const all = await db.listAll();
    expect(all.find((entry) => entry.prompt === 'a castle')?.count).toBe(1);
    expect(all.find((entry) => entry.prompt === 'a fox')?.count).toBe(1);
  });

  it('removes several entries and puts them back whole', async () => {
    await db.record('a', '', 'm', 100);
    await db.record('b', '', 'm', 200);
    await db.record('c', 'x', 'm', 300);
    const before = await db.listAll();

    await db.removeMany([before[0].key, before[2].key]);
    expect((await db.listAll()).map((entry) => entry.prompt)).toEqual(['b']);
    expect(db.size()).toBe(1);

    await db.putMany([before[0], before[2]]);
    expect(await db.listAll()).toEqual(before);
    expect(db.size()).toBe(3);
  });
});
