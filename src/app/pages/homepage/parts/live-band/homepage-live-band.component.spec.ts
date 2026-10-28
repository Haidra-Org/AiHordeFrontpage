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
              'homepage.band.today_images': '{{count}} images',
              'homepage.band.today_texts': '{{count}} texts',
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
   * One domain's figures, down its column, as they are read: the unit
   * tooltip's own body is behind the dotted word until it is asked for, so it
   * is dropped here rather than counted as part of the figure.
   */
  function column(index: 1 | 2 | 3): string[] {
    const rows = Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLTableRowElement>('tbody tr'),
    );
    return rows.map((row) => {
      const cell = row.querySelectorAll('.home-ledger-figure')[
        index - 1
      ] as HTMLElement;
      const copy = cell.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.tooltip-text').forEach((body) => body.remove());
      return copy.textContent.replace(/\s+/g, ' ').trim();
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('reads as one table, a column per domain and a header on each', () => {
    setup({ performance: PERFORMANCE, stats: 'ok' });

    const heads = Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLTableCellElement>('thead th'),
    );
    // Four columns: the measure's own, then the three domains, each a header
    // cell scoped to its column so a figure is never read without its name.
    expect(heads).toHaveLength(4);
    expect(heads.every((head) => head.getAttribute('scope') === 'col')).toBe(
      true,
    );
    expect(heads.slice(1).map((head) => head.textContent.trim())).toEqual([
      'homepage.band.image',
      'homepage.band.text',
      'homepage.band.alchemy',
    ]);
    // The rows are named too, and the table itself is named for anyone who
    // meets it without the heading above it.
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('tbody th')).map(
        (cell) => (cell as HTMLElement).getAttribute('scope'),
      ),
    ).toEqual(['row', 'row', 'row', 'row']);
    expect(
      fixture.nativeElement.querySelector('caption')!.textContent!.trim(),
    ).toBe('homepage.band.table_caption');
  });

  it('reads workers, queue, throughput and the day down each domain', () => {
    setup({ performance: PERFORMANCE, stats: 'ok' });

    // 1200 megapixelsteps a minute is one standard image a second; the queue's
    // own amount rides under the request count as a unit anyone can read.
    expect(column(1)).toEqual([
      '40 · 96 threads',
      '12 requests 20.0 standard images',
      '1.0 homepage.band.standard_images homepage.band.per_second',
      '48,210 images',
    ]);
    expect(column(2)).toEqual([
      '9 · 18 threads',
      '5 requests 6.0 kilotokens',
      '60.0 tokens homepage.band.per_second',
      '1,204 texts',
    ]);
    // The performance endpoint publishes no alchemy rate and no alchemy
    // totals, so those two read as the placeholder and as nothing at all.
    expect(column(3)).toEqual(['3 · 6 threads', '7 forms', '—', '']);
  });

  it('shows a placeholder per figure and no error copy when nothing answers', () => {
    setup({ performance: null, stats: 'fails' });

    // Every figure but the one alchemy never has, which stays empty.
    expect([...column(1), ...column(2), ...column(3)]).toEqual([
      ...Array.from({ length: 11 }, () => '—'),
      '',
    ]);
  });

  it('points at the status page from beside its own heading', () => {
    setup({ performance: PERFORMANCE, stats: 'ok' });

    const link = fixture.nativeElement.querySelector(
      '.home-section-head .home-section-link',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/status');
    // The sparkline moved back to the status page, which is the only place
    // that draws a trend, and the cards went with the columns.
    expect(fixture.nativeElement.querySelector('.status-sparkline')).toBeNull();
    expect(fixture.nativeElement.querySelector('.hd-card')).toBeNull();
  });
});
