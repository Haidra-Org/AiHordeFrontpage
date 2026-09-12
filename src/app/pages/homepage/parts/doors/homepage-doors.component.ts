import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsDoorComponent } from '../../../../components/gs-door/gs-door.component';
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
 * The doors are the same card the installed app and the documentation use, so a
 * reader who has pressed one anywhere has pressed all of them.
 */
@Component({
  selector: 'app-homepage-doors',
  imports: [TranslocoPipe, GsDoorComponent, ScrollRevealDirective],
  templateUrl: './homepage-doors.component.html',
  styleUrl: './homepage-doors.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomepageDoorsComponent {
  private readonly router = inject(Router);

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

  public enter(door: HomeDoor): void {
    if (door.external) {
      globalThis.open?.(door.link, '_blank', 'noopener');
      return;
    }
    void this.router.navigateByUrl(door.link);
  }
}
