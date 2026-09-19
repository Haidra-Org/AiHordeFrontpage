import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { NewsItem } from '../../types/news.types';
import { AiHordeService } from '../../services/ai-horde.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { StripWrapperTagPipe } from '../../pipes/strip-wrapper-tag.pipe';
import { setPageMeta } from '../../helper/page-meta';

@Component({
  selector: 'app-news',
  imports: [TranslocoPipe, TranslocoModule, MarkdownPipe, StripWrapperTagPipe],
  templateUrl: './news.component.html',
  styleUrl: './news.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly news = signal<NewsItem[]>([]);
  public readonly loading = signal(true);

  constructor() {
    setPageMeta({
      titleKey: 'latest_news.title',
      descriptionKey: 'latest_news.subtitle',
    });

    // Fetch news only in the browser after rendering completes.
    // This prevents stale prerendered data from appearing during static builds.
    afterNextRender(() => {
      this.aiHorde
        .getNews()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (newsItems) => {
            this.news.set(newsItems);
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
          },
        });
    });
  }
}
