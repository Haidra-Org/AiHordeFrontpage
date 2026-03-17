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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../../services/auth.service';
import { AdminWorkerService } from '../../../../services/admin-worker.service';
import { TeamService } from '../../../../services/team.service';
import { ToastService } from '../../../../services/toast.service';
import {
  Team,
  CreateTeamRequest,
  UpdateTeamRequest,
} from '../../../../types/team';
import { HordeWorker } from '../../../../types/horde-worker';
import { FormatNumberPipe } from '../../../../pipes/format-number.pipe';
import { catchError, from, map, mergeMap, of } from 'rxjs';
import { extractApiError } from '../../../../helper/extract-api-error';

interface WorkerListItem {
  id: string;
  loading: boolean;
  failed: boolean;
  worker: HordeWorker | null;
}

@Component({
  selector: 'app-profile-teams',
  imports: [RouterLink, TranslocoPipe, FormatNumberPipe],
  templateUrl: './profile-teams.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileTeamsComponent {
  public readonly auth = inject(AuthService);
  private readonly workerService = inject(AdminWorkerService);
  private readonly teamService = inject(TeamService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workerRequestConcurrency = 3;

  // Teams state
  public allTeams = signal<Team[]>([]);
  public loadingTeams = signal<boolean>(false);

  // Team dialog
  public teamDialogOpen = signal<boolean>(false);
  public teamDialogType = signal<'create' | 'edit' | 'delete'>('create');
  public editingTeam = signal<Team | null>(null);
  public teamFormName = signal<string>('');
  public teamFormInfo = signal<string>('');
  public teamSaving = signal<boolean>(false);
  public teamError = signal<string | null>(null);

  // Workers (needed for getUserWorkerTeams)
  public userWorkers = signal<WorkerListItem[]>([]);

  // Computed teams
  public readonly userCreatedTeams = computed(() => {
    const currentUser = this.auth.currentUser();
    if (!currentUser) return [];
    return this.allTeams().filter(
      (team) => team.creator === currentUser.username,
    );
  });

  public readonly userWorkerTeams = computed(() => {
    const currentUser = this.auth.currentUser();
    if (!currentUser) return [];

    const workerTeamIds = new Set<string>();
    for (const workerItem of this.userWorkers()) {
      if (workerItem.worker?.team?.id) {
        workerTeamIds.add(workerItem.worker.team.id);
      }
    }

    const createdTeamIds = new Set(this.userCreatedTeams().map((t) => t.id));
    return this.allTeams().filter(
      (team) =>
        team.id && workerTeamIds.has(team.id) && !createdTeamIds.has(team.id),
    );
  });

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (!user) return;
      if (this.allTeams().length === 0) {
        this.loadAllTeams();
      }
      if (this.userWorkers().length === 0) {
        this.loadUserWorkers();
      }
    });
  }

  public canCreateTeam(): boolean {
    return this.auth.currentUser()?.trusted === true;
  }

  public canEditTeam(team: Team): boolean {
    const currentUser = this.auth.currentUser();
    if (!currentUser) return false;
    if (currentUser.moderator) return true;
    return team.creator === currentUser.username;
  }

  public openCreateTeamDialog(): void {
    if (!this.canCreateTeam()) return;
    this.teamDialogType.set('create');
    this.editingTeam.set(null);
    this.teamFormName.set('');
    this.teamFormInfo.set('');
    this.teamError.set(null);
    this.teamDialogOpen.set(true);
  }

  public openEditTeamDialog(team: Team): void {
    if (!this.canEditTeam(team)) return;
    this.teamDialogType.set('edit');
    this.editingTeam.set(team);
    this.teamFormName.set(team.name ?? '');
    this.teamFormInfo.set(team.info ?? '');
    this.teamError.set(null);
    this.teamDialogOpen.set(true);
  }

  public openDeleteTeamDialog(team: Team): void {
    if (!this.canEditTeam(team)) return;
    this.teamDialogType.set('delete');
    this.editingTeam.set(team);
    this.teamError.set(null);
    this.teamDialogOpen.set(true);
  }

  public closeTeamDialog(): void {
    this.teamDialogOpen.set(false);
  }

  public onTeamNameChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.teamFormName.set(target.value);
  }

  public onTeamInfoChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.teamFormInfo.set(target.value);
  }

  public isTeamFormValid(): boolean {
    const name = this.teamFormName().trim();
    return name.length >= 3 && name.length <= 100;
  }

  public confirmTeamSave(): void {
    if (!this.isTeamFormValid()) return;

    this.teamSaving.set(true);
    this.teamError.set(null);

    const name = this.teamFormName().trim();
    const info = this.teamFormInfo().trim() || undefined;

    if (this.teamDialogType() === 'create') {
      const payload: CreateTeamRequest = { name, info };
      this.teamService
        .createTeam(payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.teamSaving.set(false);
            this.teamDialogOpen.set(false);
            this.toast.success('teams.success', { transloco: true });
            this.loadAllTeams();
          },
          error: (err: unknown) => {
            this.teamSaving.set(false);
            this.teamError.set(extractApiError(err, 'Failed to create team'));
          },
        });
    } else if (this.teamDialogType() === 'edit') {
      const teamId = this.editingTeam()?.id;
      if (!teamId) return;

      const payload: UpdateTeamRequest = { name, info };
      this.teamService
        .updateTeam(teamId, payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.teamSaving.set(false);
            this.teamDialogOpen.set(false);
            this.toast.success('teams.success', { transloco: true });
            this.loadAllTeams();
          },
          error: (err: unknown) => {
            this.teamSaving.set(false);
            this.teamError.set(extractApiError(err, 'Failed to update team'));
          },
        });
    }
  }

  public confirmTeamDelete(): void {
    const teamId = this.editingTeam()?.id;
    if (!teamId) return;

    this.teamSaving.set(true);
    this.teamError.set(null);

    this.teamService
      .deleteTeam(teamId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.teamSaving.set(false);
          this.teamDialogOpen.set(false);
          this.toast.success('teams.success', { transloco: true });
          this.loadAllTeams();
        },
        error: (err: unknown) => {
          this.teamSaving.set(false);
          this.teamError.set(extractApiError(err, 'Failed to delete team'));
        },
      });
  }

  public refreshTeams(): void {
    this.loadAllTeams();
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

  private loadUserWorkers(): void {
    const user = this.auth.currentUser();
    const workerIds = user?.worker_ids ?? [];
    if (workerIds.length === 0) return;

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
      });
  }
}
