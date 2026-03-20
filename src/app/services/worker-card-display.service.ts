import {
  Injectable,
  signal,
  computed,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  WorkerCardDisplaySettings,
  WorkerCardField,
  WORKER_CARD_FIELDS,
  DEFAULT_DISPLAY_SETTINGS,
} from '../types/worker-card-display';

@Injectable({ providedIn: 'root' })
export class WorkerCardDisplayService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly STORAGE_KEY = 'worker-card-display-settings';

  public readonly settings = signal<WorkerCardDisplaySettings>(
    structuredClone(DEFAULT_DISPLAY_SETTINGS),
  );

  public readonly hideUnsetFields = computed(
    () => this.settings().hideUnsetFields,
  );
  public readonly alwaysShowOwnWorkerFields = computed(
    () => this.settings().alwaysShowOwnWorkerFields,
  );

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.load();
    }
  }

  public isFieldVisible(field: WorkerCardField): boolean {
    return this.settings().visibleFields[field];
  }

  public toggleField(field: WorkerCardField): void {
    this.settings.update((s) => ({
      ...s,
      visibleFields: {
        ...s.visibleFields,
        [field]: !s.visibleFields[field],
      },
    }));
    this.save();
  }

  public setHideUnsetFields(hide: boolean): void {
    this.settings.update((s) => ({ ...s, hideUnsetFields: hide }));
    this.save();
  }

  public setAlwaysShowOwnWorkerFields(show: boolean): void {
    this.settings.update((s) => ({ ...s, alwaysShowOwnWorkerFields: show }));
    this.save();
  }

  public resetToDefaults(): void {
    this.settings.set(structuredClone(DEFAULT_DISPLAY_SETTINGS));
    this.save();
  }

  private save(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings()));
    } catch {
      // localStorage unavailable
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<WorkerCardDisplaySettings>;
      if (!parsed || typeof parsed !== 'object') return;

      const merged = structuredClone(DEFAULT_DISPLAY_SETTINGS);

      if (parsed.visibleFields && typeof parsed.visibleFields === 'object') {
        for (const field of WORKER_CARD_FIELDS) {
          if (typeof parsed.visibleFields[field] === 'boolean') {
            merged.visibleFields[field] = parsed.visibleFields[field];
          }
        }
      }

      if (typeof parsed.hideUnsetFields === 'boolean') {
        merged.hideUnsetFields = parsed.hideUnsetFields;
      }
      if (typeof parsed.alwaysShowOwnWorkerFields === 'boolean') {
        merged.alwaysShowOwnWorkerFields = parsed.alwaysShowOwnWorkerFields;
      }

      this.settings.set(merged);
    } catch {
      // Corrupt data — use defaults
    }
  }
}
