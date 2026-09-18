import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../../components/icon/icon.component';
import {
  HOME_SHOWCASE_FIRST,
  showcaseImageUrl,
} from '../../../../content/home-showcase';
import { ScrollRevealDirective } from '../../../../directives/scroll-reveal.directive';

/** One of the three places the home page sends a reader. */
interface HomeDoor {
  id: string;
  /** The mark of the place the door leads to, an app-icon name. */
  icon: string;
  titleKey: string;
  metaKey: string;
  link: string;
  /** True where the destination is published outside this site. */
  external?: boolean;
}

/**
 * The three things anybody can do here: make something, help run the service,
 * or build on it.
 *
 * Their common chassis makes them one family; the illustration inside each one
 * says what kind of participation waits behind it without borrowing the
 * modality colours used elsewhere on the site.
 */
@Component({
  selector: 'app-homepage-doors',
  imports: [TranslocoPipe, IconComponent, ScrollRevealDirective],
  templateUrl: './homepage-doors.component.html',
  styleUrl: './homepage-doors.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomepageDoorsComponent {
  private readonly router = inject(Router);

  /** A small run of the same published outputs the hero draws from. */
  public readonly generatePreviews = HOME_SHOWCASE_FIRST.slice(0, 6).map(
    showcaseImageUrl,
  );

  public readonly doors: readonly HomeDoor[] = [
    {
      id: 'generate',
      icon: 'photo',
      titleKey: 'homepage.doors.generate_title',
      metaKey: 'homepage.doors.generate_meta',
      link: '/generate/image',
    },
    {
      id: 'contribute',
      icon: 'heart',
      titleKey: 'homepage.doors.contribute_title',
      metaKey: 'homepage.doors.contribute_meta',
      link: '/contribute',
    },
    {
      id: 'build',
      icon: 'code-bracket',
      titleKey: 'homepage.doors.build_title',
      metaKey: 'homepage.doors.build_meta',
      link: 'https://aihorde.net/api/',
      external: true,
    },
  ];

  /**
   * Keep ordinary in-app presses in the client router while leaving modified
   * presses and the published API link to the browser like any other link.
   */
  public enter(event: MouseEvent, door: HomeDoor): void {
    if (
      door.external ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    void this.router.navigateByUrl(door.link);
  }
}
