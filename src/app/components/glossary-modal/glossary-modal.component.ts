import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import { useScrollLock } from '../../helper/scroll-lock';
import {
  GlossaryService,
  GlossaryCategory,
  GlossaryTab,
  GlossaryTerm,
  PageGlossaryContext,
  PageGlossaryEntry,
  GLOSSARY_CATEGORIES,
  GLOSSARY_TERMS,
} from '../../services/glossary.service';

@Component({
  selector: 'app-glossary-modal',
  imports: [TranslocoPipe, RouterLink, IconComponent],
  template: `
    @if (glossary.isOpen()) {
      <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'help.glossary.title' | transloco"
        (keydown.escape)="close()"
      >
        <button
          type="button"
          aria-label="Close glossary dialog"
          class="modal-backdrop modal-backdrop--blur"
          (click)="close()"
        ></button>
        <div class="modal-panel modal-panel--xl glossary-modal-panel">
          <!-- Header -->
          <div class="modal-header">
            <h2 class="modal-title">{{ 'help.glossary.title' | transloco }}</h2>
            <button
              type="button"
              class="modal-close"
              (click)="close()"
              [attr.aria-label]="'admin.workers.dialog.close' | transloco"
            >
              <app-icon class="w-5 h-5" name="x-mark" />
            </button>
          </div>

          <!-- Tab bar -->
          <div class="glossary-tab-bar" role="tablist">
            <button
              type="button"
              role="tab"
              class="glossary-tab"
              [class.glossary-tab-active]="
                glossary.activeTab() === 'dictionary'
              "
              [attr.aria-selected]="glossary.activeTab() === 'dictionary'"
              aria-controls="glossary-panel-dictionary"
              (click)="switchTab('dictionary')"
            >
              {{ 'help.glossary.tab.dictionary' | transloco }}
            </button>
            @for (ctx of pageContextList(); track ctx.pageId) {
              <button
                type="button"
                role="tab"
                class="glossary-tab"
                [class.glossary-tab-active]="
                  glossary.activeTab() === 'this-page' &&
                  glossary.activePageId() === ctx.pageId
                "
                [attr.aria-selected]="
                  glossary.activeTab() === 'this-page' &&
                  glossary.activePageId() === ctx.pageId
                "
                [attr.aria-controls]="'glossary-panel-page-' + ctx.pageId"
                (click)="switchToPageTab(ctx.pageId)"
              >
                {{ ctx.pageTitleKey | transloco }}
              </button>
            }
          </div>

          <!-- Dictionary tab panel -->
          @if (glossary.activeTab() === 'dictionary') {
            <div id="glossary-panel-dictionary" role="tabpanel">
              <!-- Search + relevant-only filter -->
              <div class="glossary-search">
                <input
                  #searchInput
                  type="text"
                  class="form-input w-full"
                  [placeholder]="'help.glossary.search_placeholder' | transloco"
                  [value]="searchQuery()"
                  (input)="onSearchChange($event)"
                />
              </div>

              <!-- Category Tabs + Relevant filter -->
              <div class="glossary-categories">
                <button
                  type="button"
                  class="glossary-category-btn"
                  [class.glossary-category-active]="activeCategory() === null"
                  (click)="setCategory(null)"
                >
                  {{ 'help.glossary.category.all' | transloco }}
                </button>
                @for (cat of categories; track cat.id) {
                  <button
                    type="button"
                    class="glossary-category-btn"
                    [class.glossary-category-active]="
                      activeCategory() === cat.id
                    "
                    (click)="setCategory(cat.id)"
                  >
                    {{ cat.labelKey | transloco }}
                  </button>
                }
                @if (glossary.pageContext()?.relevantTermIds?.length) {
                  <button
                    type="button"
                    class="glossary-relevant-toggle"
                    [class.glossary-relevant-toggle-active]="showRelevantOnly()"
                    (click)="toggleRelevantOnly()"
                  >
                    {{ 'help.glossary.relevant_only' | transloco }}
                  </button>
                }
              </div>

              <!-- Terms List -->
              <div class="modal-scroll glossary-terms-list">
                @for (term of filteredTerms(); track term.id) {
                  <div
                    class="glossary-term"
                    [id]="'glossary-term-' + term.id"
                    [class.glossary-term-active]="
                      glossary.activeTermId() === term.id
                    "
                  >
                    <h3 class="glossary-term-title">
                      {{ term.titleKey | transloco }}
                    </h3>
                    <p class="glossary-term-body">
                      {{ term.bodyKey | transloco }}
                    </p>
                    @if (term.faqFragment || term.links?.length) {
                      <div class="glossary-term-links">
                        @if (term.faqFragment) {
                          <a
                            class="glossary-faq-link"
                            routerLink="/faq"
                            [fragment]="term.faqFragment"
                            (click)="close()"
                          >
                            {{ 'help.glossary.read_more_faq' | transloco }}
                          </a>
                        }
                        @for (link of term.links; track link.routerLink) {
                          <a
                            class="glossary-faq-link"
                            [routerLink]="link.routerLink"
                            [fragment]="link.fragment"
                            (click)="close()"
                          >
                            {{ link.labelKey | transloco }}
                          </a>
                        }
                      </div>
                    }
                  </div>
                } @empty {
                  <p class="text-secondary text-sm">
                    {{ 'help.glossary.no_results' | transloco }}
                  </p>
                }
              </div>
            </div>
          }

          <!-- Page-context tab panel -->
          @if (glossary.activeTab() === 'this-page' && activePageContext()) {
            <div
              [id]="'glossary-panel-page-' + activePageContext()!.pageId"
              role="tabpanel"
            >
              <!-- The same search the dictionary offers, over what this page
                   holds: its controls and the words it uses. A page with a long
                   list of glyphs is read by looking for one of them. -->
              <div class="glossary-search">
                <input
                  type="text"
                  class="form-input w-full"
                  [placeholder]="
                    'help.glossary.page_filter_placeholder' | transloco
                  "
                  [value]="pageQuery()"
                  (input)="onPageFilterChange($event)"
                />
              </div>
              <div class="modal-scroll glossary-terms-list">
                <!-- The page's unlabelled buttons and marks, first: a reader
                     looking at a row of glyphs is asking what one of them does,
                     and no definition answers that. Read rather than pressed,
                     so each is static text beside the glyph it explains. -->
                @if (pageControls().length > 0) {
                  <section class="glossary-controls-section">
                    <h3 class="glossary-related-heading">
                      {{ 'help.glossary.controls_heading' | transloco }}
                    </h3>
                    <p class="glossary-controls-note">
                      {{ 'help.glossary.controls_note' | transloco }}
                    </p>
                    @for (control of pageControls(); track control.id) {
                      <div
                        class="glossary-page-entry glossary-control-entry"
                        [id]="'glossary-entry-' + control.id"
                      >
                        @if (control.iconName) {
                          <span
                            class="glossary-control-glyph"
                            aria-hidden="true"
                          >
                            <app-icon [name]="control.iconName" />
                          </span>
                        }
                        <div class="glossary-page-entry-content">
                          <h4 class="glossary-page-entry-title">
                            {{ control.titleKey | transloco }}
                          </h4>
                          <p class="glossary-page-entry-desc">
                            {{ control.descriptionKey | transloco }}
                          </p>
                        </div>
                      </div>
                    }
                  </section>
                }
                <!-- Page-specific entries. An entry the page gave an action to
                     is a control and is pressed; one without it is read. The
                     two are written out separately because a button may only
                     hold phrasing content, and the entry a reader cannot press
                     keeps the headed markup it has always had. -->
                @for (entry of pageEntries(); track entry.id) {
                  @if (entry.action) {
                    <button
                      type="button"
                      class="glossary-page-entry glossary-page-entry-action"
                      [id]="'glossary-entry-' + entry.id"
                      (click)="runEntry(entry)"
                    >
                      @if (entry.iconName) {
                        <app-icon
                          [name]="entry.iconName"
                          class="glossary-page-entry-icon"
                          [class]="entry.iconColorClass ?? ''"
                        />
                      } @else if (entry.colorSwatch) {
                        <span
                          class="glossary-page-entry-swatch"
                          [style.background-color]="entry.colorSwatch"
                        ></span>
                      }
                      <span class="glossary-page-entry-content">
                        <span class="glossary-page-entry-title">
                          {{ entry.titleKey | transloco }}
                        </span>
                        <span class="glossary-page-entry-desc">
                          {{ entry.descriptionKey | transloco }}
                        </span>
                      </span>
                    </button>
                  } @else {
                    <div
                      class="glossary-page-entry"
                      [id]="'glossary-entry-' + entry.id"
                    >
                      @if (entry.iconName) {
                        <app-icon
                          [name]="entry.iconName"
                          class="glossary-page-entry-icon"
                          [class]="entry.iconColorClass ?? ''"
                        />
                      } @else if (entry.colorSwatch) {
                        <span
                          class="glossary-page-entry-swatch"
                          [style.background-color]="entry.colorSwatch"
                        ></span>
                      }
                      <div class="glossary-page-entry-content">
                        <h4 class="glossary-page-entry-title">
                          {{ entry.titleKey | transloco }}
                        </h4>
                        <p class="glossary-page-entry-desc">
                          {{ entry.descriptionKey | transloco }}
                        </p>
                      </div>
                    </div>
                  }
                }

                @if (pageFilterEmpty()) {
                  <p class="text-secondary text-sm">
                    {{ 'help.glossary.page_no_results' | transloco }}
                  </p>
                }

                <!-- Related Terms subsection -->
                @if (relevantTerms().length > 0) {
                  <div class="glossary-related-section">
                    <h3 class="glossary-related-heading">
                      {{ 'help.glossary.related_terms' | transloco }}
                    </h3>
                    <div class="glossary-related-list">
                      @for (term of relevantTerms(); track term.id) {
                        <button
                          type="button"
                          class="glossary-related-item"
                          (click)="goToTerm(term.id)"
                        >
                          {{ term.titleKey | transloco }}
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlossaryModalComponent {
  public readonly glossary = inject(GlossaryService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The page underneath stops moving while the glossary covers it. */
  private readonly scrollLock = useScrollLock();

  /** Whatever the reader was on when the glossary opened, to hand focus back. */
  private opener: HTMLElement | null = null;

  public readonly categories = GLOSSARY_CATEGORIES;

  public readonly searchQuery = signal('');
  public readonly activeCategory = signal<GlossaryCategory | null>(null);
  public readonly showRelevantOnly = signal(false);
  /** The this-page tab's filter, over that page's controls, entries and words. */
  public readonly pageQuery = signal('');

  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** All registered page contexts as an array (for @for in template). */
  public readonly pageContextList = computed<PageGlossaryContext[]>(() =>
    Array.from(this.glossary.pageContexts().values()),
  );

  /** Currently active page context (from activePageId). */
  public readonly activePageContext = computed<PageGlossaryContext | null>(
    () => {
      const pageId = this.glossary.activePageId();
      if (!pageId) return null;
      return this.glossary.pageContexts().get(pageId) ?? null;
    },
  );

  public readonly filteredTerms = computed(() => {
    let terms: GlossaryTerm[] = GLOSSARY_TERMS;

    if (this.showRelevantOnly()) {
      const ctx = this.activePageContext();
      const relevant = ctx?.relevantTermIds ?? [];
      if (relevant.length > 0) {
        terms = terms.filter((t) => relevant.includes(t.id));
      }
    }

    const category = this.activeCategory();
    if (category) {
      terms = terms.filter((t) => t.category === category);
    }

    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      terms = terms.filter(
        (t) =>
          t.id.includes(query) ||
          this.transloco.translate(t.titleKey).toLowerCase().includes(query) ||
          this.transloco.translate(t.bodyKey).toLowerCase().includes(query),
      );
    }

    return terms;
  });

  /** The active page's unlabelled controls, matching the page filter. */
  public readonly pageControls = computed<PageGlossaryEntry[]>(() =>
    this.matchingEntries(this.activePageContext()?.controls ?? []),
  );

  /** The active page's own entries, matching the page filter. */
  public readonly pageEntries = computed<PageGlossaryEntry[]>(() =>
    this.matchingEntries(this.activePageContext()?.entries ?? []),
  );

  /** Whether a filter is on and has left the page's own lists with nothing. */
  public readonly pageFilterEmpty = computed(
    () =>
      this.pageQuery().trim() !== '' &&
      this.pageControls().length === 0 &&
      this.pageEntries().length === 0,
  );

  public readonly relevantTerms = computed(() => {
    const ctx = this.activePageContext();
    if (!ctx?.relevantTermIds?.length) return [];
    const terms = GLOSSARY_TERMS.filter((t) =>
      ctx.relevantTermIds.includes(t.id),
    );
    const query = this.pageQuery().toLowerCase().trim();
    if (!query) return terms;
    return terms.filter(
      (t) => t.id.includes(query) || this.matches(t.titleKey, query),
    );
  });

  /** The entries whose name or description carries the filter's words. */
  private matchingEntries(
    entries: readonly PageGlossaryEntry[],
  ): PageGlossaryEntry[] {
    const query = this.pageQuery().toLowerCase().trim();
    if (!query) return [...entries];
    return entries.filter(
      (entry) =>
        entry.id.includes(query) ||
        this.matches(entry.titleKey, query) ||
        this.matches(entry.descriptionKey, query),
    );
  }

  /**
   * Whether a translated line carries the query. A key without a translation
   * reads as no match rather than throwing: the filter is a convenience, and a
   * page that declares a key the catalogue has not caught up with must still
   * be searchable by everything else on it.
   */
  private matches(key: string, query: string): boolean {
    const text: unknown = this.transloco.translate(key);
    return typeof text === 'string' && text.toLowerCase().includes(query);
  }

  constructor() {
    // Scroll to active term/entry when modal opens
    effect(() => {
      const termId = this.glossary.activeTermId();
      const isOpen = this.glossary.isOpen();
      const activeTab = this.glossary.activeTab();
      if (isOpen && termId && isPlatformBrowser(this.platformId)) {
        setTimeout(() => {
          // Try dictionary term first, then page entry
          const prefix =
            activeTab === 'this-page' ? 'glossary-entry-' : 'glossary-term-';
          const el = this.document.getElementById(`${prefix}${termId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    });

    // Focus search input when modal opens on dictionary tab
    effect(() => {
      if (
        this.glossary.isOpen() &&
        this.glossary.activeTab() === 'dictionary'
      ) {
        setTimeout(() => {
          this.searchInput()?.nativeElement.focus();
        }, 100);
      }
      if (!this.glossary.isOpen()) {
        this.searchQuery.set('');
        this.pageQuery.set('');
        this.activeCategory.set(null);
        this.showRelevantOnly.set(false);
      }
    });

    // The glossary covers the whole page, so the page behaves as though it were
    // not there: nothing behind it takes focus or is read out, nothing behind
    // it scrolls, and the control that opened it has the reader back the moment
    // it shuts.
    effect(() => {
      const isOpen = this.glossary.isOpen();
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }
      if (isOpen) {
        this.opener =
          this.document.activeElement instanceof HTMLElement
            ? this.document.activeElement
            : null;
        this.setPageInert(true);
        this.scrollLock.enable();
        return;
      }
      this.setPageInert(false);
      this.scrollLock.disable();
      const opener = this.opener;
      this.opener = null;
      opener?.focus();
    });
  }

  /**
   * Everything the app draws that the glossary is not inside. Read from the
   * modal's own place in the page rather than from a class name, so the dialog's
   * own ancestors are never among what is switched off.
   */
  private setPageInert(inert: boolean): void {
    const root = this.host.nativeElement.parentElement;
    for (const sibling of Array.from(root?.children ?? [])) {
      if (
        sibling instanceof HTMLElement &&
        !sibling.contains(this.host.nativeElement)
      ) {
        if (inert) {
          sibling.setAttribute('inert', '');
        } else {
          sibling.removeAttribute('inert');
        }
      }
    }
  }

  public close(): void {
    this.glossary.close();
  }

  public onSearchChange(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  public onPageFilterChange(event: Event): void {
    this.pageQuery.set((event.target as HTMLInputElement).value);
  }

  public setCategory(category: GlossaryCategory | null): void {
    this.activeCategory.set(category);
  }

  public switchTab(tab: GlossaryTab): void {
    this.glossary.activeTab.set(tab);
    if (tab === 'dictionary') {
      setTimeout(() => {
        this.searchInput()?.nativeElement.focus();
      }, 50);
    }
  }

  public switchToPageTab(pageId: string): void {
    this.glossary.activePageId.set(pageId);
    this.glossary.activeTab.set('this-page');
  }

  public toggleRelevantOnly(): void {
    this.showRelevantOnly.update((v) => !v);
  }

  /**
   * Do what a this-page entry offers. The modal gets out of the way first: the
   * page is where the action happens, and a reader who has just been taken to a
   * control should be looking at it rather than at the dialog that sent them.
   */
  public runEntry(entry: PageGlossaryEntry): void {
    this.close();
    entry.action?.();
  }

  public goToTerm(termId: string): void {
    this.glossary.activeTermId.set(termId);
    this.glossary.activeTab.set('dictionary');
    this.showRelevantOnly.set(false);
    this.activeCategory.set(null);
    this.searchQuery.set('');
    this.pageQuery.set('');
  }
}
