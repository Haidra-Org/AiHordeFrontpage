import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-volunteer-cta-banner',
  imports: [RouterLink, TranslocoModule],
  template: `
    <div class="volunteer-cta-banner" [class.volunteer-cta-banner-compact]="compact()">
      <div class="volunteer-cta-banner-content">
        <svg
          class="volunteer-cta-banner-icon"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
        <p class="volunteer-cta-banner-text">
          {{ "volunteer_cta.message" | transloco }}
        </p>
      </div>
      <div class="volunteer-cta-banner-actions">
        <a routerLink="/contribute/joining" class="volunteer-cta-banner-link volunteer-cta-banner-link-primary">
          {{ "volunteer_cta.become_worker" | transloco }}
        </a>
        <span class="volunteer-cta-banner-separator" aria-hidden="true">|</span>
        <a routerLink="/contribute/donate" class="volunteer-cta-banner-link">
          {{ "volunteer_cta.donate" | transloco }}
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
