import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';
import { InfoTooltipComponent } from '../info-tooltip/info-tooltip.component';
import { UnitTooltipComponent } from '../unit-tooltip/unit-tooltip.component';
import { UnitConversionService } from '../../services/unit-conversion.service';
import {
  UsageDetails,
  ContributionsDetails,
  UserRecords,
} from '../../types/horde-user';

export interface UserRecordsInput {
  records?: UserRecords;
  usage?: UsageDetails;
  contributions?: ContributionsDetails;
}

@Component({
  selector: 'app-user-records-panel',
  imports: [
    TranslocoPipe,
    FormatNumberPipe,
    InfoTooltipComponent,
    UnitTooltipComponent,
  ],
  template: `
    @if (loading()) {
      <h3 class="hd-card-title">
        {{ 'profile.detailed_records' | transloco }}
      </h3>
      @for (i of [1, 2]; track i) {
        <div class="records-group" aria-busy="true">
          <span class="hd-skeleton-bar hd-skeleton-bar--title"></span>
          <div class="hd-stats">
            @for (j of [1, 2]; track j) {
              <div class="hd-stat">
                <span class="hd-skeleton-bar"></span>
                <span class="hd-skeleton-bar hd-skeleton-bar--wide"></span>
              </div>
            }
          </div>
        </div>
      }
    } @else {
      <h3 class="hd-card-title">
        {{ 'profile.detailed_records' | transloco }}
      </h3>

      @if (data().records?.usage) {
        <div class="records-group">
          <h4 class="hd-card-title">
            {{ 'profile.records.usage' | transloco }}
          </h4>
          <div class="hd-stats">
            @if (usageMegapixelsteps(); as ps) {
              <div class="hd-stat domain-hue--image">
                <span class="hd-stat-label"
                  >{{ 'profile.records.megapixelsteps' | transloco }}
                  <app-info-tooltip
                    termKey="help.glossary.terms.megapixelsteps.body"
                    glossaryId="megapixelsteps"
                  />
                </span>
                <span class="hd-stat-value">{{ ps.primary.formatted }}</span>
                <span class="hd-stat-note">
                  <app-unit-tooltip [unit]="ps" [swapDisplay]="true" />
                </span>
              </div>
            }
            @if (usageTokens(); as tokens) {
              <div class="hd-stat domain-hue--text">
                <span class="hd-stat-label"
                  >{{ 'profile.records.tokens' | transloco }}
                  <app-info-tooltip
                    termKey="help.glossary.terms.tokens.body"
                    glossaryId="tokens"
                  />
                </span>
                <span class="hd-stat-value">{{
                  tokens.primary.formatted
                }}</span>
                <span class="hd-stat-note">
                  <app-unit-tooltip [unit]="tokens" [swapDisplay]="true" />
                </span>
              </div>
            }
          </div>
        </div>
      }

      @if (data().records?.contribution) {
        <div class="records-group">
          <h4 class="hd-card-title">
            {{ 'profile.records.contribution' | transloco }}
            <app-info-tooltip
              termKey="help.glossary.page.profile.kudos_generated.description"
              glossaryId="profile-kudos-generated"
            />
          </h4>
          <div class="hd-stats">
            @if (contributionMegapixelsteps(); as ps) {
              <div class="hd-stat domain-hue--image">
                <span class="hd-stat-label"
                  >{{ 'profile.records.megapixelsteps' | transloco }}
                  <app-info-tooltip
                    termKey="help.glossary.terms.megapixelsteps.body"
                    glossaryId="megapixelsteps"
                  />
                </span>
                <span class="hd-stat-value">{{ ps.primary.formatted }}</span>
                <span class="hd-stat-note">
                  <app-unit-tooltip [unit]="ps" [swapDisplay]="true" />
                </span>
              </div>
            }
            @if (contributionTokens(); as tokens) {
              <div class="hd-stat domain-hue--text">
                <span class="hd-stat-label"
                  >{{ 'profile.records.tokens' | transloco }}
                  <app-info-tooltip
                    termKey="help.glossary.terms.tokens.body"
                    glossaryId="tokens"
                  />
                </span>
                <span class="hd-stat-value">{{
                  tokens.primary.formatted
                }}</span>
                <span class="hd-stat-note">
                  <app-unit-tooltip [unit]="tokens" [swapDisplay]="true" />
                </span>
              </div>
            }
          </div>
        </div>
      }

      @if (data().records?.request) {
        <div class="records-group">
          <h4 class="hd-card-title">
            {{ 'profile.records.requests' | transloco }}
            <app-info-tooltip
              termKey="help.glossary.page.profile.requests_made.description"
              glossaryId="profile-requests"
            />
          </h4>
          <div class="hd-stats">
            @if (data().records!.request!.image !== undefined) {
              <div class="hd-stat domain-hue--image">
                <span class="hd-stat-label">{{
                  'profile.records.image' | transloco
                }}</span>
                <span class="hd-stat-value">{{
                  data().records!.request!.image ?? 0 | formatNumber
                }}</span>
              </div>
            }
            @if (data().records!.request!.text !== undefined) {
              <div class="hd-stat domain-hue--text">
                <span class="hd-stat-label">{{
                  'profile.records.text' | transloco
                }}</span>
                <span class="hd-stat-value">{{
                  data().records!.request!.text ?? 0 | formatNumber
                }}</span>
              </div>
            }
            @if (data().records!.request!.interrogation !== undefined) {
              <div class="hd-stat domain-hue--alchemy">
                <span class="hd-stat-label">{{
                  'profile.records.interrogation' | transloco
                }}</span>
                <span class="hd-stat-value">{{
                  data().records!.request!.interrogation ?? 0 | formatNumber
                }}</span>
              </div>
            }
          </div>
        </div>
      }

      @if (data().records?.fulfillment) {
        <div class="records-group">
          <h4 class="hd-card-title">
            {{ 'profile.records.fulfillments' | transloco }}
            <app-info-tooltip
              termKey="help.glossary.page.profile.requests_fulfilled.description"
              glossaryId="profile-fulfillments"
            />
          </h4>
          <div class="hd-stats">
            @if (data().records!.fulfillment!.image !== undefined) {
              <div class="hd-stat domain-hue--image">
                <span class="hd-stat-label">{{
                  'profile.records.image' | transloco
                }}</span>
                <span class="hd-stat-value">{{
                  data().records!.fulfillment!.image ?? 0 | formatNumber
                }}</span>
              </div>
            }
            @if (data().records!.fulfillment!.text !== undefined) {
              <div class="hd-stat domain-hue--text">
                <span class="hd-stat-label">{{
                  'profile.records.text' | transloco
                }}</span>
                <span class="hd-stat-value">{{
                  data().records!.fulfillment!.text ?? 0 | formatNumber
                }}</span>
              </div>
            }
            @if (data().records!.fulfillment!.interrogation !== undefined) {
              <div class="hd-stat domain-hue--alchemy">
                <span class="hd-stat-label">{{
                  'profile.records.interrogation' | transloco
                }}</span>
                <span class="hd-stat-value">{{
                  data().records!.fulfillment!.interrogation ?? 0 | formatNumber
                }}</span>
              </div>
            }
          </div>
        </div>
      }
    }
  `,
  host: { class: 'records-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserRecordsPanelComponent {
  private readonly units = inject(UnitConversionService);

  public readonly loading = input(false);
  public readonly data = input<UserRecordsInput>({});

  public readonly usageMegapixelsteps = computed(() => {
    const d = this.data();
    if (d.records?.usage?.megapixelsteps === undefined) return null;
    const rawPixelsteps = d.records.usage.megapixelsteps * 1e6;
    return this.units.formatTotalPixelsteps(rawPixelsteps);
  });

  public readonly usageTokens = computed(() => {
    const d = this.data();
    if (d.records?.usage?.tokens === undefined) return null;
    return this.units.formatTotalTokens(d.records.usage.tokens);
  });

  public readonly contributionMegapixelsteps = computed(() => {
    const d = this.data();
    if (d.records?.contribution?.megapixelsteps === undefined) return null;
    const rawPixelsteps = d.records.contribution.megapixelsteps * 1e6;
    return this.units.formatTotalPixelsteps(rawPixelsteps);
  });

  public readonly contributionTokens = computed(() => {
    const d = this.data();
    if (d.records?.contribution?.tokens === undefined) return null;
    return this.units.formatTotalTokens(d.records.contribution.tokens);
  });
}
