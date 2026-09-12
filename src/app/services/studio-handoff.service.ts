import { Injectable } from '@angular/core';

/**
 * What one studio hands the other on the way over: a picture to become the
 * source, prompt text to go in the prompt box, or both. Either half may be
 * absent; a caption sent to the image studio carries no bytes.
 */
export interface StudioHandoff {
  blob?: Blob;
  mimeType?: string;
  prompt?: string;
}

@Injectable({ providedIn: 'root' })
export class StudioHandoffService {
  private pending: StudioHandoff | null = null;

  public set(handoff: StudioHandoff): void {
    this.pending = handoff;
  }

  public has(): boolean {
    return this.pending !== null;
  }

  public consume(): StudioHandoff | null {
    const handoff = this.pending;
    this.pending = null;
    return handoff;
  }
}
