import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
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
import { VolunteerCtaBannerComponent } from '../../components/volunteer-cta-banner/volunteer-cta-banner.component';

@Component({
  selector: 'app-details',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    VolunteerCtaBannerComponent,
  ],
  templateUrl: './details.component.html',
  styleUrl: './details.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

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
