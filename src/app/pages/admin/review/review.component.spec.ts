import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import {
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
  Params,
  Router,
  provideRouter,
} from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject, map, of } from 'rxjs';
import { vi } from 'vitest';
import { ReviewComponent } from './review.component';
import {
  DEFAULT_CRITERIA,
  DEFAULT_PROMPTS,
  DEFAULT_REPORTS,
  PromptsState,
  parseReviewQuery,
  promptPivotParams,
  promptQueryOf,
  promptsParams,
  reportsParams,
  subjectQueryOf,
} from './review-query';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { TranslatorService } from '../../../services/translator.service';
import { ListCount } from '../../../types/moderation';

describe('parseReviewQuery', () => {
  it('reads the tab, the view, the kind, custom criteria and the open subject', () => {
    expect(
      parseReviewQuery(
        convertToParamMap({
          tab: 'reports',
          view: 'over',
          kind: 'proxied_account',
          window: '3600',
          min_count: '5',
          reason: ['worker_csam', 'nonsense'],
          since_review: '0',
          open: 'proxied_account:12:bot:user 7',
        }),
      ),
    ).toEqual({
      tab: 'reports',
      reports: {
        view: 'over',
        kind: 'proxied_account',
        criteria: {
          window: 3600,
          minCount: 5,
          reasons: ['worker_csam'],
          sinceReview: false,
        },
        open: {
          kind: 'proxied_account',
          user_id: 12,
          proxied_account: 'bot:user 7',
          ipaddr: null,
        },
        worker: null,
      },
      prompts: DEFAULT_PROMPTS,
    });
  });

  it('reads the open worker in the reporting-workers view only', () => {
    expect(
      parseReviewQuery(convertToParamMap({ view: 'workers', worker: 'w-1' }))
        .reports.worker,
    ).toBe('w-1');
    expect(
      parseReviewQuery(convertToParamMap({ view: 'over', worker: 'w-1' }))
        .reports.worker,
    ).toBeNull();
  });

  it('reads an IPv6 address whole', () => {
    expect(
      parseReviewQuery(convertToParamMap({ open: 'ip:2001:db8::1' })).reports
        .open,
    ).toEqual({
      kind: 'ip',
      user_id: null,
      proxied_account: null,
      ipaddr: '2001:db8::1',
    });
  });

  it('falls back to the defaults for anything it does not know', () => {
    expect(
      parseReviewQuery(
        convertToParamMap({
          tab: 'elsewhere',
          view: 'elsewhere',
          kind: 'worker',
          window: '999',
          min_count: '-3',
          open: 'account:x',
        }),
      ),
    ).toEqual({
      tab: null,
      reports: DEFAULT_REPORTS,
      prompts: DEFAULT_PROMPTS,
    });
  });

  it('fills the other half of a custom search named only in part', () => {
    expect(
      parseReviewQuery(convertToParamMap({ min_count: '9' })).reports.criteria,
    ).toEqual({
      window: 86_400,
      minCount: 9,
      reasons: [],
      sinceReview: true,
    });
  });

  it('writes values at their default as removals, and round-trips', () => {
    expect(reportsParams(DEFAULT_REPORTS)).toEqual({
      tab: 'reports',
      view: null,
      kind: null,
      window: null,
      min_count: null,
      reason: null,
      since_review: null,
      open: null,
      worker: null,
    });
    const state = {
      view: 'over' as const,
      kind: 'ip' as const,
      criteria: {
        window: 21_600,
        minCount: 3,
        reasons: ['model_rejection' as const],
        sinceReview: false,
      },
      open: {
        kind: 'ip' as const,
        user_id: null,
        proxied_account: null,
        ipaddr: '10.0.0.1',
      },
      worker: null,
    };
    // The router hands every value over as a string, or strings for a
    // repeated key, and drops the removals.
    const address = Object.fromEntries(
      Object.entries(reportsParams(state))
        .filter(([, value]) => value !== null)
        .map(([key, value]) => [
          key,
          Array.isArray(value) ? value.map(String) : String(value),
        ]),
    );
    expect(parseReviewQuery(convertToParamMap(address)).reports).toEqual(state);
  });
});

