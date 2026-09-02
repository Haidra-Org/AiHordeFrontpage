import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { formatUptime } from '../../../helper/account-age';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, map, switchMap, tap } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
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
  private readonly transloco = inject(TranslocoService);
  private readonly teamService = inject(TeamService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  // State
  public team = signal<Team | null>(null);
  public teamId = signal<string | null>(null);
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
          const teamId = params['teamId'] as string | undefined;
          if (!teamId) {
            this.error.set('Missing team ID');
            this.loading.set(false);
            return EMPTY;
          }
          this.teamId.set(teamId);
          this.loading.set(true);
          this.error.set(null);
          return this.teamService.getTeam(teamId);
        }),
        tap((team) => {
          this.team.set(team);
          this.loading.set(false);
        }),
        switchMap((team) =>
          team
            ? this.translator
                .get('app_title')
                .pipe(map((appTitle) => ({ team, appTitle })))
            : EMPTY,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ team, appTitle }) => {
          this.title.setTitle(`${team.name} | ${appTitle}`);
        },
        error: () => {
          this.error.set('Failed to load team');
          this.loading.set(false);
        },
      });
  }

  public formatUptime(seconds: number): string {
    return formatUptime(this.transloco, seconds);
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
