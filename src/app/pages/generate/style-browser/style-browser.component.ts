import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { TranslocoPipe } from '@jsverse/transloco';
import { useScrollLock } from '../../../helper/scroll-lock';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  GsIndexRailComponent,
  GsIndexRailEntry,
} from '../../../components/gs-index-rail/gs-index-rail.component';
import {
  STYLE_PREVIEW_VARIANTS,
  StylePreviewVariant,
  StylePreviewsService,
} from '../../../services/style-previews.service';
import { StyleUsageService } from '../../../services/style-usage.service';
import { DatabaseService } from '../../../services/database.service';
import { GenerateFormGroup, StylePickerGroup } from '../generate-form.model';

/** How the body is arranged: curated categories, or a flat most-used list. */
export type StyleBrowserSort = 'category' | 'used';

/**
 * Which preview subject the cards show. `all` shows every subject a style has
 * side by side, which is the default: it showcases the style rather than
 * reducing it to one thumbnail.
 */
export type StyleBrowserVariantOption = 'all' | StylePreviewVariant;

/** One card in the browser: a style, its previews, and the user's usage count. */
export interface StyleBrowserCard {
  name: string;
  /** One URL in a single-subject mode, up to three in `all`, empty when none. */
  previewUrls: string[];
  count: number;
}

/** A rendered section of cards, titled by its curated category. */
export interface StyleBrowserSection {
  category: string;
  cards: StyleBrowserCard[];
}

/** One render on show in the enlarged layer, tagged with the subject it is. */
export interface StyleBrowserShot {
  variant: StylePreviewVariant;
  url: string;
}

/** The style shown in the enlarged preview layer, with its place in the list. */
export interface StyleBrowserExpanded {
  name: string;
  /** Position in {@link StyleBrowserComponent.visibleNames}, for the counter. */
  index: number;
  total: number;
  /**
   * Every subject in `all`, or the single chosen one otherwise. Empty when the
   * style has no render at all.
   */
  shots: StyleBrowserShot[];
}

/**
 * How far a drag on the control dock has to travel, and how much more of that
 * travel has to be vertical than horizontal, before it counts as a swipe. Short
 * enough to be worth the gesture on a dock only a few rows tall, long enough
 * that a thumb settling on a chip does not fold the dock away.
 */
const DOCK_SWIPE_PX = 24;

/** How many favourites the pinned strip shows at most. */
const MOST_USED_LIMIT = 10;

/** Where the "show mature styles" choice is remembered between visits. */
const MATURE_PREF_KEY = 'aihorde.generate.style_browser_mature';

/** Where the fullscreen choice is remembered between visits. */
const FULLSCREEN_PREF_KEY = 'aihorde.generate.style_browser_fullscreen';

/**
 * Curated categories whose members are mature as a body. The catalogue already
 * groups these deliberately, which makes membership a far better signal than
 * anything a style's name can be read for.
 */
const MATURE_CATEGORIES = new Set(['furries', 'horrors', 'ponies']);

/**
 * Name fragments that mark a style as mature wherever it is filed. Kept to
 * unambiguous markers only, because a name is weak evidence: "horror" would also
 * take "impressionist horror comic", which is why the categories carry that
 * judgement now. Matched case-insensitively as substrings, so the entries are
 * stems rather than whole words ("yiff" catches "yiffy"). Several have no match
 * in today's catalogue and are kept because it is fetched from a repository that
 * keeps growing.
 */
const MATURE_NAME_KEYWORDS = [
  'nsfw',
  'hentai',
  'lewd',
  'nude',
  'gore',
  'erotic',
  'yiff',
] as const;

/**
 * Whether a style should be hidden while the mature toggle is off.
 *
 * The catalogue carries no maturity flag, so this stands in for one: primarily
 * the curated categories the style is filed under, with a name check for the few
 * unambiguous markers that turn up outside them. `categories` should be every
 * category the style belongs to, not just the one it is being rendered under.
 * A single function, so that a real discriminator, once the catalogue offers
 * one, replaces it here and nowhere else.
 */
