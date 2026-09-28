import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  ReportsPage,
  ReviewSubjectEventsComponent,
  promptStages,
} from './review-subject-events.component';
import { SubjectRef } from './review-subjects';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import {
  PromptModerationEvent,
  PromptModerationEventQuery,
} from '../../../types/moderation';

const ACCOUNT: SubjectRef = {
  kind: 'account',
  user_id: 42,
  proxied_account: null,
  ipaddr: null,
};

function event(
  id: number,
  overrides: Partial<PromptModerationEvent> = {},
): PromptModerationEvent {
  return {
    id,
    created: '2026-09-26T10:00:00+00:00',
    user_id: 42,
    request_id: null,
    worker_id: null,
    proxied_account: null,
    ipaddr: null,
    models: null,
    reason: 'filter_rejection',
    outcome: 'rejected',
    submitted_prompt: `submitted text ${id}`,
    moderation_prompt: `styled text ${id}`,
    effective_prompt: null,
    text_truncated: false,
    held_until: null,
    notes: [],
    ...overrides,
  };
}

describe('ReviewSubjectEventsComponent', () => {
  let fixture: ComponentFixture<ReviewSubjectEventsComponent>;
  let component: ReviewSubjectEventsComponent;
  let events: PromptModerationEvent[];
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let moderation: {
    getPromptEvents: ReturnType<typeof vi.fn>;
    addPromptNote: ReturnType<typeof vi.fn>;
    holdPromptEvent: ReturnType<typeof vi.fn>;
    releasePromptHold: ReturnType<typeof vi.fn>;
  };

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const stageTexts = (): string[] =>
    Array.from(host().querySelectorAll('[data-prompt-stage]')).map(
      (el) => el.textContent?.trim() ?? '',
    );

  const render = async (
    ref: SubjectRef | null = ACCOUNT,
    watermark: number | null = null,
    page: ReportsPage | null = { events, cursor: null },
    query: PromptModerationEventQuery | null = null,
  ): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [
        ReviewSubjectEventsComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AdminModerationService, useValue: moderation },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewSubjectEventsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('ref', ref);
    fixture.componentRef.setInput('watermark', watermark);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('query', query);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const hrefOf = (selector: string): string =>
    host().querySelector(selector)?.getAttribute('href') ?? '';

  beforeEach(() => {
    toast = { success: vi.fn(), error: vi.fn() };
    events = [
      event(3),
      event(2, {
        reason: 'worker_csam',
        outcome: 'censored',
        moderation_prompt: null,
        effective_prompt: 'effective text 2',
      }),
      event(1),
    ];
    moderation = {
      getPromptEvents: vi.fn(() => of({ events, next_cursor: null })),
      addPromptNote: vi.fn(),
      holdPromptEvent: vi.fn(),
      releasePromptHold: vi.fn(),
    };
  });

  it('shows no prompt text until asked, and one report at a time', async () => {
    await render();
    component.toggleExpanded(3);
    component.toggleExpanded(1);
    fixture.detectChanges();
    expect(stageTexts()).toEqual([]);

    component.toggleReveal(3);
    fixture.detectChanges();
    expect(stageTexts()).toEqual(['submitted text 3', 'styled text 3']);

    component.toggleReveal(1);
    fixture.detectChanges();
    expect(stageTexts()).toEqual(['submitted text 1', 'styled text 1']);
  });

  it('draws only the stages an event has, with no placeholder for the others', async () => {
    await render();
    component.toggleExpanded(2);
    component.toggleReveal(2);
    fixture.detectChanges();

    const stages = host().querySelector('[data-event="2"] .review-stages');
    expect(stageTexts()).toEqual(['submitted text 2', 'effective text 2']);
    expect(stages?.textContent).not.toContain('admin.review.not_recorded');
    expect(stages?.textContent).not.toContain(
      'admin.review.reports.events.stage_after_styles',
    );
  });

  it('says a stage repeats the one before it instead of drawing its text again', async () => {
    events = [event(4, { moderation_prompt: 'submitted text 4' })];
    await render();
    component.toggleExpanded(4);
    component.toggleReveal(4);
    fixture.detectChanges();

    const stages = host().querySelector('[data-event="4"] .review-stages');
    expect(stageTexts()).toEqual(['submitted text 4']);
    expect(stages?.textContent).toContain(
      'admin.review.reports.events.stage_after_styles',
    );
    expect(
      stages?.querySelector('[data-prompt-stage-same]')?.textContent?.trim(),
    ).toBe('admin.review.reports.events.stage_same_as_submitted');
  });

  it('shows every rejected prompt at once on request, never a worker report', async () => {
    await render();
    component.toggleRejectionsRevealed();
    fixture.detectChanges();

    expect(stageTexts()).toEqual([
      'submitted text 3',
      'styled text 3',
      'submitted text 1',
      'styled text 1',
    ]);

    component.toggleExpanded(2);
    component.toggleReveal(2);
    fixture.detectChanges();
    expect(stageTexts()).toContain('effective text 2');

    component.toggleRejectionsRevealed();
    fixture.detectChanges();
    expect(stageTexts()).toEqual([]);
  });

  it('keeps showing rejected prompts loaded while the page-wide control is on', async () => {
    moderation.getPromptEvents.mockReturnValue(
      of({ events: [event(0)], next_cursor: null }),
    );
    await render(ACCOUNT, null, { events, cursor: 1 });
    component.toggleRejectionsRevealed();
    component.loadMore();
    fixture.detectChanges();

    expect(stageTexts()).toContain('submitted text 0');
  });

  it('hides the text again when another page of reports arrives', async () => {
    await render();
    component.toggleReveal(3);
    fixture.componentRef.setInput('page', { events, cursor: null });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.revealedId()).toBeNull();
    expect(stageTexts()).toEqual([]);
  });

  it('shows each report as one line until it is opened', async () => {
    await render();
    expect(host().querySelectorAll('[data-event-toggle]').length).toBe(3);
    expect(host().querySelector('.review-event-body')).toBeNull();

    (
      host().querySelector(
        '[data-event="3"] [data-event-toggle]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(
      host().querySelector('[data-event="3"] .review-event-body'),
    ).not.toBeNull();
  });

  it('hides a report text again when its report is closed', async () => {
    await render();
    component.toggleExpanded(3);
    component.toggleReveal(3);
    component.toggleExpanded(3);
    fixture.detectChanges();

    expect(component.revealedId()).toBeNull();
    expect(stageTexts()).toEqual([]);
  });

  it('warns before a worker report and never shows it on its own', async () => {
    await render();
    for (const id of [1, 2, 3]) component.toggleExpanded(id);
    fixture.detectChanges();

    const csam = host().querySelector('[data-event="2"]');
    expect(csam?.querySelector('.review-caution')).not.toBeNull();
    expect(csam?.querySelector('[data-prompt-stage]')).toBeNull();
    expect(host().querySelectorAll('.review-caution').length).toBe(1);
  });

  it('reads nothing itself, and marks the reports the latest decision covered', async () => {
    await render(ACCOUNT, 2);
    expect(moderation.getPromptEvents).not.toHaveBeenCalled();
    expect(
      Array.from(host().querySelectorAll('[data-covered]')).map((el) =>
        el.closest('[data-event]')?.getAttribute('data-event'),
      ),
    ).toEqual(['2', '1']);
  });

  it('waits for its page while the detail is read', async () => {
    await render(ACCOUNT, null, null);
    expect(component.list().loading).toBe(true);
    expect(host().querySelector('.hd-skeleton')).not.toBeNull();
  });

  it('reads on from the cursor with the subject filters', async () => {
    moderation.getPromptEvents.mockReturnValue(
      of({ events: [event(0)], next_cursor: null }),
    );
    await render(
      { kind: 'ip', user_id: null, proxied_account: null, ipaddr: '10.0.0.1' },
      null,
      { events, cursor: 1 },
    );
    component.loadMore();
    fixture.detectChanges();

    expect(moderation.getPromptEvents).toHaveBeenCalledExactlyOnceWith({
      ipaddr: '10.0.0.1',
      limit: 50,
      before_id: 1,
    });
    expect(component.list().events.map((e) => e.id)).toEqual([3, 2, 1, 0]);
    expect(component.list().cursor).toBeNull();
  });

  it('reads on within a range, and by worker on a worker page', async () => {
    moderation.getPromptEvents.mockReturnValue(
      of({ events: [], next_cursor: null }),
    );
    await render(null, null, {
      events,
      cursor: 1,
      since: new Date('2026-09-26T02:00:00Z'),
      until: new Date('2026-09-26T04:00:00Z'),
    });
    fixture.componentRef.setInput('workerId', 'w-1');
    component.loadMore();

    expect(moderation.getPromptEvents).toHaveBeenCalledWith({
      worker_id: 'w-1',
      limit: 50,
      before_id: 1,
      since: '2026-09-26T02:00:00+00:00',
      until: '2026-09-26T04:00:00+00:00',
    });
    expect(host().querySelector('[data-range-events]')).not.toBeNull();
  });

  it('adds a note to the report and shows it', async () => {
    moderation.addPromptNote.mockReturnValue(
      of({
        id: 5,
        author_id: 9,
        note: 'ordinary photo',
        created: '2026-09-26T11:00:00+00:00',
      }),
    );
    await render();
    component.toggleExpanded(3);
    component.startNote(3);
    component.setNoteDraft(' ordinary photo ');
    component.saveNote();
    fixture.detectChanges();

    expect(moderation.addPromptNote).toHaveBeenCalledWith(3, 'ordinary photo');
    expect(
      host().querySelector('[data-event="3"] .review-notes')?.textContent,
    ).toContain('ordinary photo');
  });

  it('says plainly when the horde refuses a note', async () => {
    moderation.addPromptNote.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'bad note', rc: 'InvalidModerationNote' },
          }),
      ),
    );
    await render();
    component.startNote(3);
    component.setNoteDraft('text');
    component.saveNote();

    expect(toast.error).toHaveBeenCalledWith(
      'admin.review.refusal.note',
      expect.anything(),
    );
    expect(component.noteFor()).toBe(3);
  });

  it('shows hold controls only when the horde returned hold state', async () => {
    const oldEvent = event(3);
    delete oldEvent.held_until;
    events = [oldEvent];
    await render();
    component.toggleExpanded(3);
    fixture.detectChanges();
    expect(host().querySelector('[data-hold-form]')).toBeNull();
    expect(host().textContent).not.toContain(
      'admin.review.reports.events.hold_add',
    );
    expect(component.holdsShown()).toBe(false);
  });

  it('marks a held report on its collapsed row', async () => {
    events = [event(3, { held_until: '2026-10-26T11:00:00+00:00' }), event(2)];
    await render();

    const marker = host().querySelector('[data-event="3"] [data-held-marker]');
    expect(marker?.textContent).toContain(
      'admin.review.reports.events.hold_until',
    );
    expect(marker?.closest('.review-event-row')).not.toBeNull();
    expect(
      host().querySelector('[data-event="2"] [data-held-marker]'),
    ).toBeNull();
    expect(component.holdsShown()).toBe(true);
  });

  it('says a shorter hold keeps the current date only on a held report', async () => {
    events = [event(3, { held_until: '2026-10-26T11:00:00+00:00' }), event(2)];
    await render();
    component.toggleExpanded(3);
    component.startHold(3);
    fixture.detectChanges();
    expect(host().querySelector('[data-hold-keeps]')).not.toBeNull();

    component.toggleExpanded(2);
    component.startHold(2);
    fixture.detectChanges();
    expect(host().querySelector('[data-hold-keeps]')).toBeNull();
  });

  it('sets a hold with an attributed note and releases it', async () => {
    const storedNote = {
      id: 9,
      author_id: 7,
      note: 'Keep for review',
      created: '2026-09-26T11:00:00+00:00',
    };
    moderation.holdPromptEvent.mockReturnValue(
      of({ held_until: '2026-10-26T11:00:00+00:00', note: storedNote }),
    );
    const releaseNote = {
      id: 10,
      author_id: 7,
      note: 'Case closed',
      created: '2026-09-27T11:00:00+00:00',
    };
    moderation.releasePromptHold.mockReturnValue(
      of({ held_until: null, note: releaseNote }),
    );
    await render();
    component.toggleExpanded(3);
    component.startHold(3);
    component.setHoldDays('30');
    component.setHoldNote(' Keep for review ');
    component.saveHold();
    await settle();

    expect(moderation.holdPromptEvent).toHaveBeenCalledWith(
      3,
      30,
      'Keep for review',
    );
    expect(component.list().events[0].held_until).toBe(
      '2026-10-26T11:00:00+00:00',
    );
    expect(component.list().events[0].notes).toContainEqual(storedNote);
    expect(host().querySelector('[data-hold-expiry]')).not.toBeNull();

    component.startRelease(3);
    component.setReleaseNote(' Case closed ');
    component.releaseHold(3);
    await settle();
    expect(moderation.releasePromptHold).toHaveBeenCalledWith(3, 'Case closed');
    expect(component.list().events[0].held_until).toBeNull();
    expect(component.list().events[0].notes).toContainEqual(releaseNote);
    expect(component.releaseFor()).toBeNull();
  });

  it('sends no release note when none is written', async () => {
    events = [event(3, { held_until: '2026-10-26T11:00:00+00:00' })];
    moderation.releasePromptHold.mockReturnValue(
      of({
        held_until: null,
        note: {
          id: 10,
          author_id: 7,
          note: 'Hold released',
          created: '2026-09-27T11:00:00+00:00',
        },
      }),
    );
    await render();
    component.startRelease(3);
    component.setReleaseNote('   ');
    component.releaseHold(3);

    expect(moderation.releasePromptHold).toHaveBeenCalledWith(3, undefined);
  });

  it('drops a report the horde has already pruned when a hold is refused', async () => {
    moderation.holdPromptEvent.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { message: 'gone', rc: 'ModerationEventNotFound' },
          }),
      ),
    );
    await render();
    component.toggleExpanded(3);
    component.startHold(3);
    component.setHoldNote('keep');
    component.saveHold();
    fixture.detectChanges();

    expect(toast.error).toHaveBeenCalledWith(
      'admin.review.refusal.event_not_found',
      expect.anything(),
    );
    expect(component.list().events.map((each) => each.id)).toEqual([2, 1]);
    expect(host().querySelector('[data-event="3"]')).toBeNull();
    expect(component.holdFor()).toBeNull();
    expect(component.savingHold()).toBe(false);
  });

  it('keeps the report and its form when a hold is refused for another reason', async () => {
    moderation.holdPromptEvent.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'bad', rc: 'InvalidModerationHold' },
          }),
      ),
    );
    await render();
    component.startHold(3);
    component.setHoldNote('keep');
    component.saveHold();

    expect(toast.error).toHaveBeenCalledWith(
      'admin.review.refusal.hold',
      expect.anything(),
    );
    expect(component.list().events.map((each) => each.id)).toEqual([3, 2, 1]);
    expect(component.holdFor()).toBe(3);
  });

  describe('focus', () => {
    const focused = (): Element | null => document.activeElement;
    const inRow = (selector: string): Element | null =>
      host().querySelector(`[data-event="3"] ${selector}`);

    it('moves into the note form and back to the control that opened it', async () => {
      await render();
      component.toggleExpanded(3);
      await settle();

      component.startNote(3);
      await settle();
      expect(focused()).toBe(host().querySelector('#review-event-note-3'));

      component.cancelNote();
      await settle();
      expect(focused()).toBe(inRow('[data-opens="note"]'));
    });

    it('returns to the note control after a note is saved', async () => {
      moderation.addPromptNote.mockReturnValue(
        of({
          id: 5,
          author_id: 9,
          note: 'seen',
          created: '2026-09-26T11:00:00+00:00',
        }),
      );
      await render();
      component.toggleExpanded(3);
      component.startNote(3);
      await settle();
      component.setNoteDraft('seen');
      component.saveNote();
      await settle();
      expect(focused()).toBe(inRow('[data-opens="note"]'));
    });

    it('moves into the hold form and back after a save', async () => {
      moderation.holdPromptEvent.mockReturnValue(
        of({
          held_until: '2026-10-26T11:00:00+00:00',
          note: {
            id: 9,
            author_id: 7,
            note: 'keep',
            created: '2026-09-26T11:00:00+00:00',
          },
        }),
      );
      await render();
      component.toggleExpanded(3);
      component.startHold(3);
      await settle();
      expect(focused()).toBe(host().querySelector('#review-event-hold-days-3'));

      component.setHoldNote('keep');
      component.saveHold();
      await settle();
      expect(focused()).toBe(inRow('[data-opens="hold"]'));
    });

    it('moves into the release step, back on cancel, and to the toggle once the control is gone', async () => {
      events = [event(3, { held_until: '2026-10-26T11:00:00+00:00' })];
      moderation.releasePromptHold.mockReturnValue(
        of({
          held_until: null,
          note: {
            id: 10,
            author_id: 7,
            note: 'Hold released',
            created: '2026-09-27T11:00:00+00:00',
          },
        }),
      );
      await render();
      component.toggleExpanded(3);
      component.startRelease(3);
      await settle();
      expect(focused()).toBe(
        host().querySelector('#review-event-release-note-3'),
      );

      component.cancelRelease();
      await settle();
      expect(focused()).toBe(inRow('[data-opens="release"]'));

      component.startRelease(3);
      await settle();
      component.releaseHold(3);
      await settle();
      expect(inRow('[data-opens="release"]')).toBeNull();
      expect(focused()).toBe(inRow('[data-event-toggle]'));
    });
  });

  describe('reading its own pages', () => {
    const query: PromptModerationEventQuery = {
      worker_id: 'w-1',
      since: '2026-09-25T12:00:00+00:00',
    };

    it('reads its first page from the query when no detail brings one', async () => {
      moderation.getPromptEvents.mockReturnValue(
        of({ events, next_cursor: 1 }),
      );
      await render(null, null, null, query);

      expect(moderation.getPromptEvents).toHaveBeenCalledExactlyOnceWith({
        ...query,
        limit: 50,
      });
      expect(component.list().events.map((e) => e.id)).toEqual([3, 2, 1]);
      expect(component.standalone()).toBe(true);
    });

    it('reads on from the cursor with the query, and appends', async () => {
      moderation.getPromptEvents
        .mockReturnValueOnce(of({ events, next_cursor: 1 }))
        .mockReturnValueOnce(of({ events: [event(0)], next_cursor: null }));
      await render(null, null, null, query);
      component.loadMore();

      expect(moderation.getPromptEvents).toHaveBeenLastCalledWith({
        ...query,
        limit: 50,
        before_id: 1,
      });
      expect(component.list().events.map((e) => e.id)).toEqual([3, 2, 1, 0]);
    });

    it('reads again and hides the text when the query changes', async () => {
      await render(null, null, null, query);
      component.toggleReveal(3);
      fixture.componentRef.setInput('query', { ipaddr: '10.0.0.1' });
      await settle();

      expect(moderation.getPromptEvents).toHaveBeenLastCalledWith({
        ipaddr: '10.0.0.1',
        limit: 50,
      });
      expect(component.revealedId()).toBeNull();
    });

    it('asks for the first page again after it failed', async () => {
      moderation.getPromptEvents.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      await render(null, null, null, query);
      expect(component.list().failed).toBe(true);
      expect(toast.error).toHaveBeenCalled();

      component.loadMore();
      expect(moderation.getPromptEvents).toHaveBeenCalledTimes(2);
      expect(component.list().events.length).toBe(3);
    });

    it('says what share of the loaded reports the chosen reasons show', async () => {
      await render(null, null, null, query);
      fixture.componentRef.setInput('reasons', new Set(['worker_csam']));
      await settle();

      expect(component.shownEvents().map((e) => e.id)).toEqual([2]);
      expect(host().querySelector('[data-shown-count]')).not.toBeNull();
      expect(host().querySelectorAll('[data-event]').length).toBe(1);
    });

    it('marks nothing as covered by a decision', async () => {
      await render(null, null, null, query);
      expect(host().querySelector('[data-covered]')).toBeNull();
    });
  });

  describe('links from a report', () => {
    const named = event(4, {
      user_id: 42,
      worker_id: 'w-1',
      ipaddr: '10.0.0.1',
      proxied_account: 'bot:7',
    });

    const openNamed = async (): Promise<void> => {
      events = [named];
      await render(null, null, null, {});
      component.toggleExpanded(4);
      fixture.detectChanges();
    };

    it('pivots each account, address and worker into the Prompts tab', async () => {
      await openNamed();

      expect(hrefOf('[data-pivot="account"]')).toContain('tab=prompts');
      expect(hrefOf('[data-pivot="account"]')).toContain('user_id=42');
      expect(hrefOf('[data-pivot="ip"]')).toContain('ipaddr=10.0.0.1');
      expect(hrefOf('[data-pivot="worker"]')).toContain('worker_id=w-1');
      expect(hrefOf('[data-pivot="proxied_account"]')).toContain(
        'proxied_account=bot',
      );
    });

    it('names the account on the collapsed row unless the list is one account', async () => {
      events = [named];
      await render(null, null, null, {});
      expect(host().querySelectorAll('[data-pivot="account"]').length).toBe(1);

      fixture.componentRef.setInput('query', { user_id: 42 });
      await settle();
      expect(host().querySelectorAll('[data-pivot="account"]').length).toBe(0);
    });

    it("opens an account's and a worker's admin page", async () => {
      await openNamed();

      expect(hrefOf('[data-admin-page="account"]')).toBe('/admin/users/42');
      expect(hrefOf('[data-admin-page="worker"]')).toBe(
        '/admin/workers?worker=w-1',
      );
    });
  });

  it('reports the newest report on the page', async () => {
    await render();
    expect(component.newestLoadedId()).toBe(3);
  });
});

describe('promptStages', () => {
  it('names the drawn stage each repeat follows, skipping stages the event lacks', () => {
    expect(
      promptStages(
        event(1, {
          submitted_prompt: 'a',
          moderation_prompt: null,
          effective_prompt: 'a',
        }),
      ).map((stage) => stage.sameKey),
    ).toEqual([null, 'admin.review.reports.events.stage_same_as_submitted']);
    expect(
      promptStages(
        event(2, {
          submitted_prompt: 'a',
          moderation_prompt: 'a',
          effective_prompt: 'a',
        }),
      ).map((stage) => stage.sameKey),
    ).toEqual([
      null,
      'admin.review.reports.events.stage_same_as_submitted',
      'admin.review.reports.events.stage_same_as_after_styles',
    ]);
  });

  it('draws every stage whose text differs', () => {
    expect(
      promptStages(event(3)).map((stage) => [stage.text, stage.sameKey]),
    ).toEqual([
      ['submitted text 3', null],
      ['styled text 3', null],
    ]);
  });
});
