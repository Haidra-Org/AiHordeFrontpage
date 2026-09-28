import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ListCount } from '../../../types/moderation';

/**
 * A queue count as the horde allows it to be stated: exact under the page
 * limit, and a floor ("100+", read aloud as "at least 100") at it.
 */
@Component({
  selector: 'app-moderation-count',
  imports: [TranslocoPipe],
  template: `
    @if (value().atLeast) {
      <span aria-hidden="true">{{
        'admin.moderation.count_at_least' | transloco: { count: value().count }
      }}</span>
      <span class="sr-only">{{
        'admin.moderation.count_at_least_spoken'
          | transloco: { count: value().count }
      }}</span>
    } @else {
      {{ value().count }}
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationCountComponent {
  public readonly value = input.required<ListCount>();
}
