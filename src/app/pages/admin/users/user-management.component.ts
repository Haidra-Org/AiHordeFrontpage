import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser, DatePipe } from '@angular/common';
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
import { SharedKeyDetails } from '../../../types/shared-key';
import { FormatNumberPipe } from '../../../pipes/format-number.pipe';
import { WorkerCardComponent } from '../workers/worker-card.component';
import { AdminDialogComponent } from '../../../components/admin/admin-dialog/admin-dialog.component';
import {
  AdminToastBarComponent,
  AdminToast,
} from '../../../components/admin/admin-toast-bar/admin-toast-bar.component';
import { KudosBreakdownPanelComponent } from '../../../components/kudos-breakdown-panel/kudos-breakdown-panel.component';
import { combineLatest } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { highlightJson, stringifyAsJson } from '../../../helper/json-formatter';

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
    DatePipe,
    AdminDialogComponent,
    AdminToastBarComponent,
    KudosBreakdownPanelComponent,
  ],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  // User shared keys
  public userSharedKeys = signal<SharedKeyDetails[]>([]);
  public loadingSharedKeys = signal<boolean>(false);
  public sharedKeysFetched = signal<boolean>(false);

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
  public rawJsonModalOpen = signal<boolean>(false);

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

  // Raw JSON snapshots
  public userJson = computed(() => stringifyAsJson(this.selectedUser()));
  public workersJson = computed(() => stringifyAsJson(this.userWorkers()));
  public sharedKeysJson = computed(() =>
    stringifyAsJson(this.userSharedKeys()),
  );
  public stylesJson = computed(() =>
    stringifyAsJson(this.selectedUser()?.styles ?? []),
  );
  public userJsonHighlighted = computed(() => highlightJson(this.userJson()));
  public workersJsonHighlighted = computed(() =>
    highlightJson(this.workersJson()),
  );
  public sharedKeysJsonHighlighted = computed(() =>
    highlightJson(this.sharedKeysJson()),
  );
  public stylesJsonHighlighted = computed(() =>
    highlightJson(this.stylesJson()),
  );

  // Computed signals for tracking individual field changes
  public trustedChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.trustedValue() !== user.trusted : false;
  });
  public flaggedChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.flaggedValue() !== user.flagged : false;
  });
  public moderatorChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.moderatorValue() !== user.moderator : false;
  });
  public publicWorkersChanged = computed(() => {
    const user = this.selectedUser();
    return user
      ? this.publicWorkersValue() !== (user.public_workers ?? false)
      : false;
  });
  public customizerChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.customizerValue() !== (user.customizer ?? false) : false;
  });
  public serviceChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.serviceValue() !== (user.service ?? false) : false;
  });
  public educationChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.educationValue() !== (user.education ?? false) : false;
  });
  public specialChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.specialValue() !== (user.special ?? false) : false;
  });
  public filteredChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.filteredValue() !== (user.filtered ?? false) : false;
  });
  public vpnChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.vpnValue() !== (user.vpn ?? false) : false;
  });
  public workerInvitesChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.workerInvitesValue() !== user.worker_invited : false;
  });
  public usageMultiplierChanged = computed(() => {
    const user = this.selectedUser();
    return user
      ? this.usageMultiplierValue() !== (user.usage_multiplier ?? 1)
      : false;
  });
  public concurrencyChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.concurrencyValue() !== (user.concurrency ?? 0) : false;
  });
  public monthlyKudosChanged = computed(() => {
    const user = this.selectedUser();
    return user
      ? this.monthlyKudosValue() !== (user.monthly_kudos?.amount ?? 0)
      : false;
  });
  public contactChanged = computed(() => {
    const user = this.selectedUser();
    return user ? this.contactValue().trim() !== (user.contact ?? '') : false;
  });
  public adminCommentChanged = computed(() => {
    const user = this.selectedUser();
    return user
      ? this.adminCommentValue().trim() !== (user.admin_comment ?? '')
      : false;
  });

  // Dialog state
  public dialogOpen = signal<boolean>(false);
  public dialogType = signal<DialogType>('resetSuspicion');
  public isUpdating = signal<boolean>(false);

  // Toast notifications
  public toasts = signal<AdminToast[]>([]);

  // User history
  public userHistory = signal<UserHistoryItem[]>([]);
  public historyExpanded = signal<boolean>(false);

  ngOnInit(): void {
    combineLatest([
      this.translator.get('admin.users.title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([usersTitle, appTitle]) => {
        this.title.setTitle(`${usersTitle} | ${appTitle}`);
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
    this.clearToasts();
    this.userNotFound.set(false);
    this.selectedUser.set(null);
    this.userWorkers.set([]);
    this.workersExpanded.set(false);
    this.userSharedKeys.set([]);
    this.sharedKeysFetched.set(false);
    this.sharedKeysExpanded.set(false);

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
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.loading.set(false)),
        )
        .subscribe({
          next: (user) => {
            if (user) {
              this.setSelectedUser(user);
              this.addToUserHistory(user);
            } else {
              this.userNotFound.set(true);
            }
          },
          error: () => {
            this.userNotFound.set(true);
            this.showToast('error', 'Failed to load user data.');
          },
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

  /**
   * Consolidated field change handler.
   * Handles boolean, number, and string field updates.
   */
  public onFieldChange(
    field: keyof typeof this.fieldSignals,
    event: Event,
  ): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    const signalRef = this.fieldSignals[field];

    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      (signalRef as ReturnType<typeof signal<boolean>>).set(target.checked);
    } else if (target instanceof HTMLInputElement && target.type === 'number') {
      const rawValue = target.value;
      // Handle float for usage multiplier, integer for others
      if (field === 'usageMultiplier') {
        const value = parseFloat(rawValue);
        (signalRef as ReturnType<typeof signal<number>>).set(
          Number.isFinite(value) ? value : 1,
        );
      } else {
        (signalRef as ReturnType<typeof signal<number>>).set(
          parseInt(rawValue, 10) || 0,
        );
      }
    } else {
      (signalRef as ReturnType<typeof signal<string>>).set(target.value);
    }

    this.checkDirty();
  }

  /**
   * Map of field names to their signal references for dynamic updates.
   */
  private readonly fieldSignals = {
    trusted: this.trustedValue,
    flagged: this.flaggedValue,
    moderator: this.moderatorValue,
    publicWorkers: this.publicWorkersValue,
    customizer: this.customizerValue,
    service: this.serviceValue,
    education: this.educationValue,
    special: this.specialValue,
    filtered: this.filteredValue,
    vpn: this.vpnValue,
    workerInvites: this.workerInvitesValue,
    usageMultiplier: this.usageMultiplierValue,
    concurrency: this.concurrencyValue,
    monthlyKudos: this.monthlyKudosValue,
    contact: this.contactValue,
    adminComment: this.adminCommentValue,
  } as const;

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
        this.adminCommentValue().trim() !== (user.admin_comment ?? ''),
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
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSaving.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            this.userService
              .getUser(user.id)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((updatedUser) => {
                if (updatedUser) {
                  this.setSelectedUser(updatedUser);
                }
              });
            this.showToast('success', 'Changes saved successfully.');
          }
        },
        error: () => {
          this.showToast('error', 'Failed to save changes.');
        },
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
    const expanded = !this.sharedKeysExpanded();
    this.sharedKeysExpanded.set(expanded);

    if (expanded && !this.sharedKeysFetched()) {
      this.loadUserSharedKeys();
    }
  }

  public openRawJsonModal(): void {
    const user = this.selectedUser();
    if (!user) return;

    // Ensure we have the freshest related entities before showing JSON
    if (
      user.worker_ids?.length &&
      this.userWorkers().length === 0 &&
      !this.loadingWorkers()
    ) {
      this.loadUserWorkers();
    }
    if (
      user.sharedkey_ids?.length &&
      !this.sharedKeysFetched() &&
      !this.loadingSharedKeys()
    ) {
      this.loadUserSharedKeys();
    }

    this.rawJsonModalOpen.set(true);
  }

  public closeRawJsonModal(): void {
    this.rawJsonModalOpen.set(false);
  }

  private loadUserSharedKeys(): void {
    const user = this.selectedUser();
    if (!user || !user.sharedkey_ids || user.sharedkey_ids.length === 0) return;

    this.loadingSharedKeys.set(true);

    this.userService
      .getSharedKeysByIds(user.sharedkey_ids)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingSharedKeys.set(false)),
      )
      .subscribe({
        next: (sharedKeys) => {
          this.userSharedKeys.set(sharedKeys);
          this.sharedKeysFetched.set(true);
        },
        error: () => {
          this.sharedKeysFetched.set(true);
          this.showToast('error', 'Failed to load shared keys.');
        },
      });
  }

  public hasActiveGenerations(user: AdminUserDetails | null): boolean {
    if (!user || !user.active_generations) return false;
    const gen = user.active_generations;
    return (
      (gen.image?.length ?? 0) > 0 ||
      (gen.text?.length ?? 0) > 0 ||
      (gen.alchemy?.length ?? 0) > 0
    );
  }

  private loadUserWorkers(): void {
    const user = this.selectedUser();
    if (!user || !user.worker_ids || user.worker_ids.length === 0) return;

    this.loadingWorkers.set(true);

    // Fetch workers by their IDs (this will include inactive workers)
    this.workerService
      .getWorkersByIds(user.worker_ids)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingWorkers.set(false)),
      )
      .subscribe({
        next: (workers) => {
          this.userWorkers.set(workers);
        },
        error: () => {
          this.showToast('error', 'Failed to load workers.');
        },
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

    action$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isUpdating.set(false);
          this.closeDialog();
        }),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            this.userService
              .getUser(user.id)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((updatedUser) => {
                if (updatedUser) {
                  this.setSelectedUser(updatedUser);
                }
              });
            this.showToast('success', 'Suspicion reset successfully.');
          }
        },
        error: () => {
          this.showToast('error', 'Failed to reset suspicion.');
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
    this.showToast('success', 'Worker deleted successfully! Note: It may take up to a minute for the API to reflect this change.');
  }

  public regenerateProxyPasskey(): void {
    const user = this.selectedUser();
    if (!user) return;

    this.isRegeneratingPasskey.set(true);

    this.userService
      .updateUser(user.id, { generate_proxy_passkey: true })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isRegeneratingPasskey.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            this.userService
              .getUser(user.id)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((updatedUser) => {
                if (updatedUser) {
                  this.setSelectedUser(updatedUser);
                }
              });
          }
        },
        error: () => {
          this.showToast('error', 'Failed to regenerate passkey.');
        },
      });
  }

  // Toast notification methods
  /**
   * Show a toast notification.
   * @param type Toast type: success, error, or warning
   * @param message The message to display
   * @param autoDismiss Whether to auto-dismiss after 3 seconds (default: true for success)
   */
  public showToast(
    type: AdminToast['type'],
    message: string,
    autoDismiss = type === 'success',
  ): void {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.toasts.update((current) => [...current, { id, type, message }]);

    if (autoDismiss) {
      setTimeout(() => this.dismissToast(id), 3000);
    }
  }

  /**
   * Dismiss a toast by ID.
   */
  public dismissToast(id: string): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }

  /**
   * Clear all toasts.
   */
  public clearToasts(): void {
    this.toasts.set([]);
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
    const filtered = history.filter((item) => item.id !== user.id);

    // Add the new entry at the beginning
    const newEntry: UserHistoryItem = {
      id: user.id,
      username: user.username,
      timestamp: Date.now(),
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
