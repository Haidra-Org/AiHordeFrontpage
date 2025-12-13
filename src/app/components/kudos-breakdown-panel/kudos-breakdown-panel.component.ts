import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';
import { UserKudosDetails } from '../../types/horde-user';

/**
 * Display variant for the kudos breakdown panel.
 * - 'admin': Dark card style with larger text (admin panel)
 * - 'profile': Compact list style (user profile page)
 */
export type KudosBreakdownVariant = 'admin' | 'profile';

/**
 * Individual kudos field configuration.
 */
interface KudosField {
  key: keyof UserKudosDetails;
  labelKey: string;
  value: number | undefined;
}

/**
 * Reusable component for displaying kudos breakdown details.
 * Supports two visual variants for admin and profile contexts.
 */
@Component({
  selector: 'app-kudos-breakdown-panel',
  imports: [TranslocoPipe, FormatNumberPipe],
  template: `
    @if (variant() === 'admin') {
      <div class="admin-grid-stats-4 gap-4">
        @for (field of visibleFields(); track field.key) {
          <div class="admin-bg-dark rounded-lg p-3">
            <div class="text-xs admin-text-muted mb-1">
              {{ field.labelKey | transloco }}
            </div>
            <div class="admin-heading-card">
              {{ field.value ?? 0 | formatNumber }}
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="data-grid-2-3">
        @for (field of visibleFields(); track field.key) {
          <div class="data-item">
            <span class="data-label">{{ field.labelKey | transloco }}</span>
            <span class="data-value">{{
              field.value ?? 0 | formatNumber
            }}</span>
          </div>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KudosBreakdownPanelComponent {
  /** The kudos details object to display. */
  public readonly kudosDetails = input.required<UserKudosDetails>();

  /** Display variant: 'admin' for card style, 'profile' for list style. */
  public readonly variant = input<KudosBreakdownVariant>('admin');

  /**
   * Translation key prefix for field labels.
   * Admin uses 'admin.users.kudos.' prefix, profile uses 'profile.kudos_' prefix.
   */
  public readonly translationPrefix = input<string | undefined>(undefined);

  /**
   * Whether to show all fields or only those with non-zero values.
   * Admin shows all, profile hides zero values.
   */
  public readonly showZeroValues = input<boolean>(true);

  /**
   * Computed list of fields to display based on variant and showZeroValues.
   */
  public readonly visibleFields = computed<KudosField[]>(() => {
    const details = this.kudosDetails();
    const prefix = this.translationPrefix() ?? this.defaultPrefix();
    const showZero = this.showZeroValues();

    const allFields: KudosField[] = [
      {
        key: 'accumulated',
        labelKey: `${prefix}accumulated`,
        value: details.accumulated,
      },
      { key: 'gifted', labelKey: `${prefix}gifted`, value: details.gifted },
      {
        key: 'received',
        labelKey: `${prefix}received`,
        value: details.received,
      },
      { key: 'admin', labelKey: `${prefix}admin`, value: details.admin },
      {
        key: 'recurring',
        labelKey: `${prefix}recurring`,
        value: details.recurring,
      },
      { key: 'awarded', labelKey: `${prefix}awarded`, value: details.awarded },
      { key: 'donated', labelKey: `${prefix}donated`, value: details.donated },
      { key: 'styled', labelKey: `${prefix}styled`, value: details.styled },
    ];

    if (showZero) {
      // For admin, show all except undefined optional fields (donated, styled)
      return allFields.filter(
        (f) =>
          f.value !== undefined ||
          !['donated', 'styled'].includes(f.key as string),
      );
    }

    // For profile, only show fields with truthy (non-zero) values
    return allFields.filter((f) => f.value);
  });

  /**
   * Default translation prefix based on variant.
   */
  private defaultPrefix(): string {
    return this.variant() === 'admin' ? 'admin.users.kudos.' : 'profile.kudos_';
  }
}
