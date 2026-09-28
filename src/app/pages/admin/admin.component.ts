import {
  Component,
  DestroyRef,
  ChangeDetectionStrategy,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { AuthService } from '../../services/auth.service';
import { HordeStatusService } from '../../services/horde-status.service';
import { ModerationCountsService } from '../../services/moderation-counts.service';
import { IconComponent } from '../../components/icon/icon.component';
import { ModerationCountComponent } from '../../components/admin/moderation-count/moderation-count.component';
import { StickyHeaderDirective } from '../../helper/sticky-header.directive';
import { HordeStatusModes } from '../../types/horde-status';
import { setPageTitle } from '../../helper/page-title';

export interface AdminTab {
  /** Path under /admin; empty for the dashboard. */
  slug: string;
  labelKey: string;
  iconName: string;
  /** Match exactly, since every tab's path starts with the dashboard's. */
  exact: boolean;
}

const TAB_DASHBOARD: AdminTab = {
  slug: '',
  labelKey: 'admin.nav.dashboard',
  iconName: 'home',
  exact: true,
};
const TAB_REVIEW: AdminTab = {
  slug: 'review',
  labelKey: 'admin.nav.review',
  iconName: 'shield-check',
  exact: false,
};
const TAB_WORKERS: AdminTab = {
  slug: 'workers',
  labelKey: 'admin.nav.workers',
  iconName: 'cpu-chip',
  exact: false,
};
const TAB_USERS: AdminTab = {
  slug: 'users',
  labelKey: 'admin.nav.users',
  iconName: 'users-simple',
  exact: false,
};
const TAB_FILTERS: AdminTab = {
  slug: 'filters',
  labelKey: 'admin.nav.filters',
  iconName: 'filter-simple',
  exact: false,
};
const TAB_OPERATIONS: AdminTab = {
  slug: 'operations',
  labelKey: 'admin.nav.operations',
  iconName: 'lock-closed',
  exact: false,
};

/** One horde-wide mode the status line reports. */
interface StatusMode {
  labelKey: string;
  active: boolean;
}

@Component({
  selector: 'app-admin',
  imports: [
    TranslocoPipe,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    IconComponent,
    ModerationCountComponent,
    StickyHeaderDirective,
  ],
  templateUrl: './admin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hordeStatus = inject(HordeStatusService);
  public readonly auth = inject(AuthService);
  public readonly counts = inject(ModerationCountsService);

  public readonly statusModes = signal<HordeStatusModes | null>(null);

  public readonly reviewSlug = TAB_REVIEW.slug;

  /**
   * The tabs this account can open. Review shows only once one of its queues
   * has answered, so a horde without the moderation endpoints offers no tab
   * that opens onto nothing.
   */
  public readonly tabs = computed<readonly AdminTab[]>(() => {
    if (!this.auth.currentUser()?.moderator) {
      return [TAB_DASHBOARD, TAB_WORKERS];
    }
    return [
      TAB_DASHBOARD,
      ...(this.counts.anyAvailable() ? [TAB_REVIEW] : []),
      TAB_WORKERS,
      TAB_USERS,
      TAB_FILTERS,
      TAB_OPERATIONS,
    ];
  });

  public readonly modes = computed<readonly StatusMode[]>(() => {
    const status = this.statusModes();
    if (!status) return [];
    return [
      {
        labelKey: 'admin.status.maintenance_mode',
        active: status.maintenance_mode,
      },
      {
        labelKey: 'admin.status.invite_only',
        active: status.invite_only_mode,
      },
      ...(status.raid_mode !== undefined
        ? [{ labelKey: 'admin.status.raid_mode', active: status.raid_mode }]
        : []),
    ];
  });

  ngOnInit(): void {
    setPageTitle(this.translator, this.title, this.destroyRef, 'admin.title');

    this.footerColor.setDarkMode(true);

    this.hordeStatus
      .getStatusModes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((modes) => {
        this.statusModes.set(modes);
      });
  }
}
