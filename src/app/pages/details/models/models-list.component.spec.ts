import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
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
            getClassifiedTextModels: () => of([]),
            getChatTextModels: () => of([]),
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
    expect(html).toContain('Unlisted');
  });

  it('offers every model a way into the studio, named rather than printed', () => {
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      'a[href^="/generate/image"]',
    ) as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('/generate/image?model=Deliberate');
    // The row is one line, so the way in is a glyph and the words are its name.
    expect(link?.getAttribute('aria-label')).toBe(
      'Try this model in the studio',
    );
    expect(link?.textContent?.trim()).toBe('');
  });

  it('names each unit once, on the column, and leaves the cells as numbers', () => {
    fixture.detectChanges();
    const html = fixture.nativeElement.innerHTML as string;

    expect(html).toContain('Queued (mps)');
    expect(html).toContain('Performance (mps/s)');
    expect(
      fixture.nativeElement.querySelectorAll('app-unit-tooltip').length,
    ).toBe(0);
  });

  it('gives the family its own column and reads the adult mark out only', () => {
    fixture.detectChanges();

    const families = [
      ...fixture.nativeElement.querySelectorAll('.models-list-family'),
    ].map((cell) => (cell as HTMLElement).textContent?.trim() ?? '');
    expect(families).toContain('SD 1.5');
    expect(families).toContain('SDXL');

    // Still said, still filtered on, no longer printed on most of the rows.
    const adult = fixture.nativeElement.querySelector(
      '.hd-list-row .sr-only',
    ) as HTMLElement | null;
    expect(adult?.textContent?.trim()).toBe('Adult');
    expect(
      fixture.nativeElement.querySelectorAll('.models-mark--adult').length,
    ).toBe(0);
  });

  it('explains the columns once rather than once per column', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.hd-help-btn').length).toBe(
      1,
    );
    expect(
      fixture.nativeElement.querySelectorAll('app-info-tooltip').length,
    ).toBe(0);
  });

  it('narrows the list to the models that accept an extra', () => {
    fixture.detectChanges();

    // The horde's ControlNet annotators are SD 1.5 only, so one row survives.
    fixture.componentInstance.setCapabilityFilter('controlnet');
    fixture.detectChanges();
    expect(rowNames()).toEqual(['Deliberate']);

    fixture.componentInstance.setCapabilityFilter('controlnet');
    fixture.detectChanges();
    expect(rowNames().length).toBeGreaterThan(1);
  });

  it('counts what the filters left, in the filter bar', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.innerHTML).toContain('4 models');

    fixture.componentInstance.setBaselineFilter('stable_diffusion_xl');
    fixture.detectChanges();
    expect(fixture.nativeElement.innerHTML).toContain('1 of 4 models');
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

  it('uses backend text classification even when metadata is missing', () => {
    const api = TestBed.inject(AiHordeService);
    vi.spyOn(api, 'getClassifiedTextModels').mockReturnValue(
      of([
        { name: 'Canonical.IQ4_XS::worker', count: 3, custom: false },
        { name: 'Private', count: 2, custom: true },
        { name: 'Unclassified', count: 1 },
      ]),
    );
    const reference = TestBed.inject(ModelReferenceService);
    vi.spyOn(reference, 'textNames').mockReturnValue(['Canonical']);
    fixture.detectChanges();
    fixture.componentInstance.setActiveTab('text');
    fixture.detectChanges();

    const rows = [
      ...fixture.nativeElement.querySelectorAll('.hd-list-row'),
    ] as HTMLElement[];
    const known = rows.find((row) =>
      row.textContent?.includes('Canonical.IQ4_XS::worker'),
    )!;
    expect(known.querySelector('.models-mark--custom')).toBeNull();
    const custom = rows.find((row) => row.textContent?.includes('Private'))!;
    expect(
      custom.querySelector('.models-mark--custom')?.textContent?.trim(),
    ).toBe('Unlisted');
    expect(
      rows.find((row) => row.textContent?.includes('Unclassified'))
        ?.textContent,
    ).toContain('Classification unavailable');
    expect(
      known.querySelector('.models-list-name')?.getAttribute('href'),
    ).toContain('Canonical.IQ4_XS::worker');
  });

  describe('the chat column', () => {
    function textTabWithChat(): HTMLElement[] {
      const api = TestBed.inject(AiHordeService);
      vi.spyOn(api, 'getClassifiedTextModels').mockReturnValue(
        of([
          { name: 'Chatty', count: 3, custom: false },
          { name: 'Plain', count: 2, custom: false },
        ]),
      );
      vi.spyOn(api, 'getChatTextModels').mockReturnValue(
        of([
          {
            name: 'Chatty',
            count: 3,
            chat: {
              workers: 2,
              max_context_length: 8192,
              max_length: 512,
              features: [],
              created: 0,
            },
          },
        ]),
      );
      fixture.detectChanges();
      fixture.componentInstance.setActiveTab('text');
      fixture.detectChanges();
      return [
        ...fixture.nativeElement.querySelectorAll('.hd-list-row'),
      ] as HTMLElement[];
    }

    it('heads the column and shows the chat worker count over the largest chat context', () => {
      const rows = textTabWithChat();
      const heads = Array.from(
        fixture.nativeElement.querySelectorAll('.hd-list-th'),
      ).map((th) => (th as HTMLElement).textContent?.trim());
      expect(heads).toContain('Chat workers');
      const chatty = rows.find((row) => row.textContent?.includes('Chatty'))!;
      const cell = chatty.querySelector('.models-list-chat') as HTMLElement;
      expect(
        cell.querySelector('.models-desktop-value')?.textContent?.trim(),
      ).toBe('2');
      expect(cell.querySelector('.models-list-sub')?.textContent?.trim()).toBe(
        '8,192 context',
      );
      expect(cell.querySelector('.sr-only')?.textContent).toContain(
        'Largest chat context: 8,192 tokens. Largest chat reply: 512 tokens.',
      );
      const plain = rows.find((row) => row.textContent?.includes('Plain'))!;
      expect(plain.querySelector('.models-list-chat')?.classList).toContain(
        'models-list-value--muted',
      );
    });

    it('counts a model run only by chat-only workers as running', () => {
      const api = TestBed.inject(AiHordeService);
      vi.spyOn(api, 'getClassifiedTextModels').mockReturnValue(
        of([
          { name: 'ChatOnly', count: 0, custom: false },
          { name: 'Idle', count: 0, custom: false },
        ]),
      );
      vi.spyOn(api, 'getChatTextModels').mockReturnValue(
        of([
          {
            name: 'ChatOnly',
            count: 0,
            chat: {
              workers: 1,
              max_context_length: 4096,
              max_length: 256,
              features: [],
              created: 0,
            },
          },
        ]),
      );
      fixture.detectChanges();
      fixture.componentInstance.setActiveTab('text');
      fixture.componentInstance.workersOnly.set(true);
      fixture.detectChanges();
      expect(rowNames()).toEqual(['ChatOnly']);
      expect(
        fixture.nativeElement.querySelector('.hd-list-row--idle'),
      ).toBeNull();
    });

    it('sorts on the chat worker count', () => {
      textTabWithChat();
      fixture.componentInstance.setSortField('chat');
      expect(
        fixture.componentInstance.filteredRows().map((row) => row.model.name),
      ).toEqual(['Chatty', 'Plain']);
    });

    it('hides the chat column when the horde does not list any chat workers', () => {
      fixture.detectChanges();
      fixture.componentInstance.setActiveTab('text');
      fixture.detectChanges();
      expect(fixture.componentInstance.showsChat()).toBe(false);
      expect(
        fixture.nativeElement.querySelector('.models-list-chat'),
      ).toBeNull();
    });

    it('does not show chat details on the image tab', () => {
      textTabWithChat();
      fixture.componentInstance.setActiveTab('image');
      fixture.detectChanges();
      expect(fixture.componentInstance.showsChat()).toBe(false);
      expect(
        fixture.nativeElement.querySelector('.models-list-chat'),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('.models-grid--chat'),
      ).toBeNull();
    });
  });

  it('sorts from the mobile selector and direction button', () => {
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector(
      '#models-sort',
    ) as HTMLSelectElement;
    select.value = 'name';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.sortField()).toBe('name');
    const button = fixture.nativeElement.querySelector(
      '.models-mobile-sort button',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.sortDirection()).toBe('asc');
  });

  it('folds the secondary filters behind a toggle that counts the active ones', () => {
    fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector(
      '.models-filter-toggle',
    ) as HTMLButtonElement;
    const panel = fixture.nativeElement.querySelector(
      '#models-extra-filters',
    ) as HTMLElement;
    expect(toggle.getAttribute('aria-controls')).toBe('models-extra-filters');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent?.trim()).toBe('More filters');

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.classList).toContain('models-extra-filters--open');

    fixture.componentInstance.workersOnly.set(true);
    fixture.componentInstance.hideAdult.set(true);
    fixture.detectChanges();
    expect(toggle.textContent?.trim()).toBe('More filters (2 active)');
  });

  it('lists each active filter as a chip that removes only that filter', () => {
    fixture.detectChanges();
    fixture.componentInstance.setBaselineFilter('stable_diffusion_xl');
    fixture.componentInstance.workersOnly.set(true);
    fixture.detectChanges();

    const chips = (): HTMLButtonElement[] =>
      Array.from(
        fixture.nativeElement.querySelectorAll(
          '.models-active-filters .hd-chip',
        ),
      );
    expect(chips().length).toBe(2);
    const workersChip = chips().find((chip) =>
      chip
        .getAttribute('aria-label')
        ?.includes('Remove filter: Only models with a worker'),
    );
    expect(workersChip).toBeDefined();

    workersChip!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.workersOnly()).toBe(false);
    expect(fixture.componentInstance.baselineFilter()).toBe(
      'stable_diffusion_xl',
    );
    expect(chips().length).toBe(1);
  });
  describe('text model metadata and filters', () => {
    const longBaseline =
      'An exceptionally long published baseline family / Extended instruction tuned edition';
    function textList(): ModelsListComponent {
      const api = TestBed.inject(AiHordeService);
      const reference = TestBed.inject(ModelReferenceService);
      const names = ['Small', 'Medium', 'Large', 'Largest', 'Unknown size'];
      const sizes = [6.9e9, 7e9, 20e9, 70e9, null];
      vi.spyOn(api, 'getClassifiedTextModels').mockReturnValue(
        of(
          names.map((name, index) => ({
            name,
            count: index === 1 ? 0 : 2,
            custom: index === 3 ? undefined : index === 1,
          })),
        ),
      );
      vi.spyOn(api, 'getChatTextModels').mockReturnValue(
        of([
          {
            name: 'Medium',
            count: 0,
            chat: {
              workers: 2,
              max_context_length: 8192,
              max_length: 512,
              features: [],
              created: 0,
            },
          },
        ]),
      );
      vi.spyOn(reference, 'textNames').mockReturnValue(names);
      vi.spyOn(reference, 'textRecordFor').mockImplementation(
        (name) =>
          ({
            name,
            baseline: name === 'Small' ? longBaseline : 'Other family',
            parameters: sizes[names.indexOf(name)],
          }) as ReturnType<ModelReferenceService['textRecordFor']>,
      );
      fixture.detectChanges();
      fixture.componentInstance.setActiveTab('text');
      fixture.detectChanges();
      return fixture.componentInstance;
    }

    it('puts full metadata beneath names and hides it without changing the models', () => {
      textList();
      const host = fixture.nativeElement as HTMLElement;
      expect(
        host
          .querySelector('.models-text-metadata')
          ?.parentElement?.querySelector('.models-list-name'),
      ).not.toBeNull();
      expect(host.textContent).toContain(longBaseline);
      expect(host.querySelectorAll('.models-list-family')).toHaveLength(0);
      expect(host.querySelectorAll('.models-text-metadata')).toHaveLength(5);
      const before = rowNames();
      host.querySelector<HTMLButtonElement>('.models-details-toggle')!.click();
      fixture.detectChanges();
      expect(host.querySelectorAll('.models-text-metadata')).toHaveLength(0);
      expect(rowNames()).toEqual(before);
      expect(
        host.querySelector('.models-details-toggle')?.textContent,
      ).toContain('Show model details');
    });

    it('keeps baseline sorting available on the text table and exposes metadata as a disclosure', () => {
      textList();
      const host = fixture.nativeElement as HTMLElement;
      expect(
        host
          .querySelector('.models-details-toggle')
          ?.getAttribute('aria-expanded'),
      ).toBe('true');
      host.querySelector<HTMLButtonElement>('.models-baseline-sort')!.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.sortField()).toBe('baseline');
      expect(
        host
          .querySelector('.models-baseline-sort')
          ?.getAttribute('aria-pressed'),
      ).toBe('true');
    });

    it('keeps last successful chat data when refreshing an active chat filter fails', () => {
      const component = textList();
      component.chatOnly.set(true);
      vi.spyOn(
        TestBed.inject(AiHordeService),
        'getChatTextModels',
      ).mockReturnValue(throwError(() => new Error('offline')));
      component.loadModels();
      expect(component.chatOnly()).toBe(true);
      expect(component.filteredRows().map((row) => row.model.name)).toEqual([
        'Medium',
      ]);
    });

    it('uses inclusive lower bounds for parameter sizes and keeps unknown sizes separate', () => {
      const component = textList();
      for (const [range, name] of [
        ['small', 'Small'],
        ['medium', 'Medium'],
        ['large', 'Large'],
        ['largest', 'Largest'],
        ['unknown', 'Unknown size'],
      ]) {
        component.parameterFilter.set(range);
        expect(component.filteredRows().map((row) => row.model.name)).toEqual([
          name,
        ]);
      }
    });

    it('combines baseline and backend listing status and clears the text filters', () => {
      const component = textList();
      component.baselineFilter.set(longBaseline);
      component.listingFilter.set('listed');
      expect(component.filteredRows().map((row) => row.model.name)).toEqual([
        'Small',
      ]);
      component.listingFilter.set('unlisted');
      expect(component.filteredRows()).toEqual([]);
      component.baselineFilter.set(null);
      component.listingFilter.set('unclassified');
      expect(component.filteredRows().map((row) => row.model.name)).toEqual([
        'Largest',
      ]);
      component.chatOnly.set(true);
      component.parameterFilter.set('medium');
      component.clearFilters();
      expect(component.filteredRows()).toHaveLength(5);
      expect(component.extraFilterCount()).toBe(0);
      expect(component.showTextDetails()).toBe(true);
    });

    it('includes chat-only models and leaves image filters and rows unchanged on switching tabs', () => {
      const component = textList();
      component.chatOnly.set(true);
      component.workersOnly.set(true);
      expect(component.filteredRows().map((row) => row.model.name)).toEqual([
        'Medium',
      ]);
      component.setActiveTab('image');
      fixture.detectChanges();
      expect(component.chatOnly()).toBe(false);
      expect(component.filteredRows().map((row) => row.model.name)).toContain(
        'Deliberate',
      );
      expect(
        fixture.nativeElement.querySelector('.models-text-metadata'),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('.models-details-toggle'),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('.models-list-family'),
      ).not.toBeNull();
    });
  });
});
