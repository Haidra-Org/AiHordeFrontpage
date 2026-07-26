import { Injectable } from '@angular/core';

/** An image handed from one studio tab to another. */
export interface StudioImageHandoff {
  blob: Blob;
  mimeType: string;
}

/**
 * Carries a single image between the studio's tabs (a generation result sent to
 * alchemy, say). The blob is held in memory only and consumed exactly once by
 * the receiving page, so a reload or a second visit starts clean: persisting it
 * would resurrect an image the user has long since moved on from.
 */
@Injectable({ providedIn: 'root' })
export class StudioHandoffService {
  private pending: StudioImageHandoff | null = null;

  public set(handoff: StudioImageHandoff): void {
    this.pending = handoff;
  }

  public has(): boolean {
    return this.pending !== null;
  }

  /** Take the pending image, leaving nothing behind for the next visit. */
  public consume(): StudioImageHandoff | null {
    const handoff = this.pending;
    this.pending = null;
    return handoff;
  }
}