describe('subjectQueryOf', () => {
  it('sends no window, count or reasons for the alert preset', () => {
    expect(subjectQueryOf('account', DEFAULT_CRITERIA, 50)).toEqual({
      kind: 'account',
      since_review: true,
      limit: 50,
    });
  });

  it('sends the custom window, count and reasons, and the offset', () => {
    expect(
      subjectQueryOf(
        'ip',
        {
          window: 3600,
          minCount: 4,
          reasons: ['worker_csam'],
          sinceReview: false,
        },
        50,
        100,
      ),
    ).toEqual({
      kind: 'ip',
      window: 3600,
      min_count: 4,
      reason: ['worker_csam'],
      since_review: false,
      limit: 50,
      offset: 100,
    });
  });

  it('leaves the reasons off when every reason counts', () => {
    expect(
      subjectQueryOf(
        'account',
        { window: 3600, minCount: 1, reasons: [], sinceReview: true },
        50,
      ),
    ).not.toHaveProperty('reason');
  });
});

describe('Prompts tab address', () => {
  const now = Date.parse('2026-09-26T12:00:00Z');

  it('reads the filters, the period and the reasons, and ignores what it does not know', () => {
    expect(
      parseReviewQuery(
        convertToParamMap({
          tab: 'prompts',
          user_id: '42',
          proxied_account: 'bot:7',
          ipaddr: '2001:db8::/64',
          worker_id: 'w-1',
          period: 'week',
          prompt_reason: ['worker_csam', 'nonsense'],
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        tab: 'prompts',
        prompts: {
          user_id: 42,
          proxied_account: 'bot:7',
          ipaddr: '2001:db8::/64',
          worker_id: 'w-1',
          period: 'week',
          since: null,
          until: null,
          reasons: ['worker_csam'],
        },
      }),
    );
    expect(
      parseReviewQuery(
        convertToParamMap({
          user_id: 'x',
          period: 'year',
          since: '2026-09-01T00:00:00',
          prompt_reason: 'nonsense',
        }),
      ).prompts,
    ).toEqual(DEFAULT_PROMPTS);
  });

  it('keeps its reasons apart from the Reports criteria', () => {
    const parsed = parseReviewQuery(
      convertToParamMap({ reason: 'worker_csam', window: '3600' }),
    );
    expect(parsed.prompts.reasons).toEqual(DEFAULT_PROMPTS.reasons);
    expect(parsed.reports.criteria.reasons).toEqual(['worker_csam']);
  });

  it('writes values at their default as removals, and round-trips', () => {
    expect(promptsParams(DEFAULT_PROMPTS)).toEqual({
      tab: 'prompts',
      user_id: null,
      proxied_account: null,
      ipaddr: null,
      worker_id: null,
      period: null,
      since: null,
      until: null,
      prompt_reason: null,
    });
    const state: PromptsState = {
      user_id: 42,
      proxied_account: null,
      ipaddr: '10.0.0.1',
      worker_id: null,
      period: 'day',
      since: new Date('2026-09-20T00:00:00Z'),
      until: new Date('2026-09-21T00:00:00Z'),
      reasons: ['filter_rejection', 'worker_csam'],
    };
    // The router writes every value into the address as text.
    const address: Params = Object.fromEntries(
      Object.entries(promptsParams(state))
        .filter(([, value]) => value !== null)
        .map(([key, value]) => [
          key,
          Array.isArray(value) ? value.map(String) : String(value),
        ]),
    );
    expect(parseReviewQuery(convertToParamMap(address)).prompts).toEqual(state);
  });

  it('pivots onto one identity, clearing the others and keeping the rest of the address', () => {
    expect(promptPivotParams({ ipaddr: '10.0.0.1' })).toEqual({
      tab: 'prompts',
      user_id: null,
      proxied_account: null,
      ipaddr: '10.0.0.1',
      worker_id: null,
    });
  });

  it('asks for the filters and the period, with no reason while the horde cannot filter by one', () => {
    expect(
      promptQueryOf(
        {
          ...DEFAULT_PROMPTS,
          user_id: 42,
          worker_id: 'w-1',
          period: 'day',
          reasons: ['worker_csam'],
        },
        now,
        false,
      ),
    ).toEqual({
      user_id: 42,
      worker_id: 'w-1',
      since: '2026-09-25T12:00:00+00:00',
    });
    expect(promptQueryOf(DEFAULT_PROMPTS, now, false)).toEqual({});
  });

  it('sends every selected reason to a horde that filters by it', () => {
    expect(
      promptQueryOf(
        { ...DEFAULT_PROMPTS, reasons: ['worker_csam'] },
        now,
        true,
      ),
    ).toEqual({ reason: ['worker_csam'] });
    expect(
      promptQueryOf(
        { ...DEFAULT_PROMPTS, reasons: ['worker_csam', 'model_rejection'] },
        now,
        true,
      ),
    ).toEqual({ reason: ['model_rejection', 'worker_csam'] });
  });

  it('lets a named range stand in for the period', () => {
    expect(
      promptQueryOf(
        {
          ...DEFAULT_PROMPTS,
          period: 'week',
          since: new Date('2026-09-20T00:00:00Z'),
          until: new Date('2026-09-21T00:00:00Z'),
        },
        now,
        false,
      ),
    ).toEqual({
      since: '2026-09-20T00:00:00+00:00',
      until: '2026-09-21T00:00:00+00:00',
    });
  });
});

describe('ReviewComponent', () => {
  let fixture: ComponentFixture<ReviewComponent>;
  let component: ReviewComponent;
  let query: BehaviorSubject<Params>;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let counts: {
    reportsAvailable: WritableSignal<boolean>;
    promptsAvailable: WritableSignal<boolean>;
    overviewAvailable: WritableSignal<boolean>;
    loading: WritableSignal<boolean>;
    reportsTotal: WritableSignal<ListCount | null>;
    eligible: WritableSignal<ListCount | null>;
    blocked: WritableSignal<ListCount | null>;
    paused: WritableSignal<ListCount | null>;
    refreshIfStale: ReturnType<typeof vi.fn>;
  };

  const render = async (params: Params): Promise<void> => {
    query = new BehaviorSubject<Params>(params);
    const queryParamMap = query.pipe(
      map((value): ParamMap => convertToParamMap(value)),
    );
    await TestBed.configureTestingModule({
      imports: [
        ReviewComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap,
            snapshot: { queryParamMap: convertToParamMap(params) },
          },
        },
        { provide: Router, useValue: router },
        { provide: ModerationCountsService, useValue: counts },
        { provide: TranslatorService, useValue: { get: () => of('') } },
        { provide: Title, useValue: { setTitle: vi.fn() } },
      ],
    })
      .overrideComponent(ReviewComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(ReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    router = { navigate: vi.fn().mockResolvedValue(true) };
    counts = {
      reportsAvailable: signal(true),
      promptsAvailable: signal(true),
      overviewAvailable: signal(true),
      loading: signal(false),
      reportsTotal: signal({ count: 7, atLeast: false }),
      eligible: signal({ count: 2, atLeast: false }),
      blocked: signal({ count: 100, atLeast: true }),
      paused: signal(null),
      refreshIfStale: vi.fn(),
    };
  });

  it('opens the tab the address names and follows the address as it changes', async () => {
    await render({ tab: 'paused' });
    expect(component.activeTab()).toBe('paused');

    query.next({ tab: 'promotions' });
    expect(component.activeTab()).toBe('promotions');
  });

  it('opens Reports first when the address names no tab', async () => {
    await render({});
    expect(component.activeTab()).toBe('reports');
  });

  it('badges Reports with the subjects and escalated count, and sums the trusted status queues', async () => {
    await render({});
    expect(component.tabs()).toEqual([
      {
        id: 'reports',
        labelKey: 'admin.review.tabs.reports',
        count: { count: 7, atLeast: false },
      },
      { id: 'prompts', labelKey: 'admin.review.tabs.prompts', count: null },
      {
        id: 'promotions',
        labelKey: 'admin.review.tabs.promotions',
        count: { count: 102, atLeast: true },
      },
      { id: 'paused', labelKey: 'admin.review.tabs.paused', count: null },
    ]);
  });

  it('reads the Reports state from the address', async () => {
    await render({ tab: 'reports', kind: 'ip', open: 'ip:1.2.3.4' });
    expect(component.reports().kind).toBe('ip');
    expect(component.reports().open?.ipaddr).toBe('1.2.3.4');
  });

  it('writes a changed Reports state back into the address', async () => {
    await render({ tab: 'reports' });
    component.setReports({ ...DEFAULT_REPORTS, view: 'escalated' });

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({
          tab: 'reports',
          view: 'escalated',
          open: null,
        }),
        queryParamsHandling: 'merge',
      }),
    );
  });

  it('shows only the queues whose endpoint has answered', async () => {
    counts.reportsAvailable.set(false);
    await render({ tab: 'reports' });

    expect(component.tabs().map((tab) => tab.id)).toEqual([
      'prompts',
      'promotions',
      'paused',
    ]);
    expect(component.activeTab()).toBe('prompts');
  });

  it('shows the Prompts tab on its own endpoint, without the report listings', async () => {
    counts.reportsAvailable.set(false);
    counts.overviewAvailable.set(false);
    await render({ tab: 'prompts', worker_id: 'w-1' });

    expect(component.tabs().map((tab) => tab.id)).toEqual(['prompts']);
    expect(component.activeTab()).toBe('prompts');
    expect(component.prompts().worker_id).toBe('w-1');
  });

  it('writes a changed Prompts state back into the address', async () => {
    await render({ tab: 'prompts' });
    component.setPrompts({ ...DEFAULT_PROMPTS, ipaddr: '10.0.0.1' });

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({
          tab: 'prompts',
          ipaddr: '10.0.0.1',
          user_id: null,
        }),
        queryParamsHandling: 'merge',
      }),
    );
  });

  it('waits for a named queue that is still being asked for', async () => {
    counts.reportsAvailable.set(false);
    counts.loading.set(true);
    await render({ tab: 'reports' });
    expect(component.activeTab()).toBeNull();

    counts.reportsAvailable.set(true);
    counts.loading.set(false);
    expect(component.activeTab()).toBe('reports');
  });

  it('shows no tab at all when no queue has answered', async () => {
    counts.reportsAvailable.set(false);
    counts.promptsAvailable.set(false);
    counts.overviewAvailable.set(false);
    await render({});

    expect(component.tabs()).toEqual([]);
    expect(component.activeTab()).toBeNull();
  });
});

