import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-volunteer-cta-banner',
  imports: [RouterLink, TranslocoModule, IconComponent],
  template: `
    <div
      class="volunteer-cta-banner"
      [class.volunteer-cta-banner-compact]="compact()"
    >
      <div class="volunteer-cta-banner-content">
        <app-icon class="volunteer-cta-banner-icon" name="heart-simple" />
        <p class="volunteer-cta-banner-text">
          {{ 'volunteer_cta.message' | transloco }}
        </p>
      </div>
      <div class="volunteer-cta-banner-actions">
        <a
          routerLink="/contribute/workers"
          class="volunteer-cta-banner-link volunteer-cta-banner-link-primary"
        >
          {{ 'volunteer_cta.become_worker' | transloco }}
        </a>
        <span class="volunteer-cta-banner-separator" aria-hidden="true">|</span>
        <a routerLink="/contribute/donate" class="volunteer-cta-banner-link">
          {{ 'volunteer_cta.donate' | transloco }}
        </a>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VolunteerCtaBannerComponent {
  /**
   * Whether to use a more compact layout (for tighter spaces)
   * @default false
   */
  compact = input<boolean>(false);
}
