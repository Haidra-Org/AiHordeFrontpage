import {Component, OnInit, signal} from '@angular/core';
import {NewsItem} from "../../types/news.types";
import {AiHordeService} from "../../services/ai-horde.service";
import {toPromise} from "../../types/resolvable";
import {TranslocoPipe, TranslocoModule} from "@jsverse/transloco";
import {MarkdownPipe} from "../../pipes/markdown.pipe";
import {StripWrapperTagPipe} from "../../pipes/strip-wrapper-tag.pipe";


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
export class NewsComponent implements OnInit {
  public news = signal<NewsItem[]>([]);

  constructor(
    private readonly aiHorde: AiHordeService,
  ) {
  }

  public async ngOnInit(): Promise<void> {
    this.news.set(await toPromise(this.aiHorde.getNews()));
  }
}
