import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { combineLatest, finalize } from 'rxjs';
import { TranslatorService } from '../../../services/translator.service';
import { AuthService } from '../../../services/auth.service';
import { AdminOperationsService } from '../../../services/admin-operations.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { IPTimeout } from '../../../types/ip-operations';
import { HordeWorker } from '../../../types/horde-worker';
import {
  AdminToastBarComponent,
  AdminToast,
} from '../../../components/admin/admin-toast-bar/admin-toast-bar.component';
import { AdminDialogComponent } from '../../../components/admin/admin-dialog/admin-dialog.component';

type DialogType = 'deleteIP' | 'blockWorker' | 'unblockWorker' | 'refreshIP' | 'batchRefreshIP';

@Component({
  selector: 'app-operations',
  imports: [
    TranslocoPipe,
    TranslocoModule,
    FormsModule,
    AdminToastBarComponent,
    AdminDialogComponent,
  ],
  templateUrl: './operations.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperationsComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly operationsService = inject(AdminOperationsService);
  private readonly workerService = inject(AdminWorkerService);
  public readonly auth = inject(AuthService);

  // IP Timeout List state
  public ipTimeouts = signal<IPTimeout[]>([]);
  public loadingTimeouts = signal<boolean>(false);
  public searchQuery = signal<string>('');

  // Batch selection state
  public selectedIPs = signal<Set<string>>(new Set());
  public batchRefreshHours = signal<number>(720);
  public batchRefreshing = signal<boolean>(false);
  public batchRefreshProgress = signal<{ completed: number; total: number }>({ completed: 0, total: 0 });

  // Add IP Timeout form state
  public addIPAddress = signal<string>('');
  public addIPHours = signal<number>(720);
  public addingIP = signal<boolean>(false);
  public addIPWarning = computed(() => {
    const ip = this.addIPAddress().trim();
    if (!ip || ip.includes('/')) return null;

    // Check for IPv4 ending in .0
    if (ip.match(/\.0$/)) {
      return 'This IP ends in .0 - did you forget to add a CIDR mask (e.g., /24)?';
    }

    // Check for IPv6 ending in ::
    if (ip.match(/::$/)) {
      return 'This IP ends in :: - did you forget to add a CIDR mask (e.g., /64)?';
    }

    return null;
  });

  // Check IP state
  public checkIPAddress = signal<string>('');
  public checkResult = signal<IPTimeout | null | undefined>(undefined);
  public checkingIP = signal<boolean>(false);

  // Worker IP Block state
  public workers = signal<HordeWorker[]>([]);
  public loadingWorkers = signal<boolean>(false);
  public workerSearchQuery = signal<string>('');
  public selectedWorker = signal<HordeWorker | null>(null);
  public blockDays = signal<number>(1);
  public blockingWorker = signal<boolean>(false);
  public workerDropdownOpen = signal<boolean>(false);
  public fetchingWorkerInfo = signal<boolean>(false);
  public workerFetchError = signal<string | null>(null);

  // Dialog state
  public dialogOpen = signal<boolean>(false);
  public dialogType = signal<DialogType>('deleteIP');
  public selectedIPForDelete = signal<IPTimeout | null>(null);
  public selectedIPForRefresh = signal<IPTimeout | null>(null);
  public refreshIPHours = signal<number>(720);
  public selectedWorkerForUnblock = signal<HordeWorker | null>(null);
  public isDialogLoading = signal<boolean>(false);

  // Toast notifications
  public toasts = signal<AdminToast[]>([]);

  // Hour options for the add IP form
  public readonly hourOptions = [720, 336, 168, 72, 48, 24, 12, 8, 4, 2, 1];

  // Day options for worker block
  public readonly dayOptions = Array.from({ length: 30 }, (_, i) => i + 1);

  // Computed: filtered IP timeouts
  public filteredTimeouts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.ipTimeouts();
    return this.ipTimeouts().filter((t) =>
      t.ipaddr.toLowerCase().includes(query),
    );
  });

  // Computed: filtered workers for dropdown
  public filteredWorkers = computed(() => {
    const query = this.workerSearchQuery().toLowerCase().trim();
    if (!query) return this.workers().slice(0, 50);
    return this.workers()
      .filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          w.id.toLowerCase().includes(query),
      )
      .slice(0, 50);
  });

  // Computed: selection state for batch operations
  public selectedCount = computed(() => this.selectedIPs().size);
  public allSelected = computed(() => {
    const filtered = this.filteredTimeouts();
    if (filtered.length === 0) return false;
    const selected = this.selectedIPs();
    return filtered.every((t) => selected.has(t.ipaddr));
  });
  public someSelected = computed(() => {
    const selected = this.selectedIPs();
    const filtered = this.filteredTimeouts();
    return filtered.some((t) => selected.has(t.ipaddr)) && !this.allSelected();
  });
  public selectedIPsList = computed(() => {
    const selected = this.selectedIPs();
    return this.ipTimeouts().filter((t) => selected.has(t.ipaddr));
  });

  ngOnInit(): void {
    combineLatest([
      this.translator.get('admin.operations.title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([operationsTitle, appTitle]) => {
        this.title.setTitle(`${operationsTitle} | ${appTitle}`);
      });

    // Load data on init
    this.loadIPTimeouts();
    this.loadWorkers();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IP TIMEOUT LIST
  // ─────────────────────────────────────────────────────────────────────────

  public loadIPTimeouts(): void {
    this.loadingTimeouts.set(true);
    this.operationsService
      .getIPTimeouts()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingTimeouts.set(false)),
      )
      .subscribe({
        next: (timeouts) => {
          this.ipTimeouts.set(timeouts);
        },
        error: () => {
          this.showToast('error', 'Failed to load IP timeouts.');
        },
      });
  }

  public onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value);
  }

  public formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400)
      return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  }

  public openDeleteIPDialog(timeout: IPTimeout): void {
    this.selectedIPForDelete.set(timeout);
    this.dialogType.set('deleteIP');
    this.dialogOpen.set(true);
  }

  public openRefreshIPDialog(timeout: IPTimeout): void {
    this.selectedIPForRefresh.set(timeout);
    this.refreshIPHours.set(720);
    this.dialogType.set('refreshIP');
    this.dialogOpen.set(true);
  }

  public onRefreshIPHoursChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.refreshIPHours.set(parseInt(target.value, 10));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BATCH SELECTION
  // ─────────────────────────────────────────────────────────────────────────

  public toggleSelectIP(ipaddr: string): void {
    this.selectedIPs.update((current) => {
      const newSet = new Set(current);
      if (newSet.has(ipaddr)) {
        newSet.delete(ipaddr);
      } else {
        newSet.add(ipaddr);
      }
      return newSet;
    });
  }

  public toggleSelectAll(): void {
    const filtered = this.filteredTimeouts();
    if (this.allSelected()) {
      // Deselect all filtered
      this.selectedIPs.update((current) => {
        const newSet = new Set(current);
        filtered.forEach((t) => newSet.delete(t.ipaddr));
        return newSet;
      });
    } else {
      // Select all filtered
      this.selectedIPs.update((current) => {
        const newSet = new Set(current);
        filtered.forEach((t) => newSet.add(t.ipaddr));
        return newSet;
      });
    }
  }

  public clearSelection(): void {
    this.selectedIPs.set(new Set());
  }

  public isIPSelected(ipaddr: string): boolean {
    return this.selectedIPs().has(ipaddr);
  }

  public openBatchRefreshDialog(): void {
    if (this.selectedCount() === 0) return;
    this.batchRefreshHours.set(720);
    this.dialogType.set('batchRefreshIP');
    this.dialogOpen.set(true);
  }

  public onBatchRefreshHoursChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.batchRefreshHours.set(parseInt(target.value, 10));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADD IP TIMEOUT
  // ─────────────────────────────────────────────────────────────────────────

  public onAddIPAddressChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.addIPAddress.set(target.value);
  }

  public onAddIPHoursChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.addIPHours.set(parseInt(target.value, 10));
  }

  public addIPTimeout(): void {
    let ipaddr = this.addIPAddress().trim();
    if (!ipaddr) {
      this.showToast('error', 'IP address is required.');
      return;
    }

    // Auto-append /32 for IPv4 addresses without CIDR mask
    // Auto-append /128 for IPv6 addresses without CIDR mask
    if (!ipaddr.includes('/')) {
      // Check if it's IPv6 (contains colons)
      if (ipaddr.includes(':')) {
        ipaddr = `${ipaddr}/128`;
      } else {
        // IPv4
        ipaddr = `${ipaddr}/32`;
      }
    }

    this.addingIP.set(true);
    this.operationsService
      .addIPTimeout({ ipaddr, hours: this.addIPHours() })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.addingIP.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            this.showToast('success', 'IP timeout added successfully.');
            this.addIPAddress.set('');
            this.loadIPTimeouts();
          } else {
            this.showToast('error', 'Failed to add IP timeout.');
          }
        },
        error: () => {
          this.showToast('error', 'Failed to add IP timeout.');
        },
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHECK IP
  // ─────────────────────────────────────────────────────────────────────────

  public onCheckIPAddressChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.checkIPAddress.set(target.value);
    // Reset result when input changes
    this.checkResult.set(undefined);
  }

  public checkIP(): void {
    const ipaddr = this.checkIPAddress().trim();
    if (!ipaddr) {
      this.showToast('error', 'IP address is required.');
      return;
    }

    this.checkingIP.set(true);
    this.checkResult.set(undefined);
    this.operationsService
      .getIPTimeout(ipaddr)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.checkingIP.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.checkResult.set(result);
        },
        error: () => {
          this.showToast('error', 'Failed to check IP.');
        },
      });
  }

  public clearCheckResult(): void {
    this.checkIPAddress.set('');
    this.checkResult.set(undefined);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WORKER IP BLOCK
  // ─────────────────────────────────────────────────────────────────────────

  public loadWorkers(): void {
    this.loadingWorkers.set(true);
    this.workerService
      .getWorkers()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingWorkers.set(false)),
      )
      .subscribe({
        next: (workers) => {
          this.workers.set(workers);
        },
        error: () => {
          this.showToast('error', 'Failed to load workers.');
        },
      });
  }

  public onWorkerSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    this.workerSearchQuery.set(value);
    this.workerDropdownOpen.set(true);
    this.workerFetchError.set(null);

    // If user clears input, clear selection
    if (!value.trim()) {
      this.selectedWorker.set(null);
    }
  }

  public selectWorker(worker: HordeWorker): void {
    this.selectedWorker.set(worker);
    this.workerSearchQuery.set(`${worker.name} (${worker.id.slice(0, 8)}...)`);
    this.workerDropdownOpen.set(false);
  }

  public clearWorkerSelection(): void {
    this.selectedWorker.set(null);
    this.workerSearchQuery.set('');
    this.workerFetchError.set(null);
  }

  /**
   * Look up a worker by UUID - first check the loaded workers list,
   * then fetch from API if not found
   */
  public lookupWorkerByUUID(): void {
    const query = this.workerSearchQuery().trim();

    // UUID format: 8-4-4-4-12 hex characters
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(query)) {
      this.workerFetchError.set(
        'Invalid UUID format. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      );
      return;
    }

    // First check if it's in the loaded workers list
    const cachedWorker = this.workers().find(
      (w) => w.id.toLowerCase() === query.toLowerCase(),
    );
    if (cachedWorker) {
      this.selectWorker(cachedWorker);
      return;
    }

    // Fetch from API
    this.fetchingWorkerInfo.set(true);
    this.workerFetchError.set(null);
    this.workerService
      .getWorker(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.fetchingWorkerInfo.set(false)),
      )
      .subscribe({
        next: (worker) => {
          if (worker) {
            this.selectWorker(worker);
          } else {
            this.workerFetchError.set('Worker not found with this UUID.');
          }
        },
        error: () => {
          this.workerFetchError.set('Failed to fetch worker information.');
        },
      });
  }

  /**
   * Check if the current search query looks like a UUID
   */
  public isUUIDFormat(): boolean {
    const query = this.workerSearchQuery().trim();
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(query);
  }

  public onBlockDaysChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.blockDays.set(parseInt(target.value, 10));
  }

  public openBlockWorkerDialog(): void {
    if (!this.selectedWorker()) {
      this.showToast('error', 'Please select a worker first.');
      return;
    }
    this.dialogType.set('blockWorker');
    this.dialogOpen.set(true);
  }

  public openUnblockWorkerDialog(worker: HordeWorker): void {
    this.selectedWorkerForUnblock.set(worker);
    this.dialogType.set('unblockWorker');
    this.dialogOpen.set(true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DIALOG ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  public closeDialog(): void {
    this.dialogOpen.set(false);
    this.selectedIPForDelete.set(null);
    this.selectedIPForRefresh.set(null);
    this.selectedWorkerForUnblock.set(null);
  }

  public confirmDialog(): void {
    const type = this.dialogType();
    if (type === 'deleteIP') {
      this.confirmDeleteIP();
    } else if (type === 'refreshIP') {
      this.confirmRefreshIP();
    } else if (type === 'batchRefreshIP') {
      this.confirmBatchRefreshIP();
    } else if (type === 'blockWorker') {
      this.confirmBlockWorker();
    } else if (type === 'unblockWorker') {
      this.confirmUnblockWorker();
    }
  }

  private confirmDeleteIP(): void {
    const ip = this.selectedIPForDelete();
    if (!ip) return;

    this.isDialogLoading.set(true);
    this.operationsService
      .removeIPTimeout(ip.ipaddr)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDialogLoading.set(false)),
      )
      .subscribe({
        next: (success) => {
          if (success) {
            this.showToast('success', 'IP timeout removed successfully.');
            this.closeDialog();
            this.loadIPTimeouts();
          } else {
            this.showToast('error', 'Failed to remove IP timeout.');
          }
        },
        error: () => {
          this.showToast('error', 'Failed to remove IP timeout.');
        },
      });
  }

  private confirmRefreshIP(): void {
    const ip = this.selectedIPForRefresh();
    if (!ip) return;

    this.isDialogLoading.set(true);
    this.operationsService
      .addIPTimeout({ ipaddr: ip.ipaddr, hours: this.refreshIPHours() })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDialogLoading.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            this.showToast('success', 'IP timeout refreshed successfully.');
            this.closeDialog();
            this.loadIPTimeouts();
          } else {
            this.showToast('error', 'Failed to refresh IP timeout.');
          }
        },
        error: () => {
          this.showToast('error', 'Failed to refresh IP timeout.');
        },
      });
  }

  private confirmBatchRefreshIP(): void {
    const selected = this.selectedIPsList();
    if (selected.length === 0) return;

    this.isDialogLoading.set(true);
    this.batchRefreshing.set(true);
    this.batchRefreshProgress.set({ completed: 0, total: selected.length });

    const hours = this.batchRefreshHours();
    let completed = 0;
    let successCount = 0;
    let failCount = 0;

    // Process each IP sequentially to avoid overwhelming the API
    const processNext = (index: number): void => {
      if (index >= selected.length) {
        // All done
        this.isDialogLoading.set(false);
        this.batchRefreshing.set(false);
        this.closeDialog();
        this.clearSelection();
        this.loadIPTimeouts();

        if (failCount === 0) {
          this.showToast('success', `Successfully refreshed ${successCount} IP timeout(s).`);
        } else {
          this.showToast('warning', `Refreshed ${successCount} IP(s), ${failCount} failed.`);
        }
        return;
      }

      const ip = selected[index];
      this.operationsService
        .addIPTimeout({ ipaddr: ip.ipaddr, hours })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            completed++;
            if (result) {
              successCount++;
            } else {
              failCount++;
            }
            this.batchRefreshProgress.set({ completed, total: selected.length });
            processNext(index + 1);
          },
          error: () => {
            completed++;
            failCount++;
            this.batchRefreshProgress.set({ completed, total: selected.length });
            processNext(index + 1);
          },
        });
    };

    processNext(0);
  }

  private confirmBlockWorker(): void {
    const worker = this.selectedWorker();
    if (!worker) return;

    this.isDialogLoading.set(true);
    this.operationsService
      .blockWorkerIP(worker.id, this.blockDays())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDialogLoading.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            this.showToast(
              'success',
              `Worker "${worker.name}" IP blocked for ${this.blockDays()} day(s).`,
            );
            this.closeDialog();
            this.clearWorkerSelection();
          } else {
            this.showToast('error', 'Failed to block worker IP.');
          }
        },
        error: () => {
          this.showToast('error', 'Failed to block worker IP.');
        },
      });
  }

  private confirmUnblockWorker(): void {
    const worker = this.selectedWorkerForUnblock();
    if (!worker) return;

    this.isDialogLoading.set(true);
    this.operationsService
      .unblockWorkerIP(worker.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDialogLoading.set(false)),
      )
      .subscribe({
        next: (success) => {
          if (success) {
            this.showToast(
              'success',
              `Worker "${worker.name}" IP block removed.`,
            );
            this.closeDialog();
          } else {
            this.showToast('error', 'Failed to unblock worker IP.');
          }
        },
        error: () => {
          this.showToast('error', 'Failed to unblock worker IP.');
        },
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOAST NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────

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

  public dismissToast(id: string): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UNSAVED CHANGES GUARD
  // ─────────────────────────────────────────────────────────────────────────

  public hasUnsavedChanges(): boolean {
    return this.dialogOpen();
  }

  public onWorkerDropdownBlur(): void {
    // Delay closing to allow click events to fire
    setTimeout(() => {
      this.workerDropdownOpen.set(false);
    }, 200);
  }

  public onWorkerInputFocus(): void {
    this.workerDropdownOpen.set(true);
  }
}
