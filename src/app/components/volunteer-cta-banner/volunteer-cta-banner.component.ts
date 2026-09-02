import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';

/**
 * The standing offer to join in, carried above the areas of the details page.
 * Both destinations are buttons, never links in the prose: one asks for a
 * computer and the other for money, and neither is ever the quieter offer. The
 * worker door is filled and the donation door is tonal, the pairing the site
 * uses wherever two doors stand together.
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
          class="hd-btn hd-btn--ghost hd-btn--dense details-cta-action"
        >
          {{ 'volunteer_cta.become_worker' | transloco }}
        </a>
        <a
          routerLink="/contribute/donate"
          class="hd-btn hd-btn--ghost hd-btn--dense details-cta-action"
        >
          {{ 'volunteer_cta.donate' | transloco }}
        </a>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VolunteerCtaBannerComponent {}
