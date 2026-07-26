import { Injectable, inject, signal } from '@angular/core';
import { DatabaseService } from './database.service';

const USAGE_KEY = 'aihorde.generate.style_usage';

/** A style and how many generations the user has submitted with it. */
export interface StyleUsageEntry {
  name: string;
  count: number;
}

/**
 * Counts how often each curated style has been used, so the style browser can
 * pin the user's favourites above the curated categories. Persisted through
 * {@link DatabaseService} and exposed as a signal so the browser reflects a
 * fresh submission without reloading.
 */
@Injectable({ providedIn: 'root' })
export class StyleUsageService {
  private readonly db = inject(DatabaseService);

  public readonly usage = signal<Record<string, number>>(this.load());

  /** Record one more generation submitted with `name`. Blank names are ignored. */
  public increment(name: string): void {
    const key = name.trim();
    if (!key) {
      return;
    }
    const next = { ...this.usage(), [key]: (this.usage()[key] ?? 0) + 1 };
    this.usage.set(next);
    this.db.store(USAGE_KEY, next);
  }

  public count(name: string): number {
    return this.usage()[name] ?? 0;
  }

  /**
   * The most-used styles, highest count first and ties broken alphabetically so
   * the strip's order is stable between renders.
   */
  public topStyles(limit: number): StyleUsageEntry[] {
    return Object.entries(this.usage())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
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
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        usage[name] = Math.floor(value);
      }
    }
    return usage;
  }
}
