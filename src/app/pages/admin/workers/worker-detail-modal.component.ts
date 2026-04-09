import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HordeWorker } from '../../../types/horde-worker';
import { Team } from '../../../types/team';
import { WorkerCardComponent } from './worker-card.component';

@Component({
  selector: 'app-worker-detail-modal',
  imports: [WorkerCardComponent, DialogModule],
  template: `
    <ng-template #dialogTpl>
      @if (worker(); as w) {
        <div class="worker-detail-modal-header">
          <button
            type="button"
            class="btn-icon"
            (click)="close()"
            aria-label="Close"
          >
            <span class="text-lg" aria-hidden="true">&times;</span>
          </button>
        </div>
        <app-worker-card
          [worker]="w"
          [isModerator]="isModerator()"
          [viewMode]="viewMode()"
          [availableTeams]="availableTeams()"
          (workerUpdated)="workerUpdated.emit()"
          (workerDeleted)="onWorkerDeleted($event)"
        />
      }
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkerDetailModalComponent implements OnDestroy {
  private readonly cdkDialog = inject(Dialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogTpl =
    viewChild.required<TemplateRef<unknown>>('dialogTpl');
  private cdkDialogRef: DialogRef | null = null;
  private suppressClosedEmit = false;

  public open = input(false);
  public worker = input<HordeWorker | null>(null);
  public isModerator = input(false);
  public viewMode = input<'admin' | 'public'>('admin');
  public availableTeams = input<Team[]>([]);

  public closed = output<void>();
  public workerUpdated = output<void>();
  public workerDeleted = output<string>();

  constructor() {
    effect(() => {
      const shouldOpen = this.open();
      const selectedWorker = this.worker();

      if (shouldOpen && selectedWorker) {
        this.openDialog();
        return;
      }

      if (!shouldOpen) {
        this.closeDialog(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.closeDialog(false);
  }

  public close(): void {
    this.closeDialog(true);
  }

  public onWorkerDeleted(workerId: string): void {
    this.workerDeleted.emit(workerId);
    this.close();
  }

  private openDialog(): void {
    if (this.cdkDialogRef) return;

    this.cdkDialogRef = this.cdkDialog.open(this.dialogTpl(), {
      hasBackdrop: true,
      backdropClass: 'modal-cdk-backdrop',
      panelClass: [
        'modal-panel',
        'modal-panel--xl',
        'worker-detail-modal-panel',
      ],
      maxWidth: '56rem',
      ariaModal: true,
    });

    this.cdkDialogRef.closed
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.cdkDialogRef = null;
        const shouldEmitClosed = !this.suppressClosedEmit;
        this.suppressClosedEmit = false;
        if (shouldEmitClosed) {
          this.closed.emit();
        }
      });
  }

  private closeDialog(emitClosed: boolean): void {
    if (!this.cdkDialogRef) return;

    this.suppressClosedEmit = !emitClosed;
    this.cdkDialogRef.close();
  }
}
