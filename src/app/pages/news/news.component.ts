import {
  afterNextRender,
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

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [TranslocoPipe, TranslocoModule, MarkdownPipe, StripWrapperTagPipe],
  templateUrl: './news.component.html',
  styleUrl: './news.component.css',
})
export class NewsComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly news = signal<NewsItem[]>([]);
  public readonly loading = signal(true);

  constructor() {
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
