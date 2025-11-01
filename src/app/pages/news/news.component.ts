import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoModule } from "@jsverse/transloco";
import { NewsItem } from "../../types/news.types";
import { AiHordeService } from "../../services/ai-horde.service";
import { MarkdownPipe } from "../../pipes/markdown.pipe";
import { StripWrapperTagPipe } from "../../pipes/strip-wrapper-tag.pipe";

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [
    TranslocoPipe,
    TranslocoModule,
    MarkdownPipe,
    StripWrapperTagPipe,
  ],
  templateUrl: './news.component.html',
  styleUrl: './news.component.scss'
})
export class NewsComponent {
  private readonly aiHorde = inject(AiHordeService);
  
  // Automatically unsubscribes when component is destroyed
  public readonly news = toSignal(this.aiHorde.getNews(), { initialValue: [] as NewsItem[] });
}
