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

/** One entry in the row of links that opens the areas of this page. */
interface DetailsTab {
  readonly path: string;
  readonly icon: string;
  readonly labelKey: string;
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
  ],
  templateUrl: './details.component.html',
  styleUrl: './details.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * The areas, in the order they are offered. Each one has its own address, so
   * the row is navigation and the open area reports itself with
   * aria-current="page" rather than as a selected tab.
   */
  public readonly tabs: readonly DetailsTab[] = [
    { path: 'workers', icon: 'server', labelKey: 'details.tabs.workers' },
    {
      path: 'models',
      icon: 'cube-transparent',
      labelKey: 'details.tabs.models',
    },
    { path: 'usage', icon: 'chart-bar', labelKey: 'details.tabs.usage_stats' },
    { path: 'styles', icon: 'paintbrush', labelKey: 'details.tabs.styles' },
    { path: 'users', icon: 'user-group', labelKey: 'details.tabs.users' },
    { path: 'teams', icon: 'users', labelKey: 'details.tabs.teams' },
    {
      path: 'leaderboard',
      icon: 'trophy',
      labelKey: 'details.tabs.leaderboard',
    },
  ];

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
