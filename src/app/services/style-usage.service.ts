import { Injectable, inject, signal } from '@angular/core';
import { DatabaseService } from './database.service';
import { storedStyleKey } from './style-record';

const USAGE_KEY = 'aihorde.generate.style_usage';

/** A style and how many generations the user has submitted with it. */
export interface StyleUsageEntry {
  /** The style's source-qualified key; see `styleRecordKey`. */
  key: string;
  count: number;
}

/**
 * Counts how often each style has been used, so the style browser can pin the
 * user's favourites above the preset categories. Persisted through
 * {@link DatabaseService} and exposed as a signal so the browser reflects a
 * fresh submission without reloading.
 */
@Injectable({ providedIn: 'root' })
export class StyleUsageService {
  private readonly db = inject(DatabaseService);

  public readonly usage = signal<Record<string, number>>(this.load());

  /** Record one more generation submitted with `styleKey`. Blanks are ignored. */
  public increment(styleKey: string): void {
    const key = styleKey.trim();
    if (!key) {
      return;
    }
    const next = { ...this.usage(), [key]: (this.usage()[key] ?? 0) + 1 };
    this.usage.set(next);
    this.db.store(USAGE_KEY, next);
  }

  public count(styleKey: string): number {
    return this.usage()[styleKey] ?? 0;
  }

  /**
   * The most-used styles, highest count first and ties broken alphabetically so
   * the strip's order is stable between renders.
   */
  public topStyles(limit: number): StyleUsageEntry[] {
    return Object.entries(this.usage())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, Math.max(0, limit));
  }

  private load(): Record<string, number> {
    const raw = this.db.get(USAGE_KEY);
    if (typeof raw !== 'object' || raw === null) {
      return {};
    }
    const usage: Record<string, number> = {};
    for (const [name, value] of Object.entries(
      raw as Record<string, unknown>,
    )) {
      // A stale payload can hold anything; only sane positive counts survive.
      // Counts written before styles carried a source are keyed by a bare
      // preset name, which is what a bare key still reads as.
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        const key = storedStyleKey(name);
        if (key !== '') {
          usage[key] = (usage[key] ?? 0) + Math.floor(value);
        }
      }
    }
    return usage;
  }
}
