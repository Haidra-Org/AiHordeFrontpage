import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AiHordeService } from './ai-horde.service';
import { AuthService } from './auth.service';
import { StyleService } from './style.service';
import {
  TextGenerationQueueService,
  TextSubmitResult,
} from './text-generation-queue.service';
import type {
  StoredTextRequest,
  TextRequestContext,
} from './text-generation-db.service';
import { ActiveModel } from '../types/active-model';
import {
  HordeApiError,
  TextGenerationRequest,
  TextWorker,
} from '../types/generation';
import {
  IMAGE_PROMPT_TAG,
  ImagePromptStyle,
  asImagePromptStyle,
} from '../types/style';

const ANONYMOUS_API_KEY = '0000000000';

/**
 * Which text model answers a draft: the best value of the curated list that
 * has workers, the biggest of them, any model at all, or one named outright.
 */
export type PromptDraftModelPick =
  | 'auto'
  | 'quality'
  | 'any'
  | { model: string };

/**
 * What the model is being asked to do. `write` turns a reading into a prompt
 * and `improve` rewrites one that exists; both answer with a prompt. `judge`
 * answers with an opinion instead, comparing a prompt with what the finished
 * picture turned out to be.
 */
export type PromptDraftRole = 'write' | 'improve' | 'judge';

/**
 * What a draft is written from. Any part may be empty; not all of them. With
 * a `prompt` the request is to improve what is written; without one it is to
 * write a prompt from what alchemy found.
 */
export interface PromptDraftInput {
  caption?: string | null;
  tags?: string | null;
  note?: string | null;
  prompt?: string | null;
  /**
   * Words a rendering style already contributes to the finished picture. They
   * are named so the model writes the subject and the scene instead of saying
   * them twice.
   */
  styleWords?: string | null;
  /**
   * What to ask for. Left unset it follows the material, as it always has: a
   * prompt in hand is improved, and anything else is written from scratch.
   */
  role?: PromptDraftRole;
}

/** What the request is for, once the material has had its say. */
export function draftRole(input: PromptDraftInput): PromptDraftRole {
  return input.role ?? (input.prompt?.trim() ? 'improve' : 'write');
}

/**
 * What the request asks for beyond the material: whose instruction the model
 * follows, and how many answers come back.
 */
export interface PromptDraftShape {
  /**
   * The style the horde applies server-side. Null asks on the built-in
   * instruction and the curated model list.
   */
  style?: ImagePromptStyle | null;
  /** How many answers to ask for at once; one when unset. */
  takes?: number;
  /**
   * What the chosen model's workers will take. Unset, the sizes follow the
   * material alone and a worker with a small ceiling may not pick the request
   * up.
   */
  limits?: TextWorkerLimits | null;
  /** Ceilings the style sets on the two sizes, where it sets any. */
  ceilings?: TextSizeCeilings | null;
  /** The reader's own answer allowance, in place of the one the job works out. */
  maxLength?: number;
  /** The reader's own room for the request, in place of the worked-out one. */
  maxContextLength?: number;
  /** Workers to keep off the request; every other eligible worker may take it. */
  avoidWorkers?: readonly string[];
}

/** Which surface asked for a draft, kept with it in the history. */
export type PromptDraftOrigin = 'alchemy' | 'studio';

/** How a request goes out: on whose account, and on whose behalf. */
export interface PromptDraftOptions {
  /**
   * Send on the shared anonymous key. It costs the reader nothing and queues
   * at the lowest priority, which is the only choice open when logged out.
   */
  anonymous: boolean;
  origin: PromptDraftOrigin;
}

/** How a request is sent through the queue, beyond whose account pays. */
export interface PromptDraftSubmitOptions extends PromptDraftOptions {
  /** Which card asked, so the card can find the request again. */
  context: TextRequestContext;
  /** Cancel the live request this context already has, and send anyway. */
  replace?: boolean;
  /** The price the card was shown, kept with the request. */
  quotedKudos?: number | null;
}

export type PromptDraftOutcome =
  | {
      kind: 'done';
      /** Every take the request came back with, in the order the horde sent them. */
      texts: string[];
      /**
       * The negative line each take wrote, positionally alongside `texts`. A
       * model that answered with a prompt alone leaves its entry empty.
       */
      negatives: string[];
      model: string;
      kudos: number;
      seed: number | null;
      /** The history records written for this draft, one per take. */
      ids: string[];
    }
  | { kind: 'refused'; error: HordeApiError }
  /** The request ran and came back with nothing to read. */
  | { kind: 'empty' }
  | { kind: 'faulted' }
  | { kind: 'expired' }
  | { kind: 'cancelled' };

/** Where a request waited on in code is filed, apart from every card. */
const AWAITED_CONTEXT: TextRequestContext = { kind: 'awaited' };

