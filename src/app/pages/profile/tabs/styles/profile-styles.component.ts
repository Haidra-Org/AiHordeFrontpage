import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ProfileStylesListComponent } from '../../../../components/profile-styles-list/profile-styles-list.component';

@Component({
  selector: 'app-profile-styles',
  imports: [ProfileStylesListComponent],
  // The list prints its own image/text switch with a count on each side, and
  // the tab that opened this area already carries the total, so the tab needs
  // no heading of its own.
  template: `
    <div class="details-area">
      <app-profile-styles-list />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileStylesComponent {}
