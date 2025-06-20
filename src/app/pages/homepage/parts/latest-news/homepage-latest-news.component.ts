import {Component, NgZone, OnInit, signal} from '@angular/core';
import {NewsItem} from "../../../../types/news.types";
import {AiHordeService} from "../../../../services/ai-horde.service";
import {toPromise} from "../../../../types/resolvable";
import {RouterLink} from "@angular/router";
import {TranslocoPipe, TranslocoModule} from "@jsverse/transloco";
import {MarkdownPipe} from "../../../../pipes/markdown.pipe";
import {StripWrapperTagPipe} from "../../../../pipes/strip-wrapper-tag.pipe";


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
  public news = signal<NewsItem[]>([]);

  constructor(
    private readonly aiHorde: AiHordeService,
    private readonly zone: NgZone,
  ) {
  }

  public async ngOnInit(): Promise<void> {
    this.news.set(await toPromise(this.aiHorde.getNews(3)));

    this.zone.runOutsideAngular(() => {
      setTimeout(async () => {
        this.news.set(await toPromise(this.aiHorde.getNews(3)));
      }, 300);
    });

  }
}
