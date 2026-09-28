import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NEVER, of } from 'rxjs';
import { vi } from 'vitest';
import { ReviewReportsComponent } from './review-reports.component';
import { DEFAULT_REPORTS, ReportsState } from './review-query';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { AdminOperationsService } from '../../../services/admin-operations.service';
import { AdminUserService } from '../../../services/admin-user.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { ToastService } from '../../../services/toast.service';
import {
  EndpointAvailability,
  ModerationSubject,
  ModerationSubjectQuery,
} from '../../../types/moderation';

function subject(
  userId: number,
  overrides: Partial<ModerationSubject> = {},
): ModerationSubject {
  return {
    kind: 'account',
    user_id: userId,
    username: `user#${userId}`,
    proxied_account: null,
    ipaddr: null,
    count: 60,
    counts_by_reason: { worker_csam: 55, filter_rejection: 5 },
    last_event: '2026-09-26T10:50:00+00:00',
    decision: null,
    ...overrides,
  };
}

describe('ReviewReportsComponent', () => {
  let fixture: ComponentFixture<ReviewReportsComponent>;
  let component: ReviewReportsComponent;
  let emitted: ReportsState[];
  let subjects: ModerationSubject[];
  let moderation: Record<string, unknown>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (state: ReportsState = DEFAULT_REPORTS) => {
    await TestBed.configureTestingModule({
      imports: [
        ReviewReportsComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AdminModerationService, useValue: moderation },
        {
          provide: ModerationCountsService,
          useValue: { refreshReports: vi.fn() },
        },
        { provide: AdminUserService, useValue: {} },
        { provide: AdminOperationsService, useValue: {} },
        { provide: AdminWorkerService, useValue: {} },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewReportsComponent);
    component = fixture.componentInstance;
    emitted = [];
    component.stateChange.subscribe((value) => emitted.push(value));
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const setState = async (state: ReportsState) => {
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    subjects = [subject(1), subject(2), subject(3)];
    moderation = {
      subjectsAvailability: signal<EndpointAvailability>('available'),
      reportingWorkersAvailability: signal<EndpointAvailability>('available'),
      falsePositivesAvailability: signal<EndpointAvailability>('available'),
      settingsAvailability: signal<EndpointAvailability>('available'),
      promptEventsAvailability: signal<EndpointAvailability>('available'),
      probe: vi.fn(() => of(undefined)),
      getSubjects: vi.fn((query: ModerationSubjectQuery) =>
        of({
          criteria: {
            rules: [
              { window_seconds: 3600, min_count: 50, reasons: ['worker_csam'] },
            ],
            since_review: true,
          },
          subjects:
            query.state === 'watching'
              ? [subject(8)]
              : query.state === 'escalated'
                ? []
                : subjects,
          next_offset: null,
        }),
      ),
      getSubjectDecisions: vi.fn(() =>
        of({ decisions: [], next_cursor: null }),
      ),
      getPromptEvents: vi.fn(() => of({ events: [], next_cursor: null })),
      getSubjectDetail: vi.fn(() => NEVER),
      getFalsePositives: vi.fn(() =>
        of({
          since: '2026-09-01T00:00:00Z',
          until: '2026-09-27T00:00:00Z',
          models: [],
          total: 0,
          next_offset: null,
        }),
      ),
      getSettings: vi.fn(() => of({ rules: [] })),
    };
  });

  it('asks for those over the alert thresholds with no window or count', async () => {
    await render();

    expect(moderation['getSubjects']).toHaveBeenCalledWith({
      kind: 'account',
      since_review: true,
      limit: 50,
    });
    expect(host().querySelectorAll('[role="row"]').length).toBe(3);
  });

  it('reads the alert preset as one line until the criteria are opened', async () => {
    await render();
    expect(host().querySelector('[data-criteria-summary]')).not.toBeNull();
    expect(host().querySelector('.review-criteria')).toBeNull();

    component.criteriaOpen.set(true);
    fixture.detectChanges();
    expect(host().querySelector('[data-criteria-summary]')).toBeNull();
    expect(host().querySelector('.review-criteria')).not.toBeNull();
  });

  it('says which reasons each alert rule counts', async () => {
    await render();
    component.criteriaOpen.set(true);
    fixture.detectChanges();

    const rules = host().querySelector('[data-alert-rules]');
    expect(rules?.textContent).toContain('admin.review.reports.rule_line');
    expect(component.reasonsOf(['worker_csam', 'filter_rejection'])).toBe(
      'admin.review.reason.filter_rejection or admin.review.reason.worker_csam',
    );
  });

  it('asks with the custom criteria the address carries', async () => {
    await render({
      ...DEFAULT_REPORTS,
      kind: 'ip',
      criteria: {
        window: 604_800,
        minCount: 3,
        reasons: ['worker_csam'],
        sinceReview: false,
      },
    });

    expect(moderation['getSubjects']).toHaveBeenCalledWith({
      kind: 'ip',
      window: 604_800,
      min_count: 3,
      reason: ['worker_csam'],
      since_review: false,
      limit: 50,
    });
  });

  it('turns the since-review toggle into criteria in the address', async () => {
    await render();
    component.setSinceReview(false);

    expect(emitted.at(-1)?.criteria).toEqual({
      ...DEFAULT_REPORTS.criteria,
      sinceReview: false,
    });
  });

  it('applies a custom search only when asked, and not with a bad count', async () => {
    await render();
    component.setCustom(true);
    component.draftWindow.set(3600);
    component.draftMinCount.set('0');
    expect(component.minCountInvalid()).toBe(true);
    component.applyCustom();
    expect(emitted).toEqual([]);

    component.draftMinCount.set('12');
    component.toggleReason('model_rejection');
    component.applyCustom();
    expect(emitted.at(-1)?.criteria).toEqual({
      window: 3600,
      minCount: 12,
      reasons: ['model_rejection'],
      sinceReview: true,
    });
  });

  it('goes back to the alert preset at once', async () => {
    await render({
      ...DEFAULT_REPORTS,
      criteria: { window: 3600, minCount: 2, reasons: [], sinceReview: false },
    });
    component.setCustom(false);

    expect(emitted.at(-1)?.criteria).toEqual({
      ...DEFAULT_REPORTS.criteria,
      sinceReview: false,
    });
  });

  it('reads the watching state with pagination, without custom criteria', async () => {
    await render({ ...DEFAULT_REPORTS, view: 'watching' });

    expect(moderation['getSubjects']).toHaveBeenCalledWith({
      state: 'watching',
      limit: 50,
      offset: undefined,
    });
    expect(host().querySelector('.review-criteria')).toBeNull();
  });

  it('probes each view with an endpoint of its own once', async () => {
    await render();

    expect(
      (moderation['probe'] as ReturnType<typeof vi.fn>).mock.calls.map(
        ([endpoint]) => endpoint,
      ),
    ).toEqual(['reportingWorkers', 'falsePositives', 'settings']);
  });

  it('offers only the views whose endpoint has answered, and shows the lists in place of one that has not', async () => {
    (
      moderation['settingsAvailability'] as WritableSignal<EndpointAvailability>
    ).set('absent');
    (
      moderation[
        'falsePositivesAvailability'
      ] as WritableSignal<EndpointAvailability>
    ).set('unknown');
    await render({ ...DEFAULT_REPORTS, view: 'thresholds' });

    expect(component.views()).toEqual([
      'over',
      'watching',
      'escalated',
      'workers',
    ]);
    expect(component.view()).toBe('over');
    expect(moderation['getSettings']).not.toHaveBeenCalled();
    expect(moderation['getSubjects']).toHaveBeenCalled();
  });

  it('reads nothing for the panels until they are chosen', async () => {
    await render({ ...DEFAULT_REPORTS, view: 'thresholds' });

    expect(moderation['getSubjects']).not.toHaveBeenCalled();
    expect(moderation['getFalsePositives']).not.toHaveBeenCalled();
    expect(moderation['getSettings']).toHaveBeenCalledTimes(1);
  });

  it('opens a subject into the address, and keeps its counts when a refresh drops it', async () => {
    await render();
    component.open(subjects[1]);
    const opened = emitted.at(-1)!;
    expect(opened.open).toEqual({
      kind: 'account',
      user_id: 2,
      proxied_account: null,
      ipaddr: null,
    });

    await setState(opened);
    subjects = [subject(1), subject(3)];
    component.onDecided({ decision: {} as never, advance: false });
    fixture.detectChanges();

    expect(component.subjects().map((item) => item.user_id)).toEqual([1, 3]);
    expect(component.openSubject()?.user_id).toBe(2);
  });

  it('shows the detail of a subject the address names, on a narrow screen too', async () => {
    await render({
      ...DEFAULT_REPORTS,
      open: {
        kind: 'account',
        user_id: 2,
        proxied_account: null,
        ipaddr: null,
      },
    });

    expect(component.detailShown()).toBe(true);
    expect(
      host()
        .querySelector('.review-split')
        ?.classList.contains('review-split--detail'),
    ).toBe(true);
  });

  it('moves to the next subject after a closing decision', async () => {
    await render();
    component.open(subjects[1]);
    await setState(emitted.at(-1)!);

    component.onDecided({
      decision: {} as never,
      advance: true,
    });

    fixture.detectChanges();
    expect(emitted.at(-1)?.open?.user_id).toBe(3);
    expect(moderation['getSubjects']).toHaveBeenCalledTimes(2);
  });

  it('stays on the subject after an action', async () => {
    await render();
    component.open(subjects[1]);
    await setState(emitted.at(-1)!);
    const before = emitted.length;

    component.onDecided({ decision: {} as never, advance: false });

    expect(emitted.length).toBe(before);
  });

  it('steps to the neighbours of the open subject, and no further', async () => {
    await render();
    component.open(subjects[1]);
    await setState(emitted.at(-1)!);
    expect(component.hasPrevious()).toBe(true);
    expect(component.hasNext()).toBe(true);

    component.onStep('next');
    expect(emitted.at(-1)?.open?.user_id).toBe(3);
    await setState(emitted.at(-1)!);
    expect(component.hasNext()).toBe(false);

    component.onStep('previous');
    expect(emitted.at(-1)?.open?.user_id).toBe(2);
  });

  it('names a running watch and its end date in the list', async () => {
    const watch = {
      id: 5,
      subject_kind: 'account' as const,
      user_id: 8,
      proxied_account: null,
      ipaddr: null,
      outcome: 'watching' as const,
      note: null,
      reviewer_id: 1,
      reviewer: 'mod',
      created: '2026-09-20T09:00:00+00:00',
      watermark_event_id: 1,
      watch_until: '2099-10-10T23:59:59+00:00',
      watch_min_count: 20,
      action: null,
      action_detail: null,
    };
    moderation['getSubjects'] = vi.fn(() =>
      of({
        criteria: { rules: null },
        subjects: [subject(8, { decision: watch })],
        next_offset: null,
      }),
    );
    await render({ ...DEFAULT_REPORTS, view: 'watching' });

    const chip = host().querySelector('.review-state-chip');
    expect(chip?.getAttribute('data-outcome')).toBe('watching');
    expect(chip?.textContent).toContain(
      'admin.review.reports.state_label.watching',
    );
  });
});
