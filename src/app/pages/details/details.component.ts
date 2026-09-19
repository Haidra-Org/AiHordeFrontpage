import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { StickyHeaderDirective } from '../../helper/sticky-header.directive';
import { VolunteerCtaBannerComponent } from '../../components/volunteer-cta-banner/volunteer-cta-banner.component';
import { IconComponent } from '../../components/icon/icon.component';
import { PageIntroComponent } from '../../components/page-intro/page-intro.component';
import { setPageMeta } from '../../helper/page-meta';

/** One entry in the row of links that opens the areas of this page. */
interface DetailsTab {
  readonly path: string;
  readonly icon: string;
  readonly labelKey: string;
  /** The `help.<key>.*` entry whose lead and body head the area. */
  readonly pageKey: string;
  readonly readMoreLink?: string;
  readonly prose?: boolean;
}

@Component({
  selector: 'app-details',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    VolunteerCtaBannerComponent,
    StickyHeaderDirective,
    IconComponent,
    PageIntroComponent,
  ],
  templateUrl: './details.component.html',
  styleUrl: './details.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    // The areas underneath are one page to a reader arriving from outside, and
    // a record page such as a model's replaces this with its own subject.
    setPageMeta({
      titleKey: 'details.title',
      descriptionKey: 'details.meta_description',
    });
  }

  /**
   * The areas, in the order they are offered. Each one has its own address, so
   * the row is navigation and the open area reports itself with
   * aria-current="page" rather than as a selected tab.
   */
  public readonly tabs: readonly DetailsTab[] = [
    {
      path: 'workers',
      icon: 'server',
      labelKey: 'details.tabs.workers',
      pageKey: 'workers',
      readMoreLink: '/contribute/workers',
      prose: true,
    },
    {
      path: 'models',
      icon: 'cube-transparent',
      labelKey: 'details.tabs.models',
      pageKey: 'models',
    },
    {
      path: 'usage',
      icon: 'chart-bar',
      labelKey: 'details.tabs.usage_stats',
      pageKey: 'stats',
    },
    {
      path: 'styles',
      icon: 'paintbrush',
      labelKey: 'details.tabs.styles',
      pageKey: 'styles',
    },
    {
      path: 'users',
      icon: 'user-group',
      labelKey: 'details.tabs.users',
      pageKey: 'users',
    },
    {
      path: 'teams',
      icon: 'users',
      labelKey: 'details.tabs.teams',
      pageKey: 'teams',
    },
    {
      path: 'leaderboard',
      icon: 'trophy',
      labelKey: 'details.tabs.leaderboard',
      pageKey: 'leaderboard',
    },
  ];

  /** The area on screen, read off the first path segment under /details. */
  public readonly activeTab = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => this.tabFor(this.router.url)),
    ),
    { initialValue: null as DetailsTab | null },
  );

  private tabFor(url: string): DetailsTab | null {
    const segment = url.replace(/^\/details\/?/, '').split(/[/?#]/)[0];
    return this.tabs.find((tab) => tab.path === segment) ?? null;
  }

  public readonly headingKey = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let child = this.route.firstChild;
        while (child?.firstChild) {
          child = child.firstChild;
        }
        return (
          (child?.snapshot?.data?.['headingKey'] as string) ?? 'details.title'
        );
      }),
    ),
    { initialValue: 'details.title' },
  );
}
