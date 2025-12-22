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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, switchMap } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatorService } from '../../../services/translator.service';
import { TeamService } from '../../../services/team.service';
import { Team } from '../../../types/team';
import { FormatNumberPipe } from '../../../pipes/format-number.pipe';

@Component({
  selector: 'app-team-detail',
  imports: [TranslocoPipe, RouterLink, FormatNumberPipe],
  templateUrl: './team-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamDetailComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly teamService = inject(TeamService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  // State
  public team = signal<Team | null>(null);
  public loading = signal<boolean>(true);
  public error = signal<string | null>(null);

  // Computed online workers
  public onlineWorkerCount = computed(() => {
    const team = this.team();
    if (!team?.workers) return 0;
    return team.workers.filter((w) => w.online).length;
  });

  ngOnInit(): void {
    this.route.params
      .pipe(
        switchMap((params) => {
          const teamId = params['teamId'];
          this.loading.set(true);
          this.error.set(null);
          return this.teamService.getTeam(teamId);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (team) => {
          this.team.set(team);
          this.loading.set(false);

          if (team) {
            // Set title
            combineLatest([
              this.translator.get('app_title'),
            ]).subscribe(([appTitle]) => {
              this.title.setTitle(`${team.name} | ${appTitle}`);
            });
          }
        },
        error: () => {
          this.error.set('Failed to load team');
          this.loading.set(false);
        },
      });
  }

  public formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Get the link to the creator's user profile.
   * Extracts the user ID from the "username#id" format.
   */
  public getCreatorLink(): string[] {
    const team = this.team();
    if (!team?.creator) return ['/details/users'];

    const creatorParts = team.creator.split('#');
    if (creatorParts.length >= 2) {
      const creatorId = creatorParts[creatorParts.length - 1];
      return ['/details/users', creatorId];
    }
    return ['/details/users'];
  }
}
