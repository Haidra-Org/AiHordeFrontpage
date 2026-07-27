import { Injectable, computed, signal } from '@angular/core';

/**
 * Which setting's reference entry the studio is showing, if any.
 *
 * The `?` note beside a field is two or three lines of prose and a way on; the
 * entry it sends a reader to is mounted twice, docked in the results pane and
 * again in the mobile sheet, with CSS deciding which of the two is on screen.
 * Both read this one topic, so opening the entry is a single call rather than a
 * judgement the caller has to make about the viewport it is in.
 *
 * At most one entry is open page-wide, for the same reason at most one note is:
 * the dock replaces the results, and two of them cannot both have the pane.
 */
@Injectable({ providedIn: 'root' })
export class GsHelpDockService {
  private readonly current = signal<string | null>(null);

  /** The `generate.help.<topic>` entry on show, or null when none is. */
  public readonly topic = this.current.asReadonly();
  public readonly isOpen = computed(() => this.current() !== null);

  public open(topic: string): void {
    this.current.set(topic);
  }

  public close(): void {
    this.current.set(null);
  }

  /** Open this entry, or close it again when it is the one already showing. */
  public toggle(topic: string): void {
    this.current.update((current) => (current === topic ? null : topic));
  }
}
