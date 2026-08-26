import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../assets/i18n/en.json';
import { ModelsListComponent } from './models-list.component';
import { AiHordeService } from '../../../services/ai-horde.service';
import { ModelReferenceService } from '../../../services/model-reference.service';
import { TranslatorService } from '../../../services/translator.service';
import { ModelReferenceRecord } from '../../../services/model-reference.service';

/** The three image models the reference lists in these tests. */
const RECORDS = new Map<string, Partial<ModelReferenceRecord>>([
  ['Deliberate', { name: 'Deliberate', baseline: 'stable_diffusion_1' }],
  ['AlbedoBase XL', { name: 'AlbedoBase XL', baseline: 'stable_diffusion_xl' }],
  ['Quiet Model', { name: 'Quiet Model', baseline: 'flux_1', nsfw: true }],
]);

const STATUS_MODELS = [
  {
    name: 'Deliberate',
    count: 4,
    queued: 0,
    jobs: 0,
    eta: 0,
    performance: 0,
    type: 'image' as const,
  },
  {
    name: 'Somebody Elses Model',
    count: 1,
    queued: 0,
    jobs: 0,
    eta: 0,
    performance: 0,
    type: 'image' as const,
  },
];

function referenceStub(): unknown {
  const records = signal(RECORDS);
  return {
    names: signal([...RECORDS.keys()]),
    textNames: signal<string[] | null>(null),
    records,
    textRecords: signal(null),
    load: () => undefined,
    loadText: () => undefined,
    recordFor: (name: string) => records().get(name) ?? null,
    textRecordFor: () => null,
  };
}

describe('ModelsListComponent', () => {
  let fixture: ComponentFixture<ModelsListComponent>;

  beforeEach(async () => {
    // The list's scroll fade watches its element, which jsdom has no observer
    // for; nothing here depends on the measurement it would take.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        public observe(): void {
          /* nothing to measure */
        }
        public unobserve(): void {
          /* nothing to measure */
        }
        public disconnect(): void {
          /* nothing to measure */
        }
      },
    );

    await TestBed.configureTestingModule({
      imports: [
        ModelsListComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Switching tab moves the address; a catch-all keeps that navigation
        // from failing for want of a route table.
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: AiHordeService,
          useValue: {
            getImageModels: () => of(STATUS_MODELS),
            getTextModels: () => of([]),
            getImageModelStats: () =>
              of({ day: {}, month: { Deliberate: 812 }, total: {} }),
            getTextModelStats: () => of({ day: {}, month: {}, total: {} }),
          },
        },
        { provide: ModelReferenceService, useValue: referenceStub() },
        { provide: TranslatorService, useValue: { get: () => of('') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModelsListComponent);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function rowNames(): string[] {
    return [...fixture.nativeElement.querySelectorAll('.models-list-name')].map(
      (element) => (element as HTMLElement).textContent?.trim() ?? '',
    );
  }

  it('lists the whole reference, not only what a worker is running', () => {
    fixture.detectChanges();

    expect(rowNames()).toContain('Deliberate');
    expect(rowNames()).toContain('AlbedoBase XL');
    expect(rowNames()).toContain('Quiet Model');
  });

  it('says so on a model nobody is running, and marks a model a worker added', () => {
    fixture.detectChanges();
    const html = fixture.nativeElement.innerHTML as string;

    expect(
      fixture.nativeElement.querySelectorAll('.models-mark--idle').length,
    ).toBeGreaterThan(0);
    expect(html).toContain('No workers');
    expect(rowNames()).toContain('Somebody Elses Model');
    expect(html).toContain('Added by a worker');
  });

  it('offers every model a way into the studio', () => {
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      'a[href^="/generate/image"]',
    ) as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('/generate/image?model=Deliberate');
    expect(link?.textContent?.trim()).toBe('Try this model');
  });

  it('opens a model on its own page', () => {
    fixture.detectChanges();

    const name = fixture.nativeElement.querySelector(
      '.models-list-name',
    ) as HTMLAnchorElement;
    expect(name.getAttribute('href')).toBe('/details/models/image/Deliberate');
  });

  it('shows how many requests a model served this month', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.innerHTML).toContain('812');
  });

  it('narrows the list to one baseline, and to models a worker is running', () => {
    fixture.detectChanges();

    fixture.componentInstance.setBaselineFilter('stable_diffusion_xl');
    fixture.detectChanges();
    expect(rowNames()).toEqual(['AlbedoBase XL']);

    fixture.componentInstance.setBaselineFilter(null);
    fixture.componentInstance.workersOnly.set(true);
    fixture.detectChanges();
    expect(rowNames().sort()).toEqual(['Deliberate', 'Somebody Elses Model']);

    fixture.componentInstance.workersOnly.set(false);
    fixture.componentInstance.hideAdult.set(true);
    fixture.detectChanges();
    expect(rowNames()).not.toContain('Quiet Model');
  });

  it('starts the order again when the tab changes, because the units do', () => {
    fixture.detectChanges();
    fixture.componentInstance.setSortField('queued');
    fixture.componentInstance.setBaselineFilter('flux_1');

    fixture.componentInstance.setActiveTab('text');

    expect(fixture.componentInstance.sortField()).toBe('count');
    expect(fixture.componentInstance.sortDirection()).toBe('desc');
    expect(fixture.componentInstance.baselineFilter()).toBeNull();
  });
});
