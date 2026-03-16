import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-nav-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="nav-dropdown-container" [attr.data-dropdown]="dropdownId()">
      <button
        type="button"
        class="nav-link nav-dropdown-trigger"
        [class.nav-link-active]="isOpen() || isRouteActive()"
        [class.nav-needs-attention]="needsAttention() && !isOpen()"
        [attr.title]="triggerTitle()"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="true"
        (click)="toggle()"
      >
        <ng-content select="[trigger]" />
        <app-icon
          name="chevron-down"
          class="nav-dropdown-chevron"
          [class.nav-dropdown-chevron-open]="isOpen()"
        />
      </button>
      @if (isOpen()) {
        <div class="nav-dropdown-menu surface-floating" role="menu">
          <ng-content select="[panel]" />
        </div>
      }
    </div>
  `,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class NavDropdownComponent {
  public readonly dropdownId = input.required<string>();
  public readonly isRouteActive = input(false);
  public readonly needsAttention = input(false);
  public readonly triggerTitle = input<string | null>(null);

  public readonly isOpen = signal(false);
  public readonly opened = output<string>();

  public toggle(): void {
    this.isOpen.update((v) => !v);
    if (this.isOpen()) {
      this.opened.emit(this.dropdownId());
    }
  }

  public close(): void {
    this.isOpen.set(false);
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
}
