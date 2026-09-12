import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import {
  PromptDraftService,
  buildDraftMaterial,
  buildDraftPrompt,
  cleanDraft,
  cleanJudgement,
  curatedRank,
  modelCostTier,
  modelParameterCount,
  pickTextModel,
} from './prompt-draft.service';
import { AuthService } from './auth.service';
import { StyleService } from './style.service';
import { PromptDraftDbService } from './prompt-draft-db.service';
import { ActiveModel } from '../types/active-model';
import { ImagePromptStyle, TextStyle } from '../types/style';
import { API_BASE as API_BASE_URL } from '../testing/api-test-helpers';

/** A published text style as the horde lists it. */
function textStyle(
  id: string,
  name: string,
  tags: string[],
  models: string[] = [],
): TextStyle {
  return {
    id,
    name,
    prompt: '### Instruction:\n{p}\n\n### Response:\n',
    public: true,
    nsfw: false,
    tags,
    models,
    use_count: 0,
    creator: 'someone#1',
  };
}

/** The style as the card hands it back to the service. */
function chosenStyle(id: string, models: string[] = []): ImagePromptStyle {
  return {
    id,
    name: `Image prompt: ${id}`,
    role: 'describe',
    direction: null,
    models,
  };
}

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

  it('ranks the small instruct builds above the big ones', () => {
    expect(
      curatedRank('koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic'),
    ).toBe(0);
    expect(curatedRank('koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M')).toBe(3);
    expect(curatedRank('koboldcpp/gemma-4-31B-it-heretic')).toBeGreaterThan(3);
    expect(curatedRank('aphrodite/TheDrummer/Behemoth-X-123B-v2.1')).toBe(10);
    expect(curatedRank('koboldcpp/L3-8B-Stheno-v3.2')).toBeNull();
  });

  it('reads the parameter count off a name, however it is written', () => {
    expect(modelParameterCount('koboldcpp/gemma-4-31B-it-heretic')).toBe(31);
    expect(
      modelParameterCount('aphrodite/TheDrummer/Behemoth-X-123B-v2.1'),
    ).toBe(123);
    expect(modelParameterCount('koboldcpp/L3-8B-Stheno-v3.2')).toBe(8);
    expect(modelParameterCount('koboldcpp/Qwen3-0.8B')).toBe(0.8);
    expect(
      modelParameterCount('koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic'),
    ).toBe(4);
    expect(modelParameterCount('koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M')).toBe(
      3,
    );
    expect(modelParameterCount('some/model-12b')).toBe(12);
    // A quantisation suffix is not a size, and neither is a version.
    expect(modelParameterCount('koboldcpp/MythoMax-v2-Q4bit')).toBeNull();
    expect(modelParameterCount('koboldcpp/Unnamed-Tune-v3.2')).toBeNull();
  });

  it('sorts the sizes into what they cost to ask', () => {
    expect(modelCostTier('koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M')).toBe(
      'small',
    );
    expect(modelCostTier('koboldcpp/L3-8B-Stheno-v3.2')).toBe('small');
    expect(modelCostTier('koboldcpp/gemma-4-31B-it-heretic')).toBe('medium');
    expect(modelCostTier('some/Cydonia-24B-v4')).toBe('medium');
    expect(modelCostTier('aphrodite/TheDrummer/Behemoth-X-123B-v2.1')).toBe(
      'large',
    );
    expect(modelCostTier('koboldcpp/Unnamed-Tune-v3.2')).toBeNull();
  });

  it('takes the cheapest curated tier that has a model online', () => {
    expect(pickTextModel(pool, 'auto')).toEqual({
      models: ['koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic'],
      label: 'koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic',
    });
  });

  it('falls through to the bigger tiers only when nothing smaller is online', () => {
    const noSmall = [
      model('aphrodite/TheDrummer/Behemoth-X-123B-v2.1', 16),
      model('koboldcpp/gemma-4-31B-it-heretic', 1),
    ];
    expect(pickTextModel(noSmall, 'auto').models).toEqual([
      'koboldcpp/gemma-4-31B-it-heretic',
    ]);
    const largeOnly = [model('aphrodite/TheDrummer/Behemoth-X-123B-v2.1', 16)];
    expect(pickTextModel(largeOnly, 'auto').models).toEqual([
      'aphrodite/TheDrummer/Behemoth-X-123B-v2.1',
    ]);
  });

  it('asks the biggest curated model online when quality is chosen', () => {
    expect(pickTextModel(pool, 'quality').models).toEqual([
      'aphrodite/TheDrummer/Behemoth-X-123B-v2.1',
    ]);
    const noLarge = [
      model('koboldcpp/gemma-4-31B-it-heretic', 1),
      model('koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic', 2),
    ];
    expect(pickTextModel(noLarge, 'quality').models).toEqual([
      'koboldcpp/gemma-4-31B-it-heretic',
    ]);
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

  it('names the words a rendering style already adds, and asks for the scene alone', () => {
    const input = {
      prompt: 'a dog',
      styleWords: 'oil painting, thick impasto',
    };
    const prompt = buildDraftPrompt(input);
    expect(prompt).toContain(
      'Rendering style applied separately (do not repeat these words): oil painting, thick impasto',
    );
    expect(prompt).toContain('Write the subject and the scene only');
    expect(prompt).not.toContain('adding setting, style, lighting');
    // The material a style's own template wraps carries the line and no
    // instruction of its own.
    expect(buildDraftMaterial(input)).toBe(
      'Prompt: a dog\nRendering style applied separately (do not repeat these words): oil painting, thick impasto',
    );
  });

  it('keeps the first line the model wrote, without label or quotes', () => {
    expect(
      cleanDraft('\n"Prompt: a dog on a couch, soft light"\n\nMore.'),
    ).toEqual({ text: 'a dog on a couch, soft light', negative: '' });
    expect(cleanDraft('   ')).toEqual({ text: '', negative: '' });
  });

  it('reads the two labelled lines an improved prompt comes back as', () => {
    expect(
      cleanDraft(
        'Prompt: a dog on a couch, soft light\nNegative: blurry, extra limbs',
      ),
    ).toEqual({
      text: 'a dog on a couch, soft light',
      negative: 'blurry, extra limbs',
    });
  });

  it('takes the prompt alone when the model ignored the labels', () => {
    expect(cleanDraft('a dog on a couch\nsomething else')).toEqual({
      text: 'a dog on a couch',
      negative: '',
    });
  });

  it('asks the improve instruction for a negative line as well', () => {
    const prompt = buildDraftPrompt({ prompt: 'a dog' });
    expect(prompt).toContain('Prompt:');
    expect(prompt).toContain('Negative:');
  });

  it('asks a judge to compare the prompt with what the picture became', () => {
    const prompt = buildDraftPrompt({
      role: 'judge',
      prompt: 'a dog',
      caption: 'a cat on a couch',
      tags: 'cat, couch',
    });
    expect(prompt).toContain('You compare an image prompt');
    expect(prompt).toContain('Prompt: a dog');
    expect(prompt).toContain('Description: a cat on a couch');
  });

  it('keeps every line of a verdict', () => {
    expect(cleanJudgement('  one\n\n two \nthree  ')).toBe('one\n\ntwo\nthree');
  });
});

