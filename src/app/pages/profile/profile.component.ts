import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { combineLatest, from, map, mergeMap } from 'rxjs';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
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
import { KudosBreakdownPanelComponent } from '../../components/kudos-breakdown-panel/kudos-breakdown-panel.component';
import { UnitTooltipComponent } from '../../components/unit-tooltip/unit-tooltip.component';
import { UnitConversionService } from '../../services/unit-conversion.service';
import { DeleteAccountDialogComponent } from '../../components/delete-account-dialog/delete-account-dialog.component';
import { AdminDialogComponent } from '../../components/admin/admin-dialog/admin-dialog.component';

type WorkerListItem = {
  id: string;
  loading: boolean;
  worker: HordeWorker | null;
};

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
    KudosBreakdownPanelComponent,
    UnitTooltipComponent,
    DeleteAccountDialogComponent,
    AdminDialogComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workerService = inject(AdminWorkerService);
  private readonly teamService = inject(TeamService);
  private readonly router = inject(Router);
  public readonly auth = inject(AuthService);
  public readonly units = inject(UnitConversionService);
  private readonly workerRequestConcurrency = 3;

  public loginError = signal<boolean>(false);

  // Tab state
  public activeTab = signal<
    'profile' | 'records' | 'workers' | 'teams' | 'styles' | 'shared-keys'
  >('profile');

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

  // Computed username with discriminator for delete confirmation
  public readonly usernameWithDiscriminator = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return '';
    return user.username;
  });

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

  // Records expanded state
  public recordsExpanded = signal<boolean>(false);

  // Computed units for Usage Records
  public readonly usageMegapixelsteps = computed(() => {
    const user = this.auth.currentUser();
    if (!user?.records?.usage?.megapixelsteps) return null;
    // API gives megapixelsteps, convert to raw pixelsteps for the service
    const rawPixelsteps = user.records.usage.megapixelsteps * 1e6;
    return this.units.formatTotalPixelsteps(rawPixelsteps);
  });

  public readonly usageTokens = computed(() => {
    const user = this.auth.currentUser();
    if (!user?.records?.usage?.tokens) return null;
    return this.units.formatTotalTokens(user.records.usage.tokens);
  });

  // Computed units for Contribution Records
  public readonly contributionMegapixelsteps = computed(() => {
    const user = this.auth.currentUser();
    if (!user?.records?.contribution?.megapixelsteps) return null;
    // API gives megapixelsteps, convert to raw pixelsteps for the service
    const rawPixelsteps = user.records.contribution.megapixelsteps * 1e6;
    return this.units.formatTotalPixelsteps(rawPixelsteps);
  });

  public readonly contributionTokens = computed(() => {
    const user = this.auth.currentUser();
    if (!user?.records?.contribution?.tokens) return null;
    return this.units.formatTotalTokens(user.records.contribution.tokens);
  });

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

    // Reset error when typing
    this.form.controls.apiKey.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loginError.set(false);
      });
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

  public toggleRecordsSection(): void {
    this.recordsExpanded.set(!this.recordsExpanded());
  }

  public setActiveTab(
    tab: 'profile' | 'records' | 'workers' | 'teams' | 'styles' | 'shared-keys',
  ): void {
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

  private loadUserWorkers(): void {
    const user = this.auth.currentUser();
    const workerIds = user?.worker_ids ?? [];
    if (workerIds.length === 0) return;

    this.loadingWorkers.set(true);
    this.userWorkers.set(
      workerIds.map((id) => ({
        id,
        loading: true,
        worker: null,
      })),
    );

    from(workerIds)
      .pipe(
        mergeMap(
          (id) =>
            this.workerService
              .getWorker(id)
              .pipe(map((worker) => ({ id, worker }))),
          this.workerRequestConcurrency,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ id, worker }) => {
          this.userWorkers.update((items) =>
            items.map((item) =>
              item.id === id ? { ...item, worker, loading: false } : item,
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
