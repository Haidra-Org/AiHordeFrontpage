import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatorService } from '../../../services/translator.service';
import { TeamService } from '../../../services/team.service';
import { Team } from '../../../types/team';
import { FormatNumberPipe } from '../../../pipes/format-number.pipe';
import { EntityLookupComponent } from '../../../components/entity-lookup/entity-lookup.component';
import { extractUserId } from '../../../helper/user-parser';

@Component({
  selector: 'app-teams-list',
  imports: [TranslocoPipe, RouterLink, FormatNumberPipe, EntityLookupComponent],
  templateUrl: './teams-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamsListComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly teamService = inject(TeamService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Route parameters as signals. */
  private readonly params = toSignal(this.route.params, { initialValue: {} as Record<string, string> });

  /** Owner ID to filter by from route. */
  public readonly filterOwnerId = computed<string | null>(() => {
    return this.params()['ownerId'] ?? null;
  });

  /** Team ID to highlight from route. */
  public readonly highlightTeamId = computed<string | null>(() => {
    return this.params()['highlightTeamId'] ?? null;
  });

  /** Reference to highlighted team element for scrolling. */
  private readonly highlightedTeam = viewChild<ElementRef<HTMLElement>>('highlightedTeam');

  // State
  public teams = signal<Team[]>([]);
  public loading = signal<boolean>(true);
  public error = signal<string | null>(null);
  public searchText = signal<string>('');
  public sortBy = signal<'name' | 'workers' | 'kudos'>('kudos');
  public sortOrder = signal<'asc' | 'desc'>('desc');

  // Computed filtered and sorted teams
  public filteredTeams = computed(() => {
    let result = this.teams();

    // Filter by owner ID if specified
    const ownerId = this.filterOwnerId();
    if (ownerId) {
      result = result.filter((team) => {
        // Extract the numeric ID from the creator's username (format: "alias#id")
        const creatorId = extractUserId(team.creator);
        return creatorId !== null && creatorId.toString() === ownerId;
      });
    }

    // Filter by search text
    const search = this.searchText().toLowerCase().trim();
    if (search) {
      result = result.filter(
        (team) =>
          team.name?.toLowerCase().includes(search) ||
          team.info?.toLowerCase().includes(search) ||
          team.creator?.toLowerCase().includes(search),
      );
    }

    // Sort
    const sortField = this.sortBy();
    const order = this.sortOrder() === 'asc' ? 1 : -1;
    const highlightId = this.highlightTeamId();

    return [...result].sort((a, b) => {
      // Always put highlighted team first
      if (highlightId) {
        if (a.id === highlightId) return -1;
        if (b.id === highlightId) return 1;
      }

      switch (sortField) {
        case 'name':
          return (a.name ?? '').localeCompare(b.name ?? '') * order;
        case 'workers':
          return ((a.worker_count ?? 0) - (b.worker_count ?? 0)) * order;
        case 'kudos':
          return ((a.kudos ?? 0) - (b.kudos ?? 0)) * order;
        default:
          return 0;
      }
    });
  });

  /** Check if a team is highlighted (for styling). */
  public isTeamHighlighted(teamId: string | undefined): boolean {
    if (!teamId) return false;
    return this.highlightTeamId() === teamId;
  }

  /** Computed: whether the owner filter returned no results */
  public readonly ownerNotFound = computed(() => {
    const ownerId = this.filterOwnerId();
    if (!ownerId) return false;
    // Check if we have teams loaded but none match the owner filter
    return !this.loading() && this.teams().length > 0 && this.filteredTeams().length === 0;
  });

  constructor() {
    // Effect to scroll highlighted team into view after data loads
    effect(() => {
      const highlightId = this.highlightTeamId();
      const teams = this.filteredTeams();
      const teamEl = this.highlightedTeam();
      
      if (highlightId && teams.length > 0 && teamEl) {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          teamEl.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    });
  }

  ngOnInit(): void {
    // Set title
    combineLatest([
      this.translator.get('details.teams.title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([teamsTitle, appTitle]) => {
        this.title.setTitle(`${teamsTitle} | ${appTitle}`);
      });

    this.loadTeams();
  }

  private loadTeams(): void {
    this.loading.set(true);
    this.error.set(null);

    this.teamService
      .getTeams()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (teams) => {
          this.teams.set(teams);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load teams');
          this.loading.set(false);
        },
      });
  }

  public refresh(): void {
    this.loadTeams();
  }

  public onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchText.set(target.value);
  }

  public onSortChange(field: 'name' | 'workers' | 'kudos'): void {
    if (this.sortBy() === field) {
      // Toggle order
      this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortOrder.set('asc');
    }
  }

  public formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);

    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    return `${hours}h`;
  }

  /**
   * Handle team lookup search.
   */
  public onTeamSearch(value: string): void {
    const trimmed = value.trim();
    if (trimmed) {
      this.router.navigate(['/details/teams', trimmed]);
    }
  }

  /**
   * Clear the owner filter and return to the full teams list.
   */
  public clearOwnerFilter(): void {
    this.router.navigate(['/details/teams'], { replaceUrl: true });
  }

  /**
   * Clear the highlighted team and return to the teams list.
   * Uses replaceUrl so back button goes to previous page instead of re-highlighting.
   */
  public clearHighlight(): void {
    this.router.navigate(['/details/teams'], { replaceUrl: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