describe('PromptDraftService', () => {
  let service: PromptDraftService;
  let http: HttpTestingController;
  let storedKey: string | null;
  let getTextStyles: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getTextStyles = vi.fn().mockReturnValue(of([]));
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
        { provide: StyleService, useValue: { getTextStyles } },
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
      texts: ['a dog on a couch, warm light'],
      model: 'koboldcpp/gemma-4-31B-it-heretic',
      kudos: 3,
    });
  });

  it('keeps the negative line an improved prompt came back with', async () => {
    const pending = service.draft({ prompt: 'a dog' }, 'any', []);
    const submit = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    // Two lines are asked for, so the answer is not held to one.
    expect(submit.request.body.params.singleline).toBeUndefined();
    submit.flush({ id: 'text-n', kudos: 4 });

    await vi.advanceTimersByTimeAsync(2_500);
    http.expectOne(`${API_BASE_URL}/generate/text/status/text-n`).flush({
      done: true,
      faulted: false,
      kudos: 4,
      generations: [
        {
          text: 'Prompt: a dog on a couch\nNegative: blurry, extra limbs',
          model: 'm/1',
        },
      ],
    });

    await expect(pending).resolves.toMatchObject({
      kind: 'done',
      texts: ['a dog on a couch'],
      negatives: ['blurry, extra limbs'],
    });
    const stored = await TestBed.inject(PromptDraftDbService).list(10);
    expect(stored.at(0)?.negative).toBe('blurry, extra limbs');
  });

  it('stores a verdict as the model wrote it, line breaks and all', async () => {
    const pending = service.draft(
      { role: 'judge', prompt: 'a dog', caption: 'a cat' },
      'any',
      [],
    );
    const submit = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    expect(submit.request.body.prompt).toContain('You compare an image prompt');
    submit.flush({ id: 'text-j', kudos: 5 });

    await vi.advanceTimersByTimeAsync(2_500);
    http.expectOne(`${API_BASE_URL}/generate/text/status/text-j`).flush({
      done: true,
      faulted: false,
      kudos: 5,
      generations: [
        {
          text: ' Matches: nothing.\nMissing: the dog.\nTry: say dog. ',
          model: 'm/1',
        },
      ],
    });

    await expect(pending).resolves.toMatchObject({
      kind: 'done',
      texts: ['Matches: nothing.\nMissing: the dog.\nTry: say dog.'],
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
      id: outcome.kind === 'done' ? outcome.ids[0] : '',
      requestId: 'text-9',
      takeIndex: 0,
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

  it('keeps only the tagged styles, and reads a role and a direction off them', async () => {
    getTextStyles.mockReturnValue(
      of([
        textStyle('s1', 'Image prompt: photographic', [
          'image-prompt',
          'image-prompt:describe',
          'photographic',
        ]),
        textStyle(
          's2',
          'Image prompt: sharpen',
          ['image-prompt', 'image-prompt:improve'],
          ['koboldcpp/gemma-4-31B-it-heretic'],
        ),
        textStyle('s3', 'A story style', ['roleplay']),
        textStyle('s4', 'Tagged but roleless', ['image-prompt']),
      ]),
    );

    const styles = await service.imagePromptStyles();

    expect(styles).toEqual([
      {
        id: 's1',
        name: 'Image prompt: photographic',
        role: 'describe',
        direction: 'photographic',
        models: [],
      },
      {
        id: 's2',
        name: 'Image prompt: sharpen',
        role: 'improve',
        direction: null,
        models: ['koboldcpp/gemma-4-31B-it-heretic'],
      },
    ]);
    expect(getTextStyles).toHaveBeenCalledWith({
      tag: 'image-prompt',
      page: 1,
    });
    // Fetched once a session, however many cards ask for them.
    await service.imagePromptStyles();
    expect(getTextStyles).toHaveBeenCalledTimes(1);
  });

  it('offers no styles when the catalogue will not load', async () => {
    getTextStyles.mockReturnValue(throwError(() => new Error('offline')));
    await expect(service.imagePromptStyles()).resolves.toEqual([]);
  });

  it('sends a chosen style as the whole instruction, without params or models', async () => {
    const models = [model('koboldcpp/gemma-4-31B-it-heretic', 1)];
    const pending = service.draft(
      { caption: 'a dog', note: 'at night' },
      'auto',
      models,
      { anonymous: true, origin: 'alchemy' },
      { style: chosenStyle('s1', ['koboldcpp/gemma-4-31B-it-heretic']) },
    );

    const submit = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    expect(submit.request.body).toEqual({
      prompt: 'Description: a dog\nNotes from the user: at night',
      style: 's1',
      slow_workers: true,
    });
    submit.flush(
      { message: 'nope', rc: 'Nope' },
      { status: 400, statusText: 'Bad Request' },
    );
    await pending;
  });

  it('writes its own instruction and model list when no style is chosen', async () => {
    const models = [model('koboldcpp/gemma-4-31B-it-heretic', 1)];
    const pending = service.draft({ caption: 'a dog' }, 'auto', models, {
      anonymous: true,
      origin: 'alchemy',
    });
    const submit = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    expect(submit.request.body.style).toBeUndefined();
    expect(submit.request.body.models).toEqual([
      'koboldcpp/gemma-4-31B-it-heretic',
    ]);
    expect(submit.request.body.prompt).toContain('### Instruction:');
    submit.flush(
      { message: 'nope', rc: 'Nope' },
      { status: 400, statusText: 'Bad Request' },
    );
    await pending;
  });

  it('asks for three takes and keeps each of them', async () => {
    const pending = service.draft(
      { caption: 'a dog' },
      'any',
      [],
      { anonymous: true, origin: 'studio' },
      { takes: 3 },
    );
    const submit = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    expect(submit.request.body.params.n).toBe(3);
    submit.flush({ id: 'text-3', kudos: 9 });

    await vi.advanceTimersByTimeAsync(2_500);
    http.expectOne(`${API_BASE_URL}/generate/text/status/text-3`).flush({
      done: true,
      faulted: false,
      kudos: 9,
      generations: [
        { text: 'one dog', model: 'm/1', seed: 1 },
        { text: 'two dogs', model: 'm/1', seed: 2 },
        { text: 'three dogs', model: 'm/1', seed: 3 },
      ],
    });

    const outcome = await pending;
    expect(outcome).toMatchObject({
      kind: 'done',
      texts: ['one dog', 'two dogs', 'three dogs'],
    });
    const stored = await TestBed.inject(PromptDraftDbService).list(10);
    expect(stored).toHaveLength(3);
    expect(stored.map((draft) => draft.requestId)).toEqual([
      'text-3',
      'text-3',
      'text-3',
    ]);
    expect([...stored].map((draft) => draft.takeIndex).sort()).toEqual([
      0, 1, 2,
    ]);
  });

  it('previews the body a press would send, down to the last field', async () => {
    const models = [model('koboldcpp/gemma-4-31B-it-heretic', 1)];
    const input = { caption: 'a dog', styleWords: 'oil painting' };
    const shape = { takes: 3 };
    const preview = service.previewRequest(input, 'auto', models, shape);

    const pending = service.draft(
      input,
      'auto',
      models,
      { anonymous: true, origin: 'alchemy' },
      shape,
    );
    const submit = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    expect(submit.request.body).toEqual(preview);
    submit.flush(
      { message: 'nope', rc: 'Nope' },
      { status: 400, statusText: 'Bad Request' },
    );
    await pending;
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
