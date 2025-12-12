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
import { RouterLink } from '@angular/router';
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
import { FormatNumberPipe } from '../../pipes/format-number.pipe';
import { WorkerCardComponent } from '../admin/workers/worker-card.component';
import { HordeWorker, WorkerType } from '../../types/horde-worker';
import { SharedKeyListComponent } from '../../components/shared-key/shared-key-list/shared-key-list.component';
import { ProfileStylesListComponent } from '../../components/profile-styles-list/profile-styles-list.component';
import { KudosBreakdownPanelComponent } from '../../components/kudos-breakdown-panel/kudos-breakdown-panel.component';
import { UnitTooltipComponent } from '../../components/unit-tooltip/unit-tooltip.component';
import { UnitConversionService } from '../../services/unit-conversion.service';

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
  public readonly auth = inject(AuthService);
  public readonly units = inject(UnitConversionService);
  private readonly workerRequestConcurrency = 3;

  public loginError = signal<boolean>(false);

  // Tab state
  public activeTab = signal<
    'profile' | 'records' | 'workers' | 'styles' | 'shared-keys'
  >('profile');

  // Workers state
  public userWorkers = signal<WorkerListItem[]>([]);
  public loadingWorkers = signal<boolean>(false);
  public workersExpanded = signal<boolean>(false);
  
  // Worker filters
  public filterText = signal<string>('');
  public filterWorkerType = signal<WorkerType | 'all'>('all');
  public filterMaintenance = signal<'all' | 'active' | 'maintenance' | 'offline'>('all');

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
      result = result.filter(
        (item) =>
          item.worker!.online,
      );
    } else if (maintenanceFilter === 'maintenance') {
      result = result.filter(
        (item) =>
          item.worker!.maintenance_mode,
      );
    } else if (maintenanceFilter === 'offline') {
      result = result.filter(
        (item) =>
          !item.worker!.online,
      );
    }

    // Filter by name (partial matching)
    const searchText = this.filterText().toLowerCase();
    if (searchText) {
      result = result.filter(
        (item) =>
          item.worker!.name.toLowerCase().includes(searchText) ||
          (item.worker!.id ?? '').toLowerCase().includes(searchText),
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
    tab: 'profile' | 'records' | 'workers' | 'styles' | 'shared-keys',
  ): void {
    this.activeTab.set(tab);

    // Load workers when switching to workers tab
    if (tab === 'workers' && this.userWorkers().length === 0) {
      this.loadUserWorkers();
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
  
  public onFilterTextChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filterText.set(target.value);
  }
  
  public onFilterTypeChange(type: WorkerType | 'all'): void {
    this.filterWorkerType.set(type);
  }
  
  public onFilterMaintenanceChange(status: 'all' | 'active' | 'maintenance' | 'offline'): void {
    this.filterMaintenance.set(status);
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
