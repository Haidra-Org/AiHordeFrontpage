import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { HomepageHeroComponent } from './parts/hero/homepage-hero.component';
import { HomepageLiveBandComponent } from './parts/live-band/homepage-live-band.component';
import { HomepageDoorsComponent } from './parts/doors/homepage-doors.component';
import { HomepageSponsorsComponent } from './parts/sponsors/homepage-sponsors.component';
import { HomepageLatestNewsComponent } from './parts/latest-news/homepage-latest-news.component';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { setPageMeta } from '../../helper/page-meta';
import { setAppTitle } from '../../helper/page-title';

/**
 * The front door: pictures the horde made, the three ways in, what it is doing
 * right now, what has happened lately, and who pays for it.
 */
@Component({
  selector: 'app-homepage',
  imports: [
    HomepageHeroComponent,
    HomepageDoorsComponent,
    HomepageLiveBandComponent,
    HomepageLatestNewsComponent,
    HomepageSponsorsComponent,
  ],
  templateUrl: './homepage.component.html',
  styleUrl: './homepage.component.css',
  encapsulation: ViewEncapsulation.Emulated,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomepageComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // The tab keeps the bare site name; the link preview gets the site's own
    // sentence and card, which the head's defaults cannot say per page.
    setPageMeta({
      titleKey: 'app_title',
      descriptionKey: 'homepage.intro.tagline',
      ownsTitle: false,
    });
  }

  ngOnInit(): void {
    this.footerColor.setDarkMode(false);
    setAppTitle(this.translator, this.title, this.destroyRef);
  }
}
