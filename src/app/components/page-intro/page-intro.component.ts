import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { GlossaryService } from '../../services/glossary.service';
import { StickyRegistryService } from '../../services/sticky-registry.service';
import { PageGuideService } from '../../services/page-guide.service';
import { scrollToElement } from '../../helper/scroll-utils';

@Component({
  selector: 'app-page-intro',
  imports: [TranslocoPipe, RouterLink],
  template: `
    @if (!isDismissed()) {
      <div class="collapsible-card card-bg-secondary page-intro">
        <button
          type="button"
          class="collapsible-header-button"
          (click)="toggleExpanded()"
          [attr.aria-expanded]="isExpanded()"
          [attr.aria-controls]="contentId()"
        >
          <div class="collapsible-header-content">
            <div
              class="feature-card-icon feature-card-icon-blue collapsible-header-icon"
            >
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div class="collapsible-header-text">
              <h2 class="collapsible-header-title">
                {{ titleKey() | transloco }}
              </h2>
              <p class="feature-card-subtitle feature-card-subtitle-desktop">
                {{ subtitleKey() | transloco }}
              </p>
            </div>
          </div>
          <svg
            class="chevron-icon"
            [class.expanded]="isExpanded()"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        @if (isExpanded()) {
          <div [id]="contentId()" class="card-expandable-content">
            <div class="card-expandable-stack">
              <div
                #bodyContent
                class="page-intro-body"
                [innerHTML]="bodyKey() | transloco"
              ></div>

              <div class="page-intro-actions">
                <button
                  type="button"
                  class="btn-secondary"
                  (click)="toggleExpanded()"
                >
                  <svg
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                  {{ 'help.collapse' | transloco }}
                </button>
                @if (glossaryLink() && !readMoreLink()) {
                  <button
                    type="button"
                    class="btn-secondary"
                    (click)="openGlossary()"
                  >
                    {{ 'help.open_glossary' | transloco }}
                  </button>
                }
                @if (readMoreLink(); as link) {
                  <a [routerLink]="link" class="btn-secondary">
                    {{ 'help.learn_more' | transloco }}
                  </a>
                }
                <button
                  type="button"
                  class="page-intro-dismiss"
                  (click)="dismiss()"
                >
                  {{ 'help.dismiss' | transloco }}
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="page-intro-restore">
        <button
          type="button"
          class="page-intro-restore-btn"
          (click)="restore()"
        >
          <svg
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {{ 'help.show_intro' | transloco }}
        </button>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageIntroComponent {
  private readonly elementRef = inject(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly glossary = inject(GlossaryService);
  private readonly stickyRegistry = inject(StickyRegistryService);
  private readonly guideService = inject(PageGuideService);
  private readonly bodyContent = viewChild<ElementRef<HTMLElement>>('bodyContent');

  /** Page key — drives localStorage key and i18n key prefix */
  public readonly pageKey = input.required<string>();

  /** Whether to show the "Open Glossary" link */
  public readonly glossaryLink = input(true);

  /** Optional routerLink to show a "Read more" link instead of glossary */
  public readonly readMoreLink = input<string>();

  public readonly titleKey = computed(() => `help.${this.pageKey()}.title`);
  public readonly subtitleKey = computed(
    () => `help.${this.pageKey()}.subtitle`,
  );
  public readonly bodyKey = computed(() => `help.${this.pageKey()}.body`);
  public readonly contentId = computed(() => `page-intro-${this.pageKey()}`);

  private readonly _isExpanded = signal(true);

  public readonly isExpanded = this._isExpanded.asReadonly();
  public readonly isDismissed = computed(() =>
    this.guideService.isDismissed(this.storageKey())(),
  );

  constructor() {
    effect((onCleanup) => {
      const body = this.bodyContent()?.nativeElement;
      if (!body) return;

      const handler = (event: Event) => this.onBodyClick(event);
      body.addEventListener('click', handler);
      onCleanup(() => body.removeEventListener('click', handler));
    });
  }

  public toggleExpanded(): void {
    const wasExpanded = this._isExpanded();
    this._isExpanded.set(!wasExpanded);

    if (wasExpanded) {
      setTimeout(() => {
        const element = this.elementRef.nativeElement as HTMLElement;
        scrollToElement(element, this.stickyRegistry.totalOffset());
      }, 50);
    }
  }

  public dismiss(): void {
    this.guideService.dismiss(this.storageKey());
  }

  public restore(): void {
    this.guideService.restore(this.storageKey());
    this._isExpanded.set(true);
  }

  public openGlossary(): void {
    this.glossary.open();
  }

  /** Intercept clicks on glossary links rendered via innerHTML */
  public onBodyClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'A' && target.classList.contains('glossary-link')) {
      event.preventDefault();
      const termClass = Array.from(target.classList).find((c) =>
        c.startsWith('gl-'),
      );
      if (termClass) {
        this.glossary.open(termClass.substring(3));
      }
    }
  }

  private storageKey(): string {
    return `help-dismissed-${this.pageKey()}`;
  }
}
