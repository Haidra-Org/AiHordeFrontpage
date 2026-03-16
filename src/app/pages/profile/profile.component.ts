import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  effect,
  inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { catchError, combineLatest, from, map, mergeMap, of } from 'rxjs';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { ScrollFadeDirective } from '../../helper/scroll-fade.directive';
import { StickyHeaderDirective } from '../../helper/sticky-header.directive';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { ToggleCheckboxComponent } from '../../components/toggle-checkbox/toggle-checkbox.component';
import { AuthService } from '../../services/auth.service';
import { AdminWorkerService } from '../../services/admin-worker.service';
import { TeamService } from '../../services/team.service';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';
import { WorkerCardComponent } from '../admin/workers/worker-card.component';
import { HordeWorker, WorkerType } from '../../types/horde-worker';
import { Team, CreateTeamRequest, UpdateTeamRequest } from '../../types/team';
import { SharedKeyListComponent } from '../../components/shared-key/shared-key-list/shared-key-list.component';
import { ProfileStylesListComponent } from '../../components/profile-styles-list/profile-styles-list.component';

import { DeleteAccountDialogComponent } from '../../components/delete-account-dialog/delete-account-dialog.component';
import { AdminDialogComponent } from '../../components/admin/admin-dialog/admin-dialog.component';
import { PageIntroComponent } from '../../components/page-intro/page-intro.component';

import { GenerationsTabComponent } from '../../components/generations-tab/generations-tab.component';
import { PageGuideService } from '../../services/page-guide.service';
import { InfoTooltipComponent } from '../../components/info-tooltip/info-tooltip.component';
import { GlossaryService } from '../../services/glossary.service';
import { UserBadgesComponent } from '../../components/user-badges/user-badges.component';
import { UserStatsSummaryComponent } from '../../components/user-stats-summary/user-stats-summary.component';
import { UserKudosCardComponent } from '../../components/user-kudos-card/user-kudos-card.component';
import { UserRecordsPanelComponent } from '../../components/user-records-panel/user-records-panel.component';
import {
  JsonInspectorComponent,
  JsonInspectorSection,
} from '../../components/json-inspector/json-inspector.component';
import { JsonInspectorTriggerComponent } from '../../components/json-inspector-trigger/json-inspector-trigger.component';
import { IconComponent } from '../../components/icon/icon.component';

type ProfileTab =
  | 'profile'
  | 'generations'
  | 'records'
  | 'workers'
  | 'teams'
  | 'styles'
  | 'shared-keys'
  | 'settings';

interface WorkerListItem {
  id: string;
  loading: boolean;
  failed: boolean;
  worker: HordeWorker | null;
}

const CONTACT_NAG_DISMISSED_STORAGE_KEY = 'profile_contact_nag_dismissed';

