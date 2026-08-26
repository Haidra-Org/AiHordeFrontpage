import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../../services/auth.service';
import { IconComponent } from '../../../../components/icon/icon.component';
import { UserRecordsPanelComponent } from '../../../../components/user-records-panel/user-records-panel.component';

@Component({
  selector: 'app-profile-records',
  imports: [
    RouterLink,
    TranslocoPipe,
    IconComponent,
    UserRecordsPanelComponent,
  ],
  template: `
    <div class="card card-bg-primary card-full card-spaced">
      @if (auth.isLoading()) {
        <app-user-records-panel [loading]="true" />
      } @else if (hasRecords()) {
        <app-user-records-panel
          [loading]="false"
          [data]="auth.currentUser()!"
        />
      } @else {
        <div class="hd-empty">
          <app-icon class="state-icon-lg" name="clipboard" />
          <p class="hd-empty-title">
            {{ 'profile.records.empty_title' | transloco }}
          </p>
          <p class="hd-empty-sub">
            {{ 'profile.records.empty_sub' | transloco }}
          </p>
          <a
            routerLink="/generate/image"
            class="hd-btn hd-btn--tonal hd-btn--dense"
          >
            {{ 'profile.records.empty_action' | transloco }}
          </a>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileRecordsComponent {
  public readonly auth = inject(AuthService);

  /** The account has done something the panel can show. */
  public readonly hasRecords = computed(() => {
    const user = this.auth.currentUser();
    return Boolean(user?.records ?? user?.usage ?? user?.contributions);
  });
}
