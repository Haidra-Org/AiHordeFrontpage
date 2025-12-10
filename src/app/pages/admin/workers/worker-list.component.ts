import {
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { TranslatorService } from '../../../services/translator.service';
import { AuthService } from '../../../services/auth.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { HordeWorker, WorkerType } from '../../../types/horde-worker';
import { WorkerCardComponent } from './worker-card.component';

type SortKey = 'name' | 'performance' | 'bridge_agent' | 'uptime' | 'megapixelsteps_generated';
type SortOrder = 'asc' | 'desc';

@Component({
  selector: 'app-worker-list',
  standalone: true,
  imports: [
    TranslocoPipe,
    TranslocoModule,
    FormsModule,
    WorkerCardComponent,
  ],
  templateUrl: './worker-list.component.html',
  styleUrl: './worker-list.component.css',
})
export class WorkerListComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workerService = inject(AdminWorkerService);
  public readonly auth = inject(AuthService);

  // State
  public workers = signal<HordeWorker[]>([]);
  public loading = signal<boolean>(true);
  public filterText = signal<string>('');
  public workerType = signal<WorkerType>('image');
  public sortKey = signal<SortKey>('name');
  public sortOrder = signal<SortOrder>('asc');

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
          w.bridge_agent.toLowerCase().includes(filter)
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

  ngOnInit(): void {
    this.translator
      .get('admin.workers.title')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((workersTitle) => {
        this.translator.get('app_title').subscribe((appTitle) => {
          this.title.setTitle(`${workersTitle} | ${appTitle}`);
        });
      });

    this.loadWorkers();
  }

  private loadWorkers(): void {
    this.loading.set(true);
    this.workerService
      .getWorkers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((workers) => {
        this.workers.set(workers);
        this.loading.set(false);
      });
  }

  public refreshWorkers(): void {
    this.loadWorkers();
  }

  public onFilterChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filterText.set(target.value);
  }

  public onWorkerTypeChange(type: WorkerType): void {
    this.workerType.set(type);
    // Reset sort key if MPS generated is selected but not available for this type
    if (type !== 'image' && this.sortKey() === 'megapixelsteps_generated') {
      this.sortKey.set('name');
    }
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
}
