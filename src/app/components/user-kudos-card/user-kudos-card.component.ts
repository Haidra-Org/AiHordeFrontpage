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
      <h3 class="hd-card-title"><app-kudos-term /></h3>
      <div class="hd-stats" aria-busy="true">
        @for (i of [1, 2]; track i) {
          <div class="hd-stat">
            <span class="hd-skeleton-bar"></span>
            <span class="hd-skeleton-bar hd-skeleton-bar--wide"></span>
          </div>
        }
      </div>
      <h4 class="hd-card-title">
        {{ 'profile.kudos_breakdown' | transloco }}
      </h4>
      <div class="kudos-card-skeleton" aria-busy="true">
        @for (i of [1, 2, 3, 4]; track i) {
          <span class="hd-skeleton-bar hd-skeleton-bar--wide"></span>
        }
      </div>
    } @else {
      <h3 class="hd-card-title">
        <app-kudos-term />
        @if (isOwnProfile()) {
          <a
            routerLink="/v2-transfer/"
            class="hd-btn hd-btn--tonal hd-btn--dense kudos-card-action"
          >
            {{ 'profile.transfer_kudos' | transloco }}
          </a>
        }
      </h3>

      <div class="hd-stats">
        <div class="hd-stat">
          <span class="hd-stat-label"><app-kudos-term /></span>
          <span class="hd-stat-value">{{ kudos() | formatNumber }}</span>
        </div>
        @if (monthlyKudos()?.amount) {
          <div class="hd-stat">
            <span class="hd-stat-label">{{
              'profile.kudos_recurring' | transloco
            }}</span>
            <span class="hd-stat-value">{{
              'profile.monthly_kudos'
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
            class="hd-stat"
            [attr.title]="'profile.evaluating_kudos_tooltip' | transloco"
          >
            <span class="hd-stat-label">{{
              'profile.evaluating_kudos' | transloco
            }}</span>
            <span class="hd-stat-value">{{
              evaluatingKudos()! | formatNumber
            }}</span>
          </div>
        }
      </div>

      @if (isOwnProfile() && kudos() < 100) {
        <div class="hd-callout hd-callout--accent">
          <p class="hd-callout-title">
            {{ 'profile.low_kudos_info_title' | transloco }}
          </p>
          <p class="hd-callout-body">
            {{ 'profile.low_kudos_info_message' | transloco }}
          </p>
          <div class="hd-callout-actions">
            <a
              routerLink="/faq/"
              fragment="kudos"
              class="hd-btn hd-btn--dense kudos-card-action"
            >
              {{ 'profile.low_kudos_info_link' | transloco }}
            </a>
          </div>
        </div>
      }

      @if (kudosDetails()) {
        <h4 class="hd-card-title">
          {{ 'profile.kudos_breakdown' | transloco }}
        </h4>
        <app-kudos-breakdown-panel
          [kudosDetails]="kudosDetails()!"
          [currentBalance]="kudos()"
          variant="profile"
          [showZeroValues]="false"
        />
      }
    }
  `,
  host: { class: 'kudos-card' },
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
