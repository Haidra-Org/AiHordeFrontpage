import { Injectable, signal } from '@angular/core';
import type { TiInjectTarget } from '../types/civitai-asset';
import { findPromptWords, type PromptRange } from '../types/ti-prompt';

export interface PromptReview {
  word: string;
  target: TiInjectTarget;
  /** The match last selected in the prompt, or -1 before any is shown. */
  shown: number;
}

/**
 * Steps through the uses of one trigger word in a prompt field. The LoRA list
 * starts a review from its removal warning, and the form that owns the prompt
 * field selects each match and shows a bar under the field. Provided by that
 * form, so the list and the bar share one review.
 */
@Injectable()
export class PromptReviewService {
  public readonly review = signal<PromptReview | null>(null);
  private reveal: ((range: PromptRange) => void) | null = null;
  private returnTo: (() => void) | null = null;

  /** Called by the form that owns the prompt field. */
  public connect(reveal: (range: PromptRange) => void): void {
    this.reveal = reveal;
  }

  /** Whether a form can select text in its prompt field. */
  public get connected(): boolean {
    return this.reveal !== null;
  }

  /**
   * Starts reviewing `word`, or keeps the current review when it is the same
   * word. `returnTo` brings the place that started the review back into view.
   */
  public start(
    word: string,
    target: TiInjectTarget,
    returnTo: () => void,
  ): void {
    this.returnTo = returnTo;
    const current = this.review();
    if (current?.word === word && current.target === target) return;
    this.review.set({ word, target, shown: -1 });
  }

  /** Selects the next match in `text`, wrapping after the last one. */
  public showNext(text: string): void {
    const review = this.review();
    if (!review) return;
    const ranges = findPromptWords(text, review.word);
    if (ranges.length === 0) return;
    const shown = (review.shown + 1) % ranges.length;
    const range = ranges[shown];
    if (!range) return;
    this.review.set({ ...review, shown });
    this.reveal?.({ target: review.target, ...range });
  }

  /** The 1-based number of the match that {@link showNext} selects. */
  public nextNumber(count: number): number {
    const shown = this.review()?.shown ?? -1;
    return count > 0 ? ((shown + 1) % count) + 1 : 0;
  }

  public back(): void {
    this.returnTo?.();
  }

  public end(): void {
    this.review.set(null);
    this.returnTo = null;
  }
}
