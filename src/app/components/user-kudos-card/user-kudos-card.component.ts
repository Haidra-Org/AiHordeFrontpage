import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';
import { KudosBreakdownPanelComponent } from '../kudos-breakdown-panel/kudos-breakdown-panel.component';
import { KudosTermComponent } from '../kudos-term/kudos-term.component';
import { UserKudosDetails, MonthlyKudos } from '../../types/horde-user';

@Component({
  selector: 'app-user-kudos-card',
  imports: [
    TranslocoPipe,
    FormatNumberPipe,
    KudosBreakdownPanelComponent,
    KudosTermComponent,
    RouterLink,
  ],
  template: `
    @if (loading()) {
      <h3 class="heading-card"><app-kudos-term /></h3>
      <div class="data-grid-1-2-3" aria-busy="true">
        <div class="data-item-box">
          <span class="skeleton-bar" style="width: 3rem; height: 0.75rem;"></span>
          <span class="skeleton-bar" style="width: 5rem; height: 1.5rem; margin-top: 0.5rem;"></span>
        </div>
        <div class="data-item-box">
          <span class="skeleton-bar" style="width: 5rem; height: 0.75rem;"></span>
          <span class="skeleton-bar" style="width: 4rem; height: 1.25rem; margin-top: 0.5rem;"></span>
        </div>
      </div>
      <h4 class="section-title-sm">
        {{ "profile.kudos_breakdown" | transloco }}
      </h4>
      <div aria-busy="true" style="display: flex; flex-direction: column; gap: 0.5rem;">
        @for (i of [1, 2, 3, 4]; track i) {
          <span class="skeleton-bar" style="height: 1.25rem;"></span>
        }
      </div>
    } @else {
    <h3 class="heading-card"><app-kudos-term /></h3>

    <div class="data-grid-1-2-3">
      <div class="data-item-box">
        <span class="data-label"><app-kudos-term /></span>
        <div class="kudos-balance-row">
          <span class="data-value text-brand-purple">{{
            kudos() | formatNumber
          }}</span>
          @if (isOwnProfile()) {
            <a routerLink="/v2-transfer/" class="btn-primary btn-sm">
              {{ "profile.transfer_kudos" | transloco }}
            </a>
          }
        </div>
      </div>
      @if (monthlyKudos()?.amount) {
        <div class="data-item-box">
          <span class="data-label">{{
            "profile.kudos_recurring" | transloco
          }}</span>
          <span class="data-value">{{
            "profile.monthly_kudos"
              | transloco: { amount: monthlyKudos()!.amount! | formatNumber }
          }}</span>
        </div>
      }
      @if (
        evaluatingKudos() !== undefined &&
        evaluatingKudos() !== null &&
        !trusted()
      ) {
        <div
          class="data-item-box"
          [attr.title]="
            'profile.evaluating_kudos_tooltip' | transloco
          "
        >
          <span class="data-label">{{
            "profile.evaluating_kudos" | transloco
          }}</span>
          <span class="data-value">{{
            evaluatingKudos()! | formatNumber
          }}</span>
        </div>
      }
    </div>

    @if (isOwnProfile() && kudos() < 100) {
      <div class="info-box info-box--blue mt-4">
        <h4 class="info-box-title">
          {{ "profile.low_kudos_info_title" | transloco }}
        </h4>
        <p class="info-box-text">
          {{ "profile.low_kudos_info_message" | transloco }}
        </p>
        <a routerLink="/faq/" fragment="kudos" class="info-box-link">
          {{ "profile.low_kudos_info_link" | transloco }} →
        </a>
      </div>
    }

    @if (kudosDetails()) {
      <h4 class="section-title-sm">
        {{ "profile.kudos_breakdown" | transloco }}
      </h4>
      <app-kudos-breakdown-panel
        [kudosDetails]="kudosDetails()!"
        variant="profile"
        [showZeroValues]="false"
      />
    }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserKudosCardComponent {
  public readonly loading = input(false);
  public readonly kudos = input(0);
  public readonly kudosDetails = input<UserKudosDetails>();
  public readonly monthlyKudos = input<MonthlyKudos>();
  public readonly evaluatingKudos = input<number>();
  public readonly trusted = input(false);
  public readonly isOwnProfile = input(false);
}
