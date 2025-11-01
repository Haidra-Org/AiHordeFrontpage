import { Component, DestroyRef, Inject, inject, NgZone, OnInit, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from "@angular/common";
import { RouterLink } from "@angular/router";
import { TranslocoPipe, TranslocoModule } from "@jsverse/transloco";
import { NewsItem } from "../../../../types/news.types";
import { AiHordeService } from "../../../../services/ai-horde.service";
import { MarkdownPipe } from "../../../../pipes/markdown.pipe";
import { StripWrapperTagPipe } from "../../../../pipes/strip-wrapper-tag.pipe";

@Component({
  selector: 'app-homepage-latest-news',
  standalone: true,
  imports: [
    RouterLink,
    TranslocoPipe,
    TranslocoModule,
    MarkdownPipe,
    StripWrapperTagPipe,
  ],
  templateUrl: './homepage-latest-news.component.html',
  styleUrl: './homepage-latest-news.component.scss'
})
export class HomepageLatestNewsComponent implements OnInit {
  private readonly isBrowser: boolean;
  private readonly aiHorde = inject(AiHordeService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  
  // Automatically unsubscribes when component is destroyed
  public readonly news = toSignal(this.aiHorde.getNews(3), { initialValue: [] as NewsItem[] });
  private timeoutId: number | null = null;

  constructor(
    @Inject(PLATFORM_ID) platformId: string,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    // Only schedule timeout in browser environment (not during SSR)
    if (this.isBrowser) {
      // Delayed refresh with proper cleanup
      this.zone.runOutsideAngular(() => {
        this.timeoutId = window.setTimeout(() => {
          this.zone.run(() => {
            // Trigger a refresh by re-subscribing
            this.aiHorde.getNews(3).subscribe();
          });
        }, 300);
      });
      
      // Cleanup timeout on destroy
      this.destroyRef.onDestroy(() => {
        if (this.timeoutId !== null) {
          clearTimeout(this.timeoutId);
        }
      });
    }
  }
}
