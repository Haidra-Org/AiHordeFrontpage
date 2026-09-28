import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ModerationDetailWorker,
  ModerationCappedList,
  ModerationDetailModel,
  ModerationRelatedAccount,
  ModerationRelatedIP,
  ModerationRelatedProxiedAccount,
} from '../../../types/moderation';
import { caseParams, workerParams } from './review-subjects';

/**
 * Each connected list shows this many at first; the horde sends up to 50,
 * and the rest open on request so one long list does not bury the reports.
 */
export const PIVOT_LIMIT = 8;

/**
 * What a set of reports names, ranked by count, each entry a link: accounts,
 * proxied accounts and addresses open as their own subject in the review,
 * workers and models open their pages. A list the page has none of is left
 * out.
 */
@Component({
  selector: 'app-review-pivots',
  imports: [TranslocoPipe, RouterLink],
  templateUrl: './review-pivots.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPivotsComponent {
  public readonly accounts =
    input<ModerationCappedList<ModerationRelatedAccount> | null>(null);
  public readonly proxiedAccounts =
    input<ModerationCappedList<ModerationRelatedProxiedAccount> | null>(null);
  public readonly ips = input<ModerationCappedList<ModerationRelatedIP> | null>(
    null,
  );
  public readonly workers =
    input<ModerationCappedList<ModerationDetailWorker> | null>(null);
  public readonly models =
    input<ModerationCappedList<ModerationDetailModel> | null>(null);

  public readonly pivotLimit = PIVOT_LIMIT;
  public readonly caseParams = caseParams;
  public readonly workerParams = workerParams;

  /** The lists opened past their first few. */
  private readonly open = signal<ReadonlySet<string>>(new Set());

  public pivotsOpen(key: string): boolean {
    return this.open().has(key);
  }

  public togglePivots(key: string): void {
    this.open.update((open) => {
      const next = new Set(open);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }
}
