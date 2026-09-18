import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../components/icon/icon.component';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { setPageMeta } from '../../helper/page-meta';
import { setPageTitle } from '../../helper/page-title';
import { pageCardUrl } from '../../content/share-cards';

@Component({
  selector: 'app-contribute',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    TranslocoPipe,
  ],
  templateUrl: './contribute.component.html',
  styleUrl: './contribute.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributeComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    setPageMeta({
      titleKey: 'contribute.title',
      descriptionKey: 'contribute.subtitle',
      image: pageCardUrl('contribute'),
      ownsTitle: false,
    });
  }

  ngOnInit(): void {
    this.footerColor.setDarkMode(true);
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'contribute.title',
    );
  }
}
