import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { AlchemyResultsBrowserComponent } from './alchemy-results-browser.component';
import { AlchemyJob } from '../../../helper/alchemy-job-view';

const makeJob = (
  id: string,
  thumb: string | null,
  full: string | null = null,
): AlchemyJob => ({
  id,
  localId: id,
  sourceMode: 'upload',
  forms: ['caption', 'nsfw'],
  annotationControlTypes: [],
  status: null,
  done: false,
  faulted: false,
  cancelled: false,
  notFound: false,
  adopted: false,
  firstSeenAt: Date.now(),
  sourceThumb: thumb,
  sourceFull: full,
  storedResultForms: [],
  failedResultForms: [],
});

@Component({
  imports: [AlchemyResultsBrowserComponent],
  template: `<app-alchemy-results-browser
      [jobs]="jobs()"
      [selectedJobId]="selectedJobId()"
      [viewMode]="viewMode()"
      [galleryColumns]="galleryColumns()"
      [selectMode]="selectMode()"
      [selectedJobIds]="selectedJobIds()"
      [isNarrow]="isNarrow()"
      [resultImageUrls]="resultImageUrls()"
      [paneOpen]="paneOpen()"
      [foot]="foot"
      (activateJob)="selected = $event"
      (toggleSelected)="toggled = $event"
      (closePane)="paneClosed = paneClosed + 1"
      (exportCsv)="exported = $event"
    />
    <ng-template #foot><p class="test-foot">foot</p></ng-template>`,
})
class HostComponent {
  jobs = signal<AlchemyJob[]>([
    makeJob('job-a', 'https://example.com/a.png'),
    makeJob('job-b', null),
  ]);
  selectedJobId = signal<string | null>('job-a');
  viewMode = signal<'detail' | 'gallery' | 'table'>('detail');
  galleryColumns = signal(4);
  selectMode = signal(false);
  selectedJobIds = signal<ReadonlySet<string>>(new Set());
  isNarrow = signal(false);
  resultImageUrls = signal<ReadonlyMap<string, string>>(new Map());
  paneOpen = signal(false);
  selected: string | null = null;
  toggled: string | null = null;
  paneClosed = 0;
  exported: { fileName: string; text: string } | null = null;
}

describe('AlchemyResultsBrowserComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const railThumbs = (): HTMLButtonElement[] => [
    ...fixture.nativeElement.querySelectorAll('.gs-rail-thumb'),
  ];

  it('renders one rail thumbnail per request', () => {
    expect(railThumbs().length).toBe(2);
  });

  it('renders an image for a thumb and a placeholder when none exists', () => {
    const [a, b] = railThumbs();
    expect(a.querySelector('.gs-rail-thumb-img')).not.toBeNull();
    expect(b.querySelector('.gs-rail-thumb-img')).toBeNull();
    expect(b.querySelector('.gs-rail-thumb-ph')).not.toBeNull();
  });

  it('marks the selected thumb active', () => {
    const [a] = railThumbs();
    expect(a.classList.contains('gs-rail-thumb--active')).toBe(true);
    expect(a.getAttribute('aria-selected')).toBe('true');
  });

  it('emits select when a thumb is clicked outside select mode', () => {
    railThumbs()[1].click();
    expect(host.selected).toBe('job-b');
    expect(host.toggled).toBeNull();
  });

  it('emits toggleSelected when a thumb is clicked in select mode', () => {
    host.selectMode.set(true);
    fixture.detectChanges();
    railThumbs()[1].click();
    expect(host.toggled).toBe('job-b');
    expect(host.selected).toBeNull();
  });

  it('renders the gallery grid with the requested column density', () => {
    host.viewMode.set('gallery');
    host.galleryColumns.set(3);
    fixture.detectChanges();
    const grid = fixture.nativeElement.querySelector(
      '.gs-gallery .gs-tile-grid',
    ) as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.style.getPropertyValue('--gs-cols')).toBe('3');
    expect(fixture.nativeElement.querySelectorAll('.gs-gtile').length).toBe(2);
  });

  it('prefers the full source over the small thumb for gallery tiles', () => {
    host.jobs.set([
      makeJob('job-a', '/assets/thumb.webp', '/assets/full.webp'),
      makeJob('job-b', '/assets/thumb.webp'),
      makeJob('job-c', null),
    ]);
    host.viewMode.set('gallery');
    fixture.detectChanges();

    const sources = [
      ...(
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLImageElement>('.gs-gtile .gs-tile-img'),
    ].map((img) => img.getAttribute('src'));
    expect(sources).toEqual(['/assets/full.webp', '/assets/thumb.webp']);
    expect(fixture.nativeElement.querySelectorAll('.gs-gtile-ph').length).toBe(
      1,
    );
  });

  it('renders a card per control map, each with its own detector and image', () => {
    const job: AlchemyJob = {
      ...makeJob('job-maps', null),
      forms: ['annotation'],
      annotationControlTypes: ['canny', 'depth'],
      done: true,
      status: {
        state: 'done',
        forms: [
          {
            form: 'annotation',
            state: 'done',
            result: { annotation: 'https://r2.example/a.webp' },
            payload: { control_type: 'depth' },
          },
          {
            form: 'annotation',
            state: 'done',
            result: { annotation: 'https://r2.example/b.webp' },
            payload: { control_type: 'canny' },
          },
        ],
      },
    };
    host.jobs.set([job]);
    host.selectedJobId.set('job-maps');
    host.resultImageUrls.set(
      new Map([
        ['job-maps::annotation-depth', 'blob:depth'],
        ['job-maps::annotation-canny', 'blob:canny'],
      ]),
    );
    fixture.detectChanges();

    const cards = [
      ...fixture.nativeElement.querySelectorAll('.alchemy-result'),
    ] as HTMLElement[];
    expect(cards.length).toBe(2);
    // The body lists forms in the order they were asked for, whatever order
    // the horde returns them in, so a card keeps its place as others finish.
    expect(
      cards.map((card) => card.querySelector('.gs-mono')?.textContent?.trim()),
    ).toEqual(['canny', 'depth']);
    // The studio stacks these under a heading of its own, which is the level
    // the card keeps unless the host that embeds it asks for another.
    expect(
      cards.map(
        (card) => card.querySelector('.alchemy-result__title')?.tagName,
      ),
    ).toEqual(['H4', 'H4']);

    const images = [
      ...fixture.nativeElement.querySelectorAll('.alchemy-result img'),
    ] as HTMLImageElement[];
    expect(images.map((img) => img.getAttribute('src'))).toEqual([
      'blob:canny',
      'blob:depth',
    ]);
  });

  it('renders the selected job inline on narrow viewports', () => {
    host.isNarrow.set(true);
    fixture.detectChanges();

    const detail = fixture.nativeElement.querySelector(
      '.gs-detail',
    ) as HTMLElement;
    expect(detail.getAttribute('aria-live')).toBe('polite');
    expect(detail.querySelector('.gs-detail-head')).not.toBeNull();
    expect(detail.querySelector('.gs-detail-hint')).toBeNull();
  });

  it('shows the empty hint when nothing is selected', () => {
    host.selectedJobId.set(null);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.gs-detail .gs-detail-hint'),
    ).not.toBeNull();
  });

  it('includes the request age in a thumb label', () => {
    // Transloco has no translations loaded here, so the pipe echoes the keys —
    // enough to prove both pieces are composed into the one label.
    const label = railThumbs()[0].getAttribute('aria-label') ?? '';
    expect(label).toContain('alchemy.jobs.thumb_label');
    expect(label).toContain('alchemy.jobs.time_now');
  });

  const runningJob = (): AlchemyJob => ({
    ...makeJob('job-run', null),
    forms: ['caption', 'nsfw', 'palette'],
    status: {
      state: 'processing',
      forms: [
        { form: 'caption', state: 'done', result: { caption: 'a dog' } },
        { form: 'nsfw', state: 'processing' },
      ],
    },
  });

  it('shows each requested form once: a result card when done, a row while not', () => {
    host.jobs.set([runningJob()]);
    host.selectedJobId.set('job-run');
    fixture.detectChanges();

    const flow = fixture.nativeElement.querySelector(
      '.gs-result-flow',
    ) as HTMLElement;
    expect(flow.querySelectorAll('.alchemy-result').length).toBe(1);
    const waits = [...flow.querySelectorAll('.gs-form-wait')] as HTMLElement[];
    expect(waits.map((w) => w.className)).toEqual([
      'gs-form-wait gs-form-wait--processing',
      'gs-form-wait gs-form-wait--waiting',
    ]);
    expect(fixture.nativeElement.querySelector('.gs-checklist')).toBeNull();
    const bar = fixture.nativeElement.querySelector(
      '.gs-job-bar',
    ) as HTMLElement;
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('3');
  });

  it('opens every result of a small request', () => {
    host.jobs.set([runningJob()]);
    host.selectedJobId.set('job-run');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.alchemy-result--open'),
    ).not.toBeNull();
  });

  it('previews the lead result on a gallery tile and shows progress in the badge', () => {
    host.jobs.set([runningJob()]);
    host.viewMode.set('gallery');
    fixture.detectChanges();

    const tile = fixture.nativeElement.querySelector(
      '.gs-gtile',
    ) as HTMLElement;
    expect(tile.querySelector('.gs-tile-lead')?.textContent?.trim()).toBe(
      'a dog',
    );
    expect(tile.querySelector('.gs-tile-badge')?.textContent).toContain(
      'alchemy.jobs.progress_badge',
    );
    expect(tile.querySelector('.gs-rail-ring')).not.toBeNull();
  });

  it('shows the picked job over the gallery and closes on request', () => {
    host.jobs.set([runningJob()]);
    host.selectedJobId.set('job-run');
    host.viewMode.set('gallery');
    host.paneOpen.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.gs-gallery')).not.toBeNull();
    const pane = fixture.nativeElement.querySelector(
      '.gs-jobpane',
    ) as HTMLElement;
    expect(pane.querySelector('.gs-detail-head')).not.toBeNull();
    (pane.querySelector('.gs-plate-x') as HTMLButtonElement).click();
    expect(host.paneClosed).toBe(1);
  });

  it('reads the foot after the results in both views', () => {
    expect(
      fixture.nativeElement.querySelector('.gs-detail .test-foot'),
    ).not.toBeNull();
    host.viewMode.set('gallery');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.gs-gallery .test-foot'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.test-foot').length).toBe(1);
  });

  describe('series table', () => {
    const scored = (
      id: string,
      caption: string,
      score: number,
    ): AlchemyJob => ({
      ...makeJob(id, null),
      forms: ['caption', 'aesthetic'],
      status: {
        state: 'done',
        forms: [
          { form: 'caption', state: 'done', result: { caption } },
          { form: 'aesthetic', state: 'done', result: { aesthetic: score } },
        ],
      },
    });

    beforeEach(() => {
      host.jobs.set([scored('job-a', 'zebra', 3), scored('job-b', 'apple', 9)]);
      host.viewMode.set('table');
      fixture.detectChanges();
    });

    const rowIds = (): string[] =>
      [...fixture.nativeElement.querySelectorAll('tbody .gs-series-row')].map(
        (row) =>
          (row as HTMLElement)
            .querySelector('.gs-series-open')
            ?.getAttribute('aria-label') ?? '',
      );

    it('renders a row per request and a column per operation', () => {
      const heads = [
        ...fixture.nativeElement.querySelectorAll('thead .gs-series-th'),
      ];
      expect(heads.length).toBe(3);
      expect(
        fixture.nativeElement.querySelectorAll('tbody .gs-series-row').length,
      ).toBe(2);
      expect(
        [
          ...fixture.nativeElement.querySelectorAll(
            '.gs-series-td--number .gs-mono',
          ),
        ].map((el) => (el as HTMLElement).textContent?.trim()),
      ).toEqual(['3.00', '9.00']);
    });

    it('sorts by a column on press, flips on the second, clears on the third', () => {
      const sortButtons = () =>
        [
          ...fixture.nativeElement.querySelectorAll('.gs-series-sort'),
        ] as HTMLButtonElement[];
      const scores = () =>
        [
          ...fixture.nativeElement.querySelectorAll(
            '.gs-series-td--number .gs-mono',
          ),
        ].map((el) => (el as HTMLElement).textContent?.trim());
      sortButtons()[1].click();
      fixture.detectChanges();
      expect(scores()).toEqual(['3.00', '9.00']);
      expect(
        fixture.nativeElement
          .querySelectorAll('thead .gs-series-th')[2]
          .getAttribute('aria-sort'),
      ).toBe('ascending');
      sortButtons()[1].click();
      fixture.detectChanges();
      expect(scores()).toEqual(['9.00', '3.00']);
      sortButtons()[1].click();
      fixture.detectChanges();
      expect(scores()).toEqual(['3.00', '9.00']);
      expect(
        fixture.nativeElement
          .querySelectorAll('thead .gs-series-th')[2]
          .getAttribute('aria-sort'),
      ).toBe('none');
    });

    it('opens a request from its row', () => {
      (
        fixture.nativeElement.querySelector(
          '.gs-series-open',
        ) as HTMLButtonElement
      ).click();
      expect(host.selected).toBe('job-a');
      expect(rowIds().length).toBe(2);
    });

    it('exports the table as shown', () => {
      (
        fixture.nativeElement.querySelector(
          '.gs-series-bar .gs-download-all',
        ) as HTMLButtonElement
      ).click();
      expect(host.exported?.fileName).toMatch(
        /^alchemy-series-\d{4}-\d{2}-\d{2}\.csv$/,
      );
      const lines = host.exported?.text.split('\r\n') ?? [];
      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('"request","age_minutes"');
      expect(lines[1]).toContain('"job-a"');
      expect(lines[1]).toContain('"zebra"');
      expect(lines[1]).toContain('"3.00"');
    });

    it('shows the picked job over the table', () => {
      host.selectedJobId.set('job-b');
      host.paneOpen.set(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.gs-series')).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('.gs-jobpane .gs-detail-head'),
      ).not.toBeNull();
    });
  });
});
