import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

export interface BreadcrumbItem {
  /** Display label (transloco key or raw text). */
  label: string;
  /** Route path (optional - if not provided, renders as plain text). */
  route?: string | string[];
  /** If true, label is treated as raw text and not translated. */
  raw?: boolean;
}

@Component({
  selector: 'app-breadcrumb',
  imports: [RouterLink, TranslocoPipe],
  template: `
    <nav aria-label="Breadcrumb" class="breadcrumb">
      <ol class="breadcrumb-list">
        @for (item of items(); track item.label; let last = $last) {
          <li class="breadcrumb-item">
            @if (item.route && !last) {
              <a [routerLink]="item.route" class="breadcrumb-link">
                @if (item.raw) {
                  {{ item.label }}
                } @else {
                  {{ item.label | transloco }}
                }
              </a>
            } @else {
              <span
                class="breadcrumb-current"
                [attr.aria-current]="last ? 'page' : null"
              >
                @if (item.raw) {
                  {{ item.label }}
                } @else {
                  {{ item.label | transloco }}
                }
              </span>
            }
            @if (!last) {
              <span class="breadcrumb-separator" aria-hidden="true">›</span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreadcrumbComponent {
  /** Array of breadcrumb items to display. */
  public readonly items = input<BreadcrumbItem[]>([]);
}
