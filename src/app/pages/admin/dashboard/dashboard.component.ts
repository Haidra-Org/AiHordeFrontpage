import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Params, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatorService } from '../../../services/translator.service';
import { AuthService } from '../../../services/auth.service';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { IconComponent } from '../../../components/icon/icon.component';
import { ModerationCountComponent } from '../../../components/admin/moderation-count/moderation-count.component';
import { setPageTitle } from '../../../helper/page-title';
import { ListCount } from '../../../types/moderation';
import { ReviewTab } from '../review/review-query';
import { SUBJECT_KINDS } from '../review/review-subjects';

interface QueueTile {
  labelKey: string;
  noteKey: string;
  count: ListCount;
  queryParams: Params;
}

interface ToolLink {
  path: string;
  labelKey: string;
  descriptionKey: string;
  iconName: string;
}

const TOOLS: readonly ToolLink[] = [
  {
    path: '/admin/users',
    labelKey: 'admin.dashboard.view_users',
    descriptionKey: 'admin.dashboard.view_users_description',
    iconName: 'users-simple',
  },
  {
    path: '/admin/workers',
    labelKey: 'admin.dashboard.view_workers',
    descriptionKey: 'admin.dashboard.view_workers_description',
    iconName: 'cpu-chip',
  },
  {
    path: '/admin/filters',
    labelKey: 'admin.dashboard.view_filters',
    descriptionKey: 'admin.dashboard.view_filters_description',
    iconName: 'filter-simple',
  },
  {
    path: '/admin/operations',
    labelKey: 'admin.dashboard.view_operations',
    descriptionKey: 'admin.dashboard.view_operations_description',
    iconName: 'lock-closed',
  },
];

function tabParams(tab: ReviewTab, extra: Params = {}): Params {
  return { tab, ...extra };
}

@Component({
  selector: 'app-admin-dashboard',
  imports: [TranslocoPipe, RouterLink, IconComponent, ModerationCountComponent],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly auth = inject(AuthService);
  public readonly counts = inject(ModerationCountsService);

  public readonly tools = TOOLS;

  /** One tile per queue whose endpoint has answered. */
  public readonly queues = computed<readonly QueueTile[]>(() => {
    const tiles: QueueTile[] = [];
    const subjects = this.counts.subjects();
    if (subjects) {
      for (const kind of SUBJECT_KINDS) {
        const count = subjects[kind];
        if (!count) continue;
        tiles.push({
          labelKey: `admin.dashboard.queue.over.${kind}`,
          noteKey: 'admin.dashboard.queue.over_note',
          count,
          queryParams: tabParams('reports', kind === 'account' ? {} : { kind }),
        });
      }
    }
    const escalated = this.counts.escalated();
    if (escalated) {
      tiles.push({
        labelKey: 'admin.dashboard.queue.escalated',
        noteKey: 'admin.dashboard.queue.escalated_note',
        count: escalated,
        queryParams: tabParams('reports', { view: 'escalated' }),
      });
    }
    const eligible = this.counts.eligible();
    if (eligible) {
      tiles.push({
        labelKey: 'admin.dashboard.queue.eligible',
        noteKey: 'admin.dashboard.queue.eligible_note',
        count: eligible,
        queryParams: tabParams('promotions'),
      });
    }
    const blocked = this.counts.blocked();
    if (blocked) {
      tiles.push({
        labelKey: 'admin.dashboard.queue.blocked',
        noteKey: 'admin.dashboard.queue.blocked_note',
        count: blocked,
        queryParams: tabParams('promotions'),
      });
    }
    const paused = this.counts.paused();
    if (paused) {
      tiles.push({
        labelKey: 'admin.dashboard.queue.paused',
        noteKey: 'admin.dashboard.queue.paused_note',
        count: paused,
        queryParams: tabParams('paused'),
      });
    }
    return tiles;
  });

  ngOnInit(): void {
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'admin.dashboard.title',
    );
    this.counts.refreshIfStale();
  }
}
