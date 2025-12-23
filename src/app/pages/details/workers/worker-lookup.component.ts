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
import { combineLatest, switchMap, of } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../../components/breadcrumb/breadcrumb.component';
import { WorkerCardComponent } from '../../admin/workers/worker-card.component';
import { TranslatorService } from '../../../services/translator.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { HordeWorker } from '../../../types/horde-worker';

@Component({
  selector: 'app-worker-lookup',
  imports: [
    TranslocoPipe,
    BreadcrumbComponent,
    WorkerCardComponent,
    RouterLink,
  ],
  template: `
    <app-breadcrumb [items]="breadcrumbs()" />

    @if (loading()) {
      <div class="loading-container">
        <p class="text-body text-content-secondary">
          {{ 'details.workers.loading' | transloco }}
        </p>
      </div>
    } @else if (error()) {
      <div class="error-container">
        <p class="text-body text-red-600 dark:text-red-400">
          {{ error()! | transloco }}
        </p>
        <p class="text-body text-content-secondary mt-2">
          {{ 'details.workers.lookup.inactive_note' | transloco }}
        </p>
        <a routerLink="/details/workers" class="btn btn-secondary mt-4">
          {{ 'details.workers.back_to_list' | transloco }}
        </a>
      </div>
    } @else if (worker()) {
      <div class="worker-lookup-result">
        <app-worker-card [worker]="worker()!" viewMode="public" />
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkerLookupComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly workerService = inject(AdminWorkerService);

  private readonly params = toSignal(this.route.params, {
    initialValue: {} as Record<string, string>,
  });

  public readonly worker = signal<HordeWorker | null>(null);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);

  public readonly lookupType = computed<'id' | 'name'>(() => {
    return this.params()['workerId'] ? 'id' : 'name';
  });

  public readonly lookupValue = computed(() => {
    return this.params()['workerId'] ?? this.params()['workerName'] ?? '';
  });

  public readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    const items: BreadcrumbItem[] = [
      { label: 'details.title', route: '/details' },
      { label: 'details.tabs.workers', route: '/details/workers' },
    ];
    const w = this.worker();
    if (w) {
      items.push({ label: w.name, raw: true });
    } else if (this.lookupValue()) {
      items.push({ label: this.lookupValue(), raw: true });
    }
    return items;
  });

  ngOnInit(): void {
    combineLatest([
      this.translator.get('details.workers.lookup_title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([lookupTitle, appTitle]) => {
        this.title.setTitle(`${lookupTitle} | ${appTitle}`);
      });

    // Load worker when route changes
    this.route.params
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((params) => {
          const workerId = params['workerId'];
          const workerName = params['workerName'];

          this.loading.set(true);
          this.error.set(null);

          if (workerId) {
            return this.workerService.getWorker(workerId);
          } else if (workerName) {
            return this.workerService.getWorkerByName(workerName);
          }
          return of(null);
        }),
      )
      .subscribe((worker) => {
        this.worker.set(worker);
        this.loading.set(false);
        if (!worker) {
          this.error.set('details.workers.lookup.not_found');
        }
      });
  }
}
