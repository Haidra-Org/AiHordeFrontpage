import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { ToastService } from '../../../services/toast.service';
import {
  ModerationRule,
  ModerationSettings,
  PromptModerationReason,
} from '../../../types/moderation';
import {
  PROMPT_REASONS,
  RULE_BOUNDS,
  durationLabel,
  refusalKey,
  validateRules,
} from './review-subjects';

export type RuleUnit = 'minute' | 'hour' | 'day';

export const RULE_UNITS: readonly RuleUnit[] = ['minute', 'hour', 'day'];

const UNIT_SECONDS: Record<RuleUnit, number> = {
  minute: 60,
  hour: 3_600,
  day: 86_400,
};

/** One rule as the form holds it: the window as a number and a unit. */
export interface RuleRow {
  id: number;
  value: string;
  unit: RuleUnit;
  count: string;
  /** In the order the page lists reasons. */
  reasons: PromptModerationReason[];
}

let nextRowId = 0;

/** A stored rule as a row, in the largest unit that divides its window. */
export function ruleRowOf(rule: ModerationRule): RuleRow {
  const unit =
    [...RULE_UNITS]
      .reverse()
      .find(
        (candidate) => rule.window_seconds % UNIT_SECONDS[candidate] === 0,
      ) ?? 'minute';
  return {
    id: nextRowId++,
    value: String(rule.window_seconds / UNIT_SECONDS[unit]),
    unit,
    count: String(rule.min_count),
    reasons: inReasonOrder(rule.reasons),
  };
}

/** A row as the rule the horde stores; a blank or unreadable field becomes NaN. */
export function ruleOf(row: RuleRow): ModerationRule {
  const value = row.value.trim() ? Number(row.value) : Number.NaN;
  const count = row.count.trim() ? Number(row.count) : Number.NaN;
  return {
    window_seconds: value * UNIT_SECONDS[row.unit],
    min_count: count,
    reasons: [...row.reasons],
  };
}

/** Reasons in the order the page lists them, without repeats. */
function inReasonOrder(
  reasons: readonly PromptModerationReason[],
): PromptModerationReason[] {
  return PROMPT_REASONS.filter((reason) => reasons.includes(reason));
}

/**
 * The alert rules, each with the reasons it counts, for moderators to change. The
 * report listings, the counts on the dashboard and the alerts to the
 * moderators' channel all read these rules.
 */
@Component({
  selector: 'app-review-thresholds',
  imports: [TranslocoPipe, DecimalPipe],
  templateUrl: './review-thresholds.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewThresholdsComponent {
  private readonly moderation = inject(AdminModerationService);
  private readonly counts = inject(ModerationCountsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly units = RULE_UNITS;
  public readonly reasons = PROMPT_REASONS;
  public readonly bounds = RULE_BOUNDS;
  public readonly duration = durationLabel;

  public readonly stored = signal<ModerationSettings | null>(null);
  public readonly rows = signal<RuleRow[]>([]);
  public readonly loading = signal(true);
  public readonly failed = signal(false);
  public readonly saving = signal(false);
  /** Problems show once the moderator has tried to save. */
  public readonly attempted = signal(false);

  public readonly draft = computed<ModerationSettings>(() => ({
    rules: this.rows().map(ruleOf),
  }));
  public readonly validation = computed(() =>
    validateRules(this.draft().rules),
  );
  public readonly valid = computed(
    () =>
      this.validation().set.length === 0 &&
      this.validation().rules.every((problems) => problems.length === 0),
  );
  public readonly dirty = computed(() => {
    const stored = this.stored();
    return (
      stored !== null &&
      JSON.stringify(this.draft()) !== JSON.stringify(normalise(stored))
    );
  });

  constructor() {
    this.load();
  }

  public load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.moderation
      .getSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.adopt(settings);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.failed.set(true);
          this.toast.error('admin.review.thresholds.load_error', {
            transloco: true,
            rawError: error,
          });
        },
      });
  }

  public unitKey(unit: RuleUnit): string {
    return `admin.review.thresholds.unit.${unit}`;
  }

  public reasonKey(reason: PromptModerationReason): string {
    return `admin.review.reason.${reason}`;
  }

  public problemsOf(index: number): string[] {
    return this.attempted() ? (this.validation().rules[index] ?? []) : [];
  }

  public setProblems(): string[] {
    return this.attempted() ? this.validation().set : [];
  }

  public updateRow(id: number, patch: Partial<RuleRow>): void {
    this.rows.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  public setUnit(id: number, value: string): void {
    const unit = RULE_UNITS.find((candidate) => candidate === value);
    if (unit) this.updateRow(id, { unit });
  }

  public addRule(): void {
    if (this.rows().length >= RULE_BOUNDS.maxRules) return;
    this.rows.update((rows) => [
      ...rows,
      {
        id: nextRowId++,
        value: '1',
        unit: 'hour',
        count: '',
        reasons: ['worker_csam'],
      },
    ]);
  }

  public removeRule(id: number): void {
    this.rows.update((rows) => rows.filter((row) => row.id !== id));
  }

  public toggleReason(id: number, reason: PromptModerationReason): void {
    this.rows.update((rows) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              reasons: row.reasons.includes(reason)
                ? row.reasons.filter((item) => item !== reason)
                : inReasonOrder([...row.reasons, reason]),
            }
          : row,
      ),
    );
  }

  public reset(): void {
    const stored = this.stored();
    if (stored) this.adopt(stored);
  }

  public save(): void {
    if (this.saving()) return;
    this.attempted.set(true);
    if (!this.valid()) return;
    this.saving.set(true);
    this.moderation
      .updateSettings(this.draft())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.saving.set(false);
          if (!settings) return;
          this.adopt(settings);
          this.toast.success('admin.review.thresholds.saved', {
            transloco: true,
          });
          this.counts.refreshReports();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.toast.error(
            refusalKey(error, 'admin.review.thresholds.save_error'),
            {
              transloco: true,
              rawError: error,
            },
          );
        },
      });
  }

  private adopt(settings: ModerationSettings): void {
    this.stored.set(settings);
    this.rows.set(settings.rules.map(ruleRowOf));
    this.attempted.set(false);
  }
}

/** Settings in the order the form builds them, so an unchanged form compares equal. */
function normalise(settings: ModerationSettings): ModerationSettings {
  return {
    rules: settings.rules.map((rule) => ({
      window_seconds: rule.window_seconds,
      min_count: rule.min_count,
      reasons: inReasonOrder(rule.reasons),
    })),
  };
}
