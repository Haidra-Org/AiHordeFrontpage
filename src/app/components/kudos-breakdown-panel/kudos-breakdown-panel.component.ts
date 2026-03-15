import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';
import { UserKudosDetails } from '../../types/horde-user';
import { InfoTooltipComponent } from '../info-tooltip/info-tooltip.component';

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
  group: 'incoming' | 'outgoing' | 'lifetime';
  apiField?: string;
  glossaryId?: string;
  tooltipKey?: string;
}

interface ProfileKudosSection {
  id: 'incoming' | 'outgoing' | 'lifetime';
  titleKey: string;
  hintKey: string;
  fields: KudosField[];
}

/**
 * Reusable component for displaying kudos breakdown details.
 * Supports two visual variants for admin and profile contexts.
 */
@Component({
  selector: 'app-kudos-breakdown-panel',
  imports: [TranslocoPipe, FormatNumberPipe, InfoTooltipComponent],
  template: `
    @if (variant() === 'admin') {
      <div class="admin-grid-stats-4 gap-4">
        @for (field of visibleFields(); track field.key) {
          <div class="admin-bg-dark rounded-lg p-3">
            <div class="text-xs admin-text-muted mb-1">
              {{ field.labelKey | transloco }}
            </div>
            <div class="heading-admin-card">
              {{ field.value ?? 0 | formatNumber }}
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="kudos-breakdown-profile">
        @for (section of profileSections(); track section.id) {
          <section class="kudos-breakdown-section">
            <div class="kudos-breakdown-section__header">
              <h5 class="kudos-breakdown-section__title">
                {{ section.titleKey | transloco }}
              </h5>
              <p class="kudos-breakdown-section__hint">
                {{ section.hintKey | transloco }}
              </p>
            </div>

            <div class="kudos-breakdown kudos-breakdown--profile">
              @for (field of section.fields; track field.key) {
                <div
                  class="kudos-breakdown__metric"
                  [class.kudos-breakdown__metric--primary]="
                    field.key === 'accumulated' || field.key === 'awarded'
                  "
                  [class.kudos-breakdown__metric--outgoing]="
                    field.group === 'outgoing'
                  "
                  [class.kudos-breakdown__metric--context]="
                    field.group === 'lifetime'
                  "
                >
                  <span class="kudos-breakdown__label"
                    >{{ field.labelKey | transloco }}
                    @if (field.apiField) {
                      <span
                        class="kudos-api-badge"
                        tabindex="0"
                        [attr.data-api-field]="field.apiField"
                        [attr.aria-label]="'API field: ' + field.apiField"
                        >API</span
                      >
                    }
                    @if (field.tooltipKey && field.glossaryId) {
                      <app-info-tooltip
                        [termKey]="field.tooltipKey"
                        [glossaryId]="field.glossaryId"
                      />
                    }
                  </span>
                  <span class="kudos-breakdown__value">{{
                    profileFieldDisplayValue(field) | formatNumber
                  }}</span>
                </div>
              }
            </div>
          </section>
        }

        <div class="kudos-breakdown-summary">
          @if (currentBalance() !== undefined) {
            <div class="kudos-breakdown-summary__row kudos-breakdown-summary__row--balance">
              <span class="kudos-breakdown-summary__label"
                >{{ 'profile.kudos_balance' | transloco }}</span
              >
              <span class="kudos-breakdown-summary__value">{{
                currentBalance()! | formatNumber
              }}</span>
            </div>
          }

          <div class="kudos-breakdown-summary__row">
            <span class="kudos-breakdown-summary__label"
              >{{ 'profile.kudos_generated_total' | transloco }}</span
            >
            <span class="kudos-breakdown-summary__value">{{
              profileGeneratedKudos() | formatNumber
            }}</span>
          </div>
          <div class="kudos-breakdown-summary__row">
            <span class="kudos-breakdown-summary__label"
              >{{ 'profile.kudos_incoming_total' | transloco }}</span
            >
            <span class="kudos-breakdown-summary__value">+{{
              profileIncomingTotal() | formatNumber
            }}</span>
          </div>
          <div class="kudos-breakdown-summary__row">
            <span class="kudos-breakdown-summary__label"
              >{{ 'profile.kudos_outgoing_total' | transloco }}</span
            >
            <span class="kudos-breakdown-summary__value">-{{
              profileOutgoingTotal() | formatNumber
            }}</span>
          </div>
          <div class="kudos-breakdown-summary__row kudos-breakdown-summary__row--net">
            <span class="kudos-breakdown-summary__label"
              >{{ 'profile.kudos_net_flow' | transloco }}</span
            >
            <span class="kudos-breakdown-summary__value">{{
              profileNetFlowSign()
            }}{{ profileNetFlow() | formatNumber }}</span>
          </div>

          <div class="kudos-breakdown-summary__row kudos-breakdown-summary__row--formula">
            <span class="kudos-breakdown-summary__label"
              >{{ 'profile.kudos_calculated_total' | transloco }}</span
            >
            <span class="kudos-breakdown-summary__value">{{
              profileCalculatedTotal() | formatNumber
            }}</span>
          </div>

          @if (currentBalance() !== undefined) {
            <div class="kudos-breakdown-summary__row kudos-breakdown-summary__row--difference">
              <span class="kudos-breakdown-summary__label"
                >{{ 'profile.kudos_balance_difference' | transloco }}</span
              >
              <span class="kudos-breakdown-summary__value">{{
                profileBalanceDifferenceSign()
              }}{{ profileBalanceDifferenceMagnitude() | formatNumber }}</span>
            </div>
          }

          <p class="kudos-breakdown-summary__hint">
            {{ 'profile.kudos_difference_hint' | transloco }}
          </p>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KudosBreakdownPanelComponent {
  /** The kudos details object to display. */
  public readonly kudosDetails = input.required<UserKudosDetails>();

  /** Current user balance from the profile payload. */
  public readonly currentBalance = input<number | undefined>(undefined);

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
  private readonly allFields = computed<KudosField[]>(() => {
    const details = this.kudosDetails();
    const prefix = this.translationPrefix() ?? this.defaultPrefix();
    const isProfile = this.variant() === 'profile';

    return [
      {
        key: 'accumulated',
        labelKey: `${prefix}accumulated`,
        value: details.accumulated,
        group: 'lifetime',
        apiField: 'kudos_details.accumulated',
        glossaryId: isProfile ? 'profile-kudos-accumulated' : undefined,
        tooltipKey: isProfile
          ? 'help.glossary.page.profile.accumulated.description'
          : undefined,
      },
      {
        key: 'received',
        labelKey: `${prefix}received`,
        value: details.received,
        group: 'incoming',
        apiField: 'kudos_details.received',
        glossaryId: isProfile ? 'profile-kudos-received' : undefined,
        tooltipKey: isProfile
          ? 'help.glossary.page.profile.received.description'
          : undefined,
      },
      {
        key: 'recurring',
        labelKey: `${prefix}recurring`,
        value: details.recurring,
        group: 'incoming',
        apiField: 'kudos_details.recurring',
        glossaryId: isProfile ? 'profile-kudos-recurring' : undefined,
        tooltipKey: isProfile
          ? 'help.glossary.page.profile.recurring.description'
          : undefined,
      },
      {
        key: 'awarded',
        labelKey: `${prefix}awarded`,
        value: details.awarded,
        group: 'incoming',
        apiField: 'kudos_details.awarded',
      },
      {
        key: 'admin',
        labelKey: `${prefix}admin`,
        value: details.admin,
        group: 'incoming',
        apiField: 'kudos_details.admin',
      },
      {
        key: 'gifted',
        labelKey: `${prefix}gifted`,
        value: details.gifted,
        group: 'outgoing',
        apiField: 'kudos_details.gifted',
        glossaryId: isProfile ? 'profile-kudos-gifted' : undefined,
        tooltipKey: isProfile
          ? 'help.glossary.page.profile.gifted.description'
          : undefined,
      },
      {
        key: 'donated',
        labelKey: `${prefix}donated`,
        value: details.donated,
        group: 'outgoing',
        apiField: 'kudos_details.donated',
        glossaryId: isProfile ? 'profile-kudos-donated' : undefined,
        tooltipKey: isProfile
          ? 'help.glossary.page.profile.donated.description'
          : undefined,
      },
      {
        key: 'styled',
        labelKey: `${prefix}styled`,
        value: details.styled,
        group: 'lifetime',
        apiField: 'kudos_details.styled',
      },
    ];
  });

  /**
   * Fields displayed in admin layout.
   */
  public readonly visibleFields = computed<KudosField[]>(() => {
    const showZero = this.showZeroValues();
    const isAdmin = this.variant() === 'admin';

    if (!isAdmin) {
      return [];
    }

    return this.allFields().filter((field) =>
      this.shouldShowField(field, showZero, true),
    );
  });

  /**
   * Sectioned field groups used by the profile layout.
   */
  public readonly profileSections = computed<ProfileKudosSection[]>(() => {
    const showZero = this.showZeroValues();
    const isProfile = this.variant() === 'profile';

    if (!isProfile) {
      return [];
    }

    const sections: Omit<ProfileKudosSection, 'fields'>[] = [
      {
        id: 'incoming',
        titleKey: 'profile.kudos_section_incoming',
        hintKey: 'profile.kudos_section_incoming_hint',
      },
      {
        id: 'outgoing',
        titleKey: 'profile.kudos_section_outgoing',
        hintKey: 'profile.kudos_section_outgoing_hint',
      },
      {
        id: 'lifetime',
        titleKey: 'profile.kudos_section_lifetime',
        hintKey: 'profile.kudos_section_lifetime_hint',
      },
    ];

    return sections
      .map((section) => ({
        ...section,
        fields: this.allFields().filter(
          (field) =>
            field.group === section.id &&
            this.shouldShowField(field, showZero, false),
        ),
      }))
      .filter((section) => section.fields.length > 0);
  });

  public readonly profileIncomingTotal = computed<number>(() => {
    return this.sumGroup('incoming');
  });

  public readonly profileGeneratedKudos = computed<number>(() => {
    return this.kudosDetails().accumulated ?? 0;
  });

  public readonly profileOutgoingTotal = computed<number>(() => {
    return this.sumGroup('outgoing', true);
  });

  public readonly profileNetFlow = computed<number>(() => {
    return this.profileIncomingTotal() - this.profileOutgoingTotal();
  });

  public readonly profileCalculatedTotal = computed<number>(() => {
    return this.profileGeneratedKudos() + this.profileNetFlow();
  });

  public readonly profileBalanceDifference = computed<number>(() => {
    const balance = this.currentBalance();

    if (balance === undefined) {
      return 0;
    }

    return balance - this.profileCalculatedTotal();
  });

  public readonly profileBalanceDifferenceMagnitude = computed<number>(() => {
    return Math.abs(this.profileBalanceDifference());
  });

  public readonly profileNetFlowSign = computed<string>(() => {
    return this.profileNetFlow() > 0 ? '+' : '';
  });

  public readonly profileBalanceDifferenceSign = computed<string>(() => {
    const difference = this.profileBalanceDifference();

    if (difference > 0) {
      return '+';
    }

    if (difference < 0) {
      return '-';
    }

    return '';
  });

  public profileFieldDisplayValue(field: KudosField): number {
    const value = field.value ?? 0;

    if (field.group === 'outgoing') {
      return Math.abs(value);
    }

    return value;
  }

  /**
   * Default translation prefix based on variant.
   */
  private defaultPrefix(): string {
    return this.variant() === 'admin' ? 'admin.users.kudos.' : 'profile.kudos_';
  }

  private shouldShowField(
    field: KudosField,
    showZero: boolean,
    includeOptionalWhenDefinedOnly: boolean,
  ): boolean {
    const isOptionalField = field.key === 'donated' || field.key === 'styled';
    const value = field.value;

    if (includeOptionalWhenDefinedOnly && isOptionalField) {
      if (value === undefined) {
        return false;
      }
    }

    if (showZero) {
      return value !== undefined || !isOptionalField;
    }

    return !!value;
  }

  private sumGroup(
    group: KudosField['group'],
    useAbsoluteValue = false,
  ): number {
    return this.allFields()
      .filter((field) => field.group === group)
      .reduce((sum, field) => {
        const numericValue = field.value ?? 0;
        return sum + (useAbsoluteValue ? Math.abs(numericValue) : numericValue);
      }, 0);
  }
}
