import {
  afterNextRender,
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
import { RouterLink } from '@angular/router';
import { combineLatest, firstValueFrom, map, merge, scan } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { DecimalPipe } from '@angular/common';
import { TranslatorService } from '../../../services/translator.service';
import { AiHordeService } from '../../../services/ai-horde.service';
import { AuthService } from '../../../services/auth.service';
import { LeaderboardUser } from '../../../types/leaderboard-user';

@Component({
  selector: 'app-kudos-leaderboard',
  imports: [TranslocoPipe, DecimalPipe, RouterLink],
  templateUrl: './kudos-leaderboard.component.html',
  styleUrl: './kudos-leaderboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KudosLeaderboardComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private static readonly PAGE_SIZE = 25;

  /** Loading state. */
  public readonly loading = signal(false);

  /** Number of pages loaded so far (for progressive loading). */
  public readonly pagesLoaded = signal(0);

  /** Total pages to load. */
  private static readonly TOTAL_PAGES = 4;

  /** Error message. */
  public readonly error = signal<string | null>(null);

  /** Leaderboard users. */
  public readonly users = signal<LeaderboardUser[]>([]);

  /** Total kudos of all displayed users. */
  public readonly totalKudos = computed(() => {
    return this.users().reduce((sum, user) => sum + user.kudos, 0);
  });

  /** Whether the user is logged in. */
  public readonly isLoggedIn = this.auth.isLoggedIn;

  /** Current user from auth. */
  public readonly currentUser = this.auth.currentUser;

  /** Loading state for rank search. */
  public readonly searchingRank = signal(false);

  /** User's rank result. */
  public readonly userRank = signal<number | null>(null);

  /** Whether rank search has been performed. */
  public readonly rankSearched = signal(false);

  /** Whether to show thank you message after rank search. */
  public readonly showThankYou = signal(false);

  constructor() {
    // Fetch leaderboard only in the browser after rendering completes.
    // This prevents stale prerendered data from appearing during static builds.
    afterNextRender(() => {
      this.loadLeaderboard();
    });
  }

  ngOnInit(): void {
    combineLatest([
      this.translator.get('details.leaderboard.title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([leaderboardTitle, appTitle]) => {
        this.title.setTitle(`${leaderboardTitle} | ${appTitle}`);
      });
  }

  public loadLeaderboard(): void {
    this.loading.set(true);
    this.error.set(null);
    this.users.set([]);
    this.pagesLoaded.set(0);

    // Create observables for each page with their page number attached
    const page1$ = this.aiHorde
      .getKudosLeaderboard(1, 25)
      .pipe(map((users) => ({ page: 1, users })));
    const page2$ = this.aiHorde
      .getKudosLeaderboard(2, 25)
      .pipe(map((users) => ({ page: 2, users })));
    const page3$ = this.aiHorde
      .getKudosLeaderboard(3, 25)
      .pipe(map((users) => ({ page: 3, users })));
    const page4$ = this.aiHorde
      .getKudosLeaderboard(4, 25)
      .pipe(map((users) => ({ page: 4, users })));

    // Merge all page requests - they will emit as they complete
    merge(page1$, page2$, page3$, page4$)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        // Accumulate results from all pages
        scan(
          (acc, result) => {
            acc.pages[result.page] = result.users;
            acc.loadedCount++;
            return acc;
          },
          {
            pages: {} as Record<number, LeaderboardUser[]>,
            loadedCount: 0,
          },
        ),
      )
      .subscribe({
        next: (accumulated) => {
          // Combine all loaded pages in order
          const allUsers: LeaderboardUser[] = [];
          for (let i = 1; i <= KudosLeaderboardComponent.TOTAL_PAGES; i++) {
            if (accumulated.pages[i]) {
              allUsers.push(...accumulated.pages[i]);
            }
          }
          this.users.set(allUsers);
          this.pagesLoaded.set(accumulated.loadedCount);

          // Stop loading indicator when all pages are loaded
          if (
            accumulated.loadedCount >= KudosLeaderboardComponent.TOTAL_PAGES
          ) {
            this.loading.set(false);
          }
        },
        error: () => {
          this.error.set('Failed to load kudos leaderboard');
          this.loading.set(false);
        },
      });
  }

  public async findMyRank(): Promise<void> {
    const user = this.currentUser();
    if (!user) return;

    this.searchingRank.set(true);
    this.userRank.set(null);
    this.rankSearched.set(false);
    this.showThankYou.set(false);

    try {
      const rank = await this.binarySearchRank(user.kudos, user.id);
      this.userRank.set(rank);
      this.rankSearched.set(true);
      this.showThankYou.set(true);
    } catch {
      this.userRank.set(null);
      this.rankSearched.set(true);
      this.showThankYou.set(false);
    } finally {
      this.searchingRank.set(false);
    }
  }

  /**
   * Binary search to find the user's rank based on their kudos.
   * Returns the 1-indexed rank position.
   */
  private async binarySearchRank(
    userKudos: number,
    userId: number,
  ): Promise<number> {
    // First, find an upper bound for the page range
    let lowPage = 1;
    let highPage = 1;

    // Exponentially find the upper bound
    let pageData = await firstValueFrom(
      this.aiHorde.getKudosLeaderboardPage(highPage),
    );
    while (pageData.length === KudosLeaderboardComponent.PAGE_SIZE) {
      const lastUserKudos = pageData[pageData.length - 1].kudos;
      if (lastUserKudos < userKudos) {
        // User is on a page before or at highPage
        break;
      }
      lowPage = highPage;
      highPage *= 2;
      pageData = await firstValueFrom(
        this.aiHorde.getKudosLeaderboardPage(highPage),
      );
    }

    // Binary search between lowPage and highPage
    while (lowPage < highPage) {
      const midPage = Math.floor((lowPage + highPage) / 2);
      pageData = await firstValueFrom(
        this.aiHorde.getKudosLeaderboardPage(midPage),
      );

      if (pageData.length === 0) {
        // Page is empty, search lower
        highPage = midPage;
        continue;
      }

      const firstUserKudos = pageData[0].kudos;
      const lastUserKudos = pageData[pageData.length - 1].kudos;

      if (userKudos > firstUserKudos) {
        // User has more kudos than everyone on this page, search earlier pages
        highPage = midPage;
      } else if (userKudos < lastUserKudos) {
        // User has fewer kudos than everyone on this page, search later pages
        lowPage = midPage + 1;
      } else {
        // User's kudos falls within this page's range
        lowPage = midPage;
        highPage = midPage;
      }
    }

    // Now search within the found page to find exact position
    pageData = await firstValueFrom(
      this.aiHorde.getKudosLeaderboardPage(lowPage),
    );

    // Find user by ID in this page
    for (let i = 0; i < pageData.length; i++) {
      if (pageData[i].id === userId) {
        return (lowPage - 1) * KudosLeaderboardComponent.PAGE_SIZE + i + 1;
      }
    }

    // If not found by ID, search nearby pages (user might be on adjacent page due to ties)
    // Check previous page
    if (lowPage > 1) {
      const prevPageData = await firstValueFrom(
        this.aiHorde.getKudosLeaderboardPage(lowPage - 1),
      );
      for (let i = 0; i < prevPageData.length; i++) {
        if (prevPageData[i].id === userId) {
          return (lowPage - 2) * KudosLeaderboardComponent.PAGE_SIZE + i + 1;
        }
      }
    }

    // Check next page
    const nextPageData = await firstValueFrom(
      this.aiHorde.getKudosLeaderboardPage(lowPage + 1),
    );
    for (let i = 0; i < nextPageData.length; i++) {
      if (nextPageData[i].id === userId) {
        return lowPage * KudosLeaderboardComponent.PAGE_SIZE + i + 1;
      }
    }

    // Fallback: estimate based on kudos position
    for (let i = 0; i < pageData.length; i++) {
      if (pageData[i].kudos <= userKudos) {
        return (lowPage - 1) * KudosLeaderboardComponent.PAGE_SIZE + i + 1;
      }
    }

    return (
      (lowPage - 1) * KudosLeaderboardComponent.PAGE_SIZE + pageData.length + 1
    );
  }

  public formatKudos(kudos: number): string {
    if (kudos >= 1_000_000_000) {
      return (kudos / 1_000_000_000).toFixed(1) + 'B';
    } else if (kudos >= 1_000_000) {
      return (kudos / 1_000_000).toFixed(1) + 'M';
    } else if (kudos >= 1_000) {
      return (kudos / 1_000).toFixed(1) + 'K';
    }
    return kudos.toLocaleString();
  }
}