/** What a settled request means to a caller that waited for one answer. */
function outcomeOf(request: StoredTextRequest): PromptDraftOutcome {
  switch (request.state) {
    case 'done': {
      const results = (request.results ?? []).filter(
        (take) => take.text.length > 0,
      );
      const first = results.at(0);
      if (!first) return { kind: 'empty' };
      return {
        kind: 'done',
        texts: results.map((take) => take.text),
        negatives: results.map((take) => take.negative),
        model: first.model,
        kudos: request.chargedKudos ?? 0,
        seed: first.seed,
        ids: results.map((take) => take.draftId),
      };
    }
    case 'refused':
      return {
        kind: 'refused',
        error: request.refusal ?? { status: 0, message: '' },
      };
    case 'expired':
      return { kind: 'expired' };
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'empty':
      return { kind: 'empty' };
    default:
      return { kind: 'faulted' };
  }
}

/**
 * Text models on the horde worth asking for a prompt, best first. The pool is
 * whatever volunteers run on the day, mostly story and roleplay tunes, so
 * the list names families that follow an instruction rather than exact
 * builds: a Gemma instruct build under any suffix still writes a prompt, and
 * the same family will be back under another quantisation next week.
 */
export const CURATED_TEXT_MODELS: readonly { pattern: RegExp; rank: number }[] =
  [
    // Kudos scale with the parameter count, and writing one line of comma
    // separated phrases is not work a large model does better. The small
    // instruct builds lead the list; the big ones are last, for the reader
    // who asks for them.
    { pattern: /gemma-4.*e\d+b.*-it/i, rank: 0 },
    { pattern: /llama-3(\.\d)?-8b-instruct/i, rank: 1 },
    { pattern: /qwen3(\.5)?-(4|7|8)b/i, rank: 2 },
    { pattern: /llama-3\.2-3b-instruct/i, rank: 3 },
    { pattern: /qwen.*-(0\.6|0\.8|1\.7)b|llama-3\.2-1b-instruct/i, rank: 4 },
    { pattern: /qwen3(\.5)?-(14|32)b/i, rank: 5 },
    { pattern: /llama-3(\.\d)?-70b-instruct/i, rank: 6 },
    { pattern: /gemma-4-31b.*-it/i, rank: 7 },
    { pattern: /gemma-4.*-it/i, rank: 8 },
    { pattern: /cydonia/i, rank: 9 },
    { pattern: /behemoth/i, rank: 10 },
  ];

/** Where a model falls on the curated list, or null when it is not on it. */
export function curatedRank(name: string): number | null {
  const entry = CURATED_TEXT_MODELS.find((candidate) =>
    candidate.pattern.test(name),
  );
  return entry ? entry.rank : null;
}

/**
 * How many billion parameters a model's name claims, or null when the name
 * does not say. Volunteers name their builds every way there is, so this reads
 * the one part they all spell the same: a number followed by a B, whether it
 * is `31B`, `0.8B`, `12b`, `3B-Instruct` or Gemma's effective-size `E4B`. The
 * last such group wins, since quantisation suffixes carry digits of their own.
 */
export function modelParameterCount(name: string): number | null {
  const matches = [...name.matchAll(/(\d+(?:\.\d+)?)b(?![a-z0-9])/gi)];
  const last = matches.at(-1);
  const matchedValue = last?.at(1);
  if (!matchedValue) return null;
  const value = Number.parseFloat(matchedValue);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** What a model costs to ask, in the only terms its name gives away. */
export type ModelCostTier = 'small' | 'medium' | 'large';

/** Where the tiers part, in billions of parameters. */
const SMALL_TIER_LIMIT = 9;
const MEDIUM_TIER_LIMIT = 35;

/** A model's cost tier, or null when its name does not say how big it is. */
export function modelCostTier(name: string): ModelCostTier | null {
  const size = modelParameterCount(name);
  if (size === null) return null;
  if (size <= SMALL_TIER_LIMIT) return 'small';
  return size <= MEDIUM_TIER_LIMIT ? 'medium' : 'large';
}

/**
 * Which tier is looked at first. The default asks the cheapest models that can
 * do the job and only reaches for a bigger one when nothing smaller is online;
 * the deliberate choice does the reverse. A model whose name hides its size is
 * last in both, since there is no telling what it would cost.
 */
const VALUE_TIER_ORDER: readonly (ModelCostTier | null)[] = [
  'small',
  'medium',
  'large',
  null,
];
const QUALITY_TIER_ORDER: readonly (ModelCostTier | null)[] = [
  'large',
  'medium',
  'small',
  null,
];

/** The curated models with workers, best first within the curated order. */
function rankedCurated(
  models: readonly ActiveModel[],
): { model: ActiveModel; rank: number }[] {
  return models
    .filter((model) => model.count > 0)
    .map((model) => ({ model, rank: curatedRank(model.name) }))
    .filter(
      (entry): entry is { model: ActiveModel; rank: number } =>
        entry.rank !== null,
    )
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.model.count - a.model.count ||
        (a.model.eta ?? 0) - (b.model.eta ?? 0),
    );
}

