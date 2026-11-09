import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PromptReviewService } from '../../services/prompt-review.service';
import type { TiInjectTarget } from '../../types/civitai-asset';
import { findPromptWords } from '../../types/ti-prompt';

/**
 * Shown under a prompt field while a trigger word is reviewed there, so the
 * reader can step through its uses and go back to the LoRA list without
 * scrolling to find it.
 */
@Component({
  selector: 'app-prompt-review-bar',
  imports: [TranslocoPipe],
  templateUrl: './prompt-review-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromptReviewBarComponent {
  public readonly reviews = inject(PromptReviewService, { optional: true });
  /** Which prompt field this bar sits under. */
  public readonly target = input.required<TiInjectTarget>();
  /** The text of that field. */
  public readonly text = input.required<string>();

  public count(word: string): number {
    return findPromptWords(this.text(), word).length;
  }
}
