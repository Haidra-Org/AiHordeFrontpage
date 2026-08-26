import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
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
        @if (styleCount() > 0) {
          <span class="text-secondary text-sm">({{ styleCount() }})</span>
        }
      </h3>
      <app-profile-styles-list />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileStylesComponent {
  public readonly auth = inject(AuthService);

  public readonly styleCount = computed(
    () => this.auth.currentUser()?.styles?.length ?? 0,
  );
}