/** The first model of the first tier in `order` that has one online. */
function bestOfTiers(
  ranked: readonly { model: ActiveModel; rank: number }[],
  order: readonly (ModelCostTier | null)[],
): ActiveModel | undefined {
  for (const tier of order) {
    const found = ranked.find(
      (entry) => modelCostTier(entry.model.name) === tier,
    );
    if (found) return found.model;
  }
  return undefined;
}

/**
 * The model list a request goes out with, and the name to show for it.
 *
 * `auto` takes the cheapest tier that has a curated model online, ranked
 * within it by the curated order and then by how many workers run it, so a
 * draft costs what a short answer is worth. `quality` walks the tiers the
 * other way for a reader who asks for the biggest model on the day. Neither
 * finds anything when nothing curated is online, and the request then asks for
 * any model rather than nothing.
 */
export function pickTextModel(
  models: readonly ActiveModel[],
  pick: PromptDraftModelPick,
): { models: string[] | null; label: string | null } {
  if (pick === 'any') return { models: null, label: null };
  if (pick !== 'auto' && pick !== 'quality') {
    return { models: [pick.model], label: pick.model };
  }
  const best = bestOfTiers(
    rankedCurated(models),
    pick === 'quality' ? QUALITY_TIER_ORDER : VALUE_TIER_ORDER,
  );
  return best
    ? { models: [best.name], label: best.name }
    : { models: null, label: null };
}

/**
 * The material alone, labelled line by line. It is what a style's template
 * wraps, so it carries no instruction and no markers of its own.
 */
export function buildDraftMaterial(input: PromptDraftInput): string {
  const lines: string[] = [];
  const prompt = input.prompt?.trim();
  const caption = input.caption?.trim();
  const tags = input.tags?.trim();
  const note = input.note?.trim();
  const styleWords = input.styleWords?.trim();
  if (prompt) lines.push(`Prompt: ${prompt}`);
  if (caption) lines.push(`Description: ${caption}`);
  if (tags) lines.push(`Tags: ${tags}`);
  if (note) lines.push(`Notes from the user: ${note}`);
  if (styleWords) {
    lines.push(
      `Rendering style applied separately (do not repeat these words): ${styleWords}`,
    );
  }
  return lines.join('\n');
}

/**
 * What a verdict is asked for in. Three lines is the shape a small instruct
 * build holds to; anything looser comes back as a paragraph of praise.
 */
const JUDGE_INSTRUCTION =
  'You compare an image prompt with a description of the finished picture. In three short lines say what matches, what is missing, and one change to the prompt that would help. No preamble.';

/**
 * Where the instruction starts and where the answer begins. Most of the text
 * workers on the horde run koboldcpp, which swaps these for whatever start and
 * end sequences the loaded build was trained on, and falls back to Alpaca's
 * markers for a build it does not recognise. Writing Alpaca's markers outright
 * gets the fallback and never the build's own.
 */
const INPUT_PLACEHOLDER = '{{[INPUT]}}';
const OUTPUT_PLACEHOLDER = '{{[OUTPUT]}}';

/** An instruction and its material, marked up for the worker to template. */
function asInstruction(instruction: string, material: string): string {
  return `${INPUT_PLACEHOLDER}\n${instruction}\n\n${material}\n${OUTPUT_PLACEHOLDER}\n`;
}

/**
 * The request as an instruction the common instruct tunes follow. A plain text
 * prompt is what the endpoint takes; no chat template is applied on the way,
 * so the markers carry the shape.
 *
 * Where a rendering style is already applied to the picture, the instruction
 * asks for the subject and the scene alone: the style's own words are added
 * after the prompt is written, and a prompt that repeats them fights them.
 */
