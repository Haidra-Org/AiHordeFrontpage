import { Component, inject, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { HomepageIntroComponent } from './parts/intro/homepage-intro.component';
import { HomepageSponsorsComponent } from './parts/sponsors/homepage-sponsors.component';
import { HomepageLatestNewsComponent } from './parts/latest-news/homepage-latest-news.component';
import { HomepageStatsComponent } from './parts/stats/homepage-stats.component';
import { TranslatorService } from '../../services/translator.service';
import { HomepageQuickstartComponent } from './parts/quickstart/homepage-quickstart.component';
import { HomepageGuisComponent } from './parts/guis/homepage-guis.component';
import { FooterColorService } from '../../services/footer-color.service';
import { HomepageToolsComponent } from './parts/tools/homepage-tools.component';

@Component({
  selector: 'app-homepage',
  standalone: true,
  imports: [
    HomepageIntroComponent,
    HomepageSponsorsComponent,
    HomepageLatestNewsComponent,
    HomepageStatsComponent,
    HomepageQuickstartComponent,
    HomepageGuisComponent,
    HomepageToolsComponent,
  ],
  templateUrl: './homepage.component.html',
  styleUrl: './homepage.component.css',
})
export class HomepageComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);

  ngOnInit(): void {
    this.footerColor.setDarkMode(false);

    // Set title reactively - automatically cleans up
    this.translator
      .get('app_title')
      .subscribe((title) => this.title.setTitle(title));
  }
}
