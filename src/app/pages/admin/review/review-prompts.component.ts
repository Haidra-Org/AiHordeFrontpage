import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import {
  PromptModerationEventQuery,
  PromptModerationReason,
} from '../../../types/moderation';
import {
  NO_PROMPT_FILTER,
  PROMPT_PERIODS,
  PromptPeriod,
  PromptsState,
  promptQueryOf,
} from './review-query';
import { PROMPT_REASONS, positiveInt } from './review-subjects';
import { ReviewSubjectEventsComponent } from './review-subject-events.component';

/**
 * The Prompts tab: the prompt log newest first, narrowed by account, proxied
 * account, address, worker, a period and the reasons shown. Everything but
 * the reading position lives in the address through `state` and
 * `stateChange`, so a filtered view can be shared as a link.
 *
 * Reasons are chosen after the read, over the reports loaded, unless the
 * horde filters selected reasons itself (see
 * `AdminModerationService.promptReasonFilter`); a horde without the filter
 * ignores the parameter, so sending it would change nothing.
 */
@Component({
  selector: 'app-review-prompts',
  imports: [TranslocoPipe, DatePipe, ReviewSubjectEventsComponent],
  templateUrl: './review-prompts.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPromptsComponent {
  private readonly moderation = inject(AdminModerationService);

  public readonly state = input.required<PromptsState>();
  public readonly stateChange = output<PromptsState>();

  public readonly periods = PROMPT_PERIODS;
  public readonly reasons = PROMPT_REASONS;

  private readonly events = viewChild(ReviewSubjectEventsComponent);

  /**
   * Whether the loaded reports carry hold state, the same test each report's
   * hold controls use, so the retention copy and the controls agree.
   */
  public readonly holdsShown = computed(
    () => this.events()?.holdsShown() ?? false,
  );

  /**
   * The log request; a period is counted back from when the state changed.
   * Null until the prompt log's probe has answered, so the list's first read
   * already carries the reason filter the horde supports.
   */
  public readonly query = computed<PromptModerationEventQuery | null>(() => {
    const serverReasons = this.moderation.promptReasonFilter();
    return serverReasons === undefined
      ? null
      : promptQueryOf(this.state(), Date.now(), serverReasons);
  });

  /**
   * The reasons the list shows out of those loaded, or null when every
   * loaded report is wanted: all reasons are on, or the horde already
   * filtered by the ones that are.
   */
  public readonly clientReasons =
    computed<ReadonlySet<PromptModerationReason> | null>(() => {
      const reasons = this.state().reasons;
      if (reasons.length === PROMPT_REASONS.length) return null;
      if (this.query()?.reason !== undefined) return null;
      return new Set(reasons);
    });

  /** The filter form, as edited before it is applied. */
  public readonly draftAccount = linkedSignal(() =>
    this.state().user_id === null ? '' : String(this.state().user_id),
  );
  public readonly draftProxied = linkedSignal(
    () => this.state().proxied_account ?? '',
  );
  public readonly draftIp = linkedSignal(() => this.state().ipaddr ?? '');
  public readonly draftWorker = linkedSignal(
    () => this.state().worker_id ?? '',
  );
  public readonly accountInvalid = computed(() => {
    const value = this.draftAccount().trim();
    return value !== '' && positiveInt(value) === null;
  });

  public readonly filtered = computed(() => {
    const state = this.state();
    return (
      state.user_id !== null ||
      state.proxied_account !== null ||
      state.ipaddr !== null ||
      state.worker_id !== null
    );
  });

  /** Whether a link named its own range in place of a period. */
  public readonly ranged = computed(
    () => this.state().since !== null || this.state().until !== null,
  );

  constructor() {
    // The query waits on this probe's answer; it is shared with the counts'
    // probe and sent once per page load.
    this.moderation
      .probe('promptEvents')
      .pipe(takeUntilDestroyed())
      .subscribe();
  }

  public periodKey(period: PromptPeriod): string {
    return `admin.review.prompts.period.${period}`;
  }

  public reasonKey(reason: PromptModerationReason): string {
    return `admin.review.reason.${reason}`;
  }

  public reasonShown(reason: PromptModerationReason): boolean {
    return this.state().reasons.includes(reason);
  }

  /** Whether this is the one reason still shown, which cannot be turned off. */
  public reasonLocked(reason: PromptModerationReason): boolean {
    const shown = this.state().reasons;
    return shown.length === 1 && shown[0] === reason;
  }

  public applyFilters(): void {
    if (this.accountInvalid()) return;
    const text = (value: string): string | null => value.trim() || null;
    this.stateChange.emit({
      ...this.state(),
      user_id: positiveInt(this.draftAccount().trim()),
      proxied_account: text(this.draftProxied()),
      ipaddr: text(this.draftIp()),
      worker_id: text(this.draftWorker()),
    });
  }

  public clearFilters(): void {
    this.stateChange.emit({ ...this.state(), ...NO_PROMPT_FILTER });
  }

  public setPeriod(period: PromptPeriod): void {
    const state = this.state();
    if (period === state.period && !this.ranged()) return;
    this.stateChange.emit({ ...state, period, since: null, until: null });
  }

  public clearRange(): void {
    this.stateChange.emit({ ...this.state(), since: null, until: null });
  }

  /** Show or hide a reason. The last one shown stays, so the list is never empty by choice. */
  public toggleReason(reason: PromptModerationReason): void {
    const shown = this.state().reasons;
    const next = shown.includes(reason)
      ? shown.filter((each) => each !== reason)
      : PROMPT_REASONS.filter(
          (each) => each === reason || shown.includes(each),
        );
    if (next.length === 0) return;
    this.stateChange.emit({ ...this.state(), reasons: next });
  }
}
