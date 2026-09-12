import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomepageLiveBandComponent } from './homepage-live-band.component';
import { AiHordeService } from '../../../../services/ai-horde.service';
import { NetworkStatusService } from '../../../../services/network-status.service';
import { StatusService } from '../../../../services/status.service';
import { HordePerformance } from '../../../../types/horde-performance';
import { ImageTotalStats } from '../../../../types/image-total-stats';
import { PublicHistoryDay } from '../../../../types/status';

// The band and the reveal directive both watch for the element being read,
// which jsdom has no implementation of.
globalThis.IntersectionObserver ??= class {
  observe() {
    /* no-op */
  }
  unobserve() {
    /* no-op */
  }
  disconnect() {
    /* no-op */
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
} as unknown as typeof globalThis.IntersectionObserver;

const PERFORMANCE = {
  queued_requests: 12,
  queued_text_requests: 5,
  queued_forms: 0,
  worker_count: 40,
  text_worker_count: 9,
  interrogator_count: 3,
  thread_count: 0,
  text_thread_count: 0,
  interrogator_thread_count: 0,
  queued_megapixelsteps: 0,
  past_minute_megapixelsteps: 1200,
  queued_tokens: 0,
  past_minute_tokens: 0,
} as unknown as HordePerformance;

function totals(images: number): ImageTotalStats {
  const point = { images, ps: 0 };
  return {
    minute: point,
    hour: point,
    day: { images, ps: 0 },
    month: point,
    total: point,
  };
}

function day(): PublicHistoryDay {
  return {
    date: '2026-09-01',
    status_level: 0,
    operational_seconds: 86400,
    degraded_seconds: 0,
    down_seconds: 0,
    maintenance_seconds: 0,
    unknown_seconds: 0,
  };
}

describe('HomepageLiveBandComponent', () => {
  let fixture: ComponentFixture<HomepageLiveBandComponent>;

  function setup(options: {
    performance: HordePerformance | null;
    stats: 'ok' | 'fails';
  }): void {
    // The reduced-motion path is the one without a count-in, so the tiles hold
    // their value from the moment it arrives.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));

    TestBed.configureTestingModule({
      imports: [
        HomepageLiveBandComponent,
        RouterModule.forRoot([]),
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              'homepage.band.unavailable': '—',
              'homepage.band.split': '{{image}} image · {{text}} text',
            },
          },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        {
          provide: NetworkStatusService,
          useValue: { performance: signal(options.performance) },
        },
        {
          provide: AiHordeService,
          useValue: {
            imageStats:
              options.stats === 'ok'
                ? of(totals(48210))
                : throwError(() => new Error('unreachable')),
          },
        },
        {
          provide: StatusService,
          useValue: {
            getHistory: () => of({ buckets: [day(), day(), day()] }),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(HomepageLiveBandComponent);
    fixture.detectChanges();
  }

  function values(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.home-stat-value'),
    ).map((el) => (el as HTMLElement).textContent.trim());
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('maps the horde numbers onto the four tiles', () => {
    setup({ performance: PERFORMANCE, stats: 'ok' });

    // Workers and queue are the two domains added up; throughput is the same
    // reading the statistics page publishes, 1200 megapixelsteps a minute being
    // one standard image a second.
    expect(values()).toEqual(['49', '17', '1.0', '48,210']);
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.home-stat-sub')).map(
        (el) => (el as HTMLElement).textContent.trim(),
      ),
    ).toEqual([
      '40 image · 9 text',
      '12 image · 5 text',
      'homepage.band.throughput_sub',
      'homepage.band.pictures_sub',
    ]);
  });

  it('shows a placeholder per tile and no error copy when nothing answers', () => {
    setup({ performance: null, stats: 'fails' });

    expect(values()).toEqual(['—', '—', '—', '—']);
    expect(
      fixture.nativeElement.querySelectorAll('.home-stat-sub'),
    ).toHaveLength(0);
  });

  it('draws the API uptime trend and points at the status page', () => {
    setup({ performance: PERFORMANCE, stats: 'ok' });

    expect(
      fixture.nativeElement.querySelector('.status-sparkline'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement
        .querySelector('.home-band-link')
        .getAttribute('href'),
    ).toBe('/status');
  });
});
