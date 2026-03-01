import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  effect,
  PLATFORM_ID,
  NgZone,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import {
  KeyValuePipe,
  isPlatformBrowser,
  DOCUMENT,
  NgTemplateOutlet,
} from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { combineLatest, map, skip, take } from 'rxjs';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { DataService } from '../../services/data.service';
import { FaqItem } from '../../types/faq-item';
import { InlineSvgComponent } from '../../components/inline-svg/inline-svg.component';
import { StickyHeaderDirective } from '../../helper/sticky-header.directive';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { StickyRegistryService } from '../../services/sticky-registry.service';
import { scrollToElement as scrollToEl } from '../../helper/scroll-utils';
import { SortedItems } from '../../types/sorted-items';
import { NoSorterKeyValue } from '../../types/no-sorter-key-value';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

@Component({
  selector: 'app-faq',
  imports: [
    KeyValuePipe,
    NgTemplateOutlet,
    TranslocoPipe,
    TranslocoModule,
    InlineSvgComponent,
    StickyHeaderDirective,
  ],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqComponent implements OnInit, OnDestroy {
  protected readonly NoSorterKeyValue = NoSorterKeyValue;
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly dataService = inject(DataService);
  private readonly footerColor = inject(FooterColorService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stickyRegistry = inject(StickyRegistryService);

  private observer?: IntersectionObserver;

  public readonly faq = toSignal(this.dataService.faq, {
    initialValue: new Map<string, FaqItem[]>() as SortedItems<FaqItem>,
  });
  public expandedFaqs = signal<Set<string>>(new Set());
  public collapsedSections = signal<Set<string>>(new Set());
  public highlightedQuestions = signal<Set<string>>(new Set());
  public tocOpen = signal(false);
  public tocExpandedSections = signal<Set<string>>(new Set());

  /** Sections the user explicitly expanded — these survive auto-collapse on scroll */
  private manualTocSections = signal<Set<string>>(new Set());

  /** The ID of the currently visible FAQ item or section (e.g. 'faq-item-what-are-kudos') */
  public activeItemId = signal<string | null>(null);

  private scrollObserverReady = false;

  constructor() {
    // Re-observe DOM elements when FAQ items are expanded/collapsed,
    // so the IntersectionObserver tracks newly rendered elements.
    effect(() => {
      // Read signals to establish dependency tracking
      this.expandedFaqs();
      this.collapsedSections();

      if (!this.observer || !isPlatformBrowser(this.platformId)) return;

      // Wait for the DOM to update after signal changes
      setTimeout(() => this.refreshObservedElements(), 0);
    });

    // Rebuild IntersectionObserver when sticky offset changes
    effect(() => {
      const offset = this.stickyRegistry.totalOffset();
      if (!this.scrollObserverReady) return;
      this.rebuildScrollObserver(offset);
    });
  }

  public readonly sectionKeys = computed(() => {
    const data = this.faq();
    if (!data) return [];
    return Array.from(data.keys());
  });

  /** Lookup: question slug → section key, for auto-expanding ToC sections on scroll */
  private readonly questionToSection = computed(() => {
    const data = this.faq();
    const lookup = new Map<string, string>();
    if (!data) return lookup;
    for (const [section, items] of data) {
      for (const item of items) {
        lookup.set(slugify(item.question), section);
      }
    }
    return lookup;
  });

  /** Flat ordered list of question slugs for distance calculations */
  private readonly orderedQuestionSlugs = computed(() => {
    const data = this.faq();
    if (!data) return [];
    const slugs: string[] = [];
    for (const [, items] of data) {
      for (const item of items) {
        slugs.push(slugify(item.question));
      }
    }
    return slugs;
  });

  /** The section key that currently contains the active scroll position */
  public readonly activeSectionKey = computed(() => {
    const id = this.activeItemId();
    if (!id) return null;

    // If active element is a section header itself
    if (id.startsWith('faq-section-')) {
      const sectionSlug = id.replace('faq-section-', '');
      if (sectionSlug === 'general') return '';
      for (const key of this.sectionKeys()) {
        if (slugify(key) === sectionSlug) return key;
      }
    }

    // If active element is a question
    if (id.startsWith('faq-item-')) {
      const qSlug = id.replace('faq-item-', '');
      return this.questionToSection().get(qSlug) ?? null;
    }

    return null;
  });

  ngOnInit(): void {
    this.footerColor.setDarkMode(true);

    combineLatest([
      this.translator.get('frequently_asked_questions'),
      this.translator.get('app_title'),
    ])
      .pipe(
        map(([faq, app]) => `${faq} | ${app}`),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((title) => this.title.setTitle(title));

    // Handle initial fragment once data is loaded
    this.dataService.faq
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const fragment = this.route.snapshot.fragment;
        if (fragment) {
          setTimeout(() => this.handleFragment(fragment), 100);
        }

        // Start observing after data arrives and DOM renders
        setTimeout(() => this.setupScrollObserver(), 200);
      });

    // Handle subsequent fragment changes (e.g. in-page navigation)
    this.route.fragment
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((fragment) => {
        if (fragment) {
          this.handleFragment(fragment);
        }
      });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  public toggleFaq(question: string): void {
    const expanded = new Set(this.expandedFaqs());
    if (expanded.has(question)) {
      expanded.delete(question);
    } else {
      expanded.add(question);
    }
    this.expandedFaqs.set(expanded);
  }

  public isFaqExpanded(question: string): boolean {
    return this.expandedFaqs().has(question);
  }

  public toggleSection(sectionKey: string): void {
    const collapsed = new Set(this.collapsedSections());
    if (collapsed.has(sectionKey)) {
      collapsed.delete(sectionKey);
    } else {
      collapsed.add(sectionKey);
    }
    this.collapsedSections.set(collapsed);
  }

  public isSectionCollapsed(sectionKey: string): boolean {
    return this.collapsedSections().has(sectionKey);
  }

  public toggleTocSection(sectionKey: string): void {
    const expanded = new Set(this.tocExpandedSections());
    const manual = new Set(this.manualTocSections());
    if (expanded.has(sectionKey)) {
      expanded.delete(sectionKey);
      manual.delete(sectionKey);
    } else {
      expanded.add(sectionKey);
      manual.add(sectionKey);
    }
    this.tocExpandedSections.set(expanded);
    this.manualTocSections.set(manual);
  }

  public isTocSectionExpanded(sectionKey: string): boolean {
    return this.tocExpandedSections().has(sectionKey);
  }

  public questionSlug(question: string): string {
    return slugify(question);
  }

  public sectionSlug(section: string): string {
    return slugify(section);
  }

  /** Returns how many questions away the given question is from the active scroll position (or -1) */
  public questionDistance(question: string): number {
    const activeId = this.activeItemId();
    if (!activeId || !activeId.startsWith('faq-item-')) return -1;

    const activeSlug = activeId.replace('faq-item-', '');
    const qSlug = slugify(question);
    const ordered = this.orderedQuestionSlugs();

    const activeIdx = ordered.indexOf(activeSlug);
    const qIdx = ordered.indexOf(qSlug);

    if (activeIdx === -1 || qIdx === -1) return -1;
    return Math.abs(activeIdx - qIdx);
  }

  public scrollToSection(sectionKey: string): void {
    this.tocOpen.set(false);

    // Uncollapse the target section
    const collapsed = new Set(this.collapsedSections());
    collapsed.delete(sectionKey);
    this.collapsedSections.set(collapsed);

    if (!isPlatformBrowser(this.platformId)) return;

    const id =
      sectionKey === ''
        ? 'faq-section-general'
        : `faq-section-${slugify(sectionKey)}`;
    setTimeout(() => {
      this.scrollToElement(id);
    }, 50);
  }

  private scrollToElement(id: string): void {
    const el = this.document.getElementById(id);
    if (!el) return;
    scrollToEl(el, this.stickyRegistry.totalOffset());
  }

  public scrollToQuestion(sectionKey: string, question: string): void {
    this.tocOpen.set(false);

    // Uncollapse the parent section
    const collapsed = new Set(this.collapsedSections());
    collapsed.delete(sectionKey);
    this.collapsedSections.set(collapsed);

    // Expand the clicked FAQ item
    const expanded = new Set(this.expandedFaqs());
    expanded.add(question);
    this.expandedFaqs.set(expanded);

    if (!isPlatformBrowser(this.platformId)) return;

    const id = `faq-item-${slugify(question)}`;
    setTimeout(() => {
      this.scrollToElement(id);
    }, 50);
  }

  private setupScrollObserver(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.scrollObserverReady = true;
    this.rebuildScrollObserver(this.stickyRegistry.totalOffset());
  }

  private rebuildScrollObserver(offset: number): void {
    this.observer?.disconnect();

    this.observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (
            !best ||
            entry.boundingClientRect.top < best.boundingClientRect.top
          ) {
            best = entry;
          }
        }
        if (best) {
          const id = best.target.id;
          this.zone.run(() => {
            this.activeItemId.set(id);
            this.updateTocFromScroll();
          });
        }
      },
      {
        rootMargin: `${-offset}px 0px -60% 0px`,
        threshold: 0,
      },
    );

    this.refreshObservedElements();
  }

  /** Re-query the DOM and observe all FAQ section/item elements */
  private refreshObservedElements(): void {
    if (!this.observer) return;
    this.observer.disconnect();
    const elements = this.document.querySelectorAll(
      '[id^="faq-section-"], [id^="faq-item-"]',
    );
    elements.forEach((el) => this.observer!.observe(el));
  }

  /** Keep active section ±1 neighbors open, collapse distant ones, preserve manual pins */
  private updateTocFromScroll(): void {
    const keys = this.sectionKeys();
    const active = this.activeSectionKey();
    if (active === null || keys.length === 0) return;

    const activeIdx = keys.indexOf(active);
    if (activeIdx === -1) return;

    const manual = this.manualTocSections();
    const next = new Set<string>();

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const distance = Math.abs(i - activeIdx);
      if (distance <= 1 || manual.has(key)) {
        next.add(key);
      }
    }

    this.tocExpandedSections.set(next);
  }

  private handleFragment(fragment: string): void {
    const faqData = this.faq();
    if (!faqData || faqData.size === 0) return;

    const slug = fragment.toLowerCase();
    const toExpand = new Set(this.expandedFaqs());
    const toHighlight = new Set<string>();
    let firstMatchElement: string | null = null;

    // Match against sections and individual questions
    for (const [section, items] of faqData) {
      const sectionMatch = section && slugify(section) === slug;

      if (sectionMatch) {
        // Expand entire section — uncollapse it and expand all its questions
        const collapsed = new Set(this.collapsedSections());
        collapsed.delete(section);
        this.collapsedSections.set(collapsed);

        for (const item of items) {
          toExpand.add(item.question);
          toHighlight.add(item.question);
        }
        if (!firstMatchElement && items.length > 0) {
          firstMatchElement = `faq-item-${slugify(items[0].question)}`;
        }
      }

      // Also check individual questions
      for (const item of items) {
        if (slugify(item.question) === slug) {
          // Uncollapse the parent section
          if (section) {
            const collapsed = new Set(this.collapsedSections());
            collapsed.delete(section);
            this.collapsedSections.set(collapsed);
          }
          toExpand.add(item.question);
          toHighlight.add(item.question);
          if (!firstMatchElement) {
            firstMatchElement = `faq-item-${slugify(item.question)}`;
          }
        }
      }
    }

    if (toHighlight.size > 0) {
      this.expandedFaqs.set(toExpand);
      this.highlightedQuestions.set(toHighlight);

      // Scroll to first match after DOM update
      if (firstMatchElement && isPlatformBrowser(this.platformId)) {
        setTimeout(() => {
          this.scrollToElement(firstMatchElement!);
        }, 150);
      }

      // Clear highlight after animation
      setTimeout(() => {
        this.highlightedQuestions.set(new Set());
      }, 3000);
    }
  }
}
