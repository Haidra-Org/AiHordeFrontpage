import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';

/**
 * The standing offer to join in, carried above the areas of the details page.
 * Both destinations are buttons of the same weight: one asks for a computer and
 * the other for money, and neither is the recommended answer. They are filled
 * rather than tinted, because an accent tint on the card tone leaves accent text
 * reading against a ground almost the same colour.
 */
@Component({
  selector: 'app-volunteer-cta-banner',
  imports: [RouterLink, TranslocoModule, IconComponent],
  template: `
    <div class="details-cta">
      <p class="details-cta-text">
        <app-icon class="details-cta-icon" name="heart-simple" />
        {{ 'volunteer_cta.message' | transloco }}
      </p>
      <div class="details-cta-actions">
        <a
          routerLink="/contribute/workers"
          class="hd-btn hd-btn--primary hd-btn--dense details-cta-action"
        >
          {{ 'volunteer_cta.become_worker' | transloco }}
        </a>
        <a
          routerLink="/contribute/donate"
          class="hd-btn hd-btn--primary hd-btn--dense details-cta-action"
        >
          {{ 'volunteer_cta.donate' | transloco }}
        </a>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VolunteerCtaBannerComponent {}
