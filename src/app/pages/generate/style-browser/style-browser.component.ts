import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  STYLE_PREVIEW_VARIANTS,
  StylePreviewVariant,
  StylePreviewsService,
} from '../../../services/style-previews.service';
import { StyleUsageService } from '../../../services/style-usage.service';
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

/** How many favourites the pinned strip shows at most. */
const MOST_USED_LIMIT = 10;

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
  imports: [NgTemplateOutlet, TranslocoPipe, IconComponent],
  templateUrl: './style-browser.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class StyleBrowserComponent implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly previewsSvc = inject(StylePreviewsService);
  public readonly usageSvc = inject(StyleUsageService);

  public readonly form = input.required<GenerateFormGroup>();
  /** Curated style presets grouped by category, as the form receives them. */
  public readonly styleGroups = input<StylePickerGroup[]>([]);

  public readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** The element focused before the modal opened, restored when it closes. */
  private previousActiveElement: HTMLElement | null = null;

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

  /** The user's favourites, restricted to styles the catalogue still lists. */
  public readonly mostUsed = computed<StyleBrowserCard[]>(() => {
    const known = this.knownNames();
    return this.usageSvc
      .topStyles(Number.MAX_SAFE_INTEGER)
      .filter((entry) => known.has(entry.name) && this.matches(entry.name))
      .slice(0, MOST_USED_LIMIT)
      .map((entry) => this.card(entry.name));
  });

  /** Curated sections, dropping any left empty by the search filter. */
  public readonly sections = computed<StyleBrowserSection[]>(() =>
    this.styleGroups()
      .map((group) => ({
        category: group.category,
        cards: group.names
          .filter((name) => this.matches(name))
          .map((name) => this.card(name)),
      }))
      .filter((section) => section.cards.length > 0),
  );

  /** The flat "most used" ordering: usage desc, then name, unused styles last. */
  public readonly usedOrder = computed<StyleBrowserCard[]>(() =>
    [...this.knownNames()]
      .filter((name) => this.matches(name))
      .map((name) => this.card(name))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  );

  /** Whether the search filter left nothing to show in the current sort. */
  public readonly isEmpty = computed(() =>
    this.sort() === 'used'
      ? this.usedOrder().length === 0
      : this.sections().length === 0 && this.mostUsed().length === 0,
  );

  public ngOnInit(): void {
    // Lazy by design: the previews payload is only worth fetching once a user
    // actually asks to browse styles.
    this.previewsSvc.load();
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const active = document.activeElement;
    this.previousActiveElement = active instanceof HTMLElement ? active : null;
    // The panel renders in this same change detection pass, so focus moves on
    // the next tick, matching the admin dialog's behaviour.
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
   * Tab trapping only. Escape is bound on the overlay itself (as in the CivitAI
   * picker), so it is not handled twice while focus is inside the panel.
   */
  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  /** Keep Tab cycling inside the panel while the modal owns the screen. */
  private trapFocus(event: KeyboardEvent): void {
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return;
    }
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private matches(name: string): boolean {
    const query = this.query().trim().toLowerCase();
    return query === '' || name.toLowerCase().includes(query);
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
