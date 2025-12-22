import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { combineLatest, map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';

@Component({
  selector: 'app-contribute',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './contribute.component.html',
  styleUrl: './contribute.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributeComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);

  ngOnInit(): void {
    this.footerColor.setDarkMode(true);

    combineLatest([
      this.translator.get('contribute.title'),
      this.translator.get('app_title'),
    ])
      .pipe(map(([page, app]) => `${page} | ${app}`))
      .subscribe((title) => this.title.setTitle(title));
  }
}