export function buildDraftPrompt(input: PromptDraftInput): string {
  const styled = !!input.styleWords?.trim();
  const role = draftRole(input);
  if (role === 'judge') {
    return asInstruction(JUDGE_INSTRUCTION, buildDraftMaterial(input));
  }
  const instruction =
    role === 'improve'
      ? styled
        ? 'You improve prompts for an AI image generator. Rewrite the prompt below as one stronger prompt, then write a negative prompt for it. Answer in exactly two labelled lines:\nPrompt: a single line of comma-separated phrases, concrete and visual, keeping every subject and detail the writer asked for. Write the subject and the scene only: a rendering style is applied separately, so add no style, medium or quality words.\nNegative: a short, comma-separated line naming what should be kept out of the picture. No style words, since a style is applied separately.\nNo quotes, no explanation.'
        : 'You improve prompts for an AI image generator. Rewrite the prompt below as one stronger prompt, then write a negative prompt for it. Answer in exactly two labelled lines:\nPrompt: a single line of comma-separated phrases, concrete and visual, keeping every subject and detail the writer asked for, adding setting, style, lighting and quality words only where they are missing.\nNegative: a short, comma-separated line naming what should be kept out of the picture.\nNo quotes, no explanation.'
      : styled
        ? 'You write prompts for an AI image generator. Turn the description below into one prompt: a single line of comma-separated phrases, concrete and visual, the subject first, then the setting. Write the subject and the scene only: a rendering style is applied separately, so add no style, medium or quality words. Write nothing but the prompt. No quotes, no explanation.'
        : 'You write prompts for an AI image generator. Turn the description below into one prompt: a single line of comma-separated phrases, concrete and visual, the subject first, then the setting, the style, the lighting and quality words. Write nothing but the prompt. No quotes, no explanation.';
  return asInstruction(instruction, buildDraftMaterial(input));
}

/** A line with the quotes and bullet a model sometimes puts round it taken off. */
function tidyLine(value: string): string {
  const unquoted = (text: string): string =>
    text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  return unquoted(unquoted(value).replace(/^[-*•]\s*/, '')).replace(
    /\s+/g,
    ' ',
  );
}

/** Whether tidying a line took anything off it beyond repeated blanks. */
function wasWrapped(value: string): boolean {
  return tidyLine(value) !== value.replace(/\s+/g, ' ').trim();
}

/**
 * What cleaning did to an answer between the model writing it and the reader
 * seeing it. Every one of these is reversible: the take keeps the text as it
 * arrived, so a reader who disagrees can put it back.
 */
export type PromptDraftChange =
  | 'think_removed'
  | 'quotes_stripped'
  | 'label_stripped'
  | 'negative_reshaped'
  | 'trimmed_to_sentence'
  | 'instruction_echo';

/** The order changes are reported in, whatever order they were found in. */
const CHANGE_ORDER: readonly PromptDraftChange[] = [
  'think_removed',
  'label_stripped',
  'quotes_stripped',
  'negative_reshaped',
  'trimmed_to_sentence',
  'instruction_echo',
];

/** An answer as it is used, and what was done to it on the way. */
export interface CleanedDraft {
  text: string;
  /** Empty where the model wrote no negative line. */
  negative: string;
  changes: PromptDraftChange[];
}

/**
 * The answer with any reasoning the model showed taken out. Small builds tuned
 * for thinking write it whether or not the instruction leaves room, and an
 * allowance spent on it can run out before the block closes, so a tail that
 * opens and never closes counts as reasoning to the end.
 */
export function stripThinkBlocks(text: string): string {
  return text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, ' ')
    .replace(/<think(?:ing)?>[\s\S]*$/i, ' ')
    .trim();
}

/**
 * The text cut back to the last sentence it finished. A model stopped at its
 * allowance leaves a fragment, and a half-written clause is worse than none.
 *
 * Only prose is cut. A line with no sentence break in it is left whole: a list
 * of comma-separated phrases ends on a word because it is finished, not
 * because it was cut off.
 */
