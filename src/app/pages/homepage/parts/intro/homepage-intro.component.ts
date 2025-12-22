import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-homepage-intro',
  imports: [NgOptimizedImage, TranslocoPipe, TranslocoModule, RouterLink],
  templateUrl: './homepage-intro.component.html',
  styleUrl: './homepage-intro.component.css',
})
export class HomepageIntroComponent {
  faqLink: string;

  constructor(private router: Router) {
    // Generate the URL for the FAQ page
    this.faqLink = this.router.createUrlTree(['/faq']).toString();
  }
}
