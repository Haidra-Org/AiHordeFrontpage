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
      <h3 class="heading-card">
        {{ 'profile.detailed_records' | transloco }}
      </h3>
      <div class="records-section-wrapper" aria-busy="true">
        @for (i of [1, 2]; track i) {
          <div class="record-group">
            <div
              class="skeleton-bar"
              style="width: 8rem; height: 1rem; margin-bottom: 0.75rem;"
            ></div>
            <div class="data-grid-1-2">
              <div class="data-item-box">
                <span
                  class="skeleton-bar"
                  style="width: 60%; height: 0.75rem;"
                ></span>
                <span
                  class="skeleton-bar"
                  style="width: 40%; height: 1.25rem; margin-top: 0.5rem;"
                ></span>
              </div>
              <div class="data-item-box">
                <span
                  class="skeleton-bar"
                  style="width: 50%; height: 0.75rem;"
                ></span>
                <span
                  class="skeleton-bar"
                  style="width: 35%; height: 1.25rem; margin-top: 0.5rem;"
                ></span>
              </div>
            </div>
          </div>
        }
      </div>
    } @else {
      <h3 class="heading-card">
        {{ 'profile.detailed_records' | transloco }}
      </h3>
      <div class="records-section-wrapper">
        <!-- Usage Records -->
        @if (data().records?.usage) {
          <div class="record-group">
            <h4 class="section-title-sm">
              {{ 'profile.records.usage' | transloco }}
            </h4>
            <div class="data-grid-1-2">
              @if (usageMegapixelsteps(); as ps) {
                <div class="data-item-box">
                  <span class="data-label"
                    >{{ 'profile.records.megapixelsteps' | transloco }}
                    <app-info-tooltip
                      termKey="help.glossary.terms.megapixelsteps.body"
                      glossaryId="megapixelsteps"
                    />
                  </span>
                  <span class="data-value">
                    {{ ps.primary.formatted }}
                    <span class="text-secondary">
                      (<app-unit-tooltip [unit]="ps" [swapDisplay]="true" />)
                    </span>
                  </span>
                </div>
              }
              @if (usageTokens(); as tokens) {
                <div class="data-item-box">
                  <span class="data-label"
                    >{{ 'profile.records.tokens' | transloco }}
                    <app-info-tooltip
                      termKey="help.glossary.terms.tokens.body"
                      glossaryId="tokens"
                    />
                  </span>
                  <span class="data-value">
                    {{ tokens.primary.formatted }}
                    <span class="text-secondary">
                      (<app-unit-tooltip
                        [unit]="tokens"
                        [swapDisplay]="true"
                      />)
                    </span>
                  </span>
                </div>
              }
            </div>
          </div>
        }

        <!-- Contribution Records -->
        @if (data().records?.contribution) {
          <div class="record-group">
            <h4 class="section-title-sm">
              {{ 'profile.records.contribution' | transloco }}
              <app-info-tooltip
                termKey="help.glossary.page.profile.kudos_generated.description"
                glossaryId="profile-kudos-generated"
              />
            </h4>
            <div class="data-grid-1-2">
              @if (contributionMegapixelsteps(); as ps) {
                <div class="data-item-box">
                  <span class="data-label"
                    >{{ 'profile.records.megapixelsteps' | transloco }}
                    <app-info-tooltip
                      termKey="help.glossary.terms.megapixelsteps.body"
                      glossaryId="megapixelsteps"
                    />
                  </span>
                  <span class="data-value">
                    {{ ps.primary.formatted }}
                    <span class="text-secondary">
                      (<app-unit-tooltip [unit]="ps" [swapDisplay]="true" />)
                    </span>
                  </span>
                </div>
              }
              @if (contributionTokens(); as tokens) {
                <div class="data-item-box">
                  <span class="data-label"
                    >{{ 'profile.records.tokens' | transloco }}
                    <app-info-tooltip
                      termKey="help.glossary.terms.tokens.body"
                      glossaryId="tokens"
                    />
                  </span>
                  <span class="data-value">
                    {{ tokens.primary.formatted }}
                    <span class="text-secondary">
                      (<app-unit-tooltip
                        [unit]="tokens"
                        [swapDisplay]="true"
                      />)
                    </span>
                  </span>
                </div>
              }
            </div>
          </div>
        }

        <!-- Request Records -->
        @if (data().records?.request) {
          <div class="record-group">
            <h4 class="section-title-sm">
              {{ 'profile.records.requests' | transloco }}
              <app-info-tooltip
                termKey="help.glossary.page.profile.requests_made.description"
                glossaryId="profile-requests"
              />
            </h4>
            <div class="data-grid-1-2-3">
              @if (data().records!.request!.image !== undefined) {
                <div
                  class="data-item-box data-item-centered domain-tint--image"
                >
                  <span class="data-label">{{
                    'profile.records.image' | transloco
                  }}</span>
                  <span class="data-value">{{
                    data().records!.request!.image ?? 0 | formatNumber
                  }}</span>
                </div>
              }
              @if (data().records!.request!.text !== undefined) {
                <div class="data-item-box data-item-centered domain-tint--text">
                  <span class="data-label">{{
                    'profile.records.text' | transloco
                  }}</span>
                  <span class="data-value">{{
                    data().records!.request!.text ?? 0 | formatNumber
                  }}</span>
                </div>
              }
              @if (data().records!.request!.interrogation !== undefined) {
                <div
                  class="data-item-box data-item-centered domain-tint--alchemy"
                >
                  <span class="data-label">{{
                    'profile.records.interrogation' | transloco
                  }}</span>
                  <span class="data-value">{{
                    data().records!.request!.interrogation ?? 0 | formatNumber
                  }}</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- Fulfillment Records -->
        @if (data().records?.fulfillment) {
          <div class="record-group">
            <h4 class="section-title-sm">
              {{ 'profile.records.fulfillments' | transloco }}
              <app-info-tooltip
                termKey="help.glossary.page.profile.requests_fulfilled.description"
                glossaryId="profile-fulfillments"
              />
            </h4>
            <div class="data-grid-1-2-3">
              @if (data().records!.fulfillment!.image !== undefined) {
                <div
                  class="data-item-box data-item-centered domain-tint--image"
                >
                  <span class="data-label">{{
                    'profile.records.image' | transloco
                  }}</span>
                  <span class="data-value">{{
                    data().records!.fulfillment!.image ?? 0 | formatNumber
                  }}</span>
                </div>
              }
              @if (data().records!.fulfillment!.text !== undefined) {
                <div class="data-item-box data-item-centered domain-tint--text">
                  <span class="data-label">{{
                    'profile.records.text' | transloco
                  }}</span>
                  <span class="data-value">{{
                    data().records!.fulfillment!.text ?? 0 | formatNumber
                  }}</span>
                </div>
              }
              @if (data().records!.fulfillment!.interrogation !== undefined) {
                <div
                  class="data-item-box data-item-centered domain-tint--alchemy"
                >
                  <span class="data-label">{{
                    'profile.records.interrogation' | transloco
                  }}</span>
                  <span class="data-value">{{
                    data().records!.fulfillment!.interrogation ?? 0
                      | formatNumber
                  }}</span>
                </div>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
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
