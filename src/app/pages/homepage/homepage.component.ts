import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { HomepageIntroComponent } from './parts/intro/homepage-intro.component';
import { HomepageSponsorsComponent } from './parts/sponsors/homepage-sponsors.component';
import { HomepageLatestNewsComponent } from './parts/latest-news/homepage-latest-news.component';
import { HomepageStatsComponent } from './parts/stats/homepage-stats.component';
import { TranslatorService } from '../../services/translator.service';
import { HomepageQuickstartComponent } from './parts/quickstart/homepage-quickstart.component';
import { HomepageGuisComponent } from './parts/guis/homepage-guis.component';
import { FooterColorService } from '../../services/footer-color.service';
import { setAppTitle } from '../../helper/page-title';

@Component({
  selector: 'app-homepage',
  imports: [
    HomepageIntroComponent,
    HomepageSponsorsComponent,
    HomepageLatestNewsComponent,
    HomepageStatsComponent,
    HomepageQuickstartComponent,
    HomepageGuisComponent,
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
  private readonly platformId = inject(PLATFORM_ID);

  public readonly scrollOffset = signal(0);
  public readonly scrollOffsetCss = computed(
    () => `${Math.min(this.scrollOffset(), 1600)}px`,
  );

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    afterNextRender(() => {
      let animationFrameId = 0;

      const syncScroll = () => {
        animationFrameId = 0;
        this.scrollOffset.set(Math.round(window.scrollY));
      };

      const onScroll = () => {
        if (animationFrameId !== 0) {
          return;
        }

        animationFrameId = window.requestAnimationFrame(syncScroll);
      };

      syncScroll();
      window.addEventListener('scroll', onScroll, { passive: true });

      this.destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', onScroll);
        if (animationFrameId !== 0) {
          window.cancelAnimationFrame(animationFrameId);
        }
      });
    });
  }

  ngOnInit(): void {
    this.footerColor.setDarkMode(false);
    setAppTitle(this.translator, this.title, this.destroyRef);
  }
}
