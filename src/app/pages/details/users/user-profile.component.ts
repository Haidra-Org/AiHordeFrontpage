import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap, of } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { ScrollFadeComponent } from '../../../helper/scroll-fade.component';
import { StickyHeaderDirective } from '../../../helper/sticky-header.directive';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../../components/breadcrumb/breadcrumb.component';
import { UserBadgesComponent } from '../../../components/user-badges/user-badges.component';
import { UserKudosCardComponent } from '../../../components/user-kudos-card/user-kudos-card.component';
import { UserStatsSummaryComponent } from '../../../components/user-stats-summary/user-stats-summary.component';
import { UserRecordsPanelComponent } from '../../../components/user-records-panel/user-records-panel.component';
import { TranslatorService } from '../../../services/translator.service';
import { AiHordeService } from '../../../services/ai-horde.service';
import { HordeUser } from '../../../types/horde-user';
import { setPageTitle } from '../../../helper/page-title';
import { extractUserAlias } from '../../../helper/user-parser';
import { IconComponent } from '../../../components/icon/icon.component';

@Component({
  selector: 'app-user-profile',
  imports: [
    TranslocoPipe,
    BreadcrumbComponent,
    RouterLink,
    UserBadgesComponent,
    UserKudosCardComponent,
    UserStatsSummaryComponent,
    UserRecordsPanelComponent,
    ScrollFadeComponent,
    StickyHeaderDirective,
    IconComponent,
  ],
  templateUrl: './user-profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserProfileComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly aiHordeService = inject(AiHordeService);

  private readonly params = toSignal(this.route.params, {
    initialValue: {} as Record<string, string>,
  });

  public readonly user = signal<HordeUser | null>(null);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);

  // Tab state for switching between profile sections
  public activeTab = signal<'profile' | 'records'>('profile');

  public readonly userId = computed(() => {
    const idStr = this.params()['userId'] as string | undefined;
    const id = parseInt(idStr ?? '', 10);
    return isNaN(id) ? null : id;
  });

  public readonly userAlias = computed(() => {
    const u = this.user();
    return u ? extractUserAlias(u.username) : '';
  });

  public readonly userInitial = computed(() => {
    const alias = this.userAlias();
    return alias ? alias.charAt(0).toUpperCase() : '?';
  });

  public readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    const items: BreadcrumbItem[] = [
      { label: 'details.title', route: '/details' },
      { label: 'details.tabs.users', route: '/details/users' },
    ];
    const u = this.user();
    if (u) {
      items.push({ label: this.userAlias(), raw: true });
    }
    return items;
  });

  ngOnInit(): void {
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'details.users.profile_title',
    );

    // Load user when route changes
    this.route.params
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((params) => {
          const id = parseInt(params['userId'] as string, 10);
          if (isNaN(id)) {
            this.error.set('details.users.invalid_id');
            this.loading.set(false);
            return of(null);
          }
          this.loading.set(true);
          this.error.set(null);
          return this.aiHordeService.getUserById(id);
        }),
      )
      .subscribe((user) => {
        this.user.set(user);
        this.loading.set(false);
        if (!user) {
          this.error.set('details.users.not_found');
        }
      });
  }

  public setActiveTab(tab: 'profile' | 'records'): void {
    this.activeTab.set(tab);
  }

  public formatAccountAge(seconds: number | undefined): string {
    if (!seconds) return '';
    const days = Math.floor(seconds / 86400);
    if (days > 365) {
      const years = Math.floor(days / 365);
      const remainingDays = days % 365;
      return `${years} year${years !== 1 ? 's' : ''}, ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
    }
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
}
