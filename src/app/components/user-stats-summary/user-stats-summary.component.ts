import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';
import { InfoTooltipComponent } from '../info-tooltip/info-tooltip.component';
import {
  UsageDetails,
  ContributionsDetails,
  UserRecords,
} from '../../types/horde-user';

export interface UserStatsInput {
  records?: UserRecords;
  usage?: UsageDetails;
  contributions?: ContributionsDetails;
  worker_count?: number;
}

@Component({
  selector: 'app-user-stats-summary',
  imports: [TranslocoPipe, FormatNumberPipe, InfoTooltipComponent],
  template: `
    @if (loading()) {
      <div class="hd-stats" aria-busy="true">
        @for (i of [1, 2, 3]; track i) {
          <div class="hd-stat">
            <span class="hd-skeleton-bar"></span>
            <span class="hd-skeleton-bar hd-skeleton-bar--wide"></span>
          </div>
        }
      </div>
    } @else if (hasData()) {
      <div class="hd-stats mt-2">
        @if (imagesRequested() !== null) {
          <div class="hd-stat domain-hue--image">
            <span class="hd-stat-label"
              >{{ 'profile.images_requested' | transloco }}
              <app-info-tooltip
                termKey="help.glossary.terms.request.body_images"
                glossaryId="request"
              />
            </span>
            <span class="hd-stat-value">{{
              imagesRequested()! | formatNumber
            }}</span>
          </div>
        }
        @if (textRequests() !== null) {
          <div class="hd-stat domain-hue--text">
            <span class="hd-stat-label"
              >{{ 'profile.text_requests' | transloco }}
              <app-info-tooltip
                termKey="help.glossary.terms.request.body_text"
                glossaryId="request"
              />
            </span>
            <span class="hd-stat-value">{{
              textRequests()! | formatNumber
            }}</span>
          </div>
        }
        @if (megapixelstepsGenerated() !== null) {
          <div class="hd-stat domain-hue--image">
            <span class="hd-stat-label"
              >{{ 'profile.mps_generated' | transloco }}
              <app-info-tooltip
                termKey="help.glossary.page.profile.kudos_generated.description"
                glossaryId="profile-kudos-generated"
              />
            </span>
            <span class="hd-stat-value">{{
              megapixelstepsGenerated()! | formatNumber
            }}</span>
          </div>
        }
        @if (tokensGenerated() !== null) {
          <div class="hd-stat domain-hue--text">
            <span class="hd-stat-label"
              >{{ 'profile.tokens_generated' | transloco }}
              <app-info-tooltip
                termKey="help.glossary.page.profile.kudos_generated.description"
                glossaryId="profile-kudos-generated"
              />
            </span>
            <span class="hd-stat-value">{{
              tokensGenerated()! | formatNumber
            }}</span>
          </div>
        }
        @if (fulfillments() !== null) {
          <div class="hd-stat">
            <span class="hd-stat-label"
              >{{ 'profile.fulfillments_label' | transloco }}
              <app-info-tooltip
                termKey="help.glossary.page.profile.total_fulfillments.description"
                glossaryId="profile-total-fulfillments"
              />
            </span>
            <span class="hd-stat-value">{{
              fulfillments()! | formatNumber
            }}</span>
          </div>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserStatsSummaryComponent {
  public readonly user = input<UserStatsInput>({});
  public readonly loading = input(false);

  public readonly imagesRequested = computed(() => {
    const u = this.user();
    if (u.records?.request?.image !== undefined) return u.records.request.image;
    if (u.usage?.requests !== undefined) return u.usage.requests;
    return null;
  });

  public readonly textRequests = computed(() => {
    const u = this.user();
    if (u.records?.request?.text !== undefined) return u.records.request.text;
    return null;
  });

  public readonly megapixelstepsGenerated = computed(() => {
    const u = this.user();
    if (u.records?.contribution?.megapixelsteps !== undefined) {
      return u.records.contribution.megapixelsteps;
    }
    if (u.contributions?.megapixelsteps !== undefined) {
      return u.contributions.megapixelsteps;
    }
    return null;
  });

  public readonly tokensGenerated = computed(() => {
    const u = this.user();
    if (u.records?.contribution?.tokens !== undefined) {
      return u.records.contribution.tokens;
    }
    return null;
  });

  public readonly fulfillments = computed(() => {
    const u = this.user();
    const fulfillment = u.records?.fulfillment;
    const hasRecordsFulfillment =
      fulfillment?.image !== undefined ||
      fulfillment?.text !== undefined ||
      fulfillment?.interrogation !== undefined;

    if (hasRecordsFulfillment) {
      return (
        (fulfillment?.image ?? 0) +
        (fulfillment?.text ?? 0) +
        (fulfillment?.interrogation ?? 0)
      );
    }

    if (u.contributions?.fulfillments !== undefined) {
      return u.contributions.fulfillments;
    }

    return null;
  });

  public readonly hasData = computed(
    () =>
      this.imagesRequested() !== null ||
      this.textRequests() !== null ||
      this.megapixelstepsGenerated() !== null ||
      this.tokensGenerated() !== null ||
      this.fulfillments() !== null,
  );
}
