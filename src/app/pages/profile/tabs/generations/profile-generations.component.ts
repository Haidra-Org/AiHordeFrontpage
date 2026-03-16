import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GenerationsTabComponent } from '../../../../components/generations-tab/generations-tab.component';

@Component({
  selector: 'app-profile-generations',
  imports: [GenerationsTabComponent],
  template: '<app-generations-tab />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileGenerationsComponent {}
