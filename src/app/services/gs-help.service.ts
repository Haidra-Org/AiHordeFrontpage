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
  private readonly requested = signal<string | null>(null);

  public readonly openId = this.open.asReadonly();

  /**
   * A topic something other than the reader has asked to see expanded (the
   * follow-along tutorial pointing at a field). Addressed by topic rather than
   * by note id because the caller knows the field, not which instance of the
   * trigger is on screen; the trigger claims the request when it sees its own
   * topic named, which is also how a note in a section that has only just been
   * revealed opens as soon as it exists.
   */
  public readonly requestedTopic = this.requested.asReadonly();

  /**
   * The note opened by a request rather than by the reader, so it can be closed
   * again without ever closing one the reader opened themselves. Cleared as soon
   * as the reader touches any note: from then on the open note is theirs.
   */
  private claimed: string | null = null;

  public requestTopic(topic: string): void {
    this.requested.set(topic);
  }

  /** Take an outstanding request, expanding this note in its place. */
  public claimTopic(noteId: string): void {
    this.requested.set(null);
    this.claimed = noteId;
    this.open.set(noteId);
  }

  /**
   * Withdraw a request and close the note it opened. Used when whatever asked
   * for the note has moved on to something that describes no field; a note the
   * reader opened is left where it is.
   */
  public releaseRequested(): void {
    this.requested.set(null);
    if (this.claimed !== null && this.open() === this.claimed) {
      this.open.set(null);
    }
    this.claimed = null;
  }

  public isOpen(id: string): boolean {
    return this.open() === id;
  }

  /** Expand this note, closing whichever other note was open. */
  public toggle(id: string): void {
    this.claimed = null;
    this.open.update((current) => (current === id ? null : id));
  }

  public close(): void {
    this.claimed = null;
    this.open.set(null);
    this.requested.set(null);
  }
}