describe('ReviewComponent with nothing to show', () => {
  let fixture: ComponentFixture<ReviewComponent>;
  let noneAvailable: WritableSignal<boolean>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    noneAvailable = signal(false);
    const off = () => signal(false);
    await TestBed.configureTestingModule({
      imports: [
        ReviewComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: ModerationCountsService,
          useValue: {
            reportsAvailable: off(),
            promptsAvailable: off(),
            overviewAvailable: off(),
            loading: off(),
            noneAvailable,
            reportsTotal: signal(null),
            eligible: signal(null),
            blocked: signal(null),
            paused: signal(null),
            refreshIfStale: vi.fn(),
          },
        },
        { provide: TranslatorService, useValue: { get: () => of('') } },
        { provide: Title, useValue: { setTitle: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewComponent);
    fixture.detectChanges();
  });

  it('shows the loading state and no lead while the queues are unknown', () => {
    expect(host().querySelector('.hd-skeleton')).not.toBeNull();
    expect(host().querySelector('[data-review-none]')).toBeNull();
    expect(host().textContent).not.toContain('admin.review.lead');
  });

  it('says review is not available, with a way back, once every queue is absent', () => {
    noneAvailable.set(true);
    fixture.detectChanges();

    const none = host().querySelector('[data-review-none]');
    expect(none?.textContent).toContain('admin.review.none');
    expect(none?.querySelector('a')?.getAttribute('href')).toBe('/admin');
    expect(host().querySelector('.hd-skeleton')).toBeNull();
    expect(host().textContent).not.toContain('admin.review.lead');
  });
});
