import {
  afterNextRender,
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
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import {
  GlossaryService,
  GlossaryCategory,
  GlossaryTab,
  GlossaryTerm,
  GLOSSARY_CATEGORIES,
  GLOSSARY_TERMS,
} from '../../services/glossary.service';

@Component({
  selector: 'app-glossary-modal',
  imports: [TranslocoPipe, RouterLink],
  template: `
    @if (glossary.isOpen()) {
      <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'help.glossary.title' | transloco"
        (keydown.escape)="close()"
      >
        <div
          class="modal-backdrop modal-backdrop--blur"
          (click)="close()"
        ></div>
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
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
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
            @if (glossary.pageContext()) {
              <button
                type="button"
                role="tab"
                class="glossary-tab"
                [class.glossary-tab-active]="
                  glossary.activeTab() === 'this-page'
                "
                [attr.aria-selected]="glossary.activeTab() === 'this-page'"
                aria-controls="glossary-panel-this-page"
                (click)="switchTab('this-page')"
              >
                {{ glossary.pageContext()!.pageTitleKey | transloco }}
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

          <!-- This Page tab panel -->
          @if (glossary.activeTab() === 'this-page' && glossary.pageContext()) {
            <div id="glossary-panel-this-page" role="tabpanel">
              <div class="modal-scroll glossary-terms-list">
                <!-- Page-specific entries -->
                @for (
                  entry of glossary.pageContext()!.entries;
                  track entry.id
                ) {
                  <div class="glossary-page-entry">
                    @if (entry.iconSvg) {
                      <span
                        class="glossary-page-entry-icon"
                        [class]="entry.iconColorClass ?? ''"
                        [innerHTML]="trustIconSvg(entry.iconSvg)"
                      ></span>
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
  private readonly sanitizer = inject(DomSanitizer);

  private readonly iconCache = new Map<string, SafeHtml>();

  public readonly categories = GLOSSARY_CATEGORIES;

  public readonly searchQuery = signal('');
  public readonly activeCategory = signal<GlossaryCategory | null>(null);
  public readonly showRelevantOnly = signal(false);

  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('searchInput');

  public readonly filteredTerms = computed(() => {
    let terms: GlossaryTerm[] = GLOSSARY_TERMS;

    if (this.showRelevantOnly()) {
      const relevant = this.glossary.pageContext()?.relevantTermIds ?? [];
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
    const ctx = this.glossary.pageContext();
    if (!ctx?.relevantTermIds?.length) return [];
    return GLOSSARY_TERMS.filter((t) => ctx.relevantTermIds.includes(t.id));
  });

  constructor() {
    // Scroll to active term when modal opens
    effect(() => {
      const termId = this.glossary.activeTermId();
      const isOpen = this.glossary.isOpen();
      if (isOpen && termId && isPlatformBrowser(this.platformId)) {
        // Wait for DOM to render
        setTimeout(() => {
          const el = this.document.getElementById(`glossary-term-${termId}`);
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

  /** Sanitize icon SVGs generated from our own hardcoded templates (worker-icons.ts) */
  public trustIconSvg(svg: string): SafeHtml {
    let cached = this.iconCache.get(svg);
    if (!cached) {
      cached = this.sanitizer.bypassSecurityTrustHtml(svg);
      this.iconCache.set(svg, cached);
    }
    return cached;
  }
}
