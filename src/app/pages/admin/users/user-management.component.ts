import {
  Component,
  DestroyRef,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { TranslatorService } from '../../../services/translator.service';
import { AuthService } from '../../../services/auth.service';
import { AdminUserService } from '../../../services/admin-user.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { AdminUserDetails } from '../../../types/horde-user-admin';
import { HordeWorker } from '../../../types/horde-worker';
import { FormatNumberPipe } from '../../../pipes/format-number.pipe';
import { WorkerCardComponent } from '../workers/worker-card.component';

type DialogType = 'resetSuspicion';

interface UserHistoryItem {
  id: number;
  username: string;
  timestamp: number;
}

const USER_HISTORY_KEY = 'admin_user_history';
const MAX_HISTORY_SIZE = 30;

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    TranslocoPipe,
    TranslocoModule,
    FormsModule,
    FormatNumberPipe,
    WorkerCardComponent,
  ],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.css',
})
export class UserManagementComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly userService = inject(AdminUserService);
  private readonly workerService = inject(AdminWorkerService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  public readonly auth = inject(AuthService);

  // Search state
  public searchQuery = signal<string>('');
  public loading = signal<boolean>(false);
  public selectedUser = signal<AdminUserDetails | null>(null);
  public userNotFound = signal<boolean>(false);

  // User workers
  public userWorkers = signal<HordeWorker[]>([]);
  public loadingWorkers = signal<boolean>(false);

  // Expanded sections
  public workersExpanded = signal<boolean>(false);
  public permissionsExpanded = signal<boolean>(true);
  public limitsExpanded = signal<boolean>(true);
  public contactExpanded = signal<boolean>(false);
  public kudosDetailsExpanded = signal<boolean>(false);
  public recordsExpanded = signal<boolean>(false);
  public activeGenerationsExpanded = signal<boolean>(false);
  public stylesExpanded = signal<boolean>(false);
  public sharedKeysExpanded = signal<boolean>(false);

  // Form state
  public trustedValue = signal<boolean>(false);
  public flaggedValue = signal<boolean>(false);
  public workerInvitesValue = signal<number>(0);
  public moderatorValue = signal<boolean>(false);
  public publicWorkersValue = signal<boolean>(false);
  public customizerValue = signal<boolean>(false);
  public serviceValue = signal<boolean>(false);
  public educationValue = signal<boolean>(false);
  public specialValue = signal<boolean>(false);
  public filteredValue = signal<boolean>(false);
  public vpnValue = signal<boolean>(false);
  public usageMultiplierValue = signal<number>(1);
  public concurrencyValue = signal<number>(0);
  public monthlyKudosValue = signal<number>(0);
  public contactValue = signal<string>('');
  public adminCommentValue = signal<string>('');
  public isRegeneratingPasskey = signal<boolean>(false);
  public isDirty = signal<boolean>(false);
  public isSaving = signal<boolean>(false);

  // Dialog state
  public dialogOpen = signal<boolean>(false);
  public dialogType = signal<DialogType>('resetSuspicion');
  public isUpdating = signal<boolean>(false);
  public showSuccess = signal<boolean>(false);

  // User history
  public userHistory = signal<UserHistoryItem[]>([]);
  public historyExpanded = signal<boolean>(false);

  ngOnInit(): void {
    this.translator
      .get('admin.users.title')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((usersTitle) => {
        this.translator.get('app_title').subscribe((appTitle) => {
          this.title.setTitle(`${usersTitle} | ${appTitle}`);
        });
      });

    // Load user history from local storage
    this.loadUserHistory();

    // Check for route param first (e.g., /admin/users/304597)
    const userIdParam = this.route.snapshot.paramMap.get('userId');
    if (userIdParam) {
      this.searchQuery.set(userIdParam);
      this.searchUser();
    } else {
      // Auto-load the last user if available
      const history = this.userHistory();
      if (history.length > 0) {
        const lastUser = history[0];
        this.searchQuery.set(lastUser.id.toString());
        this.searchUser();
      }
    }
  }

  public onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value);
  }

  public searchUser(): void {
    const query = this.searchQuery().trim();
    if (!query) return;

    this.loading.set(true);
    this.userNotFound.set(false);
    this.selectedUser.set(null);
    this.userWorkers.set([]);
    this.workersExpanded.set(false);

    // Extract user ID from the query
    // Supports: numeric ID, "username#id", or "#id"
    let userId: number | null = null;

    // Try to parse as numeric ID first
    const numericId = parseInt(query, 10);
    if (!isNaN(numericId)) {
      userId = numericId;
    } else {
      // Try to extract ID from "username#id" or "#id" format
      const match = query.match(/#(\d+)$/);
      if (match) {
        userId = parseInt(match[1], 10);
      }
    }

    if (userId !== null) {
      this.userService
        .getUser(userId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((user) => {
          this.loading.set(false);
          if (user) {
            this.setSelectedUser(user);
            this.addToUserHistory(user);
          } else {
            this.userNotFound.set(true);
          }
        });
    } else {
      this.loading.set(false);
      this.userNotFound.set(true);
    }
  }

  private setSelectedUser(user: AdminUserDetails): void {
    this.selectedUser.set(user);
    this.trustedValue.set(user.trusted);
    this.flaggedValue.set(user.flagged);
    this.workerInvitesValue.set(user.worker_invited);
    this.moderatorValue.set(user.moderator ?? false);
    this.publicWorkersValue.set(user.public_workers ?? false);
    this.customizerValue.set(user.customizer ?? false);
    this.serviceValue.set(user.service ?? false);
    this.educationValue.set(user.education ?? false);
    this.specialValue.set(user.special ?? false);
    this.filteredValue.set(user.filtered ?? false);
    this.vpnValue.set(user.vpn ?? false);
    this.usageMultiplierValue.set(user.usage_multiplier ?? 1);
    this.concurrencyValue.set(user.concurrency ?? 0);
    this.monthlyKudosValue.set(user.monthly_kudos?.amount ?? 0);
    this.contactValue.set(user.contact ?? '');
    this.adminCommentValue.set(user.admin_comment ?? '');
    this.isDirty.set(false);
  }

  public onTrustedChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.trustedValue.set(target.checked);
    this.checkDirty();
  }

  public onFlaggedChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.flaggedValue.set(target.checked);
    this.checkDirty();
  }

  public onModeratorChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.moderatorValue.set(target.checked);
    this.checkDirty();
  }

  public onPublicWorkersChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.publicWorkersValue.set(target.checked);
    this.checkDirty();
  }

  public onCustomizerChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.customizerValue.set(target.checked);
    this.checkDirty();
  }

  public onServiceChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.serviceValue.set(target.checked);
    this.checkDirty();
  }

  public onEducationChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.educationValue.set(target.checked);
    this.checkDirty();
  }

  public onSpecialChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.specialValue.set(target.checked);
    this.checkDirty();
  }

  public onFilteredChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filteredValue.set(target.checked);
    this.checkDirty();
  }

  public onVpnChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.vpnValue.set(target.checked);
    this.checkDirty();
  }

  public onWorkerInvitesChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.workerInvitesValue.set(parseInt(target.value, 10) || 0);
    this.checkDirty();
  }

  public onUsageMultiplierChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = parseFloat(target.value);
    this.usageMultiplierValue.set(Number.isFinite(value) ? value : 1);
    this.checkDirty();
  }

  public onConcurrencyChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.concurrencyValue.set(parseInt(target.value, 10) || 0);
    this.checkDirty();
  }

  public onMonthlyKudosChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.monthlyKudosValue.set(parseInt(target.value, 10) || 0);
    this.checkDirty();
  }

  public onContactChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.contactValue.set(target.value);
    this.checkDirty();
  }

  public onAdminCommentChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.adminCommentValue.set(target.value);
    this.checkDirty();
  }

  private checkDirty(): void {
    const user = this.selectedUser();
    if (!user) return;

    this.isDirty.set(
      this.trustedValue() !== user.trusted ||
        this.flaggedValue() !== user.flagged ||
        this.moderatorValue() !== user.moderator ||
        this.publicWorkersValue() !== (user.public_workers ?? false) ||
        this.customizerValue() !== (user.customizer ?? false) ||
        this.serviceValue() !== (user.service ?? false) ||
        this.educationValue() !== (user.education ?? false) ||
        this.specialValue() !== (user.special ?? false) ||
        this.filteredValue() !== (user.filtered ?? false) ||
        this.vpnValue() !== (user.vpn ?? false) ||
        this.workerInvitesValue() !== user.worker_invited ||
        this.usageMultiplierValue() !== (user.usage_multiplier ?? 1) ||
        this.concurrencyValue() !== (user.concurrency ?? 0) ||
        this.monthlyKudosValue() !== (user.monthly_kudos?.amount ?? 0) ||
        this.contactValue().trim() !== (user.contact ?? '') ||
        this.adminCommentValue().trim() !== (user.admin_comment ?? '')
    );
  }

  public saveChanges(): void {
    const user = this.selectedUser();
    if (!user || !this.isDirty()) return;

    this.isSaving.set(true);

    // Only include fields that have actually changed
    const payload: Record<string, unknown> = {};

    if (this.trustedValue() !== user.trusted) {
      payload['trusted'] = this.trustedValue();
    }
    if (this.flaggedValue() !== user.flagged) {
      payload['flagged'] = this.flaggedValue();
    }
    if (this.workerInvitesValue() !== user.worker_invited) {
      payload['worker_invite'] = this.workerInvitesValue();
    }
    if (this.moderatorValue() !== user.moderator) {
      payload['moderator'] = this.moderatorValue();
    }
    if (this.publicWorkersValue() !== (user.public_workers ?? false)) {
      payload['public_workers'] = this.publicWorkersValue();
    }
    if (this.customizerValue() !== (user.customizer ?? false)) {
      payload['customizer'] = this.customizerValue();
    }
    if (this.serviceValue() !== (user.service ?? false)) {
      payload['service'] = this.serviceValue();
    }
    if (this.educationValue() !== (user.education ?? false)) {
      payload['education'] = this.educationValue();
    }
    if (this.specialValue() !== (user.special ?? false)) {
      payload['special'] = this.specialValue();
    }
    if (this.filteredValue() !== (user.filtered ?? false)) {
      payload['filtered'] = this.filteredValue();
    }
    if (this.vpnValue() !== (user.vpn ?? false)) {
      payload['vpn'] = this.vpnValue();
    }
    if (this.usageMultiplierValue() !== (user.usage_multiplier ?? 1)) {
      payload['usage_multiplier'] = this.usageMultiplierValue();
    }
    if (this.concurrencyValue() !== (user.concurrency ?? 0)) {
      payload['concurrency'] = this.concurrencyValue();
    }
    if (this.monthlyKudosValue() !== (user.monthly_kudos?.amount ?? 0)) {
      payload['monthly_kudos'] = this.monthlyKudosValue();
    }
    if (this.contactValue().trim() !== (user.contact ?? '')) {
      payload['contact'] = this.contactValue().trim() || undefined;
    }
    if (this.adminCommentValue().trim() !== (user.admin_comment ?? '')) {
      payload['admin_comment'] = this.adminCommentValue().trim() || undefined;
    }

    this.userService
      .updateUser(user.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.isSaving.set(false);
        if (result) {
          // Refresh user data
          this.userService
            .getUser(user.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((updatedUser) => {
              if (updatedUser) {
                this.setSelectedUser(updatedUser);
              }
            });
          this.showSuccess.set(true);
          setTimeout(() => this.showSuccess.set(false), 3000);
        }
      });
  }

  public toggleWorkersSection(): void {
    const expanded = !this.workersExpanded();
    this.workersExpanded.set(expanded);

    if (expanded && this.userWorkers().length === 0) {
      this.loadUserWorkers();
    }
  }

  public togglePermissionsSection(): void {
    this.permissionsExpanded.set(!this.permissionsExpanded());
  }

  public toggleLimitsSection(): void {
    this.limitsExpanded.set(!this.limitsExpanded());
  }

  public toggleContactSection(): void {
    this.contactExpanded.set(!this.contactExpanded());
  }

  public toggleKudosDetailsSection(): void {
    this.kudosDetailsExpanded.set(!this.kudosDetailsExpanded());
  }

  public toggleRecordsSection(): void {
    this.recordsExpanded.set(!this.recordsExpanded());
  }

  public toggleActiveGenerationsSection(): void {
    this.activeGenerationsExpanded.set(!this.activeGenerationsExpanded());
  }

  public toggleStylesSection(): void {
    this.stylesExpanded.set(!this.stylesExpanded());
  }

  public toggleSharedKeysSection(): void {
    this.sharedKeysExpanded.set(!this.sharedKeysExpanded());
  }

  public hasActiveGenerations(user: AdminUserDetails | null): boolean {
    if (!user || !user.active_generations) return false;
    const gen = user.active_generations;
    return (gen.image?.length ?? 0) > 0 || 
           (gen.text?.length ?? 0) > 0 || 
           (gen.alchemy?.length ?? 0) > 0;
  }

  private loadUserWorkers(): void {
    const user = this.selectedUser();
    if (!user || !user.worker_ids || user.worker_ids.length === 0) return;

    this.loadingWorkers.set(true);

    // Fetch workers by their IDs (this will include inactive workers)
    this.workerService
      .getWorkersByIds(user.worker_ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((workers) => {
        this.userWorkers.set(workers);
        this.loadingWorkers.set(false);
      });
  }

  // Dialog actions
  public openResetSuspicionDialog(): void {
    this.dialogType.set('resetSuspicion');
    this.dialogOpen.set(true);
  }

  public closeDialog(): void {
    this.dialogOpen.set(false);
  }

  public confirmDialog(): void {
    const user = this.selectedUser();
    if (!user) return;

    this.isUpdating.set(true);

    const action$ = this.userService.resetSuspicion(user.id);

    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
      this.isUpdating.set(false);
      if (result) {
        // Refresh user data
        this.userService
          .getUser(user.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((updatedUser) => {
            if (updatedUser) {
              this.setSelectedUser(updatedUser);
            }
          });
        this.showSuccess.set(true);
        setTimeout(() => this.showSuccess.set(false), 3000);
      }
      this.closeDialog();
    });
  }

  public onWorkerUpdated(): void {
    this.loadUserWorkers();
  }

  public regenerateProxyPasskey(): void {
    const user = this.selectedUser();
    if (!user) return;

    this.isRegeneratingPasskey.set(true);

    this.userService
      .updateUser(user.id, { generate_proxy_passkey: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) {
          this.userService
            .getUser(user.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((updatedUser) => {
              if (updatedUser) {
                this.setSelectedUser(updatedUser);
              }
              this.isRegeneratingPasskey.set(false);
            });
        } else {
          this.isRegeneratingPasskey.set(false);
        }
      });
  }

  // User history methods
  private loadUserHistory(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      const stored = localStorage.getItem(USER_HISTORY_KEY);
      if (stored) {
        const history: UserHistoryItem[] = JSON.parse(stored);
        this.userHistory.set(history);
      }
    } catch (error) {
      console.error('Failed to load user history:', error);
      this.userHistory.set([]);
    }
  }

  private addToUserHistory(user: AdminUserDetails): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const history = this.userHistory();
    
    // Remove existing entry for this user if present
    const filtered = history.filter(item => item.id !== user.id);
    
    // Add the new entry at the beginning
    const newEntry: UserHistoryItem = {
      id: user.id,
      username: user.username,
      timestamp: Date.now()
    };
    
    // Keep only the last MAX_HISTORY_SIZE entries
    const updated = [newEntry, ...filtered].slice(0, MAX_HISTORY_SIZE);
    
    this.userHistory.set(updated);
    
    // Save to local storage
    try {
      localStorage.setItem(USER_HISTORY_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save user history:', error);
    }
  }

  public toggleHistorySection(): void {
    this.historyExpanded.set(!this.historyExpanded());
  }

  public selectUserFromHistory(item: UserHistoryItem): void {
    this.searchQuery.set(item.id.toString());
    this.searchUser();
  }

  public clearUserHistory(): void {
    this.userHistory.set([]);
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      localStorage.removeItem(USER_HISTORY_KEY);
    } catch (error) {
      console.error('Failed to clear user history:', error);
    }
  }
}
