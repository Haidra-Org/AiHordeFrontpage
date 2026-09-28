import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SuspicionHistoryComponent } from '../../../components/admin/suspicion-history/suspicion-history.component';

/**
 * The moderation record of one account on the user management page: the
 * suspicion history of its workers, read when opened.
 */
@Component({
  selector: 'app-user-moderation-record',
  imports: [TranslocoPipe, SuspicionHistoryComponent],
  templateUrl: './user-moderation-record.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserModerationRecordComponent {
  public readonly userId = input.required<number>();
}
