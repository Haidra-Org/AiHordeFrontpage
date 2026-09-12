import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PromptDraftService,
  buildDraftPrompt,
  cleanDraft,
  curatedRank,
  pickTextModel,
} from './prompt-draft.service';
import { AuthService } from './auth.service';
import { PromptDraftDbService } from './prompt-draft-db.service';
import { ActiveModel } from '../types/active-model';
import { API_BASE as API_BASE_URL } from '../testing/api-test-helpers';

const model = (name: string, count: number, eta = 0): ActiveModel => ({
  name,
  count,
  eta,
});

describe('picking a text model', () => {
  const pool = [
    model('aphrodite/TheDrummer/Behemoth-X-123B-v2.1', 16),
    model('koboldcpp/gemma-4-31B-it-heretic', 1, 300),
    model('koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic', 2),
    model('koboldcpp/L3-8B-Stheno-v3.2', 1),
    model('koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M', 0),
  ];

  it('ranks instruct families and leaves story tunes off the list', () => {
    expect(curatedRank('koboldcpp/gemma-4-31B-it-heretic')).toBe(0);
    expect(curatedRank('koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M')).toBe(6);
    expect(curatedRank('koboldcpp/L3-8B-Stheno-v3.2')).toBeNull();
  });

  it('takes the best-ranked model that has workers', () => {
    expect(pickTextModel(pool, 'auto')).toEqual({
      models: ['koboldcpp/gemma-4-31B-it-heretic'],
      label: 'koboldcpp/gemma-4-31B-it-heretic',
    });
  });

  it('breaks a rank tie by workers online', () => {
    const tied = [
      model('koboldcpp/Gemma-4-E4B-it-A', 1),
      model('koboldcpp/Gemma-4-E4B-it-B', 3),
    ];
    expect(pickTextModel(tied, 'auto').models).toEqual([
      'koboldcpp/Gemma-4-E4B-it-B',
    ]);
  });

  it('asks for any model when nothing curated is online, or when told to', () => {
    expect(
      pickTextModel([model('koboldcpp/L3-8B-Stheno-v3.2', 1)], 'auto'),
    ).toEqual({ models: null, label: null });
    expect(pickTextModel(pool, 'any')).toEqual({ models: null, label: null });
    expect(pickTextModel(pool, { model: 'x/y' })).toEqual({
      models: ['x/y'],
      label: 'x/y',
    });
  });
});

describe('the draft prompt and its answer', () => {
  it('writes an instruction with whatever material there is', () => {
    const prompt = buildDraftPrompt({
      caption: 'a dog',
      tags: 'dog, couch',
      note: null,
    });
    expect(prompt.startsWith('### Instruction:\n')).toBe(true);
    expect(prompt).toContain('Description: a dog');
    expect(prompt).toContain('Tags: dog, couch');
    expect(prompt).not.toContain('Notes from the user');
    expect(prompt.endsWith('### Response:\n')).toBe(true);
  });

  it('asks for a rewrite when given a prompt, keeping the note', () => {
    const prompt = buildDraftPrompt({ prompt: 'a dog', note: 'at night' });
    expect(prompt).toContain('You improve prompts');
    expect(prompt).toContain('Prompt: a dog');
    expect(prompt).toContain('Notes from the user: at night');
    expect(prompt).not.toContain('Description:');
  });

  it('keeps the first line the model wrote, without label or quotes', () => {
    expect(
      cleanDraft('\n"Prompt: a dog on a couch, soft light"\n\nMore.'),
    ).toBe('a dog on a couch, soft light');
    expect(cleanDraft('   ')).toBe('');
  });
});

