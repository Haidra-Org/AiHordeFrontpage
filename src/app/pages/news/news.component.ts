import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { NewsItem } from '../../types/news.types';
import { AiHordeService } from '../../services/ai-horde.service';
import { TranslatorService } from '../../services/translator.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { StripWrapperTagPipe } from '../../pipes/strip-wrapper-tag.pipe';
import { setPageTitle } from '../../helper/page-title';

@Component({
  selector: 'app-news',
  imports: [TranslocoPipe, TranslocoModule, MarkdownPipe, StripWrapperTagPipe],
  templateUrl: './news.component.html',
  styleUrl: './news.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsComponent implements OnInit {
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);

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

  ngOnInit(): void {
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'latest_news.title',
    );
  }
}
