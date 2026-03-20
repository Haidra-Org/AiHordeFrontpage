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
import {
  GlossaryService,
  GlossaryCategory,
  GlossaryTab,
  GlossaryTerm,
  PageGlossaryContext,
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
              <div class="modal-scroll glossary-terms-list">
                <!-- Page-specific entries -->
                @for (entry of activePageContext()!.entries; track entry.id) {
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

  public readonly categories = GLOSSARY_CATEGORIES;

  public readonly searchQuery = signal('');
  public readonly activeCategory = signal<GlossaryCategory | null>(null);
  public readonly showRelevantOnly = signal(false);

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

  public readonly relevantTerms = computed(() => {
    const ctx = this.activePageContext();
    if (!ctx?.relevantTermIds?.length) return [];
    return GLOSSARY_TERMS.filter((t) => ctx.relevantTermIds.includes(t.id));
  });

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
        this.activeCategory.set(null);
        this.showRelevantOnly.set(false);
      }
    });
  }

  public close(): void {
    this.glossary.close();
  }

  public onSearchChange(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
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

  public goToTerm(termId: string): void {
    this.glossary.activeTermId.set(termId);
    this.glossary.activeTab.set('dictionary');
    this.showRelevantOnly.set(false);
    this.activeCategory.set(null);
    this.searchQuery.set('');
  }
}
