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
    (activateJob)="selected = $event"
    (toggleSelected)="toggled = $event"
  />`,
})
class HostComponent {
  jobs = signal<AlchemyJob[]>([
    makeJob('job-a', 'https://example.com/a.png'),
    makeJob('job-b', null),
  ]);
  selectedJobId = signal<string | null>('job-a');
  viewMode = signal<'detail' | 'gallery'>('detail');
  galleryColumns = signal(4);
  selectMode = signal(false);
  selectedJobIds = signal<ReadonlySet<string>>(new Set());
  isNarrow = signal(false);
  resultImageUrls = signal<ReadonlyMap<string, string>>(new Map());
  selected: string | null = null;
  toggled: string | null = null;
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
    expect(
      cards.map((card) => card.querySelector('.gs-mono')?.textContent?.trim()),
    ).toEqual(['depth', 'canny']);
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
      'blob:depth',
      'blob:canny',
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
});
