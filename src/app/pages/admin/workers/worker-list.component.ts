import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
  computed,
  input,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { TranslatorService } from '../../../services/translator.service';
import { AuthService } from '../../../services/auth.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { HordeWorker, WorkerType } from '../../../types/horde-worker';
import { WorkerCardComponent } from './worker-card.component';
import { combineLatest } from 'rxjs';
import { finalize } from 'rxjs/operators';

type SortKey =
  | 'name'
  | 'performance'
  | 'bridge_agent'
  | 'uptime'
  | 'megapixelsteps_generated';
type SortOrder = 'asc' | 'desc';

@Component({
  selector: 'app-worker-list',
  standalone: true,
  imports: [
    TranslocoPipe,
    TranslocoModule,
    FormsModule,
    WorkerCardComponent,
    DecimalPipe,
  ],
  templateUrl: './worker-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkerListComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workerService = inject(AdminWorkerService);
  public readonly auth = inject(AuthService);
  public viewMode = input<'admin' | 'public'>('admin');
  public titleKey = input<string>('admin.workers.title');
  public setPageTitle = input<boolean>(true);

  // State
  public workers = signal<HordeWorker[]>([]);
  public loading = signal<boolean>(true);
  public errorMessage = signal<string | null>(null);
  public filterText = signal<string>('');
  public workerType = signal<WorkerType>('image');
  public sortKey = signal<SortKey>('name');
  public sortOrder = signal<SortOrder>('asc');
  public workerVersionsExpanded = signal<boolean>(false);
  public statisticsCollapsed = signal<boolean>(true);
  public deletionSuccessMessage = signal<boolean>(false);

  public setWorkerType(type: WorkerType): void {
    if (this.workerType() === type) return;
    this.workerType.set(type);
    this.filterText.set('');
    // Reset sort key if MPS generated is selected but not available for this type
    if (type !== 'image' && this.sortKey() === 'megapixelsteps_generated') {
      this.sortKey.set('name');
    }
  }

  // Computed filtered and sorted workers
  public filteredWorkers = computed(() => {
    let result = this.workers().filter((w) => w.type === this.workerType());

    // Apply text filter
    const filter = this.filterText().toLowerCase();
    if (filter) {
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(filter) ||
          (w.owner ?? '').toLowerCase().includes(filter) ||
          w.id.toLowerCase().includes(filter) ||
          (w.bridge_agent ?? '').toLowerCase().includes(filter),
      );
    }

    // Sort
    const key = this.sortKey();
    const order = this.sortOrder();

    result = [...result].sort((a, b) => {
      let aVal: string | number = a[key] as string | number;
      let bVal: string | number = b[key] as string | number;

      // Handle performance as number
      if (key === 'performance') {
        aVal = parseFloat(a.performance) || 0;
        bVal = parseFloat(b.performance) || 0;
      }

      // Handle optional fields
      if (key === 'megapixelsteps_generated') {
        aVal = a.megapixelsteps_generated ?? 0;
        bVal = b.megapixelsteps_generated ?? 0;
      }

      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
        return order === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // Number comparison
      return order === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return result;
  });

  // Statistics computed signals
  public totalWorkers = computed(() => this.filteredWorkers().length);

  public totalThreads = computed(() =>
    this.filteredWorkers().reduce((sum, w) => sum + w.threads, 0),
  );

  public totalPerformance = computed(() => {
    const workers = this.filteredWorkers();
    if (workers.length === 0) return 0;

    const total = workers.reduce(
      (sum, w) => sum + (parseFloat(w.performance) || 0),
      0,
    );

    // For interrogation workers, return mean average
    if (this.workerType() === 'interrogation') {
      return total / workers.length;
    }

    // For image and text workers, return total
    return total;
  });

  public performanceLabel = computed(() => {
    if (this.workerType() === 'interrogation') {
      return 'seconds per form';
    }
    return this.workerType() === 'image' ? 'MPS/S' : 'tokens/s';
  });

  public workerVersions = computed(() => {
    const versions = new Map<string, number>();
    this.filteredWorkers().forEach((w) => {
      const agent = w.bridge_agent || 'Unknown';
      versions.set(agent, (versions.get(agent) || 0) + 1);
    });
    return Array.from(versions.entries())
      .map(([version, count]) => {
        const parsed = this.parseWorkerVersion(version);
        return { version, count, parsed };
      })
      .sort((a, b) => b.count - a.count);
  });

  private parseWorkerVersion(versionString: string): {
    displayName: string;
    url: string | null;
  } {
    // Split on first two colons: "Worker Name:Version:URL"
    const parts = versionString.split(':');

    if (parts.length >= 3) {
      const name = parts[0].trim();
      const version = parts[1].trim();
      const url = parts.slice(2).join(':').trim(); // Rejoin in case URL has colons

      return {
        displayName: `${name} v${version}`,
        url: url || null,
      };
    } else if (parts.length === 2) {
      const name = parts[0].trim();
      const version = parts[1].trim();
      return {
        displayName: `${name} v${version}`,
        url: null,
      };
    }

    // Fallback for strings that don't match the pattern
    return {
      displayName: versionString,
      url: null,
    };
  }

  public capabilityStats = computed(() => {
    const workers = this.filteredWorkers();
    const capabilities: {
      name: string;
      totalPerformance: number;
      workerCount: number;
    }[] = [];

    if (this.workerType() === 'image') {
      const img2img = { name: 'img2img', totalPerformance: 0, workerCount: 0 };
      const painting = {
        name: 'painting',
        totalPerformance: 0,
        workerCount: 0,
      };
      const postProcessing = {
        name: 'post-processing',
        totalPerformance: 0,
        workerCount: 0,
      };
      const lora = { name: 'lora', totalPerformance: 0, workerCount: 0 };
      const controlnet = {
        name: 'controlnet',
        totalPerformance: 0,
        workerCount: 0,
      };
      const sdxlControlnet = {
        name: 'sdxl_controlnet',
        totalPerformance: 0,
        workerCount: 0,
      };

      workers.forEach((w) => {
        const performance = parseFloat(w.performance) || 0;
        if (w.img2img) {
          img2img.totalPerformance += performance;
          img2img.workerCount++;
        }
        if (w.painting) {
          painting.totalPerformance += performance;
          painting.workerCount++;
        }
        if (w['post-processing']) {
          postProcessing.totalPerformance += performance;
          postProcessing.workerCount++;
        }
        if (w.lora) {
          lora.totalPerformance += performance;
          lora.workerCount++;
        }
        if (w.controlnet) {
          controlnet.totalPerformance += performance;
          controlnet.workerCount++;
        }
        if (w.sdxl_controlnet) {
          sdxlControlnet.totalPerformance += performance;
          sdxlControlnet.workerCount++;
        }
      });

      return [
        img2img,
        painting,
        postProcessing,
        lora,
        controlnet,
        sdxlControlnet,
      ].filter((c) => c.workerCount > 0);
    }

    return capabilities;
  });

  ngOnInit(): void {
    if (this.setPageTitle()) {
      combineLatest([
        this.translator.get(this.titleKey()),
        this.translator.get('app_title'),
      ])
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(([workersTitle, appTitle]) => {
          this.title.setTitle(`${workersTitle} | ${appTitle}`);
        });
    }

    this.loadWorkers();
  }

  private loadWorkers(): void {
    this.errorMessage.set(null);
    this.loading.set(true);
    this.workerService
      .getWorkers()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (workers) => {
          this.workers.set(workers);
        },
        error: () => {
          this.errorMessage.set('Failed to load workers.');
          this.workers.set([]);
        },
      });
  }

  public refreshWorkers(): void {
    this.loadWorkers();
  }

  public onFilterChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filterText.set(target.value);
  }

  public onSortKeyChange(key: SortKey): void {
    this.sortKey.set(key);
  }

  public toggleSortOrder(): void {
    this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
  }

  public onWorkerUpdated(): void {
    this.loadWorkers();
  }

  public onWorkerDeleted(workerId: string): void {
    // Remove worker from the list immediately
    this.workers.update((workers) =>
      workers.filter((w) => w.id !== workerId),
    );
    // Show success toast
    this.deletionSuccessMessage.set(true);
    setTimeout(() => this.deletionSuccessMessage.set(false), 5000);
  }

  public toggleWorkerVersions(): void {
    this.workerVersionsExpanded.set(!this.workerVersionsExpanded());
  }

  public toggleStatistics(): void {
    this.statisticsCollapsed.set(!this.statisticsCollapsed());
  }

  public clearError(): void {
    this.errorMessage.set(null);
  }
}
