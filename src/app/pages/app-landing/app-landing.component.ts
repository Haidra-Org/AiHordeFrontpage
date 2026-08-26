import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsDoorComponent } from '../../components/gs-door/gs-door.component';
import { AuthService } from '../../services/auth.service';
import { TranslatorService } from '../../services/translator.service';
import { setPageTitle } from '../../helper/page-title';

/** One of the four places the landing leads to. */
interface AppLandingDoor {
  id: string;
  titleKey: string;
  noteKey: string;
  link: string;
  /** The mark of the place the door leads to, an app-icon name. */
  icon: string;
}

/**
 * The first screen of the installed app: the site's name, a line saying what it
 * is, and the four places anybody opens it to reach.
 *
 * An installed window has no address bar and opens on `start_url` with no
 * memory of how the reader got here, so the choice has to be on the screen
 * rather than in a menu. The four are doors of the same kind the studio and the
 * documentation use, so a reader who has pressed one anywhere has pressed all
 * of them.
 */
@Component({
  selector: 'app-app-landing',
  imports: [TranslocoPipe, DecimalPipe, GsDoorComponent],
  templateUrl: './app-landing.component.html',
  styleUrl: './app-landing.component.css',
  host: {
    /* `gen-studio` is the scope the studio's design tokens are declared on and
       `hd-deep` selects the neutral dark surfaces; the landing borrows both so
       the doors look the same here as where they lead. */
    class: 'gen-studio hd-deep gs-app-landing',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppLandingComponent {
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  /** The signed-in reader, or null when nobody is signed in. */
  public readonly user = this.auth.currentUser;
  public readonly kudos = this.auth.kudos;

  /** The three doors that lead to work; the account door carries a name. */
  public readonly doors: readonly AppLandingDoor[] = [
    {
      id: 'generate',
      icon: 'photo',
      titleKey: 'app_landing.generate_title',
      noteKey: 'app_landing.generate_note',
      link: '/generate/image',
    },
    {
      id: 'alchemy',
      icon: 'beaker',
      titleKey: 'app_landing.alchemy_title',
      noteKey: 'app_landing.alchemy_note',
      link: '/generate/alchemy',
    },
    {
      id: 'learn',
      icon: 'academic-cap',
      titleKey: 'app_landing.learn_title',
      noteKey: 'app_landing.learn_note',
      link: '/docs',
    },
  ];

  public readonly accountLink = '/profile';

  constructor() {
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'app_landing.title',
    );
  }

  public enter(link: string): void {
    void this.router.navigateByUrl(link);
  }
}
