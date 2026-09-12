import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomepageLiveBandComponent } from './homepage-live-band.component';
import { AiHordeService } from '../../../../services/ai-horde.service';
import { NetworkStatusService } from '../../../../services/network-status.service';
import { HordePerformance } from '../../../../types/horde-performance';
import { ImageTotalStats } from '../../../../types/image-total-stats';
import { TextTotalStats } from '../../../../types/text-total-stats';

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
  queued_forms: 7,
  worker_count: 40,
  text_worker_count: 9,
  interrogator_count: 3,
  thread_count: 96,
  text_thread_count: 18,
  interrogator_thread_count: 6,
  queued_megapixelsteps: 400,
  past_minute_megapixelsteps: 1200,
  queued_tokens: 6000,
  past_minute_tokens: 3600,
} as unknown as HordePerformance;

function imageTotals(images: number): ImageTotalStats {
  const point = { images, ps: 0 };
  return {
    minute: point,
    hour: point,
    day: { images, ps: 0 },
    month: point,
    total: point,
  };
}

function textTotals(requests: number): TextTotalStats {
  const point = { requests, tokens: 0 };
  return {
    minute: point,
    hour: point,
    day: { requests, tokens: 0 },
    month: point,
    total: point,
  };
}

describe('HomepageLiveBandComponent', () => {
  let fixture: ComponentFixture<HomepageLiveBandComponent>;

  function setup(options: {
    performance: HordePerformance | null;
    stats: 'ok' | 'fails';
  }): void {
    // The reduced-motion path is the one without a count-in, so the figures
    // hold their value from the moment it arrives.
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
              'homepage.band.workers_value':
                '{{workers}} · {{threads}} threads',
              'homepage.band.requests': '{{count}} requests',
              'homepage.band.forms': '{{count}} forms',
              'homepage.band.today':
                'Today: {{images}} images · {{texts}} texts',
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
                ? of(imageTotals(48210))
                : throwError(() => new Error('unreachable')),
            textStats:
              options.stats === 'ok'
                ? of(textTotals(1204))
                : throwError(() => new Error('unreachable')),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(HomepageLiveBandComponent);
    fixture.detectChanges();
  }

  /**
   * The three figures of one column, in row order, as they are read: the unit
   * tooltip's own body is behind the dotted word until it is asked for, so it
   * is dropped here rather than counted as part of the figure.
   */
  function column(name: 'image' | 'text' | 'alchemy'): string[] {
    const card = fixture.nativeElement.querySelector(
      `.home-col--${name}`,
    ) as HTMLElement;
    return Array.from(card.querySelectorAll('.home-col-value')).map((cell) => {
      const copy = (cell as HTMLElement).cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.tooltip-text').forEach((body) => body.remove());
      return copy.textContent.replace(/\s+/g, ' ').trim();
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('reads one column per domain, in the order the site reads them', () => {
    setup({ performance: PERFORMANCE, stats: 'ok' });

    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.home-col-head')).map(
        (head) => (head as HTMLElement).textContent.trim(),
      ),
    ).toEqual([
      'homepage.band.image',
      'homepage.band.text',
      'homepage.band.alchemy',
    ]);
  });

  it('puts each domain workers, queue and throughput in its own column', () => {
    setup({ performance: PERFORMANCE, stats: 'ok' });

    // 1200 megapixelsteps a minute is one standard image a second; the queue's
    // own amount rides behind the request count as a unit anyone can read.
    expect(column('image')).toEqual([
      '40 · 96 threads',
      '12 requests 20.0 standard images',
      '1.0 homepage.band.standard_images homepage.band.per_second',
    ]);
    expect(column('text')).toEqual([
      '9 · 18 threads',
      '5 requests 6.0 kilotokens',
      '60.0 tokens homepage.band.per_second',
    ]);
    // The performance endpoint publishes no alchemy rate, so that row is the
    // placeholder rather than a figure that does not exist.
    expect(column('alchemy')).toEqual(['3 · 6 threads', '7 forms', '—']);
  });

  it('says what the day has made, from both totals', () => {
    setup({ performance: PERFORMANCE, stats: 'ok' });

    expect(
      (
        fixture.nativeElement.querySelector('.home-band-today') as HTMLElement
      ).textContent.trim(),
    ).toBe('Today: 48,210 images · 1,204 texts');
  });

  it('shows a placeholder per figure and no error copy when nothing answers', () => {
    setup({ performance: null, stats: 'fails' });

    expect([
      ...column('image'),
      ...column('text'),
      ...column('alchemy'),
    ]).toEqual(Array.from({ length: 9 }, () => '—'));
    expect(fixture.nativeElement.querySelector('.home-band-today')).toBeNull();
  });

  it('points at the status page from beside its own heading', () => {
    setup({ performance: PERFORMANCE, stats: 'ok' });

    const link = fixture.nativeElement.querySelector(
      '.home-section-head .home-section-link',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/status');
    // The sparkline moved back to the status page, which is the only place
    // that draws a trend.
    expect(fixture.nativeElement.querySelector('.status-sparkline')).toBeNull();
  });
});
