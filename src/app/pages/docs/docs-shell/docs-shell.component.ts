import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
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
import {
  DOCS_IMAGE,
  DOCS_IMAGE_GUIDE,
  DOCS_IMAGE_SETTINGS,
  DOCS_ROOT,
  docsExampleLink,
} from '../../../content/docs-links';

/** One entry of an area's subnav. */
export interface DocsNavEntry {
  /** The entry's own short label. */
  labelKey: string;
  /** Where pressing the entry goes. */
  link: string;
  /**
   * The URL the entry stands for, which is not always where it goes: the
   * examples are only reachable one technique at a time, so the entry deep-links
   * one but is the entry for all of them.
   */
  activePath: string;
  /** Registry name of the glyph shown beside the label. */
  icon: string;
  /**
   * Whether only `activePath` itself counts as being here. An area's landing
   * page is the prefix of every page beneath it, which would otherwise light it
   * on all of them.
   */
  exact: boolean;
}

/**
 * One documented area of the studio, and the pages it is read in.
 *
 * The shell knows areas rather than pages, so a second studio joining the
 * documentation is one entry here and no change to the chrome.
 */
export interface DocsArea {
  id: string;
  /** The area's name, as the front door and the area switcher say it. */
  labelKey: string;
  icon: string;
  /** The area's landing page, and the prefix every page of it sits under. */
  root: string;
  entries: readonly DocsNavEntry[];
}

/**
 * The documented areas. The entries take no section identity: the eight
 * identities name areas of the control panel, and none of these pages is one of
 * them. A neutral chip is more honest than borrowing a hue that already means
 * something else.
 */
export const DOCS_AREAS: readonly DocsArea[] = [
  {
    id: 'image',
    labelKey: 'docs.area_image',
    icon: 'photo',
    root: DOCS_IMAGE,
    entries: [
      {
        labelKey: 'generate.learn.nav_overview',
        link: DOCS_IMAGE,
        activePath: DOCS_IMAGE,
        icon: 'home',
        exact: true,
      },
      {
        labelKey: 'generate.learn.nav_tutorials',
        link: docsExampleLink('txt2img'),
        activePath: `${DOCS_IMAGE}/learn`,
        icon: 'document-text',
        exact: false,
      },
      {
        labelKey: 'generate.learn.nav_settings',
        link: DOCS_IMAGE_SETTINGS,
        activePath: DOCS_IMAGE_SETTINGS,
        icon: 'adjustments-horizontal',
        exact: false,
      },
      {
        labelKey: 'generate.learn.nav_guide',
        link: DOCS_IMAGE_GUIDE,
        activePath: DOCS_IMAGE_GUIDE,
        icon: 'question-mark-circle',
        exact: false,
      },
    ],
  },
];

/**
 * The documentation area's shell: the name of the area being read, the way back
 * up to the documentation, and that area's own subnav above the outlet its pages
 * render in.
 *
 * A URL that names no area carries neither. `/docs` itself lands on the one area
 * there is, so this is the moment before that redirect rather than a page.
 */
@Component({
  selector: 'app-docs-shell',
  imports: [RouterOutlet, RouterLink, TranslocoPipe, IconComponent],
  templateUrl: './docs-shell.component.html',
  host: {
    /* `gen-studio` is the scope the studio's design tokens are declared on, and
       the documentation is written in the same visual language as the panel it
       describes. It is not a studio; it opts into the studio's vocabulary. */
    class: 'gen-studio gs-learn-shell gs-docs',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsShellComponent {
  private readonly router = inject(Router);

  public readonly docsRoot = DOCS_ROOT;

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

  /** The area being read, or null on the front door itself. */
  public readonly area = computed<DocsArea | null>(() => {
    const path = this.path();
    return (
      DOCS_AREAS.find(
        (area) => path === area.root || path.startsWith(`${area.root}/`),
      ) ?? null
    );
  });

  public readonly entries = computed<readonly DocsNavEntry[]>(
    () => this.area()?.entries ?? [],
  );

  public isActive(entry: DocsNavEntry): boolean {
    const path = this.path();
    return entry.exact
      ? path === entry.activePath
      : path === entry.activePath || path.startsWith(`${entry.activePath}/`);
  }

  private pathOf(url: string): string {
    return url.split('?')[0].split('#')[0];
  }
}