@Component({
  selector: 'app-profile',
  imports: [
    TranslocoPipe,
    TranslocoModule,
    ToggleCheckboxComponent,
    ReactiveFormsModule,
    FormatNumberPipe,
    RouterLink,
    WorkerCardComponent,
    SharedKeyListComponent,
    ProfileStylesListComponent,

    DeleteAccountDialogComponent,
    AdminDialogComponent,
    PageIntroComponent,
    InfoTooltipComponent,
    ScrollFadeDirective,
    StickyHeaderDirective,
    GenerationsTabComponent,
    UserBadgesComponent,
    UserStatsSummaryComponent,
    UserKudosCardComponent,
    UserRecordsPanelComponent,
    JsonInspectorComponent,
    JsonInspectorTriggerComponent,
    IconComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly workerService = inject(AdminWorkerService);
  private readonly teamService = inject(TeamService);
  private readonly router = inject(Router);
  public readonly auth = inject(AuthService);

  public readonly guideService = inject(PageGuideService);
  private readonly glossary = inject(GlossaryService);
  private readonly workerRequestConcurrency = 3;

  public loginError = signal<boolean>(false);
  public rawJsonOpen = signal(false);

  public rawJsonSections = computed<readonly JsonInspectorSection[]>(() => {
    const user = this.auth.currentUser();
    if (!user) {
      return [];
    }

    return [
      {
        id: 'user',
        label: 'User',
        value: user,
      },
      {
        id: 'kudos-details',
        label: 'Kudos Details',
        value: user.kudos_details ?? {},
      },
      {
        id: 'records',
        label: 'Records',
        value: user.records ?? {},
      },
      {
        id: 'active-generations',
        label: 'Active Generations',
        value: user.active_generations ?? {},
      },
    ];
  });

  constructor() {
    // When user data arrives after the route param already set the tab,
    // trigger data loading for tabs that need it.
    effect(() => {
      const user = this.auth.currentUser();
      const tab = this.activeTab();
      if (!user) return;

      if (tab === 'workers' && this.userWorkers().length === 0) {
        this.loadUserWorkers();
      }
      if (
        (tab === 'workers' || tab === 'teams') &&
        this.allTeams().length === 0
      ) {
        this.loadAllTeams();
      }
    });

    this.glossary.registerPageContext({
      pageId: 'profile',
      pageTitleKey: 'profile.title',
      relevantTermIds: [
        'api_key',
        'kudos',
        'request',
        'worker',
        'team',
        'trusted',
        'megapixelsteps',
        'tokens',
      ],
      entries: [
        {
          id: 'profile-api-key',
          titleKey: 'help.glossary.terms.api_key.title',
          descriptionKey: 'help.glossary.terms.api_key.body',
        },
        {
          id: 'profile-kudos',
          titleKey: 'help.glossary.terms.kudos.title',
          descriptionKey: 'help.glossary.terms.kudos.body',
        },
        {
          id: 'profile-public-workers',
          titleKey: 'profile.public_workers_label',
          descriptionKey: 'profile.public_workers_desc',
        },
        {
          id: 'profile-requests',
          titleKey: 'profile.records.requests',
          descriptionKey:
            'help.glossary.page.profile.requests_made.description',
        },
        {
          id: 'profile-fulfillments',
          titleKey: 'profile.records.fulfillments',
          descriptionKey:
            'help.glossary.page.profile.requests_fulfilled.description',
        },
        {
          id: 'profile-total-fulfillments',
          titleKey: 'profile.fulfillments_label',
          descriptionKey:
            'help.glossary.page.profile.total_fulfillments.description',
        },
        {
          id: 'profile-kudos-generated',
          titleKey: 'profile.contributions_label',
          descriptionKey:
            'help.glossary.page.profile.kudos_generated.description',
        },
        {
          id: 'profile-kudos-accumulated',
          titleKey: 'profile.kudos_accumulated',
          descriptionKey: 'help.glossary.page.profile.accumulated.description',
        },
        {
          id: 'profile-kudos-gifted',
          titleKey: 'profile.kudos_gifted',
          descriptionKey: 'help.glossary.page.profile.gifted.description',
        },
        {
          id: 'profile-kudos-received',
          titleKey: 'profile.kudos_received',
          descriptionKey: 'help.glossary.page.profile.received.description',
        },
        {
          id: 'profile-kudos-recurring',
          titleKey: 'profile.kudos_recurring',
          descriptionKey: 'help.glossary.page.profile.recurring.description',
        },
        {
          id: 'profile-kudos-donated',
          titleKey: 'profile.kudos_donated',
          descriptionKey: 'help.glossary.page.profile.donated.description',
        },
        {
          id: 'profile-mps',
          titleKey: 'help.glossary.terms.megapixelsteps.title',
          descriptionKey: 'help.glossary.terms.megapixelsteps.body',
        },
        {
          id: 'profile-tokens',
          titleKey: 'help.glossary.terms.tokens.title',
          descriptionKey: 'help.glossary.terms.tokens.body',
        },
      ],
    });

    this.destroyRef.onDestroy(() => {
      this.glossary.clearPageContext();
    });
  }

  // Tab state
  private static readonly TAB_SLUGS: Record<string, ProfileTab> = {
    overview: 'profile',
    generations: 'generations',
    records: 'records',
    workers: 'workers',
    teams: 'teams',
    styles: 'styles',
    'shared-keys': 'shared-keys',
    settings: 'settings',
  };

  public activeTab = signal<ProfileTab>('profile');

  // Workers state
  public userWorkers = signal<WorkerListItem[]>([]);
  public loadingWorkers = signal<boolean>(false);
  public workersExpanded = signal<boolean>(false);

  // Worker filters
  public filterText = signal<string>('');
  public filterWorkerType = signal<WorkerType | 'all'>('all');
  public filterMaintenance = signal<
    'all' | 'active' | 'maintenance' | 'offline'
  >('all');
  public deletionSuccessMessage = signal<boolean>(false);

  // Delete account state
  public deleteDialogOpen = signal<boolean>(false);
  public deleteLoading = signal<boolean>(false);
  public deleteError = signal<string | null>(null);
  public deleteSuccess = signal<string | null>(null);

  // Teams state
  public allTeams = signal<Team[]>([]);
  public loadingTeams = signal<boolean>(false);
  public teamDialogOpen = signal<boolean>(false);
  public teamDialogType = signal<'create' | 'edit' | 'delete'>('create');
  public editingTeam = signal<Team | null>(null);
  public teamFormName = signal<string>('');
  public teamFormInfo = signal<string>('');
  public teamSaving = signal<boolean>(false);
  public teamError = signal<string | null>(null);
  public teamSuccess = signal<boolean>(false);

  // Undelete account state
  public undeleteDialogOpen = signal<boolean>(false);
  public undeleteLoading = signal<boolean>(false);

  // Profile editing state
  public usernameDialogOpen = signal<boolean>(false);
  public usernameInput = signal<string>('');
  public usernameSaving = signal<boolean>(false);
  public contactDialogOpen = signal<boolean>(false);
  public contactInput = signal<string>('');
  public contactSaving = signal<boolean>(false);
  public contactDialogError = signal<string | null>(null);
  public publicWorkersDialogOpen = signal<boolean>(false);
  public publicWorkersNewValue = signal<boolean>(false);
  public publicWorkersSaving = signal<boolean>(false);
  public profileUpdateError = signal<string | null>(null);
  public profileUpdateSuccess = signal<string | null>(null);

  // Computed username with discriminator for delete confirmation
  public readonly usernameWithDiscriminator = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return '';
    return user.username;
  });

  // Active generation counts
  public readonly activeImageCount = computed(
    () => this.auth.currentUser()?.active_generations?.image?.length ?? 0,
  );
  public readonly activeTextCount = computed(
    () => this.auth.currentUser()?.active_generations?.text?.length ?? 0,
  );
  public readonly activeAlchemyCount = computed(
    () => this.auth.currentUser()?.active_generations?.alchemy?.length ?? 0,
  );
  public readonly hasActiveGenerations = computed(
    () =>
      this.activeImageCount() > 0 ||
      this.activeTextCount() > 0 ||
      this.activeAlchemyCount() > 0,
  );

  // Asset counts for quick-nav boxes
  public readonly workerCount = computed(
    () => this.auth.currentUser()?.worker_ids?.length ?? 0,
  );
  public readonly styleCount = computed(
    () => this.auth.currentUser()?.styles?.length ?? 0,
  );
  public readonly sharedKeyCount = computed(
    () => this.auth.currentUser()?.sharedkey_ids?.length ?? 0,
  );
  public readonly shouldSetContactNag = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return false;

    const hasWorkers = (user.worker_ids?.length ?? 0) > 0;
    const hasContact = (user.contact?.trim().length ?? 0) > 0;
    return hasWorkers && !hasContact;
  });
  public readonly contactNagDismissed = signal<boolean>(false);
  public readonly showContactNagNotifications = computed(
    () => this.shouldSetContactNag() && !this.contactNagDismissed(),
  );

  // Computed filtered workers
  public filteredAndSortedWorkers = computed(() => {
    let result = this.userWorkers().filter((item) => item.worker !== null);

    // Filter by worker type
    const typeFilter = this.filterWorkerType();
    if (typeFilter !== 'all') {
      result = result.filter((item) => item.worker!.type === typeFilter);
    }

    // Filter by maintenance/active status
    const maintenanceFilter = this.filterMaintenance();
    if (maintenanceFilter === 'active') {
      result = result.filter((item) => item.worker!.online);
    } else if (maintenanceFilter === 'maintenance') {
      result = result.filter((item) => item.worker!.maintenance_mode);
    } else if (maintenanceFilter === 'offline') {
      result = result.filter((item) => !item.worker!.online);
    }

    // Filter by name or team (partial matching)
    const searchText = this.filterText().toLowerCase();
    if (searchText) {
      result = result.filter(
        (item) =>
          item.worker!.name.toLowerCase().includes(searchText) ||
          (item.worker!.id ?? '').toLowerCase().includes(searchText) ||
          (item.worker!.team?.name ?? '').toLowerCase().includes(searchText),
      );
    }

    // Sort by active status first, then name
    return [...result].sort((a, b) => {
      const activeDiff =
        Number(this.isActiveWorker(b.worker)) -
        Number(this.isActiveWorker(a.worker));
      if (activeDiff !== 0) return activeDiff;

      const nameA = a.worker?.name ?? '';
      const nameB = b.worker?.name ?? '';
      return nameA.localeCompare(nameB);
    });
  });

  public unresolvedWorkers = computed(() =>
    this.userWorkers().filter((item) => item.loading || item.failed),
  );

  public readonly workerTypeGroups: readonly WorkerType[] = [
    'image',
    'text',
    'interrogation',
  ];
  public collapsedWorkerTypes = signal<Set<WorkerType>>(new Set());

  public groupedWorkers = computed(() => {
    const all = this.filteredAndSortedWorkers();
    const groups: { type: WorkerType; workers: WorkerListItem[] }[] = [];
    for (const type of this.workerTypeGroups) {
      const workers = all.filter((w) => w.worker?.type === type);
      if (workers.length > 0) {
        groups.push({ type, workers });
      }
    }
    return groups;
  });

  public isWorkerTypeCollapsed(type: WorkerType): boolean {
    return this.collapsedWorkerTypes().has(type);
  }

  public toggleWorkerTypeSection(type: WorkerType): void {
    this.collapsedWorkerTypes.update((set) => {
      const next = new Set(set);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  public form = new FormGroup({
    apiKey: new FormControl<string>('', [Validators.required]),
    remember: new FormControl<boolean>(false),
  });

  ngOnInit(): void {
    // Set title
    combineLatest([
      this.translator.get('profile.title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([profileTitle, appTitle]) => {
        this.title.setTitle(`${profileTitle} | ${appTitle}`);
      });

    this.footerColor.setDarkMode(true);
    this.contactNagDismissed.set(this.loadContactNagDismissed());

    // Sync active tab from route param
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const slug = params.get('tab') ?? 'overview';
        const tab = ProfileComponent.TAB_SLUGS[slug];
        if (tab) {
          this.setActiveTab(tab);
        } else {
          this.router.navigate(['/profile/overview'], { replaceUrl: true });
        }
      });

    // Reset error when typing
    this.form.controls.apiKey.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loginError.set(false);
      });
  }

  public dismissContactNagNotifications(): void {
    this.contactNagDismissed.set(true);
    this.storeContactNagDismissed(true);
  }

  private loadContactNagDismissed(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    try {
      return localStorage.getItem(CONTACT_NAG_DISMISSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private storeContactNagDismissed(value: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      if (value) {
        localStorage.setItem(CONTACT_NAG_DISMISSED_STORAGE_KEY, '1');
      } else {
        localStorage.removeItem(CONTACT_NAG_DISMISSED_STORAGE_KEY);
      }
    } catch {
      // localStorage may be unavailable; ignore persistence errors.
    }
  }

  public login(): void {
    if (!this.form.valid) {
      return;
    }

    this.loginError.set(false);

    this.auth
      .login(this.form.value.apiKey!, this.form.value.remember ?? false)
      .subscribe((user) => {
        if (!user) {
          this.loginError.set(true);
        } else {
          this.form.reset();
        }
      });
  }

  public logout(): void {
    this.auth.logout();
  }

  public formatAccountAge(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    if (days > 365) {
      const years = Math.floor(days / 365);
      const remainingDays = days % 365;
      return `${years} year${years !== 1 ? 's' : ''}, ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
    }
    return `${days} day${days !== 1 ? 's' : ''}`;
  }

  public toggleWorkersSection(): void {
    const expanded = !this.workersExpanded();
    this.workersExpanded.set(expanded);

    if (expanded && this.userWorkers().length === 0) {
      this.loadUserWorkers();
    }
  }

  public setActiveTab(tab: ProfileTab): void {
    this.activeTab.set(tab);

    // Load workers when switching to workers tab
    if (tab === 'workers' && this.userWorkers().length === 0) {
      this.loadUserWorkers();
    }

    // Load teams when switching to workers tab (for team assignment dropdown)
    // or when switching to teams tab
    if (
      (tab === 'workers' || tab === 'teams') &&
      this.allTeams().length === 0
    ) {
      this.loadAllTeams();
    }
  }

  public openRawJson(): void {
    this.rawJsonOpen.set(true);
  }

  public closeRawJson(): void {
    this.rawJsonOpen.set(false);
  }

  private loadUserWorkers(): void {
    const user = this.auth.currentUser();
    const workerIds = user?.worker_ids ?? [];
    if (workerIds.length === 0) return;

    this.loadingWorkers.set(true);
    this.userWorkers.set(
      workerIds.map((id) => ({
        id,
        loading: true,
        failed: false,
        worker: null,
      })),
    );

    from(workerIds)
      .pipe(
        mergeMap(
          (id) =>
            this.workerService.getWorker(id).pipe(
              map((worker) => ({ id, worker, failed: false })),
              catchError(() => of({ id, worker: null, failed: true })),
            ),
          this.workerRequestConcurrency,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ id, worker, failed }) => {
          this.userWorkers.update((items) =>
            items.map((item) =>
              item.id === id
                ? { ...item, worker, failed, loading: false }
                : item,
            ),
          );
        },
        error: () => {
          this.loadingWorkers.set(false);
          this.userWorkers.update((items) =>
            items.map((item) => ({ ...item, loading: false })),
          );
        },
        complete: () => {
          this.userWorkers.update((items) => this.sortWorkers(items));
          this.loadingWorkers.set(false);
        },
      });
  }

  public onWorkerUpdated(): void {
    this.loadUserWorkers();
  }

  public onWorkerDeleted(workerId: string): void {
    // Remove worker from the list immediately
    this.userWorkers.update((workers) =>
      workers.filter((w) => w.id !== workerId),
    );
    // Show success toast
    this.deletionSuccessMessage.set(true);
    setTimeout(() => this.deletionSuccessMessage.set(false), 5000);
  }

  public onFilterTextChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filterText.set(target.value);
  }

  public onFilterTypeChange(type: WorkerType | 'all'): void {
    this.filterWorkerType.set(type);
  }

  public onFilterMaintenanceChange(
    status: 'all' | 'active' | 'maintenance' | 'offline',
  ): void {
    this.filterMaintenance.set(status);
  }

  // Delete account methods
  public openDeleteDialog(): void {
    this.deleteError.set(null);
    this.deleteDialogOpen.set(true);
  }

  public closeDeleteDialog(): void {
    this.deleteDialogOpen.set(false);
  }

  public confirmDeleteAccount(): void {
    const user = this.auth.currentUser();
    if (!user) return;

    const wasAlreadyDeleted = user.deleted ?? false;
    this.deleteLoading.set(true);
    this.deleteError.set(null);

    this.auth
      .deleteUser()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.deleteLoading.set(false);

        if (result.success) {
          this.deleteDialogOpen.set(false);

          if (wasAlreadyDeleted) {
            // Permanent deletion - logout and redirect
            this.deleteSuccess.set('profile.delete_account_permanent_success');
            setTimeout(() => {
              this.auth.logout();
              this.router.navigate(['/']);
            }, 2000);
          } else {
            // First deletion - refresh user data to show deleted state
            this.deleteSuccess.set('profile.delete_account_success');
            this.auth.refreshUser().subscribe();
            setTimeout(() => this.deleteSuccess.set(null), 5000);
          }
        } else {
          this.deleteError.set(result.error.message);
          setTimeout(() => this.deleteError.set(null), 5000);
        }
      });
  }

  // Undelete account methods
  public openUndeleteDialog(): void {
    this.undeleteDialogOpen.set(true);
  }

  public closeUndeleteDialog(): void {
    this.undeleteDialogOpen.set(false);
  }

  public confirmUndeleteAccount(): void {
    this.undeleteLoading.set(true);

    this.auth
      .undeleteUser()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.undeleteLoading.set(false);
        this.undeleteDialogOpen.set(false);

        if (result.success) {
          this.deleteSuccess.set('profile.undelete_account_success');
          this.auth.refreshUser().subscribe();
          setTimeout(() => this.deleteSuccess.set(null), 5000);
        } else {
          this.deleteError.set(result.error ?? 'Failed to restore account');
          setTimeout(() => this.deleteError.set(null), 5000);
        }
      });
  }

  // ============================================================================
  // PROFILE EDITING METHODS
  // ============================================================================

  public openUsernameDialog(): void {
    const user = this.auth.currentUser();
    if (!user) return;
    // Strip the discriminator (#12345) to show just the display name
    const name = user.username.includes('#')
      ? user.username.substring(0, user.username.lastIndexOf('#'))
      : user.username;
    this.usernameInput.set(name);
    this.profileUpdateError.set(null);
    this.usernameDialogOpen.set(true);
  }

  public closeUsernameDialog(): void {
    this.usernameDialogOpen.set(false);
  }

  public onUsernameInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.usernameInput.set(target.value);
  }

  public confirmUsernameChange(): void {
    const name = this.usernameInput().trim();
    if (!name) return;

    this.usernameSaving.set(true);
    this.profileUpdateError.set(null);

    this.auth
      .updateProfile({ username: name })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.usernameSaving.set(false);
        if (result.success) {
          this.usernameDialogOpen.set(false);
          this.profileUpdateSuccess.set('profile.change_username_success');
          setTimeout(() => this.profileUpdateSuccess.set(null), 5000);
        } else {
          this.profileUpdateError.set(
            result.error ?? 'Failed to update username',
          );
        }
      });
  }

  public openContactDialog(): void {
    const user = this.auth.currentUser();
    this.contactInput.set(user?.contact ?? '');
    this.profileUpdateError.set(null);
    this.contactDialogError.set(null);
    this.contactDialogOpen.set(true);
  }

  public closeContactDialog(): void {
    this.contactDialogError.set(null);
    this.contactDialogOpen.set(false);
  }

  public onContactInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.contactInput.set(target.value);
    this.contactDialogError.set(null);
  }

  public confirmContactChange(): void {
    const contact = this.contactInput().trim();
    if (contact.length < 5 || contact.length > 500) {
      this.contactDialogError.set(
        'Contact must be between 5 and 500 characters.',
      );
      return;
    }

    const previousDismissedState = this.contactNagDismissed();

    if (contact.length > 0) {
      this.contactNagDismissed.set(true);
      this.storeContactNagDismissed(true);
    }

    this.contactSaving.set(true);
    this.profileUpdateError.set(null);
    this.contactDialogError.set(null);

    this.auth
      .updateProfile({ contact })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.contactSaving.set(false);
        if (result.success) {
          this.contactDialogOpen.set(false);
          this.profileUpdateSuccess.set('profile.edit_contact_success');
          setTimeout(() => this.profileUpdateSuccess.set(null), 5000);
        } else {
          this.contactNagDismissed.set(previousDismissedState);
          this.storeContactNagDismissed(previousDismissedState);
          this.contactDialogError.set(
            result.error ?? 'Failed to update contact',
          );
          this.profileUpdateError.set(
            result.error ?? 'Failed to update contact',
          );
        }
      });
  }

  public onPublicWorkersToggle(newValue: boolean): void {
    this.publicWorkersNewValue.set(newValue);
    this.publicWorkersDialogOpen.set(true);
  }

  public closePublicWorkersDialog(): void {
    this.publicWorkersDialogOpen.set(false);
  }

  public confirmPublicWorkersChange(): void {
    this.publicWorkersSaving.set(true);
    this.profileUpdateError.set(null);

    this.auth
      .updateProfile({ public_workers: this.publicWorkersNewValue() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.publicWorkersSaving.set(false);
        if (result.success) {
          this.publicWorkersDialogOpen.set(false);
          this.profileUpdateSuccess.set('profile.public_workers_success');
          setTimeout(() => this.profileUpdateSuccess.set(null), 5000);
        } else {
          this.profileUpdateError.set(
            result.error ?? 'Failed to update setting',
          );
        }
      });
  }

  private sortWorkers(workers: WorkerListItem[]): WorkerListItem[] {
    const hydratedWorkers = workers.map((item) =>
      item.loading ? { ...item, loading: false } : item,
    );

    return [...hydratedWorkers].sort((a, b) => {
      const activeDiff =
        Number(this.isActiveWorker(b.worker)) -
        Number(this.isActiveWorker(a.worker));
      if (activeDiff !== 0) return activeDiff;

      const nameA = a.worker?.name ?? '';
      const nameB = b.worker?.name ?? '';
      return nameA.localeCompare(nameB);
    });
  }

  private isActiveWorker(worker: HordeWorker | null): boolean {
    if (!worker) return false;
    return worker.online && !worker.paused && !worker.maintenance_mode;
  }

  // ============================================================================
  // TEAMS MANAGEMENT METHODS
  // ============================================================================

  /**
   * Load all teams from the API
   */
  private loadAllTeams(): void {
    this.loadingTeams.set(true);
    this.teamService
      .getTeams()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (teams) => {
          this.allTeams.set(teams);
          this.loadingTeams.set(false);
        },
        error: () => {
          this.loadingTeams.set(false);
        },
      });
  }

  /**
   * Refresh teams list (public method for manual refresh)
   */
  public refreshTeams(): void {
    this.loadAllTeams();
  }

  /**
   * Get teams created by the current user
   */
  public getUserCreatedTeams(): Team[] {
    const currentUser = this.auth.currentUser();
    if (!currentUser) return [];

    return this.allTeams().filter(
      (team) => team.creator === currentUser.username,
    );
  }

  /**
   * Get teams that the user's workers belong to (but not created by user)
   */
  public getUserWorkerTeams(): Team[] {
    const currentUser = this.auth.currentUser();
    if (!currentUser) return [];

    const workerTeamIds = new Set<string>();
    for (const workerItem of this.userWorkers()) {
      if (workerItem.worker?.team?.id) {
        workerTeamIds.add(workerItem.worker.team.id);
      }
    }

    const createdTeamIds = new Set(this.getUserCreatedTeams().map((t) => t.id));

    return this.allTeams().filter(
      (team) =>
        team.id && workerTeamIds.has(team.id) && !createdTeamIds.has(team.id),
    );
  }

  /**
   * Check if the current user can create teams (must be trusted)
   */
  public canCreateTeam(): boolean {
    return this.auth.currentUser()?.trusted === true;
  }

  /**
   * Check if the current user can edit a specific team
   */
  public canEditTeam(team: Team): boolean {
    const currentUser = this.auth.currentUser();
    if (!currentUser) return false;

    // Moderators can edit any team
    if (currentUser.moderator) return true;

    // Team creator can edit
    return team.creator === currentUser.username;
  }

  /**
   * Open the create team dialog
   */
  public openCreateTeamDialog(): void {
    if (!this.canCreateTeam()) return;

    this.teamDialogType.set('create');
    this.editingTeam.set(null);
    this.teamFormName.set('');
    this.teamFormInfo.set('');
    this.teamError.set(null);
    this.teamDialogOpen.set(true);
  }

  /**
   * Open the edit team dialog
   */
  public openEditTeamDialog(team: Team): void {
    if (!this.canEditTeam(team)) return;

    this.teamDialogType.set('edit');
    this.editingTeam.set(team);
    this.teamFormName.set(team.name ?? '');
    this.teamFormInfo.set(team.info ?? '');
    this.teamError.set(null);
    this.teamDialogOpen.set(true);
  }

  /**
   * Open the delete team dialog
   */
  public openDeleteTeamDialog(team: Team): void {
    if (!this.canEditTeam(team)) return;

    this.teamDialogType.set('delete');
    this.editingTeam.set(team);
    this.teamError.set(null);
    this.teamDialogOpen.set(true);
  }

  /**
   * Close the team dialog
   */
  public closeTeamDialog(): void {
    this.teamDialogOpen.set(false);
  }

  /**
   * Handle team form name change
   */
  public onTeamNameChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.teamFormName.set(target.value);
  }

  /**
   * Handle team form info change
   */
  public onTeamInfoChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.teamFormInfo.set(target.value);
  }

  /**
   * Check if the team form is valid
   */
  public isTeamFormValid(): boolean {
    const name = this.teamFormName().trim();
    return name.length >= 3 && name.length <= 100;
  }

  /**
   * Confirm create or edit team
   */
  public confirmTeamSave(): void {
    if (!this.isTeamFormValid()) return;

    this.teamSaving.set(true);
    this.teamError.set(null);

    const name = this.teamFormName().trim();
    const info = this.teamFormInfo().trim() || undefined;

    if (this.teamDialogType() === 'create') {
      const payload: CreateTeamRequest = { name, info };
      this.teamService
        .createTeam(payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.teamSaving.set(false);
            this.teamDialogOpen.set(false);
            this.teamSuccess.set(true);
            setTimeout(() => this.teamSuccess.set(false), 3000);
            this.loadAllTeams();
          },
          error: (err) => {
            this.teamSaving.set(false);
            this.teamError.set(err.message ?? 'Failed to create team');
          },
        });
    } else if (this.teamDialogType() === 'edit') {
      const teamId = this.editingTeam()?.id;
      if (!teamId) return;

      const payload: UpdateTeamRequest = { name, info };
      this.teamService
        .updateTeam(teamId, payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.teamSaving.set(false);
            this.teamDialogOpen.set(false);
            this.teamSuccess.set(true);
            setTimeout(() => this.teamSuccess.set(false), 3000);
            this.loadAllTeams();
          },
          error: (err) => {
            this.teamSaving.set(false);
            this.teamError.set(err.message ?? 'Failed to update team');
          },
        });
    }
  }

  /**
   * Confirm delete team
   */
  public confirmTeamDelete(): void {
    const teamId = this.editingTeam()?.id;
    if (!teamId) return;

    this.teamSaving.set(true);
    this.teamError.set(null);

    this.teamService
      .deleteTeam(teamId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.teamSaving.set(false);
          this.teamDialogOpen.set(false);
          this.teamSuccess.set(true);
          setTimeout(() => this.teamSuccess.set(false), 3000);
          this.loadAllTeams();
        },
        error: (err) => {
          this.teamSaving.set(false);
          this.teamError.set(err.message ?? 'Failed to delete team');
        },
      });
  }
}
