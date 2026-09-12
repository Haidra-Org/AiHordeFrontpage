import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AiHordeService } from './ai-horde.service';
import { AuthService } from './auth.service';
import { ActiveModel } from '../types/active-model';
import {
  GENERATION_NOT_FOUND,
  HordeApiError,
  TextGenerationRequest,
} from '../types/generation';

const ANONYMOUS_API_KEY = '0000000000';

/**
 * Which text model answers a draft: the best of the curated list that has
 * workers, any model at all, or one named outright.
 */
export type PromptDraftModelPick = 'auto' | 'any' | { model: string };

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
}

export type PromptDraftOutcome =
  | { kind: 'done'; text: string; model: string; kudos: number }
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
    { pattern: /gemma-4-31b.*-it/i, rank: 0 },
    { pattern: /gemma-4.*-it/i, rank: 1 },
    { pattern: /llama-3(\.\d)?-(8|70)b-instruct/i, rank: 2 },
    { pattern: /cydonia/i, rank: 3 },
    { pattern: /behemoth/i, rank: 4 },
    { pattern: /qwen3(\.5)?-(4|7|8|14|32)b/i, rank: 5 },
    { pattern: /llama-3\.2-3b-instruct/i, rank: 6 },
    { pattern: /qwen.*-(0\.6|0\.8|1\.7)b|llama-3\.2-1b-instruct/i, rank: 7 },
  ];

/** Where a model falls on the curated list, or null when it is not on it. */
export function curatedRank(name: string): number | null {
  const entry = CURATED_TEXT_MODELS.find((candidate) =>
    candidate.pattern.test(name),
  );
  return entry ? entry.rank : null;
}

/**
 * The model list a request goes out with, and the name to show for it. Auto
 * takes the highest-ranked curated model with workers, ties broken by how
 * many; with none online it asks for any model rather than nothing.
 */
export function pickTextModel(
  models: readonly ActiveModel[],
  pick: PromptDraftModelPick,
): { models: string[] | null; label: string | null } {
  if (pick === 'any') return { models: null, label: null };
  if (pick !== 'auto') return { models: [pick.model], label: pick.model };
  const ranked = models
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
  const best = ranked[0]?.model;
  return best
    ? { models: [best.name], label: best.name }
    : { models: null, label: null };
}

/**
 * The request as an instruction the common instruct tunes follow. Alpaca's
 * markers are the ones the widest range of horde models were trained to see,
 * and a plain text prompt is what the endpoint takes; no chat template is
 * applied on the way.
 */
export function buildDraftPrompt(input: PromptDraftInput): string {
  const prompt = input.prompt?.trim();
  const lines = [
    prompt
      ? 'You improve prompts for an AI image generator. Rewrite the prompt below as one stronger prompt: a single line of comma-separated phrases, concrete and visual, keeping every subject and detail the writer asked for, adding setting, style, lighting and quality words only where they are missing. Write nothing but the prompt. No quotes, no explanation.'
      : 'You write prompts for an AI image generator. Turn the description below into one prompt: a single line of comma-separated phrases, concrete and visual, the subject first, then the setting, the style, the lighting and quality words. Write nothing but the prompt. No quotes, no explanation.',
    '',
  ];
  const caption = input.caption?.trim();
  const tags = input.tags?.trim();
  const note = input.note?.trim();
  if (prompt) lines.push(`Prompt: ${prompt}`);
  if (caption) lines.push(`Description: ${caption}`);
  if (tags) lines.push(`Tags: ${tags}`);
  if (note) lines.push(`Notes from the user: ${note}`);
  return `### Instruction:\n${lines.join('\n')}\n\n### Response:\n`;
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

/**
 * Prompts written by the horde's text models. One client for every surface
 * that wants words drafted: the alchemy card first, the studio's own prompt
 * help after it.
 */
@Injectable({ providedIn: 'root' })
export class PromptDraftService {
  private readonly aiHorde = inject(AiHordeService);
  private readonly auth = inject(AuthService);

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
   * Ask for a prompt and wait for it. The request queues like any other on
   * the horde, behind whatever the account's priority buys it, so this can
   * take a minute; the caller shows that rather than hiding it.
   */
  public async draft(
    input: PromptDraftInput,
    pick: PromptDraftModelPick,
    models?: readonly ActiveModel[],
  ): Promise<PromptDraftOutcome> {
    const chosen = pickTextModel(models ?? (await this.textModels()), pick);
    const request: TextGenerationRequest = {
      prompt: buildDraftPrompt(input),
      params: {
        max_context_length: 2048,
        max_length: 120,
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
    const apiKey = this.auth.getStoredApiKey() ?? ANONYMOUS_API_KEY;
    const submitted = await firstValueFrom(
      this.aiHorde.submitTextGeneration(apiKey, request),
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
        const generation = status.generations[0];
        const text = generation ? cleanDraft(generation.text) : '';
        if (!text) return { kind: 'faulted' };
        return {
          kind: 'done',
          text,
          model: generation?.model ?? chosen.label ?? '',
          kudos: status.kudos,
        };
      }
    }
    return { kind: 'timeout' };
  }
}
