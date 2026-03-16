import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../../../services/auth.service';
import { UserRecordsPanelComponent } from '../../../../components/user-records-panel/user-records-panel.component';

@Component({
  selector: 'app-profile-records',
  imports: [UserRecordsPanelComponent],
  template: `
    @if (
      auth.currentUser()!.records ||
      auth.currentUser()!.usage ||
      auth.currentUser()!.contributions
    ) {
      <div class="card card-bg-primary card-full card-spaced">
        <app-user-records-panel
          [loading]="auth.isLoading()"
          [data]="auth.currentUser()!"
        />
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileRecordsComponent {
  public readonly auth = inject(AuthService);
}
