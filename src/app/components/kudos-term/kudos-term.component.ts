import { ChangeDetectionStrategy, Component } from '@angular/core';
import { InfoTooltipComponent } from '../info-tooltip/info-tooltip.component';

@Component({
  selector: 'app-kudos-term',
  imports: [InfoTooltipComponent],
  template: `
    <span class="kudos-term"
      >Kudos<app-info-tooltip
        termKey="help.glossary.terms.kudos.body"
        glossaryId="kudos"
    /></span>
  `,
  host: { style: 'display: inline' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KudosTermComponent {}