export function isMatureStyle(
  name: string,
  categories: readonly string[],
): boolean {
  if (
    categories.some((category) => MATURE_CATEGORIES.has(category.toLowerCase()))
  ) {
    return true;
  }
  const lower = name.toLowerCase();
  return MATURE_NAME_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * A preview browser for the curated style catalogue, projected over the
 * /generate form. Cards are rendered from the same `styleGroups` the control
 * panel already receives, with preview renders supplied lazily by
 * {@link StylePreviewsService} (name-only cards when those are unavailable) and
 * usage counts by {@link StyleUsageService}. Picking a card writes the parent
 * form's `styleName` control, so the existing style-lock and kudos paths react
 * exactly as they do for the plain select.
 */
@Component({
  selector: 'app-style-browser',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    IconComponent,
    GsIndexRailComponent,
    A11yModule,
  ],
  templateUrl: './style-browser.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class StyleBrowserComponent implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly previewsSvc = inject(StylePreviewsService);
  private readonly db = inject(DatabaseService);
  public readonly usageSvc = inject(StyleUsageService);

  public readonly form = input.required<GenerateFormGroup>();
  /** Curated style presets grouped by category, as the form receives them. */
  public readonly styleGroups = input<StylePickerGroup[]>([]);

  public readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly bar = viewChild<ElementRef<HTMLElement>>('bar');
  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly expandedPanel =
    viewChild<ElementRef<HTMLElement>>('expandedPanel');

  /**
   * The page behind the browser stops scrolling while it is open: the browser
   * covers the whole screen on a phone, where a drag that started on its header
   * or its search field otherwise scrolled the form underneath. Released when
   * the component is destroyed, which is how the browser closes.
   */
  private readonly scrollLock = useScrollLock();

  /** The element focused before the modal opened, restored when it closes. */
  private previousActiveElement: HTMLElement | null = null;
  /** The card that opened the enlarged layer, refocused when it closes. */
  private expandedFrom: HTMLElement | null = null;

  /** The subject options offered, "all" first because it is the default. */
  public readonly variantOptions: readonly StyleBrowserVariantOption[] = [
    'all',
    ...STYLE_PREVIEW_VARIANTS,
  ];
  public readonly query = signal('');

  /**
   * Whether the mobile control bar is folded away. The bar is pinned at the
   * bottom on small screens, so folding lets the results reclaim that space;
   * desktop ignores this (the bar lives in the header there).
   */
  public readonly barFolded = signal(false);

  public toggleBarFolded(): void {
    this.barFolded.update((v) => !v);
  }

  /** The pointer a dock drag is following, and where it started. */
  private dockPointer: number | null = null;
  private dockStartX = 0;
  private dockStartY = 0;
  /** Whether the current gesture already read as a swipe rather than a tap. */
  private dockSwiped = false;
  /** Whether the dock took the pointer off the control the drag started on. */
  private dockCaptured = false;

  /**
   * The dock answers a swipe as well as its chevron: on a phone the dock is
   * within thumb reach and the chevron is a small target above it, so pushing
   * the dock down to get it out of the way and pulling it up to get it back is
   * the gesture the shape invites. It is the same fold either way.
   *
   * A drag that starts in the search field is left alone, so selecting text and
   * placing a caret behave as they do in any other field.
   */
  public onDockPointerDown(event: PointerEvent): void {
    if (event.button > 0 || this.isTextEntry(event.target)) {
      return;
    }
    this.dockPointer = event.pointerId;
    this.dockStartX = event.clientX;
    this.dockStartY = event.clientY;
    this.dockSwiped = false;
    this.dockCaptured = false;
  }

  /**
   * The fold happens as soon as the travel qualifies rather than on release, so
   * the dock answers under the thumb. One fold per gesture: the rest of the
   * travel is ignored.
   *
   * The pointer is only captured at that moment, never at the start of the
   * drag: a captured pointer sends its click to whatever holds it, so capturing
   * every touch on the dock would take the click away from the chip the reader
   * simply tapped.
   */
  public onDockPointerMove(event: PointerEvent): void {
    if (this.dockPointer !== event.pointerId || this.dockSwiped) {
      return;
    }
    const dy = event.clientY - this.dockStartY;
    const dx = event.clientX - this.dockStartX;
    if (Math.abs(dy) < DOCK_SWIPE_PX || Math.abs(dy) <= Math.abs(dx)) {
      return;
    }
    this.dockSwiped = true;
    this.dockCaptured = true;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    // Up asks for the dock, down puts it away; a swipe the way the dock already
    // is means nothing rather than folding it back.
    if (dy < 0 === this.barFolded()) {
      this.toggleBarFolded();
    }
  }

  public onDockPointerUp(event: PointerEvent): void {
    if (this.dockPointer !== event.pointerId) {
      return;
    }
    if (this.dockCaptured) {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(
        event.pointerId,
      );
      this.dockCaptured = false;
    }
    this.dockPointer = null;
  }

  /**
   * Swallow the click a swipe leaves behind. A gesture that started on a chip
   * and travelled far enough to fold the dock has been answered already, and
   * the browser would otherwise follow it with a click on that chip. Capturing,
   * so it is stopped before the chip's own handler sees it, and only ever one
   * click, so the tap after the swipe is an ordinary tap again.
   */
  private readonly swallowDockClick = (event: MouseEvent): void => {
    if (!this.dockSwiped) {
      return;
    }
    this.dockSwiped = false;
    event.preventDefault();
    event.stopPropagation();
  };

  /** Whether a drag starting here is the field's own business. */
  private isTextEntry(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.closest('input') !== null;
  }

  /**
   * Whether styles {@link isMatureStyle} flags are listed. Off by default: the
   * previews are shown unprompted and at size, so the risque and the grisly are
   * opted into rather than out of.
   */
  public readonly showMature = signal(
    this.db.get<boolean>(MATURE_PREF_KEY, false) === true,
  );

  public toggleMature(): void {
    this.showMature.update((v) => !v);
    this.db.store(MATURE_PREF_KEY, this.showMature());
    // A style that just disappeared must not stay open in the enlarged layer.
    const expanded = this.expandedName();
    if (expanded !== null && !this.visibleNames().includes(expanded)) {
      this.closeExpanded();
    }
  }

  /**
   * Whether the modal fills the viewport. Purely a size choice, so it is not an
   * Escape layer: only the header button toggles it, and Escape keeps closing
   * the enlarged preview and then the browser as it does at any size.
   */
  public readonly fullscreen = signal(
    this.db.get<boolean>(FULLSCREEN_PREF_KEY, false) === true,
  );

  public toggleFullscreen(): void {
    this.fullscreen.update((v) => !v);
    this.db.store(FULLSCREEN_PREF_KEY, this.fullscreen());
  }

  public readonly variant = signal<StyleBrowserVariantOption>('all');
  public readonly sort = signal<StyleBrowserSort>('category');
  /** Whether cards are showing every subject, which widens the grid. */
  public readonly isAllVariants = computed(() => this.variant() === 'all');

  public readonly loading = this.previewsSvc.loading;
  public readonly previewsFailed = this.previewsSvc.failed;

  /** Every catalogue style name, in curated order and de-duplicated. */
  private readonly knownNames = computed(() => {
    const names = new Set<string>();
    for (const group of this.styleGroups()) {
      for (const name of group.names) {
        names.add(name);
      }
    }
    return names;
  });

  /** Style name -> every category it is listed under, for category search. */
  private readonly categoriesByName = computed<Map<string, string[]>>(() => {
    const index = new Map<string, string[]>();
    for (const group of this.styleGroups()) {
      for (const name of group.names) {
        const categories = index.get(name);
        if (categories) {
          categories.push(group.category);
        } else {
          index.set(name, [group.category]);
        }
      }
    }
    return index;
  });

  /** The user's favourites, restricted to styles the catalogue still lists. */
  public readonly mostUsed = computed<StyleBrowserCard[]>(() => {
    const known = this.knownNames();
    return this.usageSvc
      .topStyles(Number.MAX_SAFE_INTEGER)
      .filter(
        (entry) => known.has(entry.name) && this.matchesAnywhere(entry.name),
      )
      .slice(0, MOST_USED_LIMIT)
      .map((entry) => this.card(entry.name));
  });

  /** Curated sections, dropping any left empty by the search filter. */
  public readonly sections = computed<StyleBrowserSection[]>(() =>
    this.styleGroups()
      .map((group) => ({
        category: group.category,
        cards: group.names
          .filter((name) => this.matches(name, [group.category]))
          .map((name) => this.card(name)),
      }))
      .filter((section) => section.cards.length > 0),
  );

  /**
   * The sections as the contents rail reads them. Category names are catalogue
   * data rather than anything this app has words for, so they are given as
   * literal labels; they name no area of the studio either, so the rail takes
   * the neutral hue and no glyph.
   */
  public readonly tocEntries = computed<GsIndexRailEntry[]>(() =>
    this.sections().map((section) => ({
      id: this.sectionId(section.category),
      targetId: this.sectionId(section.category),
      label: section.category,
    })),
  );

  /** The flat "most used" ordering: usage desc, then name, unused styles last. */
  public readonly usedOrder = computed<StyleBrowserCard[]>(() =>
    [...this.knownNames()]
      .filter((name) => this.matchesAnywhere(name))
      .map((name) => this.card(name))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  );

  /**
   * Every card the body currently renders, in visual order and de-duplicated,
   * which is the order the enlarged layer steps through. A style pinned in the
   * "most used" strip and again in its category appears once, at its first
   * (pinned) position.
   */
  public readonly visibleNames = computed<string[]>(() => {
    if (this.sort() === 'used') {
      return this.usedOrder().map((card) => card.name);
    }
    const names: string[] = [];
    const seen = new Set<string>();
    for (const card of [
      ...this.mostUsed(),
      ...this.sections().flatMap((section) => section.cards),
    ]) {
      if (!seen.has(card.name)) {
        seen.add(card.name);
        names.push(card.name);
      }
    }
    return names;
  });

  /** The style open in the enlarged preview layer, or null when it is closed. */
  private readonly expandedName = signal<string | null>(null);
  /**
   * The enlarged layer's own subject, kept while stepping between styles. Always
   * `all` on open rather than remembered: the contact sheet is the useful first
   * look at a style, and one tap gets to any single subject from there.
   */
  private readonly expandedVariantSignal =
    signal<StyleBrowserVariantOption>('all');
  public readonly expandedVariant = this.expandedVariantSignal.asReadonly();
  /** Whether the layer is showing the three-up contact sheet. */
  public readonly isExpandedAll = computed(
    () => this.expandedVariantSignal() === 'all',
  );

  public readonly expanded = computed<StyleBrowserExpanded | null>(() => {
    const name = this.expandedName();
    if (name === null) {
      return null;
    }
    const names = this.visibleNames();
    return {
      name,
      index: names.indexOf(name),
      total: names.length,
      shots: this.shots(name, this.expandedVariantSignal()),
    };
  });

  /**
   * The renders to show for `name`. `all` lists every subject the repo actually
   * has, without substitution, so the sheet never shows one render twice; a
   * single subject falls back to whatever the style does have, so choosing one
   * never empties the layer.
   */
  private shots(
    name: string,
    variant: StyleBrowserVariantOption,
  ): StyleBrowserShot[] {
    if (variant !== 'all') {
      const url = this.previewsSvc.previewUrl(name, variant);
      return url === null ? [] : [{ variant, url }];
    }
    const preview = this.previewsSvc.previews()?.[name];
    if (!preview) {
      return [];
    }
    return STYLE_PREVIEW_VARIANTS.flatMap((subject) => {
      const url = preview[subject];
      return url === null ? [] : [{ variant: subject, url }];
    });
  }

  /** Whether the search filter left nothing to show in the current sort. */
  public readonly isEmpty = computed(() =>
    this.sort() === 'used'
      ? this.usedOrder().length === 0
      : this.sections().length === 0 && this.mostUsed().length === 0,
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const bar = this.bar()?.nativeElement;
      if (!bar) {
        return;
      }
      bar.addEventListener('click', this.swallowDockClick, true);
      destroyRef.onDestroy(() =>
        bar.removeEventListener('click', this.swallowDockClick, true),
      );
    });
  }

  public ngOnInit(): void {
    // Lazy by design: the previews payload is only worth fetching once a user
    // actually asks to browse styles.
    this.previewsSvc.load();
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.scrollLock.enable();
    const active = document.activeElement;
    this.previousActiveElement = active instanceof HTMLElement ? active : null;
    // The panel renders in this same change detection pass, so focus moves on
    // the next tick. The search field is the target rather than whatever the
    // focus trap would capture first: the reader came to look for a style.
    setTimeout(() => {
      const input = this.searchInput()?.nativeElement;
      (input ?? this.panel()?.nativeElement)?.focus();
    }, 0);
  }

  public ngOnDestroy(): void {
    this.previousActiveElement?.focus();
    this.previousActiveElement = null;
  }

  public setQuery(value: string): void {
    this.query.set(value);
  }

  public setVariant(variant: StyleBrowserVariantOption): void {
    this.variant.set(variant);
  }

  public setSort(sort: StyleBrowserSort): void {
    this.sort.set(sort);
  }

  /** The DOM id of a section, so the contents rail can target it. */
  public sectionId(category: string): string {
    return `gs-sb-sec-${category.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  }

  /** The style the form currently selects, so its card can show as active. */
  public selectedStyle(): string {
    return this.form().controls.styleName.value;
  }

  /**
   * Pick a style: write it through the form control (the same path the plain
   * select uses, so every dependant recomputes) and dismiss the browser.
   */
  public select(name: string): void {
    const control = this.form().controls.styleName;
    if (control.value !== name) {
      control.setValue(name);
      control.markAsDirty();
    }
    this.onClose();
  }

  public onClose(): void {
    this.closed.emit();
  }

  /** Close only when the backdrop itself is clicked, not the panel within it. */
  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  /**
   * Open the enlarged preview for `name`, always on the three-up contact sheet
   * regardless of what the grid behind is set to. Stepping between styles keeps
   * whatever subject the user then chose; reopening starts from `all` again.
   */
  public openExpanded(name: string, event?: Event): void {
    const target = event?.currentTarget;
    this.expandedFrom = target instanceof HTMLElement ? target : null;
    this.expandedVariantSignal.set('all');
    this.expandedName.set(name);
    this.preloadNeighbours(name);
    // The layer renders in this same change detection pass, so focus moves on
    // the next tick, as it does for the browser panel itself.
    setTimeout(() => this.expandedPanel()?.nativeElement.focus(), 0);
  }

  public closeExpanded(): void {
    if (this.expandedName() === null) {
      // Escape reaches both the layer's own binding and the document handler,
      // so closing has to survive being asked for twice.
      return;
    }
    this.expandedName.set(null);
    this.expandedFrom?.focus();
    this.expandedFrom = null;
  }

  public setExpandedVariant(variant: StyleBrowserVariantOption): void {
    this.expandedVariantSignal.set(variant);
  }

  public expandedNext(): void {
    this.stepExpanded(1);
  }

  public expandedPrev(): void {
    this.stepExpanded(-1);
  }

  /** Close only the enlarged layer when its own backdrop is clicked. */
  public onExpandedBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeExpanded();
    }
  }

  /** Move `delta` styles along the visible order, wrapping at both ends. */
  private stepExpanded(delta: number): void {
    const names = this.visibleNames();
    const current = this.expandedName();
    if (current === null || names.length < 2) {
      return;
    }
    const index = names.indexOf(current);
    if (index === -1) {
      return;
    }
    const next = names[(index + delta + names.length) % names.length];
    this.expandedName.set(next);
    this.preloadNeighbours(next);
  }

  /**
   * Warm the images either side of `name` so stepping does not wait on a fetch.
   * Purely opportunistic: nothing depends on the result.
   */
  private preloadNeighbours(name: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const names = this.visibleNames();
    const index = names.indexOf(name);
    if (index === -1) {
      return;
    }
    const variant = this.expandedVariantSignal();
    for (const delta of [-1, 1]) {
      const neighbour = names[(index + delta + names.length) % names.length];
      for (const shot of this.shots(neighbour, variant)) {
        new Image().src = shot.url;
      }
    }
  }

  /**
   * The enlarged layer's own keys while it is open. Tab is left to the CDK
   * focus traps on the panel and on the layer. Escape is bound on the browser
   * overlay itself (as in the CivitAI picker), so it is not handled twice while
   * focus is inside the panel; the enlarged layer sits outside that overlay, so
   * its Escape is handled here and unwinds one layer.
   */
  public onKeydown(event: KeyboardEvent): void {
    if (this.expandedName() !== null) {
      this.onExpandedKeydown(event);
    }
  }

  private onExpandedKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeExpanded();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.expandedNext();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.expandedPrev();
    }
  }

  /**
   * Whether a style survives the current filters. `categories` are the category
   * names the style is being considered under: a query that names a category
   * surfaces everything in it, so a user can search "halloween" without knowing
   * any of its style names.
   */
  private matches(name: string, categories: readonly string[]): boolean {
    // Maturity is judged against every category the style belongs to, not the
    // one section it happens to be rendered under: a style filed in `furries`
    // stays hidden wherever else it is also listed.
    if (
      !this.showMature() &&
      isMatureStyle(name, this.matureCategories(name))
    ) {
      return false;
    }
    const query = this.query().trim().toLowerCase();
    if (query === '') {
      return true;
    }
    return (
      name.toLowerCase().includes(query) ||
      categories.some((category) => category.toLowerCase().includes(query))
    );
  }

  /**
   * The categories maturity is judged against. The catalogue files a style's
   * `_raw` variant separately from the style itself and often leaves it out of
   * the category lists, so the variant inherits its base style's categories
   * rather than reading as uncategorised.
   */
  private matureCategories(name: string): string[] {
    const index = this.categoriesByName();
    const base = name.endsWith('_raw')
      ? (index.get(name.slice(0, -'_raw'.length)) ?? [])
      : [];
    return [...(index.get(name) ?? []), ...base];
  }

  /** The flat lists have no section to sit under, so they match on all of them. */
  private matchesAnywhere(name: string): boolean {
    return this.matches(name, this.categoriesByName().get(name) ?? []);
  }

  private card(name: string): StyleBrowserCard {
    const variant = this.variant();
    const previewUrls =
      variant === 'all'
        ? this.previewsSvc.previewUrls(name)
        : // A single-subject mode falls back to whatever the style does have, so
          // a card is never blank just because one subject is missing.
          [this.previewsSvc.previewUrl(name, variant)].filter(
            (url): url is string => url !== null,
          );
    return { name, previewUrls, count: this.usageSvc.count(name) };
  }
}
