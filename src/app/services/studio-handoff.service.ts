import { Injectable } from '@angular/core';
import type { ImageGenerationRequest } from '../types/generation';

/**
 * What one studio hands the other on the way over: a picture to become the
 * source, prompt text to go in the prompt box, or both. Either half may be
 * absent; a caption sent to the image studio carries no bytes.
 */
export interface StudioHandoff {
  blob?: Blob;
  mimeType?: string;
  prompt?: string;
  /**
   * A whole request to fill the form from, as a published worked example
   * carries. The studio asks before replacing settings the reader already has,
   * so this is an offer rather than an instruction.
   */
  recipe?: ImageGenerationRequest;
  /** What the recipe is a recipe for, in words, so the studio can name it. */
  recipeTitle?: string;
  /**
   * What the words are to the prompt already written: material to add to it,
   * which is what a caption read off a picture is, or the prompt itself, which
   * is what a published picture's own prompt is. Absent means 'join', because
   * the studios have always joined.
   */
  promptMode?: 'set' | 'join';
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
