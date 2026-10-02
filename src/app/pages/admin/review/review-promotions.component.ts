import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT, DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AdminUserService } from '../../../services/admin-user.service';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { ToastService } from '../../../services/toast.service';
import { IconComponent } from '../../../components/icon/icon.component';
import { AdminDialogComponent } from '../../../components/admin/admin-dialog/admin-dialog.component';
import { formatAccountAge } from '../../../helper/account-age';
import { PromotionReviewUser } from '../../../types/moderation';
import { ReviewGridDirective } from './review-grid.directive';
import { isSplitView, nextAfter } from './review-layout';
import { parseHordeTime } from '../../../helper/horde-time';

type PromotionAction = 'trust' | 'reset';

/**
 * Accounts eligible for promotion to trusted, and accounts held back from it
 * by suspicion, from the shared moderation overview. A decision is made here
 * and the overview is read again, with the next account opened.
 */
@Component({
  selector: 'app-review-promotions',
  imports: [
    TranslocoPipe,
    RouterLink,
    DatePipe,
    DecimalPipe,
    IconComponent,
    AdminDialogComponent,
    ReviewGridDirective,
  ],
  templateUrl: './review-promotions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPromotionsComponent {
  private readonly users = inject(AdminUserService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  public readonly counts = inject(ModerationCountsService);
  public readonly hordeTime = parseHordeTime;

  public readonly eligible = computed(
    () => this.counts.overview()?.promotion_eligible_users ?? [],
  );
  public readonly blocked = computed(
    () => this.counts.overview()?.promotion_blocked_users ?? [],
  );
  /** Null when the horde has no promotion threshold configured. */
  public readonly promotionThreshold = computed(
    () => this.counts.overview()?.promotion_threshold ?? null,
  );
  /** The report count at which an account counts as suspicious. */
  public readonly suspicionThreshold = computed(
    () => this.counts.overview()?.suspicion_threshold ?? null,
  );
  public readonly groups = computed(() => [
    {
      id: 'eligible',
      titleKey: 'admin.review.promotions.eligible_title',
      leadKey: 'admin.review.promotions.eligible_lead',
      users: this.eligible(),
    },
    {
      id: 'blocked',
      titleKey: 'admin.review.promotions.blocked_title',
      leadKey: 'admin.review.promotions.blocked_lead',
      users: this.blocked(),
    },
  ]);
  private readonly all = computed(() => [
    ...this.eligible(),
    ...this.blocked(),
  ]);

  private readonly selectedId = signal<number | null>(null);
  /** The open account; the first one until the moderator opens another. */
  public readonly selected = computed<PromotionReviewUser | null>(() => {
    const all = this.all();
    const id = this.selectedId();
    return all.find((user) => user.id === id) ?? all.at(0) ?? null;
  });
  public readonly detailShown = signal(false);

  public readonly pendingAction = signal<PromotionAction | null>(null);
  public readonly acting = signal(false);

  private readonly detailHeading =
    viewChild<ElementRef<HTMLElement>>('detailHeading');
  private readonly detailPane =
    viewChild<ElementRef<HTMLElement>>('detailPane');

  /** How far the account's evaluating kudos stand above the promotion threshold. */
  public excess(user: PromotionReviewUser, threshold: number): number {
    return user.evaluating_kudos - threshold;
  }

  public accountAge(user: PromotionReviewUser): string {
    return formatAccountAge(this.transloco, user.account_age);
  }

  /** The row a list's single tab stop sits on: the open account, else the first. */
  public tabStop(users: readonly PromotionReviewUser[]): number | undefined {
    return users.find((user) => this.isCurrent(user))?.id ?? users.at(0)?.id;
  }

  public isCurrent(user: PromotionReviewUser): boolean {
    return this.selected()?.id === user.id;
  }

  public open(id: number): void {
    this.select(id);
    this.detailShown.set(true);
    if (!isSplitView(this.document)) {
      setTimeout(() => this.detailHeading()?.nativeElement.focus());
    }
  }

  /** The pane keeps its scroll position across items, so each one opens at its top. */
  private select(id: number | null): void {
    this.selectedId.set(id);
    const pane = this.detailPane()?.nativeElement;
    if (pane) pane.scrollTop = 0;
  }

  public back(): void {
    const id = this.selected()?.id;
    this.detailShown.set(false);
    setTimeout(() =>
      this.document
        .querySelector<HTMLElement>(`[data-promotion-user="${id}"]`)
        ?.focus(),
    );
  }

  public ask(action: PromotionAction): void {
    this.pendingAction.set(action);
  }

  public cancel(): void {
    if (!this.acting()) this.pendingAction.set(null);
  }

  public confirm(): void {
    const user = this.selected();
    const action = this.pendingAction();
    if (!user || !action || this.acting()) return;
    const request =
      action === 'trust'
        ? this.users.setTrusted(user.id, true)
        : this.users.resetSuspicion(user.id);
    const next = nextAfter(
      this.all().map((each) => each.id),
      user.id,
    );

    this.acting.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.acting.set(false);
        this.pendingAction.set(null);
        if (!result) return;
        this.toast.success(`admin.review.promotions.done.${action}`, {
          transloco: true,
          messageParams: { username: user.username },
        });
        this.select(next);
        this.counts.refreshOverview(true);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.pendingAction.set(null);
        this.toast.error('admin.review.promotions.error', {
          transloco: true,
          rawError: error,
        });
      },
    });
  }
}
