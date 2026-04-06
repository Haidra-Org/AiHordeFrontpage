import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatorService } from '../../../services/translator.service';
import { WorkerListComponent } from '../../admin/workers/worker-list.component';
import { PageIntroComponent } from '../../../components/page-intro/page-intro.component';
import { WorkerType } from '../../../types/horde-worker';
import { setPageTitle } from '../../../helper/page-title';

@Component({
  selector: 'app-public-workers',
  imports: [WorkerListComponent, PageIntroComponent],
  templateUrl: './public-workers.component.html',
  styleUrl: './public-workers.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicWorkersComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Route parameters as signals. */
  private readonly params = toSignal(this.route.params, {
    initialValue: {} as Record<string, string>,
  });

  /** Initial worker type from route (image, text, interrogation). */
  public readonly initialWorkerType = computed<WorkerType | null>(() => {
    const type = this.params()['workerType'] as string | undefined;
    if (type === 'image' || type === 'text' || type === 'interrogation') {
      return type;
    }
    return null;
  });

  /** Worker ID to highlight/filter from route. */
  public readonly highlightWorkerId = computed<string | null>(() => {
    return (this.params()['workerId'] as string | undefined) ?? null;
  });

  /** Owner ID to filter by from route. */
  public readonly filterOwnerId = computed<string | null>(() => {
    return (this.params()['ownerId'] as string | undefined) ?? null;
  });

  ngOnInit(): void {
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'details.workers.title',
    );
  }

  /**
   * Handle worker type changes from child component and update URL.
   */
  public onWorkerTypeChange(type: WorkerType): void {
    void this.router.navigate(['/details/workers', type], {
      replaceUrl: true,
    });
  }

  /**
   * Handle worker lookup search.
   */
  public onWorkerSearch(value: string): void {
    const trimmed = value.trim();
    // Check if it looks like a UUID (worker ID)
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(trimmed)) {
      void this.router.navigate(['/details/workers/id', trimmed]);
    } else {
      // Treat as worker name
      void this.router.navigate(['/details/workers/name', trimmed]);
    }
  }

  /**
   * Clear the owner filter and return to the full workers list.
   */
  public clearOwnerFilter(): void {
    void this.router.navigate(['/details/workers'], { replaceUrl: true });
  }

  /**
   * Clear the highlighted worker and return to the workers list.
   * Uses replaceUrl so back button goes to previous page instead of re-highlighting.
   */
  public clearHighlight(): void {
    const currentType = this.initialWorkerType();
    if (currentType) {
      void this.router.navigate(['/details/workers', currentType], {
        replaceUrl: true,
      });
    } else {
      void this.router.navigate(['/details/workers'], { replaceUrl: true });
    }
  }
}
