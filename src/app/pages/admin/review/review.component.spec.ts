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
import { parseReviewQuery } from './review-query';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { TranslatorService } from '../../../services/translator.service';
import { ListCount } from '../../../types/moderation';

describe('parseReviewQuery', () => {
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
    });
  });
});

describe('ReviewComponent', () => {
  let fixture: ComponentFixture<ReviewComponent>;
  let component: ReviewComponent;
  let query: BehaviorSubject<Params>;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let counts: {
    overviewAvailable: WritableSignal<boolean>;
    loading: WritableSignal<boolean>;
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
      overviewAvailable: signal(true),
      loading: signal(false),
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

  it('sums the trusted status queues', async () => {
    await render({});
    expect(component.tabs()).toEqual([
      {
        id: 'promotions',
        labelKey: 'admin.review.tabs.promotions',
        count: { count: 102, atLeast: true },
      },
      { id: 'paused', labelKey: 'admin.review.tabs.paused', count: null },
    ]);
  });

  it('shows only the queues whose endpoint has answered', async () => {
    await render({ tab: 'reports' });

    expect(component.tabs().map((tab) => tab.id)).toEqual([
      'promotions',
      'paused',
    ]);
    expect(component.activeTab()).toBe('promotions');
  });

  it('waits for a named queue that is still being asked for', async () => {
    counts.overviewAvailable.set(false);
    counts.loading.set(true);
    await render({ tab: 'paused' });
    expect(component.activeTab()).toBeNull();

    counts.overviewAvailable.set(true);
    counts.loading.set(false);
    expect(component.activeTab()).toBe('paused');
  });

  it('shows no tab at all when no queue has answered', async () => {
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
            overviewAvailable: off(),
            loading: off(),
            noneAvailable,
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
