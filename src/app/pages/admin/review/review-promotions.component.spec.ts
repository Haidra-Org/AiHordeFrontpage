import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import { ReviewPromotionsComponent } from './review-promotions.component';
import { AdminUserService } from '../../../services/admin-user.service';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { ToastService } from '../../../services/toast.service';
import {
  ModerationOverview,
  PromotionReviewUser,
} from '../../../types/moderation';

function user(
  id: number,
  overrides: Partial<PromotionReviewUser> = {},
): PromotionReviewUser {
  return {
    id,
    username: `user#${id}`,
    last_active: '2026-09-26T10:00:00+00:00',
    account_age: 864_000,
    kudos: 5000,
    evaluating_kudos: 1250,
    suspicious: 2,
    suspicion_reasons: [],
    flagged: false,
    deleted: false,
    vpn: false,
    worker_count: 1,
    paused_worker_count: 0,
    worker_kudos: 0,
    worker_fulfilments: 0,
    contact: null,
    admin_comment: null,
    ...overrides,
  };
}

function overview(
  overrides: Partial<ModerationOverview> = {},
): ModerationOverview {
  return {
    promotion_threshold: 1000,
    suspicion_threshold: 5,
    worker_suspicion_threshold: 3,
    promotion_blocked_users: [],
    promotion_eligible_users: [user(1)],
    paused_workers: [],
    ...overrides,
  };
}

describe('ReviewPromotionsComponent', () => {
  let fixture: ComponentFixture<ReviewPromotionsComponent>;
  let answer: WritableSignal<ModerationOverview | null>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const factText = (selector: string): string =>
    host().querySelector(`${selector} dd`)?.textContent?.trim() ?? '';

  const render = async (value: ModerationOverview): Promise<void> => {
    answer = signal(value);
    await TestBed.configureTestingModule({
      imports: [
        ReviewPromotionsComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              'admin.review.promotions.threshold_value':
                '{{threshold}} plus {{excess}}',
              'admin.review.suspicion_value': '{{count}} of {{threshold}}',
            },
          },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: ModerationCountsService,
          useValue: { overview: answer, refreshOverview: vi.fn() },
        },
        {
          provide: AdminUserService,
          useValue: { setTrusted: vi.fn(), resetSuspicion: vi.fn() },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewPromotionsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it("states the overview's promotion threshold and how far the account is past it", async () => {
    await render(overview());
    expect(factText('[data-promotion-threshold]')).toBe('1,000 plus 250');
  });

  it("states the account's suspicion against the overview's account threshold", async () => {
    await render(overview());
    expect(factText('[data-suspicion]')).toBe('2 of 5');
  });

  it('leaves the threshold out when the horde has none configured', async () => {
    await render(overview({ promotion_threshold: null }));
    expect(host().querySelector('[data-promotion-threshold]')).toBeNull();
    expect(host().querySelector('[data-suspicion]')).not.toBeNull();
  });
});
