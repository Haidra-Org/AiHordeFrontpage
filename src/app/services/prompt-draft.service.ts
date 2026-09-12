import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AiHordeService } from './ai-horde.service';
import { AuthService } from './auth.service';
import { StyleService } from './style.service';
import {
  PromptDraftDbService,
  StoredPromptDraft,
} from './prompt-draft-db.service';
import { ActiveModel } from '../types/active-model';
import { randomUuid } from '../helper/random-uuid';
import {
  GENERATION_NOT_FOUND,
  HordeApiError,
  TextGenerationRequest,
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

export type PromptDraftOutcome =
  | {
      kind: 'done';
      /** Every take the request came back with, in the order the horde sent them. */
      texts: string[];
      model: string;
      kudos: number;
      seed: number | null;
      /** The history records written for this draft, one per take. */
      ids: string[];
    }
  | { kind: 'refused'; error: HordeApiError }
  | { kind: 'faulted' }
  | { kind: 'timeout' };

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
  if (!last) return null;
  const value = Number.parseFloat(last[1]);
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
 * The request as an instruction the common instruct tunes follow. Alpaca's
 * markers are the ones the widest range of horde models were trained to see,
 * and a plain text prompt is what the endpoint takes; no chat template is
 * applied on the way.
 *
 * Where a rendering style is already applied to the picture, the instruction
 * asks for the subject and the scene alone: the style's own words are added
 * after the prompt is written, and a prompt that repeats them fights them.
 */
export function buildDraftPrompt(input: PromptDraftInput): string {
  const prompt = input.prompt?.trim();
  const styled = !!input.styleWords?.trim();
  const instruction = prompt
    ? styled
      ? 'You improve prompts for an AI image generator. Rewrite the prompt below as one stronger prompt: a single line of comma-separated phrases, concrete and visual, keeping every subject and detail the writer asked for. Write the subject and the scene only: a rendering style is applied separately, so add no style, medium or quality words. Write nothing but the prompt. No quotes, no explanation.'
      : 'You improve prompts for an AI image generator. Rewrite the prompt below as one stronger prompt: a single line of comma-separated phrases, concrete and visual, keeping every subject and detail the writer asked for, adding setting, style, lighting and quality words only where they are missing. Write nothing but the prompt. No quotes, no explanation.'
    : styled
      ? 'You write prompts for an AI image generator. Turn the description below into one prompt: a single line of comma-separated phrases, concrete and visual, the subject first, then the setting. Write the subject and the scene only: a rendering style is applied separately, so add no style, medium or quality words. Write nothing but the prompt. No quotes, no explanation.'
      : 'You write prompts for an AI image generator. Turn the description below into one prompt: a single line of comma-separated phrases, concrete and visual, the subject first, then the setting, the style, the lighting and quality words. Write nothing but the prompt. No quotes, no explanation.';
  return `### Instruction:\n${instruction}\n\n${buildDraftMaterial(input)}\n\n### Response:\n`;
}

/**
 * A model's answer as a prompt: the first line that says anything, stripped
 * of the label or quotes a model sometimes puts round it.
 */
export function cleanDraft(text: string): string {
  const firstLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';
  const unquoted = (value: string): string =>
    value.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  return unquoted(
    unquoted(firstLine).replace(/^(prompt|image prompt)\s*:\s*/i, ''),
  ).replace(/\s+/g, ' ');
}

/** How often the answer is asked for, and for how long. */
const POLL_INTERVAL_MS = 2_500;
const POLL_LIMIT = 48;

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
  private readonly history = inject(PromptDraftDbService);

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
    return pool.length > 0
      ? { models: pool.map((model) => model.name), label: pool[0].name }
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
    if (style) {
      return {
        prompt: buildDraftMaterial(input),
        style: style.id,
        ...(takes > 1 ? { params: { n: takes } } : {}),
        slow_workers: true,
      };
    }
    return {
      prompt: buildDraftPrompt(input),
      params: {
        ...(takes > 1 ? { n: takes } : {}),
        // The material is a caption, some tags and a note, and one line comes
        // back. Asking for room nothing uses is paid for all the same.
        max_context_length: 1024,
        max_length: 96,
        temperature: 0.7,
        top_p: 0.92,
        min_p: 0.05,
        rep_pen: 1.1,
        singleline: true,
        stop_sequence: ['\n\n', '###'],
      },
      ...(chosen.models ? { models: chosen.models } : {}),
      slow_workers: true,
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
      shape,
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
        this.buildRequest(input, chosen, shape),
      ),
    );
  }

  /**
   * Ask for a prompt and wait for it. The request queues like any other on
   * the horde, behind whatever the account's priority buys it, so this can
   * take a minute; the caller shows that rather than hiding it.
   */
  public async draft(
    input: PromptDraftInput,
    pick: PromptDraftModelPick,
    models?: readonly ActiveModel[],
    options: PromptDraftOptions = { anonymous: false, origin: 'alchemy' },
    shape: PromptDraftShape = {},
  ): Promise<PromptDraftOutcome> {
    const pool = models ?? (await this.textModels());
    const chosen = this.chooseModels(pool, pick, shape.style ?? null);
    const request = this.buildRequest(input, chosen, shape);
    const submitted = await firstValueFrom(
      this.aiHorde.submitTextGeneration(
        this.apiKeyFor(options.anonymous),
        request,
      ),
    );
    if (submitted.kind === 'error') {
      return { kind: 'refused', error: submitted.error };
    }
    for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const status = await firstValueFrom(
        this.aiHorde.getTextGenerationStatus(submitted.response.id),
      );
      if (status === GENERATION_NOT_FOUND) return { kind: 'faulted' };
      if (!status) continue;
      if (status.faulted) return { kind: 'faulted' };
      if (status.done) {
        const takes = status.generations
          .map((generation) => ({
            generation,
            text: cleanDraft(generation.text),
          }))
          .filter((take) => take.text.length > 0);
        if (takes.length === 0) return { kind: 'faulted' };
        const style = shape.style ?? null;
        const records: StoredPromptDraft[] = takes.map((take, index) => ({
          id: randomUuid(),
          createdAt: Date.now(),
          origin: options.origin,
          input,
          pick,
          model: take.generation.model ?? chosen.label ?? '',
          seed: take.generation.seed ?? null,
          kudos: status.kudos,
          anonymous: options.anonymous,
          text: take.text,
          requestId: submitted.response.id,
          takeIndex: index,
          ...(style ? { style: style.id } : {}),
        }));
        for (const record of records) {
          try {
            await this.history.put(record);
          } catch {
            // The history is a convenience beside the draft. A store that will
            // not take the record must not cost the reader the words they
            // waited for.
          }
        }
        return {
          kind: 'done',
          texts: records.map((record) => record.text),
          model: records[0].model,
          kudos: records[0].kudos,
          seed: records[0].seed,
          ids: records.map((record) => record.id),
        };
      }
    }
    return { kind: 'timeout' };
  }
}
