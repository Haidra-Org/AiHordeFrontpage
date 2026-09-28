import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { TranslatorService } from '../../../services/translator.service';
import {
  ModerationCountsService,
  sumCounts,
} from '../../../services/moderation-counts.service';
import { ModerationCountComponent } from '../../../components/admin/moderation-count/moderation-count.component';
import { setPageTitle } from '../../../helper/page-title';
import { ListCount } from '../../../types/moderation';
import { ReviewTab, parseReviewQuery } from './review-query';
import { ReviewPromotionsComponent } from './review-promotions.component';
import { ReviewPausedWorkersComponent } from './review-paused-workers.component';

interface ReviewTabView {
  id: ReviewTab;
  labelKey: string;
  count: ListCount | null;
}

/**
 * The moderator review queues. The tab lives in the address, so a link can
 * open the page on one queue.
 */
@Component({
  selector: 'app-admin-review',
  imports: [
    TranslocoPipe,
    RouterLink,
    ModerationCountComponent,
    ReviewPromotionsComponent,
    ReviewPausedWorkersComponent,
  ],
  templateUrl: './review.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  public readonly counts = inject(ModerationCountsService);

  private readonly query = toSignal(
    this.route.queryParamMap.pipe(map(parseReviewQuery)),
    { initialValue: parseReviewQuery(this.route.snapshot.queryParamMap) },
  );

  /** Only the queues whose endpoint has answered. */
  public readonly tabs = computed<readonly ReviewTabView[]>(() => {
    const tabs: ReviewTabView[] = [];
    if (this.counts.overviewAvailable()) {
      const eligible = this.counts.eligible();
      const blocked = this.counts.blocked();
      tabs.push(
        {
          id: 'promotions',
          labelKey: 'admin.review.tabs.promotions',
          count:
            eligible && blocked
              ? sumCounts([eligible, blocked])
              : (eligible ?? blocked),
        },
        {
          id: 'paused',
          labelKey: 'admin.review.tabs.paused',
          count: this.counts.paused(),
        },
      );
    }
    return tabs;
  });

  /**
   * The tab the address names once it can be shown, else the first one that
   * can. Null while nothing can be shown yet.
   */
  public readonly activeTab = computed<ReviewTab | null>(() => {
    const tabs = this.tabs();
    const wanted = this.query().tab;
    if (wanted && tabs.some((tab) => tab.id === wanted)) return wanted;
    // A named tab whose queue is still being asked for is waited on rather
    // than swapped for another one that happens to answer first.
    if (wanted && this.counts.loading()) return null;
    return tabs.at(0)?.id ?? null;
  });

  ngOnInit(): void {
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'admin.review.title',
    );
    this.counts.refreshIfStale();
  }
}
