import { Injectable, computed, inject, signal } from '@angular/core';
import { DatabaseService } from './database.service';
import {
  GenerateFormValue,
  coerceFormValue,
} from '../pages/generate/generate-form.model';

/** A user-named, saved set of generate-form settings. */
export interface SavedPreset {
  id: string;
  name: string;
  value: GenerateFormValue;
  createdAt: number;
}

/** An auto-captured recent settings snapshot (from a submitted generation). */
export interface RecentPreset {
  value: GenerateFormValue;
  at: number;
}

const PRESETS_KEY = 'aihorde.generate.presets';
const RECENT_KEY = 'aihorde.generate.recent';
const RECENT_LIMIT = 12;

/**
 * Stores the generate studio's named setting presets and a rolling history of
 * recently-submitted settings. Both persist through {@link DatabaseService} and
 * are exposed as signals so the form's presets menu updates reactively. Values
 * are run through {@link coerceFormValue} on load so a stale payload can never
 * corrupt the form.
 */
@Injectable({ providedIn: 'root' })
export class GeneratePresetsService {
  private readonly db = inject(DatabaseService);

  public readonly presets = signal<SavedPreset[]>(this.loadPresets());
  public readonly recent = signal<RecentPreset[]>(this.loadRecent());
  public readonly hasAny = computed(
    () => this.presets().length > 0 || this.recent().length > 0,
  );

  private idCounter = 0;

  /** Save the given settings under `name`, returning the new preset. */
  public savePreset(name: string, value: GenerateFormValue): SavedPreset {
    const preset: SavedPreset = {
      id: `${Date.now()}-${this.idCounter++}`,
      name: name.trim() || 'Untitled',
      value,
      createdAt: Date.now(),
    };
    const next = [preset, ...this.presets()];
    this.presets.set(next);
    this.db.store(PRESETS_KEY, next);
    return preset;
  }

  public deletePreset(id: string): void {
    const next = this.presets().filter((preset) => preset.id !== id);
    this.presets.set(next);
    this.db.store(PRESETS_KEY, next);
  }

  /**
   * Record a submitted settings snapshot at the head of the recent list,
   * skipping an exact repeat of the newest entry and capping the list length.
   */
  public pushRecent(value: GenerateFormValue): void {
    const current = this.recent();
    const signature = JSON.stringify(value);
    if (current.length > 0 && JSON.stringify(current[0].value) === signature) {
      return;
    }
    const next = [{ value, at: Date.now() }, ...current].slice(0, RECENT_LIMIT);
    this.recent.set(next);
    this.db.store(RECENT_KEY, next);
  }

  public clearRecent(): void {
    this.recent.set([]);
    this.db.store(RECENT_KEY, []);
  }

  private loadPresets(): SavedPreset[] {
    const raw = this.db.get(PRESETS_KEY);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
      .filter((item) => typeof item['name'] === 'string')
      .map((item, index) => ({
        id: typeof item['id'] === 'string' ? item['id'] : `stored-${index}`,
        name: item['name'] as string,
        value: coerceFormValue(item['value']),
        createdAt:
          typeof item['createdAt'] === 'number' ? item['createdAt'] : 0,
      }));
  }

  private loadRecent(): RecentPreset[] {
    const raw = this.db.get(RECENT_KEY);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
      .map((item) => ({
        value: coerceFormValue(item['value']),
        at: typeof item['at'] === 'number' ? item['at'] : 0,
      }))
      .slice(0, RECENT_LIMIT);
  }
}
