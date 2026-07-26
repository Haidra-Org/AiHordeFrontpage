import { Injectable, signal } from '@angular/core';

/**
 * Which studio help note is currently expanded, across every control panel on
 * the page. The studio shows at most one note at a time: the notes expand the
 * form in place, so two open at once would push the control the second one
 * describes off the reader's screen.
 */
@Injectable({ providedIn: 'root' })
export class GsHelpService {
  private readonly open = signal<string | null>(null);

  public readonly openId = this.open.asReadonly();

  public isOpen(id: string): boolean {
    return this.open() === id;
  }

  /** Expand this note, closing whichever other note was open. */
  public toggle(id: string): void {
    this.open.update((current) => (current === id ? null : id));
  }

  public close(): void {
    this.open.set(null);
  }
}
