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
import { ScrollFadeComponent } from '../../helper/scroll-fade.component';
import { StickyHeaderDirective } from '../../helper/sticky-header.directive';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { setPageTitle } from '../../helper/page-title';

@Component({
  selector: 'app-contribute',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    TranslocoPipe,
    ScrollFadeComponent,
    StickyHeaderDirective,
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
