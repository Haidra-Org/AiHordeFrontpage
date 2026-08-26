import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/** Where focus lands when the panel is opened from the keyboard. */
type PendingFocus = 'first' | 'last' | null;

@Component({
  selector: 'app-nav-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="nav-dropdown-container" [attr.data-dropdown]="dropdownId()">
      <button
        #trigger
        type="button"
        class="nav-link nav-dropdown-trigger"
        [class.nav-link-active]="isOpen() || isRouteActive()"
        [class.nav-needs-attention]="needsAttention() && !isOpen()"
        [attr.title]="triggerTitle()"
        [attr.aria-expanded]="isOpen()"
        [attr.aria-controls]="menuId()"
        aria-haspopup="true"
        (click)="toggle()"
        (keydown)="onTriggerKeydown($event)"
      >
        <ng-content select="[trigger]" />
        <app-icon
          name="chevron-down"
          class="nav-dropdown-chevron"
          [class.nav-dropdown-chevron-open]="isOpen()"
        />
      </button>
      @if (isOpen()) {
        <div
          #menu
          [id]="menuId()"
          class="nav-dropdown-menu surface-floating"
          role="menu"
          tabindex="-1"
          (keydown)="onMenuKeydown($event)"
        >
          <ng-content select="[panel]" />
        </div>
      }
    </div>
  `,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onDocumentEscape()',
  },
})
export class NavDropdownComponent {
  public readonly dropdownId = input.required<string>();
  public readonly isRouteActive = input(false);
  public readonly needsAttention = input(false);
  public readonly triggerTitle = input<string | null>(null);

  public readonly isOpen = signal(false);
  public readonly opened = output<string>();

  private readonly trigger =
    viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  /** Read by the effect below once the panel it applies to has been rendered. */
  private pendingFocus: PendingFocus = null;

  constructor() {
    effect(() => {
      const menu = this.menu();
      if (!menu) return;

      // The entries are projected in, so the roving tabindex the menu pattern
      // asks for is applied here rather than at each of the four call sites.
      const items = this.items();
      for (const item of items) {
        item.tabIndex = -1;
      }

      if (!this.pendingFocus) return;
      const target =
        this.pendingFocus === 'first' ? items[0] : items[items.length - 1];
      this.pendingFocus = null;
      target?.focus();
    });
  }

  public menuId(): string {
    return `nav-dropdown-${this.dropdownId()}-menu`;
  }

  public toggle(): void {
    this.isOpen.update((v) => !v);
    if (this.isOpen()) {
      this.opened.emit(this.dropdownId());
    }
  }

  public close(): void {
    this.isOpen.set(false);
  }

  public onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    this.pendingFocus = event.key === 'ArrowDown' ? 'first' : 'last';
    if (!this.isOpen()) {
      this.isOpen.set(true);
      this.opened.emit(this.dropdownId());
    }
  }

  public onMenuKeydown(event: KeyboardEvent): void {
    const items = this.items();
    if (!items.length) return;

    // Tab is the way out of a menu rather than a way around it, so the panel
    // gets out of the reader's way and lets the browser move focus on.
    if (event.key === 'Tab') {
      this.close();
      return;
    }

    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number;

    switch (event.key) {
      case 'ArrowDown':
        next = current < 0 ? 0 : (current + 1) % items.length;
        break;
      case 'ArrowUp':
        next =
          current < 0
            ? items.length - 1
            : (current - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    items[next].focus();
  }

  public onDocumentEscape(): void {
    if (!this.isOpen()) return;
    this.close();
    this.trigger().nativeElement.focus();
  }

  public onDocumentClick(event: Event): void {
    if (!this.isOpen()) return;
    const target = event.target as HTMLElement;
    const container = target.closest(
      `.nav-dropdown-container[data-dropdown="${this.dropdownId()}"]`,
    );
    if (!container) {
      this.close();
    }
  }

  private items(): HTMLElement[] {
    const menu = this.menu()?.nativeElement;
    if (!menu) return [];
    return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }
}