export function trimToSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '' || /[.!?]["'“”‘’]?$/.test(trimmed)) return trimmed;
  const ends = [...trimmed.matchAll(/[.!?]["'“”‘’]?(?=\s)/g)];
  const last = ends.at(-1);
  if (!last || last.index === undefined) return trimmed;
  return trimmed.slice(0, last.index + last[0].length).trim();
}

/** Whether a negative line was written as sentences rather than as a list. */
function isProseNegative(value: string): boolean {
  return /[.!?]/.test(value) || /^(no|avoid|without|don'?t)\s/i.test(value);
}

/**
 * A negative line written as prose turned into the list an image generator
 * reads. A model asked for "a short, comma-separated line" often answers "No
 * blood, gore or violence. No nudity." instead, where the words are right and
 * only the shape is wrong.
 */
function reshapeNegative(value: string): string {
  const words = value
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .map((sentence) =>
      sentence.replace(/^(no|avoid|without|don'?t(?:\s+include)?|not)\s+/i, ''),
    )
    .flatMap((sentence) => sentence.split(/\s*,\s*|\s+(?:or|and)\s+/i))
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  return [...new Set(words)].join(', ');
}

/**
 * An answer that repeats the instruction back instead of following it. The
 * words are the instruction's own opening, which no prompt for a picture would
 * begin with.
 */
const INSTRUCTION_ECHO =
  /^(you (write|improve) prompts?\b|you compare an image prompt\b|turn the description below\b|answer in exactly two labelled lines\b|rewrite the prompt below\b)/i;

/**
 * A model's answer split into the prompt and the negative line, with what was
 * done to it on the way.
 *
 * The labels are asked for, and read where they turn up, at the start of a
 * line only: a prompt may well describe a sign reading `Prompt: free beer`. A
 * model that ignores the labels still answers with a prompt, so the first line
 * that says anything is taken as one and the negative is left empty rather
 * than the whole reply being thrown away.
 */
export function cleanDraft(text: string): CleanedDraft {
  const changes = new Set<PromptDraftChange>();
  const thought = stripThinkBlocks(text);
  if (thought !== text.trim()) changes.add('think_removed');
  const lines = thought
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  let prompt: string | null = null;
  let negative = '';
  const labelled = /^(prompt|image prompt|positive)\s*:\s*/i;
  const negativeLabel = /^(negative|negative prompt)\s*:\s*/i;
  for (const line of lines) {
    const clean = tidyLine(line);
    if (negative === '' && negativeLabel.test(clean)) {
      if (wasWrapped(line)) changes.add('quotes_stripped');
      changes.add('label_stripped');
      negative = tidyLine(clean.replace(negativeLabel, ''));
      continue;
    }
    if (prompt === null && labelled.test(clean)) {
      if (wasWrapped(line)) changes.add('quotes_stripped');
      changes.add('label_stripped');
      prompt = tidyLine(clean.replace(labelled, ''));
    }
  }
  if (prompt === null) {
    const first = lines.find((line) => !negativeLabel.test(tidyLine(line)));
    if (first !== undefined && wasWrapped(first)) {
      changes.add('quotes_stripped');
    }
    prompt = first === undefined ? '' : tidyLine(first);
  }
  if (negative !== '' && isProseNegative(negative)) {
    const listed = reshapeNegative(negative);
    if (listed !== '' && listed !== negative) {
      negative = listed;
      changes.add('negative_reshaped');
    }
  }
  const trimmed = trimToSentence(prompt);
  if (trimmed !== prompt && trimmed !== '') {
    prompt = trimmed;
    changes.add('trimmed_to_sentence');
  }
  if (INSTRUCTION_ECHO.test(prompt)) changes.add('instruction_echo');
  return {
    text: prompt,
    negative,
    changes: CHANGE_ORDER.filter((change) => changes.has(change)),
  };
}

/** A verdict is kept as the model wrote it; only the blank edges go. */
export function cleanJudgement(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/**
 * What the workers carrying a model will take, as the largest figure any one
 * of them advertises. A request above every eligible worker's ceiling is one
 * no worker can pick up, and it waits until the horde expires it.
 */
export interface TextWorkerLimits {
  maxLength: number;
  maxContextLength: number;
}

/** The ceilings a style sets on the two sizes, where it sets any. */
export interface TextSizeCeilings {
  maxLength?: number;
  maxContextLength?: number;
}

/** The two sizes a request goes out with, and what they were worked out from. */
export interface TextRequestSizing {
  /** How much answer is paid for. */
  maxLength: number;
  /** How much room the request asks for, the material and the answer together. */
  maxContextLength: number;
  /** The estimate of what the material costs to read. */
  promptTokens: number;
  /** The answer the job wants, before any ceiling is applied. */
  askedLength: number;
  /** What brought the answer allowance down, where anything did. */
  limitedBy: 'workers' | 'style' | null;
}

/**
 * How many characters a token is worth. Tokenisers differ by build and by
 * language; between three and four is the usual range for English prose, and
 * the low end of it is the safe end for an allowance.
 */
const CHARS_PER_TOKEN = 3.5;

/** How much the estimate is padded, since paying for a truncated prompt is waste. */
const TOKEN_MARGIN = 1.2;

/** What a piece of text costs to read, as near as a client can tell. */
export function estimateTokens(text: string): number {
  return Math.ceil((text.length / CHARS_PER_TOKEN) * TOKEN_MARGIN);
}

/** The sizes workers are used to being asked for, smallest first. */
const LARGEST_CONTEXT = 4096;
const CONTEXT_STEPS: readonly number[] = [512, 1024, 2048, LARGEST_CONTEXT];

/** What a written prompt is worth asking for, in tokens. */
const WRITE_MIN_LENGTH = 48;
const WRITE_MAX_LENGTH = 160;
/** What an improved prompt adds to the one it was given. */
const IMPROVE_HEADROOM = 64;
const IMPROVE_MIN_LENGTH = 64;
const IMPROVE_MAX_LENGTH = 256;
/** A verdict is three short lines whatever it is about. */
const JUDGE_LENGTH = 200;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** The answer allowance the job wants, before any ceiling is applied. */
function askedLength(role: PromptDraftRole, input: PromptDraftInput): number {
  if (role === 'judge') return JUDGE_LENGTH;
  if (role === 'improve') {
    return clamp(
      estimateTokens(input.prompt ?? '') + IMPROVE_HEADROOM,
      IMPROVE_MIN_LENGTH,
      IMPROVE_MAX_LENGTH,
    );
  }
  // A longer reading has more in it to turn into a prompt, so the allowance
  // follows the material rather than sitting at one figure for every picture.
  return clamp(
    estimateTokens(buildDraftMaterial(input)),
    WRITE_MIN_LENGTH,
    WRITE_MAX_LENGTH,
  );
}

/**
 * The two sizes a request goes out with.
 *
 * Room nothing uses is still paid for, and room the answer needed and did not
 * get is paid for twice, so the allowance follows what was asked for: a line
 * of phrases for a written prompt, a little more than the prompt it was given
 * for an improved one, three short lines for a verdict. The room asked for is
 * the smallest standard size that holds the material and the answer together.
 *
 * Both are held to what the model's workers advertise, since a request above
 * every eligible worker's ceiling waits until it expires, and to a style's own
 * ceilings where it sets them.
 */
export function sizeRequest(
  role: PromptDraftRole,
  input: PromptDraftInput,
  limits?: TextWorkerLimits | null,
  ceilings?: TextSizeCeilings | null,
): TextRequestSizing {
  const promptTokens = estimateTokens(buildDraftPrompt(input));
  const asked = askedLength(role, input);
  const lengthCaps = {
    workers: limits?.maxLength ?? Infinity,
    style: ceilings?.maxLength ?? Infinity,
  };
  const maxLength = Math.max(
    1,
    Math.min(asked, lengthCaps.workers, lengthCaps.style),
  );
  const wanted = promptTokens + maxLength;
  const contextCap = Math.min(
    limits?.maxContextLength ?? Infinity,
    ceilings?.maxContextLength ?? Infinity,
  );
  const step = CONTEXT_STEPS.find((size) => size >= wanted) ?? LARGEST_CONTEXT;
  const maxContextLength = Math.min(step, contextCap);
  return {
    maxLength,
    maxContextLength,
    promptTokens,
    askedLength: asked,
    limitedBy:
      maxLength >= asked
        ? null
        : lengthCaps.style < lengthCaps.workers
          ? 'style'
          : 'workers',
  };
}

/**
 * Where an answer is cut short. The placeholders are swapped out by workers
 * that understand them, and left standing by workers that do not, so a model
 * carrying on into the next instruction is stopped either way. A written
 * prompt is one line and ends at the blank line after it; the other two jobs
 * answer in several lines and cannot be held to that.
 */
function stopSequencesFor(role: PromptDraftRole): string[] {
  const shared = [INPUT_PLACEHOLDER, '### Instruction:'];
  return role === 'write' ? ['\n\n', ...shared] : shared;
}

/** The horde pages styles twenty-five at a time. */
const STYLE_PAGE_SIZE = 25;

/**
 * How far the style listing is walked. The class is small by design, so a
 * handful of pages is more than it will ever fill; the cap is there so a tag
 * filter the server ignores cannot turn into an unbounded crawl.
 */
const STYLE_PAGE_LIMIT = 4;

/**
 * Prompts written by the horde's text models. One client for every surface
 * that wants words drafted: the alchemy card first, the studio's own prompt
 * help after it.
 */
@Injectable({ providedIn: 'root' })
export class PromptDraftService {
  private readonly aiHorde = inject(AiHordeService);
  private readonly auth = inject(AuthService);
  private readonly styles = inject(StyleService);
  private readonly queue = inject(TextGenerationQueueService);

  /** Fetched once a session: the class changes on the horde, not in a visit. */
  private stylesPromise: Promise<ImagePromptStyle[]> | null = null;

  /** The text models online now, for the auto pick and the override list. */
  public async textModels(): Promise<ActiveModel[]> {
    try {
      const models = await firstValueFrom(this.aiHorde.getTextModels());
      return [...models].sort((a, b) => b.count - a.count);
    } catch {
      return [];
    }
  }

  /** The text workers online now, for what a model's workers will take. */
  public async textWorkers(): Promise<TextWorker[]> {
    try {
      return await firstValueFrom(this.aiHorde.getTextWorkers());
    } catch {
      // Without the listing the sizes follow the material alone, which is what
      // they did before any worker advertised a ceiling.
      return [];
    }
  }

  /**
   * The largest job any online worker carrying this model will take. It is the
   * largest rather than the smallest on purpose: one worker able to do the work
   * is enough for the request to be picked up, and holding every request to the
   * smallest ceiling on the list would cut answers short for no one's benefit.
   *
   * Null where no worker carrying the model says what it will take.
   */
  public async workerLimitsFor(
    model: string | null,
  ): Promise<TextWorkerLimits | null> {
    if (!model) return null;
    const carrying = (await this.textWorkers()).filter(
      (worker) => worker.online && (worker.models ?? []).includes(model),
    );
    const largest = (
      pick: (worker: TextWorker) => number | undefined,
    ): number | null => {
      const figures = carrying
        .map(pick)
        .filter((figure): figure is number => !!figure && figure > 0);
      return figures.length > 0 ? Math.max(...figures) : null;
    };
    const maxLength = largest((worker) => worker.max_length);
    const maxContextLength = largest((worker) => worker.max_context_length);
    if (maxLength === null || maxContextLength === null) return null;
    return { maxLength, maxContextLength };
  }

  /**
   * The published text styles that write image prompts, by the tag convention
   * in `scripts/prompt-styles/README.md`. An empty list is the ordinary answer:
   * the cards fall back to their own instruction, which is what they did before
   * any style existed.
   */
  public imagePromptStyles(): Promise<ImagePromptStyle[]> {
    this.stylesPromise ??= this.fetchImagePromptStyles();
    return this.stylesPromise;
  }

  private async fetchImagePromptStyles(): Promise<ImagePromptStyle[]> {
    const found: ImagePromptStyle[] = [];
    try {
      for (let page = 1; page <= STYLE_PAGE_LIMIT; page += 1) {
        const styles = await firstValueFrom(
          this.styles.getTextStyles({ tag: IMAGE_PROMPT_TAG, page }),
        );
        // The tag is asked for, and checked again here: a server that ignores
        // the filter would otherwise hand every text style to the chip row.
        for (const style of styles) {
          const read = asImagePromptStyle(style);
          if (read) found.push(read);
        }
        if (styles.length < STYLE_PAGE_SIZE) break;
      }
    } catch {
      // A catalogue that will not load leaves the built-in instruction, which
      // is a whole answer rather than a degraded one.
      return [];
    }
    return found;
  }

  /**
   * The shape with the workers this visit has already had silence from added
   * to it. Every body the service builds goes through this, so the price the
   * reader is quoted and the body they are shown are the ones that go.
   */
  private avoiding(shape: PromptDraftShape): PromptDraftShape {
    const avoided = [
      ...new Set([
        ...(shape.avoidWorkers ?? []),
        ...this.queue.avoidedWorkers(),
      ]),
    ];
    return avoided.length > 0 ? { ...shape, avoidWorkers: avoided } : shape;
  }

  /**
   * The model list a request goes out with, and the name to show for it. A
   * style names its own models and the horde routes on them, so the pick is
   * narrowed to the ones the style allows and reports a label only.
   */
  private chooseModels(
    models: readonly ActiveModel[],
    pick: PromptDraftModelPick,
    style: ImagePromptStyle | null,
  ): { models: string[] | null; label: string | null } {
    if (!style) return pickTextModel(models, pick);
    if (pick !== 'auto' && pick !== 'quality') {
      return pickTextModel(models, pick);
    }
    if (style.models.length === 0) return { models: null, label: null };
    const allowed = new Set(style.models);
    const pool = models.filter(
      (model) => model.count > 0 && allowed.has(model.name),
    );
    const picked = pickTextModel(pool, pick);
    if (picked.models) return picked;
    const first = pool.at(0);
    return first
      ? { models: pool.map((model) => model.name), label: first.name }
      : { models: null, label: null };
  }

  /**
   * The request body a draft goes out with, priced or queued. With a style the
   * body carries the material and the style's reference and nothing else: the
   * horde supplies the template, the sampling parameters and the models, and a
   * client-side copy of any of them would only contradict it. The one exception
   * is how many answers to write, which no style declares.
   */
  public buildRequest(
    input: PromptDraftInput,
    chosen: { models: string[] | null },
    shape: PromptDraftShape = {},
  ): TextGenerationRequest {
    const takes = Math.max(1, Math.trunc(shape.takes ?? 1));
    const style = shape.style ?? null;
    const avoided = shape.avoidWorkers ?? [];
    const routing =
      avoided.length > 0
        ? { workers: [...avoided], worker_blacklist: true }
        : {};
    if (style) {
      return {
        prompt: buildDraftMaterial(input),
        style: style.id,
        ...(takes > 1 ? { params: { n: takes } } : {}),
        ...routing,
        slow_workers: true,
      };
    }
    const role = draftRole(input);
    const sizing = this.sizing(input, shape);
    return {
      prompt: buildDraftPrompt(input),
      params: {
        ...(takes > 1 ? { n: takes } : {}),
        max_length: sizing.maxLength,
        max_context_length: sizing.maxContextLength,
        temperature: 0.7,
        top_p: 0.92,
        min_p: 0.05,
        rep_pen: 1.1,
        stop_sequence: stopSequencesFor(role),
      },
      ...(chosen.models ? { models: chosen.models } : {}),
      ...routing,
      slow_workers: true,
    };
  }

  /**
   * The sizes a request would go out with, and the figures behind them, so a
   * card can show what is being paid for and offer to change it.
   */
  public sizing(
    input: PromptDraftInput,
    shape: PromptDraftShape = {},
  ): TextRequestSizing {
    const worked = sizeRequest(
      draftRole(input),
      input,
      shape.limits ?? null,
      shape.ceilings ?? null,
    );
    // A figure the reader set is the figure sent, ceilings and all: they can
    // see what the workers advertise and are entitled to disagree with it.
    return {
      ...worked,
      ...(shape.maxLength !== undefined ? { maxLength: shape.maxLength } : {}),
      ...(shape.maxContextLength !== undefined
        ? { maxContextLength: shape.maxContextLength }
        : {}),
    };
  }

  /**
   * The body a press would send, for the reader who wants to see it. It is the
   * same builder the dry run and the draft use, so what is shown is what goes.
   */
  public previewRequest(
    input: PromptDraftInput,
    pick: PromptDraftModelPick,
    models: readonly ActiveModel[],
    shape: PromptDraftShape = {},
  ): TextGenerationRequest {
    return this.buildRequest(
      input,
      this.chooseModels(models, pick, shape.style ?? null),
      this.avoiding(shape),
    );
  }

  /**
   * Whose account pays. Logged out there is only the shared key, so the
   * anonymous choice is the only one available and asking for it changes
   * nothing.
   */
  private apiKeyFor(anonymous: boolean): string {
    if (anonymous) return ANONYMOUS_API_KEY;
    return this.auth.getStoredApiKey() ?? ANONYMOUS_API_KEY;
  }

  /**
   * What the draft would cost, asked before the reader commits to it. Null
   * when the horde would not take the request at all, which is a hint worth
   * nothing rather than a failure worth reporting.
   */
  public async estimate(
    input: PromptDraftInput,
    pick: PromptDraftModelPick,
    models: readonly ActiveModel[] | undefined,
    anonymous: boolean,
    shape: PromptDraftShape = {},
  ): Promise<number | null> {
    const pool = models ?? (await this.textModels());
    const chosen = this.chooseModels(pool, pick, shape.style ?? null);
    return firstValueFrom(
      this.aiHorde.dryRunTextGeneration(
        this.apiKeyFor(anonymous),
        this.buildRequest(input, chosen, this.avoiding(shape)),
      ),
    );
  }

  /**
   * Send a draft request through the saved queue. The answer is not waited
   * for: the queue follows the request until the horde finishes, cancels or
   * expires it, lands its takes in the drafts store, and the card that asked
   * reads its progress from there.
   */
  public async submit(
    input: PromptDraftInput,
    pick: PromptDraftModelPick,
    models: readonly ActiveModel[] | undefined,
    options: PromptDraftSubmitOptions,
    shape: PromptDraftShape = {},
  ): Promise<TextSubmitResult> {
    const pool = models ?? (await this.textModels());
    const style = shape.style ?? null;
    const chosen = this.chooseModels(pool, pick, style);
    const request = this.buildRequest(input, chosen, this.avoiding(shape));
    return this.queue.submit(
      {
        context: options.context,
        origin: options.origin,
        input,
        pick,
        styleId: style?.id ?? null,
        takes: Math.max(1, Math.trunc(shape.takes ?? 1)),
        anonymous: options.anonymous,
        modelLabel: chosen.label,
        apiKey: this.apiKeyFor(options.anonymous),
        request,
        quotedKudos: options.quotedKudos ?? null,
      },
      { replace: options.replace ?? false },
    );
  }

  /**
   * Ask for an answer and wait for it, for a caller that has nowhere to show
   * progress. The request still goes through the queue, so it is kept, checked
   * and landed like any other; it is filed apart from every card, and a second
   * call replaces one that is still waiting.
   */
  public async draft(
    input: PromptDraftInput,
    pick: PromptDraftModelPick,
    models?: readonly ActiveModel[],
    options: PromptDraftOptions = { anonymous: false, origin: 'alchemy' },
    shape: PromptDraftShape = {},
  ): Promise<PromptDraftOutcome> {
    const sent = await this.submit(
      input,
      pick,
      models,
      { ...options, context: AWAITED_CONTEXT, replace: true },
      shape,
    );
    if (sent.kind === 'busy') return { kind: 'faulted' };
    // The caller is waiting on this answer, so it is checked at the pace of
    // an open card.
    const release = this.queue.watch(AWAITED_CONTEXT);
    try {
      return outcomeOf(await this.queue.settled(sent.localId));
    } finally {
      release();
    }
  }
}
