import {
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { NewsItem } from '../../../../types/news.types';
import { AiHordeService } from '../../../../services/ai-horde.service';
import { MarkdownPipe } from '../../../../pipes/markdown.pipe';
import { StripWrapperTagPipe } from '../../../../pipes/strip-wrapper-tag.pipe';

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
  styleUrl: './homepage-latest-news.component.css',
})
export class HomepageLatestNewsComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly news = signal<NewsItem[]>([]);

  constructor() {
    // Fetch news only in the browser after rendering completes.
    // This prevents stale prerendered data from appearing during static builds.
    afterNextRender(() => {
      this.aiHorde
        .getNews(3)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((newsItems) => {
          this.news.set(newsItems);
        });
    });
  }
}
