import { ChangeDetectionStrategy, Component, inject, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { StickyRegistryService } from '../../../../services/sticky-registry.service';
import { scrollToElement } from '../../../../helper/scroll-utils';
import { ScrollRevealDirective } from '../../../../directives/scroll-reveal.directive';

@Component({
  selector: 'app-homepage-intro',
  imports: [
    NgOptimizedImage,
    TranslocoPipe,
    TranslocoModule,
    RouterLink,
    ScrollRevealDirective,
  ],
  templateUrl: './homepage-intro.component.html',
  styleUrl: './homepage-intro.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomepageIntroComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly stickyRegistry = inject(StickyRegistryService);

  faqLink = this.router.createUrlTree(['/faq']).toString();

  scrollToFragment(fragmentId: string, event: Event): void {
    event.preventDefault();
    if (!isPlatformBrowser(this.platformId)) return;
    const element = this.document.getElementById(fragmentId);
    if (element) {
      scrollToElement(element, this.stickyRegistry.totalOffset());
    }
  }
}
