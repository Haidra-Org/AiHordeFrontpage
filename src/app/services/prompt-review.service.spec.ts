import { describe, expect, it, vi } from 'vitest';
import { PromptReviewService } from './prompt-review.service';

describe('PromptReviewService', () => {
  it('selects each match in turn and wraps after the last one', () => {
    const reviews = new PromptReviewService();
    const reveal = vi.fn();
    reviews.connect(reveal);
    reviews.start('detailed', 'prompt', () => undefined);
    const text = 'detailed, a detailed cat';
    expect(reviews.nextNumber(2)).toBe(1);
    reviews.showNext(text);
    expect(reviews.nextNumber(2)).toBe(2);
    reviews.showNext(text);
    reviews.showNext(text);
    expect(reveal.mock.calls.map(([range]) => range.start)).toEqual([0, 12, 0]);
  });

  it('keeps the position when the same word is started again', () => {
    const reviews = new PromptReviewService();
    reviews.connect(() => undefined);
    reviews.start('detailed', 'prompt', () => undefined);
    reviews.showNext('detailed, detailed');
    reviews.start('detailed', 'prompt', () => undefined);
    expect(reviews.review()?.shown).toBe(0);
  });

  it('returns to the place that started the review, then ends', () => {
    const reviews = new PromptReviewService();
    const back = vi.fn();
    reviews.start('detailed', 'prompt', back);
    reviews.back();
    expect(back).toHaveBeenCalledOnce();
    reviews.end();
    expect(reviews.review()).toBeNull();
  });
});
