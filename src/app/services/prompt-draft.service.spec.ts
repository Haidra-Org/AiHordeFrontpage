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
  estimateTokens,
  modelCostTier,
  modelParameterCount,
  pickTextModel,
  sizeRequest,
  stripThinkBlocks,
  trimToSentence,
  wordsForTokens,
} from './prompt-draft.service';
import { AuthService } from './auth.service';
import { StyleService } from './style.service';
import {
  TextGenerationQueueService,
  TextRequestSubmission,
} from './text-generation-queue.service';
import type { StoredTextRequest } from './text-generation-db.service';
import { ActiveModel } from '../types/active-model';
import type { TextWorker } from '../types/generation';
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

  describe('when some workers are being kept off the request', () => {
    const worker = (
      id: string,
      models: string[],
      online = true,
    ): TextWorker => ({ id, name: id, online, models });

    it('passes over a model whose every online worker is being avoided', () => {
      const workers = [
        worker('w-silent', [
          'koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic',
        ]),
        worker('w-ok', ['koboldcpp/gemma-4-31B-it-heretic']),
      ];
      expect(
        pickTextModel(pool, 'auto', { workers, avoided: ['w-silent'] }).models,
      ).toEqual(['koboldcpp/gemma-4-31B-it-heretic']);
    });

    it('keeps a model that has a worker left, and one no listed worker carries', () => {
      const workers = [
        worker('w-silent', [
          'koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic',
        ]),
        worker('w-ok', ['koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic']),
        // Offline, so it is nobody's last worker either way.
        worker(
          'w-off',
          ['koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic'],
          false,
        ),
      ];
      expect(
        pickTextModel(pool, 'auto', { workers, avoided: ['w-silent'] }).models,
      ).toEqual(['koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic']);
      // No worker in the listing carries the big one, so the listing says
      // nothing about it and it stays eligible.
      expect(
        pickTextModel(pool, 'quality', { workers, avoided: ['w-silent'] })
          .models,
      ).toEqual(['aphrodite/TheDrummer/Behemoth-X-123B-v2.1']);
    });

    it('leaves a model the reader named outright alone', () => {
      const workers = [worker('w-silent', ['x/y'])];
      expect(
        pickTextModel(
          pool,
          { model: 'x/y' },
          {
            workers,
            avoided: ['w-silent'],
          },
        ).models,
      ).toEqual(['x/y']);
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
    // The markers a worker templates for the build it is running, rather than
    // Alpaca's, which is only what it falls back to.
    expect(prompt.startsWith('{{[INPUT]}}\n')).toBe(true);
    expect(prompt).toContain('Description: a dog');
    expect(prompt).toContain('Tags: dog, couch');
    expect(prompt).not.toContain('Notes from the user');
    expect(prompt).not.toContain('### Instruction:');
    expect(prompt.endsWith('{{[OUTPUT]}}\n')).toBe(true);
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
    ).toEqual({
      text: 'a dog on a couch, soft light',
      negative: '',
      changes: ['label_stripped', 'quotes_stripped'],
    });
    expect(cleanDraft('   ')).toEqual({
      text: '',
      negative: '',
      changes: [],
    });
  });

  it('reads the two labelled lines an improved prompt comes back as', () => {
    expect(
      cleanDraft(
        'Prompt: a dog on a couch, soft light\nNegative: blurry, extra limbs',
      ),
    ).toEqual({
      text: 'a dog on a couch, soft light',
      negative: 'blurry, extra limbs',
      changes: ['label_stripped'],
    });
  });

  it('passes over a heading and reads the line under it', () => {
    expect(
      cleanDraft(
        '**Improved Prompt**\ncity street at night, neon reflections in puddles\n\n**Negative Prompt**\npeople, cars',
      ),
    ).toEqual({
      text: 'city street at night, neon reflections in puddles',
      negative: 'people, cars',
      changes: ['label_stripped'],
    });
    expect(
      cleanDraft(
        '**Stronger Prompt:** \na cluttered writing desk, warm lamplight\n\n**Negative Prompt:** \ncoffee cups',
      ),
    ).toEqual({
      text: 'a cluttered writing desk, warm lamplight',
      negative: 'coffee cups',
      changes: ['label_stripped'],
    });
  });

  it('passes over a bare label line and reads the line under it', () => {
    expect(
      cleanDraft(
        'Stronger Prompt:\na dog on a couch, soft light\n\nNegative Prompt:\nblurry, extra limbs',
      ),
    ).toEqual({
      text: 'a dog on a couch, soft light',
      negative: 'blurry, extra limbs',
      changes: ['label_stripped'],
    });
  });

  it('reads the wordings a model names its answer with, label and line together', () => {
    expect(
      cleanDraft(
        'Stronger Prompt: a woman in a greenhouse, morning light\nNegative Prompt: modern clothing',
      ),
    ).toEqual({
      text: 'a woman in a greenhouse, morning light',
      negative: 'modern clothing',
      changes: ['label_stripped'],
    });
    // The same heading without the comparative, which is what some builds write.
    expect(
      cleanDraft('Strong Prompt: a lighthouse at dusk, long exposure'),
    ).toEqual({
      text: 'a lighthouse at dusk, long exposure',
      negative: '',
      changes: ['label_stripped'],
    });
  });

  it('reads a labelled negative under a prompt the model left unlabelled', () => {
    expect(
      cleanDraft(
        'city street, rainy night, lone cyclist\n\nNegative: daylight, crowds',
      ),
    ).toEqual({
      text: 'city street, rainy night, lone cyclist',
      negative: 'daylight, crowds',
      changes: ['label_stripped'],
    });
  });

  it('leaves a label the picture itself is meant to show alone', () => {
    expect(
      cleanDraft(
        'a cluttered writing desk, an open notebook whose page reads "Prompt: buy more coffee", a cold mug',
      ),
    ).toEqual({
      text: 'a cluttered writing desk, an open notebook whose page reads "Prompt: buy more coffee", a cold mug',
      negative: '',
      changes: [],
    });
  });

  it('takes the prompt alone when the model ignored the labels', () => {
    expect(cleanDraft('a dog on a couch\nsomething else')).toEqual({
      text: 'a dog on a couch',
      negative: '',
      changes: [],
    });
  });

  it('leaves a label inside the prompt alone, since only a line start is one', () => {
    expect(
      cleanDraft('a sign reading "Prompt: free beer", neon, night'),
    ).toEqual({
      text: 'a sign reading "Prompt: free beer", neon, night',
      negative: '',
      changes: [],
    });
  });

  it('drops a thinking block, closed or left open at the allowance', () => {
    expect(
      stripThinkBlocks('<think>hmm, a dog</think>\na dog, soft light'),
    ).toBe('a dog, soft light');
    expect(stripThinkBlocks('<think>hmm, the allowance ran out')).toBe('');
    expect(stripThinkBlocks('a dog, soft light')).toBe('a dog, soft light');
    expect(
      cleanDraft('<think>weighing it up</think>\na dog, soft light'),
    ).toEqual({
      text: 'a dog, soft light',
      negative: '',
      changes: ['think_removed'],
    });
  });

  it('cuts prose back to the last sentence it finished, and leaves a list whole', () => {
    expect(trimToSentence('One thing. Another thing. A third thi')).toBe(
      'One thing. Another thing.',
    );
    expect(trimToSentence('One thing. Another thing.')).toBe(
      'One thing. Another thing.',
    );
    expect(trimToSentence('a dog on a couch, soft light')).toBe(
      'a dog on a couch, soft light',
    );
    expect(trimToSentence('')).toBe('');
  });

  it('marks a prompt it had to cut back', () => {
    expect(
      cleanDraft('The dog sits. The light is soft. The couch is gre'),
    ).toEqual({
      text: 'The dog sits. The light is soft.',
      negative: '',
      changes: ['trimmed_to_sentence'],
    });
  });

  it('reshapes a negative written as sentences into the list that was asked for', () => {
    expect(
      cleanDraft(
        'Prompt: a dog on a couch\nNegative: No blood, gore or violence. No nudity.',
      ),
    ).toEqual({
      text: 'a dog on a couch',
      negative: 'blood, gore, violence, nudity',
      changes: ['label_stripped', 'negative_reshaped'],
    });
  });

  it('marks an answer that repeats the instruction instead of following it', () => {
    expect(
      cleanDraft('You write prompts for an AI image generator. Turn the'),
    ).toEqual({
      text: 'You write prompts for an AI image generator.',
      negative: '',
      changes: ['trimmed_to_sentence', 'instruction_echo'],
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

describe('sizing a request', () => {
  const workerLimits = { maxLength: 512, maxContextLength: 4096 };

  it('pays for a line of phrases when a prompt is written from a short reading', () => {
    const sizing = sizeRequest('write', { caption: 'a dog' }, workerLimits);
    expect(sizing.maxLength).toBe(48);
    expect(sizing.askedLength).toBe(48);
    expect(sizing.limitedBy).toBeNull();
    expect(sizing.maxContextLength).toBe(512);
  });

  it('pays for more where there is more to turn into a prompt', () => {
    const sizing = sizeRequest(
      'write',
      { caption: 'a dog on a couch, '.repeat(30) },
      workerLimits,
    );
    expect(sizing.maxLength).toBeGreaterThan(48);
    expect(sizing.maxLength).toBeLessThanOrEqual(160);
    expect(sizing.maxContextLength).toBe(512);
  });

  it('never pays for more than a written prompt is worth', () => {
    const sizing = sizeRequest(
      'write',
      { caption: 'a dog on a couch, '.repeat(200) },
      workerLimits,
    );
    expect(sizing.maxLength).toBe(160);
  });

  it('gives an improved prompt room for the one it was given and a little more', () => {
    const short = sizeRequest('improve', { prompt: 'a dog' }, workerLimits);
    expect(short.maxLength).toBe(66);
    const long = sizeRequest(
      'improve',
      { prompt: 'a dog on a couch, '.repeat(20) },
      workerLimits,
    );
    expect(long.maxLength).toBeGreaterThan(64);
    expect(long.maxLength).toBeLessThanOrEqual(256);
  });

  it('gives a verdict the same three lines whatever it is about', () => {
    expect(
      sizeRequest('judge', { prompt: 'a dog', caption: 'a cat' }, workerLimits)
        .maxLength,
    ).toBe(200);
  });

  it('holds both sizes to what the model’s workers advertise', () => {
    const sizing = sizeRequest(
      'judge',
      { prompt: 'a dog' },
      {
        maxLength: 80,
        maxContextLength: 512,
      },
    );
    expect(sizing.maxLength).toBe(80);
    expect(sizing.askedLength).toBe(200);
    expect(sizing.limitedBy).toBe('workers');
    expect(sizing.maxContextLength).toBe(512);
  });

  it('holds them to a style’s ceilings as well, and says which one bound', () => {
    const sizing = sizeRequest(
      'judge',
      { prompt: 'a dog' },
      { maxLength: 512, maxContextLength: 4096 },
      { maxLength: 64, maxContextLength: 1024 },
    );
    expect(sizing.maxLength).toBe(64);
    expect(sizing.limitedBy).toBe('style');
    expect(sizing.maxContextLength).toBe(512);
    // A ceiling below the room the material needs binds that too.
    expect(
      sizeRequest(
        'improve',
        { prompt: 'a dog on a couch, '.repeat(120) },
        { maxLength: 512, maxContextLength: 4096 },
        { maxContextLength: 1024 },
      ).maxContextLength,
    ).toBe(1024);
  });

  it('asks for the room the material needs, in the sizes workers expect', () => {
    const roomy = sizeRequest(
      'improve',
      { prompt: 'a dog on a couch, '.repeat(120) },
      workerLimits,
    );
    expect(roomy.promptTokens).toBeGreaterThan(512);
    expect([1024, 2048, 4096]).toContain(roomy.maxContextLength);
  });

  it('reads a reading as costing about a token every three and a half letters', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(350))).toBe(120);
  });

  it('says a size in words, rounded to read as the approximation it is', () => {
    expect(wordsForTokens(96)).toBe(70);
    expect(wordsForTokens(1024)).toBe(770);
    expect(wordsForTokens(0)).toBe(0);
  });
});

describe('PromptDraftService', () => {
  let service: PromptDraftService;
  let http: HttpTestingController;
  let storedKey: string | null;
  let getTextStyles: ReturnType<typeof vi.fn>;
  let submit: ReturnType<typeof vi.fn>;
  let settled: ReturnType<typeof vi.fn>;
  let watch: ReturnType<typeof vi.fn>;
  let release: ReturnType<typeof vi.fn>;
  let avoided: ReadonlySet<string>;

  /** What the service handed the queue on its last send. */
  const submitted = (): TextRequestSubmission => {
    const call = submit.mock.calls.at(-1);
    if (!call) throw new Error('nothing was submitted');
    return call[0] as TextRequestSubmission;
  };

  /** A request as the queue hands it back once it has settled. */
  const settledRequest = (
    overrides: Partial<StoredTextRequest>,
  ): StoredTextRequest => ({
    localId: 'local-1',
    hordeId: 'text-1',
    createdAt: 1,
    updatedAt: 2,
    context: { kind: 'awaited' },
    origin: 'studio',
    input: { caption: 'a dog' },
    pick: 'any',
    takes: 1,
    anonymous: true,
    modelLabel: null,
    request: { prompt: 'the body' },
    state: 'done',
    acknowledged: true,
    ...overrides,
  });

  beforeEach(() => {
    getTextStyles = vi.fn().mockReturnValue(of([]));
    globalThis.indexedDB = new IDBFactory();
    storedKey = null;
    submit = vi.fn().mockResolvedValue({ kind: 'sent', localId: 'local-1' });
    settled = vi.fn();
    release = vi.fn();
    watch = vi.fn().mockReturnValue(release);
    avoided = new Set();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { getStoredApiKey: () => storedKey },
        },
        { provide: StyleService, useValue: { getTextStyles } },
        {
          provide: TextGenerationQueueService,
          useValue: {
            submit,
            settled,
            watch,
            avoidedWorkers: () => avoided,
          },
        },
      ],
    });
    service = TestBed.inject(PromptDraftService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('sends a request for the picked model on the anonymous key, filed under the card that asked', async () => {
    const models = [model('koboldcpp/gemma-4-31B-it-heretic', 1)];
    const sent = await service.submit({ caption: 'a dog' }, 'auto', models, {
      anonymous: true,
      origin: 'alchemy',
      context: { kind: 'alchemy', jobId: 'job-1' },
      quotedKudos: 4,
    });

    expect(sent).toEqual({ kind: 'sent', localId: 'local-1' });
    const body = submitted();
    expect(body).toMatchObject({
      context: { kind: 'alchemy', jobId: 'job-1' },
      origin: 'alchemy',
      input: { caption: 'a dog' },
      pick: 'auto',
      styleId: null,
      takes: 1,
      anonymous: true,
      modelLabel: 'koboldcpp/gemma-4-31B-it-heretic',
      apiKey: '0000000000',
      quotedKudos: 4,
    });
    expect(body.request.models).toEqual(['koboldcpp/gemma-4-31B-it-heretic']);
    expect(body.request.params?.max_length).toBe(48);
    expect(body.request.params?.max_context_length).toBe(512);
    expect(body.request.params?.stop_sequence).toEqual([
      '\n\n',
      '{{[INPUT]}}',
      '### Instruction:',
    ]);
    expect(body.request.prompt).toContain('Description: a dog');
    expect(submit.mock.calls.at(-1)?.[1]).toEqual({ replace: false });
  });

  it('asks the queue to replace a waiting request only when told to', async () => {
    await service.submit({ caption: 'a dog' }, 'any', [], {
      anonymous: true,
      origin: 'studio',
      context: { kind: 'studio' },
      replace: true,
    });
    expect(submit.mock.calls.at(-1)?.[1]).toEqual({ replace: true });
    expect(submitted().quotedKudos).toBeNull();
  });

  it('does not stop an improved prompt at its first blank line', async () => {
    await service.submit({ prompt: 'a dog' }, 'any', [], {
      anonymous: true,
      origin: 'studio',
      context: { kind: 'studio' },
    });
    // Two lines are asked for, so the answer is not cut off after one.
    expect(submitted().request.params?.stop_sequence).toEqual([
      '{{[INPUT]}}',
      '### Instruction:',
    ]);
  });

  it('keeps the workers an empty answer earned off the retry', async () => {
    await service.submit(
      { caption: 'a dog' },
      'any',
      [],
      { anonymous: true, origin: 'studio', context: { kind: 'studio' } },
      { avoidWorkers: ['w-1', 'w-2'] },
    );
    expect(submitted().request).toMatchObject({
      workers: ['w-1', 'w-2'],
      worker_blacklist: true,
    });
  });

  it('takes the largest job any worker carrying the model will do', async () => {
    const pending = service.workerLimitsFor('koboldcpp/gemma');
    http.expectOne(`${API_BASE_URL}/workers?type=text`).flush([
      {
        id: 'w-1',
        name: 'One',
        online: true,
        models: ['koboldcpp/gemma'],
        max_length: 80,
        max_context_length: 2048,
      },
      {
        id: 'w-2',
        name: 'Two',
        online: true,
        models: ['koboldcpp/gemma'],
        max_length: 512,
        max_context_length: 4096,
      },
      {
        id: 'w-3',
        name: 'Offline',
        online: false,
        models: ['koboldcpp/gemma'],
        max_length: 2048,
        max_context_length: 8192,
      },
      {
        id: 'w-4',
        name: 'Other model',
        online: true,
        models: ['some/other'],
        max_length: 4096,
        max_context_length: 8192,
      },
    ]);

    await expect(pending).resolves.toEqual({
      maxLength: 512,
      maxContextLength: 4096,
    });
  });

  it('reports no limits when nothing online carries the model or says what it takes', async () => {
    const pending = service.workerLimitsFor('koboldcpp/gemma');
    http
      .expectOne(`${API_BASE_URL}/workers?type=text`)
      .flush([
        { id: 'w-1', name: 'One', online: true, models: ['koboldcpp/gemma'] },
      ]);
    await expect(pending).resolves.toBeNull();
    await expect(service.workerLimitsFor(null)).resolves.toBeNull();
  });

  it('keeps a worker that answered with nothing off the next request it builds', async () => {
    avoided = new Set(['w-silent']);
    await service.submit({ caption: 'a dog' }, 'any', [], {
      anonymous: true,
      origin: 'studio',
      context: { kind: 'studio' },
    });
    expect(submitted().request).toMatchObject({
      workers: ['w-silent'],
      worker_blacklist: true,
    });
    // The price quoted and the body shown are the ones that go.
    expect(
      service.previewRequest({ caption: 'a dog' }, 'any', []),
    ).toMatchObject({ workers: ['w-silent'], worker_blacklist: true });
  });

  it('asks on a model a kept-off worker was not the whole of', async () => {
    avoided = new Set(['w-silent']);
    const models = [
      model('koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic', 1),
      model('koboldcpp/gemma-4-31B-it-heretic', 1),
    ];
    const workers: TextWorker[] = [
      {
        id: 'w-silent',
        name: 'Silent',
        online: true,
        models: ['koboldcpp/Gemma-4-E4B-it-Ultra-Uncensored-Heretic'],
      },
      {
        id: 'w-ok',
        name: 'Ok',
        online: true,
        models: ['koboldcpp/gemma-4-31B-it-heretic'],
      },
    ];

    await service.submit(
      { caption: 'a dog' },
      'auto',
      models,
      { anonymous: true, origin: 'studio', context: { kind: 'studio' } },
      { workers },
    );
    // The cheaper model would have been the pick, but nobody is left to write
    // on it, so the request would have waited out its life in the queue.
    expect(submitted().request.models).toEqual([
      'koboldcpp/gemma-4-31B-it-heretic',
    ]);
    expect(submitted().modelLabel).toBe('koboldcpp/gemma-4-31B-it-heretic');
  });

  it('sizes a request on the workers that can still answer it', async () => {
    avoided = new Set(['w-big']);
    const pending = service.workerLimitsFor('koboldcpp/gemma');
    http.expectOne(`${API_BASE_URL}/workers?type=text`).flush([
      {
        id: 'w-big',
        name: 'Big',
        online: true,
        models: ['koboldcpp/gemma'],
        max_length: 512,
        max_context_length: 8192,
      },
      {
        id: 'w-ok',
        name: 'Ok',
        online: true,
        models: ['koboldcpp/gemma'],
        max_length: 80,
        max_context_length: 2048,
      },
    ]);
    // The avoided worker's ceiling is not one this request can use.
    await expect(pending).resolves.toEqual({
      maxLength: 80,
      maxContextLength: 2048,
    });
  });

  it('sends the sizes the reader set in place of the ones worked out', () => {
    const body = service.previewRequest({ caption: 'a dog' }, 'any', [], {
      maxLength: 300,
      maxContextLength: 2048,
    });
    expect(body.params?.max_length).toBe(300);
    expect(body.params?.max_context_length).toBe(2048);
  });

  it('sends on the account key unless the request is asked for anonymously', async () => {
    storedKey = 'a-real-key';
    await service.submit({ caption: 'a dog' }, 'any', [], {
      anonymous: false,
      origin: 'studio',
      context: { kind: 'studio' },
    });
    expect(submitted().apiKey).toBe('a-real-key');

    await service.submit({ caption: 'a dog' }, 'any', [], {
      anonymous: true,
      origin: 'studio',
      context: { kind: 'studio' },
    });
    expect(submitted().apiKey).toBe('0000000000');
  });

  it('prices a draft with a dry run that queues nothing', async () => {
    storedKey = 'a-real-key';
    const pending = service.estimate({ caption: 'a dog' }, 'any', [], false);
    const priced = http.expectOne(`${API_BASE_URL}/generate/text/async`);
    expect(priced.request.body.dry_run).toBe(true);
    expect(priced.request.headers.get('apikey')).toBe('a-real-key');
    priced.flush({ kudos: 7 });
    await expect(pending).resolves.toEqual({ kudos: 7, resolved: null });
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps the request the horde says it will send, where the horde says', async () => {
    const pending = service.estimate({ caption: 'a dog' }, 'any', [], true);
    http.expectOne(`${API_BASE_URL}/generate/text/async`).flush({
      kudos: 7,
      resolved: {
        prompt: '### Instruction:\na dog',
        params: { max_length: 48, max_context_length: 512 },
        models: ['koboldcpp/gemma'],
        style: null,
        estimated_prompt_tokens: 24,
        context_fit: 'ignore',
      },
    });
    const estimate = await pending;
    expect(estimate.kudos).toBe(7);
    expect(estimate.resolved).toMatchObject({
      models: ['koboldcpp/gemma'],
      estimated_prompt_tokens: 24,
      context_fit: 'ignore',
    });
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
    await expect(pending).resolves.toEqual({ kudos: null, resolved: null });
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
    await service.submit(
      { caption: 'a dog', note: 'at night' },
      'auto',
      models,
      { anonymous: true, origin: 'alchemy', context: { kind: 'studio' } },
      { style: chosenStyle('s1', ['koboldcpp/gemma-4-31B-it-heretic']) },
    );

    expect(submitted().request).toEqual({
      prompt: 'Description: a dog\nNotes from the user: at night',
      style: 's1',
      slow_workers: true,
    });
    expect(submitted().styleId).toBe('s1');
  });

  it('writes its own instruction and model list when no style is chosen', async () => {
    const models = [model('koboldcpp/gemma-4-31B-it-heretic', 1)];
    await service.submit({ caption: 'a dog' }, 'auto', models, {
      anonymous: true,
      origin: 'alchemy',
      context: { kind: 'studio' },
    });
    const body = submitted().request;
    expect(body.style).toBeUndefined();
    expect(body.models).toEqual(['koboldcpp/gemma-4-31B-it-heretic']);
    expect(body.prompt).toContain('{{[INPUT]}}');
  });

  it('asks for three takes', async () => {
    await service.submit(
      { caption: 'a dog' },
      'any',
      [],
      { anonymous: true, origin: 'studio', context: { kind: 'studio' } },
      { takes: 3 },
    );
    expect(submitted().request.params?.n).toBe(3);
    expect(submitted().takes).toBe(3);
  });

  it('previews the body a press would send, down to the last field', async () => {
    const models = [model('koboldcpp/gemma-4-31B-it-heretic', 1)];
    const input = { caption: 'a dog', styleWords: 'oil painting' };
    const shape = { takes: 3 };
    const preview = service.previewRequest(input, 'auto', models, shape);

    await service.submit(
      input,
      'auto',
      models,
      { anonymous: true, origin: 'alchemy', context: { kind: 'studio' } },
      shape,
    );
    expect(submitted().request).toEqual(preview);
  });

  describe('waiting for one answer', () => {
    it('files the request apart from every card, replacing one still waiting, and hands back the takes', async () => {
      settled.mockResolvedValue(
        settledRequest({
          chargedKudos: 5,
          results: [
            {
              draftId: 'text-1-0',
              text: 'Matches: nothing.\nMissing: the dog.',
              negative: '',
              model: 'm/1',
              seed: 7,
            },
          ],
        }),
      );

      const outcome = await service.draft(
        { role: 'judge', prompt: 'a dog', caption: 'a cat' },
        'any',
        [],
        { anonymous: true, origin: 'studio' },
      );

      expect(submitted().context).toEqual({ kind: 'awaited' });
      expect(submitted().request.prompt).toContain(
        'You compare an image prompt',
      );
      expect(submit.mock.calls.at(-1)?.[1]).toEqual({ replace: true });
      expect(settled).toHaveBeenCalledWith('local-1');
      expect(outcome).toEqual({
        kind: 'done',
        texts: ['Matches: nothing.\nMissing: the dog.'],
        negatives: [''],
        model: 'm/1',
        kudos: 5,
        seed: 7,
        ids: ['text-1-0'],
      });
    });

    it('is checked at the quicker pace while it waits', async () => {
      const deferred: { resolve?: (request: StoredTextRequest) => void } = {};
      settled.mockReturnValue(
        new Promise<StoredTextRequest>((resolve) => {
          deferred.resolve = resolve;
        }),
      );

      const pending = service.draft({ caption: 'a dog' }, 'any', []);
      await vi.waitFor(() => expect(watch).toHaveBeenCalled());
      expect(watch).toHaveBeenCalledWith({ kind: 'awaited' });
      expect(release).not.toHaveBeenCalled();

      deferred.resolve?.(settledRequest({ state: 'expired' }));
      await expect(pending).resolves.toEqual({ kind: 'expired' });
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('reports the refusal as the horde worded it', async () => {
      settled.mockResolvedValue(
        settledRequest({
          state: 'refused',
          refusal: { status: 400, message: 'No workers', rc: 'NoWorkers' },
        }),
      );
      await expect(
        service.draft({ caption: 'a dog' }, 'any', []),
      ).resolves.toMatchObject({
        kind: 'refused',
        error: { status: 400, message: 'No workers' },
      });
    });

    it('reports a request that came back with nothing to read as empty', async () => {
      settled.mockResolvedValue(
        settledRequest({ state: 'empty', results: [] }),
      );
      await expect(
        service.draft({ caption: 'a dog' }, 'any', []),
      ).resolves.toEqual({ kind: 'empty' });
      // A finished request holding only takes that cleaned to nothing reads
      // the same way, whichever state it was filed under.
      settled.mockResolvedValue(settledRequest({ state: 'done', results: [] }));
      await expect(
        service.draft({ caption: 'a dog' }, 'any', []),
      ).resolves.toEqual({ kind: 'empty' });
    });
  });
});
