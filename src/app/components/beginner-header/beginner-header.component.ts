import { Component, input, signal, computed, ChangeDetectionStrategy, ElementRef, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-beginner-header',
  imports: [CommonModule, RouterLink, TranslocoModule],
  templateUrl: './beginner-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BeginnerHeaderComponent {
  private readonly elementRef = inject(ElementRef);
  private readonly document = inject(DOCUMENT);
  /**
   * Whether to show the "View all Frontends" button
   * @default false
   */
  showButton = input<boolean>(false);

  /**
   * Whether to disable card links (e.g., when already on the target page)
   * @default false
   */
  disableLinks = input<boolean>(false);

  /**
   * Whether the section is initially expanded
   * @default false (collapsed by default to save vertical space)
   */
  initiallyExpanded = input<boolean>(true);

  /**
   * Internal signal tracking expanded state
   */
  private readonly _isExpanded = signal<boolean | null>(null);

  /**
   * Computed expanded state (uses input as initial value)
   */
  readonly isExpanded = computed(() => {
    const internal = this._isExpanded();
    return internal !== null ? internal : this.initiallyExpanded();
  });

  /**
   * Toggle the expanded state
   * When collapsing, scroll to the top of this component
   */
  toggleExpanded(): void {
    const wasExpanded = this.isExpanded();
    this._isExpanded.set(!wasExpanded);

    // If we're collapsing, scroll the component into view
    if (wasExpanded) {
      // Use setTimeout to allow the DOM to update first
      setTimeout(() => {
        const element = this.elementRef.nativeElement as HTMLElement;
        const navHeight = parseInt(getComputedStyle(this.document.documentElement).getPropertyValue('--nav-height-mobile') || '64', 10);
        const elementTop = element.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({
          top: elementTop - navHeight - 16,
          behavior: 'smooth'
        });
      }, 50);
    }
  }
}
