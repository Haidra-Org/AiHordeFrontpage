import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const STORAGE_PREFIX = 'aihorde.generate.deleted.';

/**
 * Deletion outlives both the page and the server's result retention. Each id
 * has its own key so simultaneous deletions in different tabs cannot overwrite
 * one another. Keys contain ids only, never requests or account credentials.
 */
@Injectable({ providedIn: 'root' })
export class GenerationDeletionLedgerService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly remembered = new Set<string>();

  public remember(localId: string, hordeId?: string): void {
    this.write('local', localId);
    if (hordeId) {
      this.rememberHordeId(hordeId);
    }
  }

  public rememberHordeId(hordeId: string): void {
    this.write('horde', hordeId);
  }

  public has(localId: string, hordeId?: string): boolean {
    return (
      this.read('local', localId) || (!!hordeId && this.hasHordeId(hordeId))
    );
  }

  public hasHordeId(hordeId: string): boolean {
    return this.read('horde', hordeId);
  }

  private write(kind: 'local' | 'horde', id: string): void {
    if (!this.isBrowser) {
      return;
    }
    const key = `${STORAGE_PREFIX}${kind}.${id}`;
    this.remembered.add(key);
    try {
      localStorage.setItem(key, '1');
    } catch {
      // A browser refusing storage still keeps deletion for this page's life.
    }
  }

  private read(kind: 'local' | 'horde', id: string): boolean {
    if (!this.isBrowser) {
      return false;
    }
    const key = `${STORAGE_PREFIX}${kind}.${id}`;
    if (this.remembered.has(key)) {
      return true;
    }
    try {
      // Read shared storage each time, including before a peer's broadcast
      // arrives or after a suspended tab has missed that broadcast entirely.
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }
}
