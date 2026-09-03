import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * What an index says to a reader who asked for something on it that is not
 * there. A URL naming nothing lands on the index rather than on an error page,
 * which is the right place to be sent and a confusing place to arrive at in
 * silence: the line says which name was not found and where the reader is.
 *
 * It is the arrival that is being explained, so it goes as soon as the reader
 * goes anywhere else, which is what being part of the page already does.
 */
@Component({
  selector: 'app-gs-unknown-id-note',
  imports: [TranslocoPipe],
  template: `
    <p class="gs-unknown-id-note">
      {{ 'docs.unknown_id' | transloco: { id: id() } }}
    </p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsUnknownIdNoteComponent {
  /** The name the URL carried, said back so the reader can see the typo. */
  public readonly id = input.required<string>();
}
