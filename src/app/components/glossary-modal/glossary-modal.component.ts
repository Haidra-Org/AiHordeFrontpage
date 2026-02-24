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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import {
  GlossaryService,
  GlossaryCategory,
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

          <!-- Search -->
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

          <!-- Category Tabs -->
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
                [class.glossary-category-active]="activeCategory() === cat.id"
                (click)="setCategory(cat.id)"
              >
                {{ cat.labelKey | transloco }}
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
                <p class="glossary-term-body">{{ term.bodyKey | transloco }}</p>
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

  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('searchInput');

  public readonly filteredTerms = computed(() => {
    let terms: GlossaryTerm[] = GLOSSARY_TERMS;

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

    // Focus search input when modal opens
    effect(() => {
      if (this.glossary.isOpen()) {
        setTimeout(() => {
          this.searchInput()?.nativeElement.focus();
        }, 100);
      } else {
        // Reset state when closed
        this.searchQuery.set('');
        this.activeCategory.set(null);
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
}
