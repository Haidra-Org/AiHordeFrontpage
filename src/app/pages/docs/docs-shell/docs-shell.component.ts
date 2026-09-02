import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsToolTabsComponent } from '../../../components/gs-tool-tabs/gs-tool-tabs.component';
import { StickyHeaderDirective } from '../../../helper/sticky-header.directive';
import {
  DOCS_ALCHEMY,
  DOCS_IMAGE,
  DOCS_IMAGE_CONTROL_TYPES,
  DOCS_IMAGE_SETTINGS,
  STUDIO_ALCHEMY,
  STUDIO_IMAGE,
  docsAlchemyUseCaseLink,
  docsExampleLink,
} from '../../../content/docs-links';
import {
  ALCHEMY_USE_CASES,
  alchemyUseCaseTitleKey,
} from '../../../content/alchemy-usecases';
import { SECTION_IDENTITIES } from '../../../content/sections';

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

/** One entry of the docs area switcher and studio jump row. */
export interface DocsAreaBridgeEntry {
  id: string;
  labelKey: string;
  icon: string;
  docsLink: string;
  studioLink: string;
}

/**
 * The documented areas.
 *
 * The image area's entries take no section identity: those identities name
 * cards of the control panel, and none of the image pages is one card. The
 * alchemy area is the exception because the whole studio is one identity, so
 * its entries wear the mark the panel and the `?` notes already wear.
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
        labelKey: 'docs.nav_control_types',
        link: DOCS_IMAGE_CONTROL_TYPES,
        activePath: DOCS_IMAGE_CONTROL_TYPES,
        icon: 'sec-source',
        exact: false,
      },
    ],
  },
  {
    id: 'alchemy',
    labelKey: 'docs.area_alchemy',
    icon: SECTION_IDENTITIES.alchemy.icon,
    root: DOCS_ALCHEMY,
    entries: [
      {
        labelKey: 'generate.learn.nav_overview',
        link: DOCS_ALCHEMY,
        activePath: DOCS_ALCHEMY,
        icon: 'home',
        exact: true,
      },
      // The area is four pages, so the subnav is the four pages. An index entry
      // standing for all of them would be the landing page a second time.
      ...ALCHEMY_USE_CASES.map((useCase) => ({
        labelKey: alchemyUseCaseTitleKey(useCase.id),
        link: docsAlchemyUseCaseLink(useCase.id),
        activePath: docsAlchemyUseCaseLink(useCase.id),
        icon: useCase.icon,
        exact: false,
      })),
    ],
  },
];

/**
 * The documentation area's shell: area and studio wayfinding above the outlet
 * and each area's own subnav.
 *
 * A URL that names no area carries neither. `/docs` itself lands on the one area
 * there is, so this is the moment before that redirect rather than a page.
 */
@Component({
  selector: 'app-docs-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    TranslocoPipe,
    IconComponent,
    GsToolTabsComponent,
    StickyHeaderDirective,
  ],
  templateUrl: './docs-shell.component.html',
  host: {
    /* `gen-studio` is the scope the studio's design tokens are declared on and
       `hd-deep` selects the neutral dark surfaces, and the documentation is
       written in the same visual language as the panel it describes. It is not a
       studio; it opts into the studio's vocabulary. */
    class: 'gen-studio hd-deep gs-learn-shell gs-docs',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsShellComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** The studio an area documents, which its row's last door opens. */
  public studioLinkFor(areaId: string): string {
    return areaId === 'alchemy' ? STUDIO_ALCHEMY : STUDIO_IMAGE;
  }

  public readonly areaBridgeEntries: readonly DocsAreaBridgeEntry[] =
    DOCS_AREAS.map((area) => ({
      id: area.id,
      labelKey: area.labelKey,
      icon: area.icon,
      docsLink: area.root,
      studioLink: area.id === 'alchemy' ? STUDIO_ALCHEMY : STUDIO_IMAGE,
    }));

  /** Whether the chrome is pinned, which is where the CSS pins it. */
  private readonly chromePinned = signal(false);

  /**
   * The chrome's place in the sticky stack: under the site nav (order 0) and
   * above anything a page of the area pins for itself. It only takes a place
   * where it is pinned, so the offset the pages read is the height actually
   * standing over them.
   */
  public readonly chromeOrder = computed<number | null>(() =>
    this.chromePinned() ? 10 : null,
  );

  constructor() {
    const mq = globalThis.matchMedia?.('(max-width: 1023.98px)');
    if (!mq) {
      return;
    }
    this.chromePinned.set(mq.matches);
    const onChange = (event: MediaQueryListEvent): void =>
      this.chromePinned.set(event.matches);
    mq.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => mq.removeEventListener('change', onChange));
  }

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

  /**
   * Whether the page on screen wants the phone's tool bar. Every page does
   * unless it says otherwise with `data: { toolTabs: false }`, which is for a
   * page that puts its own controls under the thumb.
   */
  public readonly showToolTabs = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.readToolTabsFlag()),
    ),
    { initialValue: this.readToolTabsFlag() },
  );

  public isActive(entry: DocsNavEntry): boolean {
    const path = this.path();
    return entry.exact
      ? path === entry.activePath
      : path === entry.activePath || path.startsWith(`${entry.activePath}/`);
  }

  public isCurrentArea(areaId: string): boolean {
    return this.area()?.id === areaId;
  }

  /**
   * The flag as the deepest route on screen leaves it. Read from the route
   * rather than from the URL so a page opts out where it is declared.
   */
  private readToolTabsFlag(): boolean {
    let route = this.route;
    while (route.firstChild) route = route.firstChild;
    // During construction the child outlet may not have activated yet, and a
    // route without a snapshot has declared nothing: the bar shows.
    return route.snapshot?.data?.['toolTabs'] !== false;
  }

  private pathOf(url: string): string {
    return url.split('?')[0].split('#')[0];
  }
}
