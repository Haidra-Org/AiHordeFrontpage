import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../../services/auth.service';
import { ProfileStylesListComponent } from '../../../../components/profile-styles-list/profile-styles-list.component';

@Component({
  selector: 'app-profile-styles',
  imports: [ProfileStylesListComponent, TranslocoPipe],
  template: `
    <div
      class="card card-bg-primary card-full card-spaced profile-styles-shell"
    >
      <h3 class="heading-card">
        {{ 'profile.tabs.styles' | transloco }}
        @if (
          auth.currentUser()!.styles && auth.currentUser()!.styles!.length > 0
        ) {
          <span class="text-secondary text-sm"
            >({{ auth.currentUser()!.styles!.length }})</span
          >
        }
      </h3>
      <app-profile-styles-list />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileStylesComponent {
  public readonly auth = inject(AuthService);
}
