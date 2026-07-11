import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GenerateComponent } from '../../../generate/generate.component';

@Component({
  selector: 'app-profile-generations',
  imports: [GenerateComponent],
  template: '<app-generate [embedded]="true" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileGenerationsComponent {}
