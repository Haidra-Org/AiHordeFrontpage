import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, from, map, mergeMap, of } from 'rxjs';
import { AuthService } from '../../../../services/auth.service';
import { AdminWorkerService } from '../../../../services/admin-worker.service';
import { TeamService } from '../../../../services/team.service';
import { ToastService } from '../../../../services/toast.service';
import { HordeWorker, WorkerType } from '../../../../types/horde-worker';
import { Team } from '../../../../types/team';
import { WorkerCardComponent } from '../../../admin/workers/worker-card.component';
import { InfoTooltipComponent } from '../../../../components/info-tooltip/info-tooltip.component';
import { AdminDialogComponent } from '../../../../components/admin/admin-dialog/admin-dialog.component';
import { GlossaryService } from '../../../../services/glossary.service';
import { WORKERS_GLOSSARY_CONTEXT } from '../../../admin/workers/worker-icons';
import { IconComponent } from '../../../../components/icon/icon.component';

interface WorkerListItem {
  id: string;
  loading: boolean;
  failed: boolean;
  worker: HordeWorker | null;
}

@Component({
  selector: 'app-profile-workers',
  imports: [
    TranslocoPipe,
    WorkerCardComponent,
    InfoTooltipComponent,
    AdminDialogComponent,
    IconComponent,
  ],
  templateUrl: './profile-workers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileWorkersComponent {
  public readonly auth = inject(AuthService);
  private readonly workerService = inject(AdminWorkerService);
  private readonly teamService = inject(TeamService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly glossary = inject(GlossaryService);
  private readonly workerRequestConcurrency = 3;

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

  // Teams (needed for worker cards)
  public allTeams = signal<Team[]>([]);
  public loadingTeams = signal<boolean>(false);

  // Public workers toggle
  public publicWorkersDialogOpen = signal<boolean>(false);
  public publicWorkersNewValue = signal<boolean>(false);
  public publicWorkersSaving = signal<boolean>(false);

  // Computed filtered workers
  public filteredAndSortedWorkers = computed(() => {
    let result = this.userWorkers().filter((item) => item.worker !== null);

    const typeFilter = this.filterWorkerType();
    if (typeFilter !== 'all') {
      result = result.filter((item) => item.worker!.type === typeFilter);
    }

    const maintenanceFilter = this.filterMaintenance();
    if (maintenanceFilter === 'active') {
      result = result.filter((item) => item.worker!.online);
    } else if (maintenanceFilter === 'maintenance') {
      result = result.filter((item) => item.worker!.maintenance_mode);
    } else if (maintenanceFilter === 'offline') {
      result = result.filter((item) => !item.worker!.online);
    }

    const searchText = this.filterText().toLowerCase();
    if (searchText) {
      result = result.filter(
        (item) =>
          item.worker!.name.toLowerCase().includes(searchText) ||
          (item.worker!.id ?? '').toLowerCase().includes(searchText) ||
          (item.worker!.team?.name ?? '').toLowerCase().includes(searchText),
      );
    }

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

  constructor() {
    this.glossary.registerPageContext(WORKERS_GLOSSARY_CONTEXT);
    this.destroyRef.onDestroy(() => {
      this.glossary.clearPageContext('workers');
    });

    // Load workers and teams when user data arrives
    effect(() => {
      const user = this.auth.currentUser();
      if (!user) return;
      if (this.userWorkers().length === 0) {
        this.loadUserWorkers();
      }
      if (this.allTeams().length === 0) {
        this.loadAllTeams();
      }
    });
  }

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

  public onWorkerUpdated(): void {
    this.loadUserWorkers();
  }

  public onWorkerDeleted(workerId: string): void {
    this.userWorkers.update((workers) =>
      workers.filter((w) => w.id !== workerId),
    );
    this.toast.success('admin.workers.deletion_success', { transloco: true });
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

  // Public workers toggle
  public onPublicWorkersToggle(newValue: boolean): void {
    this.publicWorkersNewValue.set(newValue);
    this.publicWorkersDialogOpen.set(true);
  }

  public closePublicWorkersDialog(): void {
    this.publicWorkersDialogOpen.set(false);
  }

  public confirmPublicWorkersChange(): void {
    this.publicWorkersSaving.set(true);
    this.auth
      .updateProfile({ public_workers: this.publicWorkersNewValue() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.publicWorkersSaving.set(false);
        if (result.success) {
          this.publicWorkersDialogOpen.set(false);
          this.toast.success('profile.public_workers_success', {
            transloco: true,
          });
        } else {
          this.toast.error(result.error ?? 'Failed to update setting');
        }
      });
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
}
