import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { KudosTermComponent } from '../kudos-term/kudos-term.component';

@Component({
  selector: 'app-beginner-header',
  imports: [RouterLink, TranslocoModule, KudosTermComponent],
  templateUrl: './beginner-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BeginnerHeaderComponent {
  showButton = input(false);
  disableLinks = input(false);
}
