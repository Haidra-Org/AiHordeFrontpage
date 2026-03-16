import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SharedKeyListComponent } from '../../../../components/shared-key/shared-key-list/shared-key-list.component';

@Component({
  selector: 'app-profile-shared-keys',
  imports: [SharedKeyListComponent],
  template: `
    <div
      class="card card-bg-primary card-full card-spaced profile-shared-keys-shell"
    >
      <app-shared-key-list />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSharedKeysComponent {}
