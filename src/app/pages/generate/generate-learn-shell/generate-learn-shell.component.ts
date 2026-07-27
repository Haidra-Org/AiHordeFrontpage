import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { IconComponent } from '../../../components/icon/icon.component';

/** One entry of the Learn subnav. */
export interface LearnNavEntry {
  /** `generate.learn.nav_*`, the entry's own short label. */
  labelKey: string;
  /** Where pressing the entry goes. */
  link: string;
  /**
   * The URL the entry stands for, which is not always where it goes: the
   * examples are only reachable one flow at a time, so the entry deep-links a
   * flow but is the entry for all of them.
   */
  activePath: string;
  /** Registry name of the glyph shown beside the label. */
  icon: string;
  /**
   * Whether only `activePath` itself counts as being here. Overview is the
   * area's own landing page, so every page beneath it would otherwise light it.
   */
  exact: boolean;
}

/**
 * The Learn area's pages, in the order they are offered. Adding a page here is
 * the whole of adding it to the subnav.
 *
 * The entries take no section identity: the eight identities name areas of the
 * control panel, and none of these pages is one of them. A neutral chip is more
 * honest than borrowing a hue that already means something else.
 */
export const LEARN_NAV: readonly LearnNavEntry[] = [
  {
    labelKey: 'generate.learn.nav_overview',
    link: '/generate/learn',
    activePath: '/generate/learn',
    icon: 'home',
    exact: true,
  },
  {
    labelKey: 'generate.learn.nav_tutorials',
    link: '/generate/learn/tutorials/txt2img',
    activePath: '/generate/learn/tutorials',
    icon: 'document-text',
    exact: false,
  },
  {
    labelKey: 'generate.learn.nav_guide',
    link: '/generate/learn/guide',
    activePath: '/generate/learn/guide',
    icon: 'question-mark-circle',
    exact: false,
  },
];

/**
 * The Learn area's own shell: a subnav that persists across the landing page,
 * the worked examples and the written guide, above the outlet those render in.
 * It sits beneath the studio shell's tab bar rather than beside it, so the tab
 * bar goes on naming tools and this names pages.
 */
@Component({
  selector: 'app-generate-learn-shell',
  imports: [RouterOutlet, RouterLink, TranslocoPipe, IconComponent],
  templateUrl: './generate-learn-shell.component.html',
  host: {
    class: 'gs-learn-shell',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateLearnShellComponent {
  private readonly router = inject(Router);

  public readonly entries = LEARN_NAV;

  /**
   * The path on screen. Read from the router rather than through
   * `routerLinkActive`, because an entry's own URL is not always the one it
   * should light up for.
   */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.pathOf(this.router.url)),
    ),
    { initialValue: this.pathOf(this.router.url) },
  );

  public isActive(entry: LearnNavEntry): boolean {
    const path = this.path();
    return entry.exact
      ? path === entry.activePath
      : path === entry.activePath || path.startsWith(`${entry.activePath}/`);
  }

  private pathOf(url: string): string {
    return url.split('?')[0].split('#')[0];
  }
}
