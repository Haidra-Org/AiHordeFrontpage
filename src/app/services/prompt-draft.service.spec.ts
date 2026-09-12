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

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getStoredApiKey: () => null } },
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

    await expect(pending).resolves.toEqual({
      kind: 'done',
      text: 'a dog on a couch, warm light',
      model: 'koboldcpp/gemma-4-31B-it-heretic',
      kudos: 3,
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