describe('PromptDraftService', () => {
  let service: PromptDraftService;
  let http: HttpTestingController;
  let storedKey: string | null;

  beforeEach(() => {
    // Only the poll's own delay is faked: fake-indexeddb drives its requests off
    // the other timer families, and a history write has to complete for real.
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    globalThis.indexedDB = new IDBFactory();
    storedKey = null;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { getStoredApiKey: () => storedKey },
        },
      ],
    });
    service = TestBed.inject(PromptDraftService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  it('submits an anonymous text request for the picked model and returns the cleaned answer', async () => {
    const models = [model('koboldcpp/gemma-4-31B-it-heretic', 1)];
    const pending = service.draft({ caption: 'a dog' }, 'auto', models);

    const submit = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    expect(submit.request.headers.get('apikey')).toBe('0000000000');
    expect(submit.request.body.models).toEqual([
      'koboldcpp/gemma-4-31B-it-heretic',
    ]);
    expect(submit.request.body.params.singleline).toBe(true);
    expect(submit.request.body.prompt).toContain('Description: a dog');
    submit.flush({ id: 'text-1', kudos: 3 });

    await vi.advanceTimersByTimeAsync(2_500);
    http.expectOne(`${API_BASE_URL}/generate/text/status/text-1`).flush({
      done: false,
      faulted: false,
      generations: [],
      kudos: 3,
    });
    await vi.advanceTimersByTimeAsync(2_500);
    http.expectOne(`${API_BASE_URL}/generate/text/status/text-1`).flush({
      done: true,
      faulted: false,
      kudos: 3,
      generations: [
        {
          text: ' "a dog on a couch, warm light"\n',
          model: 'koboldcpp/gemma-4-31B-it-heretic',
        },
      ],
    });

    await expect(pending).resolves.toMatchObject({
      kind: 'done',
      text: 'a dog on a couch, warm light',
      model: 'koboldcpp/gemma-4-31B-it-heretic',
      kudos: 3,
    });
  });

  it('sends on the account key unless the request is asked for anonymously', async () => {
    storedKey = 'a-real-key';
    const pending = service.draft({ caption: 'a dog' }, 'any', [], {
      anonymous: false,
      origin: 'studio',
    });
    const submit = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    expect(submit.request.headers.get('apikey')).toBe('a-real-key');
    submit.flush(
      { message: 'nope', rc: 'Nope' },
      { status: 400, statusText: 'Bad Request' },
    );
    await pending;

    const anon = service.draft({ caption: 'a dog' }, 'any', [], {
      anonymous: true,
      origin: 'studio',
    });
    const anonSubmit = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    expect(anonSubmit.request.headers.get('apikey')).toBe('0000000000');
    anonSubmit.flush(
      { message: 'nope', rc: 'Nope' },
      { status: 400, statusText: 'Bad Request' },
    );
    await anon;
  });

  it('prices a draft with a dry run that queues nothing', async () => {
    storedKey = 'a-real-key';
    const pending = service.estimate({ caption: 'a dog' }, 'any', [], false);
    const priced = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    expect(priced.request.body.dry_run).toBe(true);
    expect(priced.request.headers.get('apikey')).toBe('a-real-key');
    priced.flush({ kudos: 7 });
    await expect(pending).resolves.toBe(7);
  });

  it('prices anonymously when asked to, and reports a refusal as no price', async () => {
    storedKey = 'a-real-key';
    const pending = service.estimate({ caption: 'a dog' }, 'any', [], true);
    const priced = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    expect(priced.request.headers.get('apikey')).toBe('0000000000');
    priced.flush(
      { message: 'No workers', rc: 'NoWorkers' },
      { status: 400, statusText: 'Bad Request' },
    );
    await expect(pending).resolves.toBeNull();
  });

  it('keeps a finished draft in the browser history', async () => {
    const pending = service.draft({ caption: 'a dog' }, 'any', [], {
      anonymous: true,
      origin: 'studio',
    });
    http
      .expectOne(`${API_BASE_URL}/generate/text/async`)
      .flush({ id: 'text-9', kudos: 4 });
    await vi.advanceTimersByTimeAsync(2_500);
    http.expectOne(`${API_BASE_URL}/generate/text/status/text-9`).flush({
      done: true,
      faulted: false,
      kudos: 4,
      generations: [{ text: 'a dog on a couch', model: 'm/1', seed: 12 }],
    });

    const outcome = await pending;
    expect(outcome.kind).toBe('done');
    const stored = await TestBed.inject(PromptDraftDbService).list(10);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: outcome.kind === 'done' ? outcome.id : '',
      origin: 'studio',
      anonymous: true,
      model: 'm/1',
      seed: 12,
      kudos: 4,
      text: 'a dog on a couch',
      input: { caption: 'a dog' },
      pick: 'any',
    });
  });

  it('reports the refusal as the horde worded it', async () => {
    const pending = service.draft({ caption: 'a dog' }, 'any', []);
    http
      .expectOne(`${API_BASE_URL}/generate/text/async`)
      .flush(
        { message: 'No workers', rc: 'NoWorkers' },
        { status: 400, statusText: 'Bad Request' },
      );
    await expect(pending).resolves.toMatchObject({
      kind: 'refused',
      error: { status: 400, message: 'No workers' },
    });
  });
});
