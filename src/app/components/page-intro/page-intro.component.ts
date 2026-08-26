import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { GlossaryService } from '../../services/glossary.service';
import { StickyRegistryService } from '../../services/sticky-registry.service';
import { PageGuideService } from '../../services/page-guide.service';
import { scrollToElement } from '../../helper/scroll-utils';
import { IconComponent } from '../icon/icon.component';
import { GsProseComponent } from '../gs-prose/gs-prose.component';

@Component({
  selector: 'app-page-intro',
  imports: [TranslocoPipe, RouterLink, IconComponent, GsProseComponent],
  template: `
    @if (!isDismissed()) {
      <div
        #container
        class="hd-disclosure page-intro"
        [class.hd-disclosure--open]="isExpanded()"
      >
        <button
          type="button"
          class="hd-disclosure-head page-intro-head"
          (click)="toggleExpanded()"
          [attr.aria-expanded]="isExpanded()"
          [attr.aria-controls]="contentId()"
        >
          <span class="hd-sec-chip hd-sec-chip--lg page-intro-glyph">
            <app-icon name="info-circle" aria-hidden="true" />
          </span>
          <span class="page-intro-heading">
            <h2 class="page-intro-title">{{ titleKey() | transloco }}</h2>
            <span class="page-intro-lead">{{ subtitleKey() | transloco }}</span>
          </span>
          <app-icon name="chevron-right" class="hd-disclosure-chev" />
        </button>

        @if (isExpanded()) {
          <div [id]="contentId()" class="hd-disclosure-body">
            <!-- A body written in the site's prose grammar is rendered
                 rather than injected; the ones still written as markup keep
                 the old path until they are converted. -->
            @if (prose()) {
              <div class="page-intro-body">
                <app-gs-prose [key]="bodyKey()" [paragraphs]="true" />
              </div>
            } @else {
              <div
                class="page-intro-body"
                [innerHTML]="bodyKey() | transloco"
              ></div>
            }

            <div class="page-intro-actions">
              <button
                type="button"
                class="hd-btn hd-btn--dense"
                (click)="toggleExpanded()"
              >
                <app-icon name="chevron-up" />
                {{ 'help.collapse' | transloco }}
              </button>
              @if (glossaryLink() && !readMoreLink()) {
                <button
                  type="button"
                  class="hd-btn hd-btn--tonal hd-btn--dense"
                  (click)="openGlossary()"
                >
                  {{ 'help.open_glossary' | transloco }}
                </button>
              }
              @if (readMoreLink(); as link) {
                <a
                  [routerLink]="link"
                  class="hd-btn hd-btn--tonal hd-btn--dense page-intro-link"
                >
                  {{ 'help.learn_more' | transloco }}
                </a>
              }
              <button
                type="button"
                class="hd-btn hd-btn--ghost hd-btn--dense"
                (click)="dismiss()"
              >
                {{ 'help.dismiss' | transloco }}
              </button>
            </div>
          </div>
        }
      </div>
    } @else {
      <div #container class="page-intro-restore">
        <button
          type="button"
          class="hd-btn hd-btn--ghost hd-btn--dense page-intro-restore-btn"
          (click)="restore()"
        >
          <app-icon name="info-circle" />
          {{ 'help.show_intro' | transloco }}
        </button>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageIntroComponent {
  private readonly glossary = inject(GlossaryService);
  private readonly stickyRegistry = inject(StickyRegistryService);
  private readonly guideService = inject(PageGuideService);
  private readonly container = viewChild<ElementRef<HTMLElement>>('container');

  /** Page key — drives localStorage key and i18n key prefix */
  public readonly pageKey = input.required<string>();

  /** Whether to show the "Open Glossary" link */
  public readonly glossaryLink = input(true);

  /** Optional routerLink to show a "Read more" link instead of glossary */
  public readonly readMoreLink = input<string>();

  /**
   * Whether the body is written in the site's prose grammar rather than as
   * markup. The two cannot be mixed in one string, so the page that owns the
   * body says which it is.
   */
  public readonly prose = input(false);

  public readonly titleKey = computed(() => `help.${this.pageKey()}.title`);
  public readonly subtitleKey = computed(
    () => `help.${this.pageKey()}.subtitle`,
  );
  public readonly bodyKey = computed(() => `help.${this.pageKey()}.body`);
  public readonly contentId = computed(() => `page-intro-${this.pageKey()}`);

  /* The intro is orientation for a page whose data is the point, so it
     opens folded: the lead in the head says what the page is, and the
     body is there for the reader who wants it. */
  private readonly _isExpanded = signal(false);

  public readonly isExpanded = this._isExpanded.asReadonly();
  public readonly isDismissed = computed(() =>
    this.guideService.isDismissed(this.storageKey())(),
  );

  public toggleExpanded(): void {
    const wasExpanded = this._isExpanded();
    this._isExpanded.set(!wasExpanded);

    if (wasExpanded) {
      setTimeout(() => {
        const el = this.container()?.nativeElement;
        if (el) {
          scrollToElement(el, this.stickyRegistry.totalOffset());
        }
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

  private storageKey(): string {
    return `help-dismissed-${this.pageKey()}`;
  }
}
