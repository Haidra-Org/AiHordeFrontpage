import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Keyboard movement for a review list drawn as an ARIA grid: one row per
 * item, and in each row the controls marked `data-grid-cell` (the button that
 * opens the item, and any other control a row carries). The grid is a single
 * tab stop;
 * the arrow keys move between rows and between a row's controls, Home and End
 * to the ends of a row, and Ctrl with Home or End to the first and last rows.
 *
 * Moving does not open an item. Opening is the button's own press (Enter,
 * Space or a click), because opening a worker loads its history and the
 * moderator endpoints share a small per-minute budget.
 */
@Directive({
  selector: '[appReviewGrid]',
  host: {
    role: 'grid',
    '(keydown)': 'onKeydown($event)',
    '(focusin)': 'onFocusIn($event)',
  },
})
export class ReviewGridDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  public onFocusIn(event: FocusEvent): void {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.hasAttribute('data-grid-cell')
    ) {
      this.makeTabStop(target);
    }
  }

  public onKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.hasAttribute('data-grid-cell')) return;

    const rows = this.rows();
    const rowIndex = rows.findIndex((row) => row.contains(target));
    const row = rows[rowIndex];
    if (!row) return;
    const cells = cellsOf(row);
    const column = cells.indexOf(target);

    let next: HTMLElement | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = cellAt(rows[rowIndex + 1], column);
        break;
      case 'ArrowUp':
        next = cellAt(rows[rowIndex - 1], column);
        break;
      case 'ArrowRight':
        next = cells[column + 1];
        break;
      case 'ArrowLeft':
        next = cells[column - 1];
        break;
      case 'Home':
        next = event.ctrlKey ? cellAt(rows.at(0), column) : cells.at(0);
        break;
      case 'End':
        next = event.ctrlKey ? cellAt(rows.at(-1), column) : cells.at(-1);
        break;
      default:
        return;
    }

    event.preventDefault();
    if (next) {
      this.makeTabStop(next);
      next.focus();
    }
  }

  private rows(): HTMLElement[] {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('[role="row"]'),
    ).filter((row) => row.querySelector('[data-grid-cell]') !== null);
  }

  private makeTabStop(cell: HTMLElement): void {
    for (const other of this.host.nativeElement.querySelectorAll<HTMLElement>(
      '[data-grid-cell]',
    )) {
      other.tabIndex = other === cell ? 0 : -1;
    }
  }
}

function cellsOf(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>('[data-grid-cell]'));
}

/** The control in a row's column, or its nearest one when the row is shorter. */
function cellAt(
  row: HTMLElement | undefined,
  column: number,
): HTMLElement | undefined {
  if (!row) return undefined;
  const cells = cellsOf(row);
  return cells[Math.min(column, cells.length - 1)];
}
