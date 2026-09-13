import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptLibraryComponent } from './prompt-library.component';
import {
  PROMPT_LIBRARY_PAGE_SIZE,
  PromptLibraryUse,
  draftEntry,
  entryUse,
  filterEntries,
  groupByDay,
  sentEntry,
  takeOf,
} from './prompt-library.model';
import {
  PromptDraftDbService,
  StoredPromptDraft,
} from '../../services/prompt-draft-db.service';
import {
  PromptHistoryDbService,
  StoredSentPrompt,
} from '../../services/prompt-history-db.service';
import { Toast, ToastService } from '../../services/toast.service';
import en from '../../../assets/i18n/en.json';

const HOUR = 60 * 60 * 1000;

function draft(
  id: string,
  createdAt: number,
  overrides: Partial<StoredPromptDraft> = {},
): StoredPromptDraft {
  return {
    id,
    createdAt,
    origin: 'studio',
    input: { caption: 'a dog on a beach' },
    pick: 'auto',
    model: 'text/a',
    seed: null,
    kudos: 3,
    anonymous: false,
    text: `draft ${id}`,
    ...overrides,
  };
}

function sent(
  prompt: string,
  lastSentAt: number,
  overrides: Partial<StoredSentPrompt> = {},
): StoredSentPrompt {
  return {
    key: `k-${prompt}`,
    prompt,
    negative: '',
    model: 'flux',
    firstSentAt: lastSentAt,
    lastSentAt,
    count: 1,
    ...overrides,
  };
}

describe('prompt library model', () => {
  it('searches the prompt, the negative and the model', () => {
    const entries = [
      draftEntry(draft('a', 3, { text: 'a red fox' })),
      draftEntry(draft('b', 2, { text: 'a cat', negative: 'blurry fox' })),
      draftEntry(draft('c', 1, { text: 'a cow', model: 'FoxModel' })),
      draftEntry(draft('d', 0, { text: 'a hen' })),
    ];
    const ids = (query: string): string[] =>
      filterEntries(entries, { query, origin: 'all', model: '' }).map(
        (entry) => entry.id,
      );

    expect(ids('FOX')).toEqual(['a', 'b', 'c']);
    expect(ids('  ')).toEqual(['a', 'b', 'c', 'd']);
    expect(ids('pony')).toEqual([]);
  });

  it('narrows by where a draft was written and by model', () => {
    const entries = [
      draftEntry(draft('a', 3, { origin: 'alchemy', model: 'x' })),
      draftEntry(draft('b', 2, { origin: 'studio', model: 'y' })),
      draftEntry(draft('c', 1, { origin: 'alchemy', model: 'y' })),
    ];
    const ids = (origin: 'all' | 'studio' | 'alchemy', model: string) =>
      filterEntries(entries, { query: '', origin, model }).map((e) => e.id);

    expect(ids('alchemy', '')).toEqual(['a', 'c']);
    expect(ids('all', 'y')).toEqual(['b', 'c']);
    expect(ids('alchemy', 'y')).toEqual(['c']);
  });

  it('groups by calendar day with today and yesterday named', () => {
    const now = new Date(2026, 8, 12, 9, 0).getTime();
    const entries = [
      sentEntry(sent('this morning', new Date(2026, 8, 12, 8).getTime())),
      sentEntry(
        sent('just after midnight', new Date(2026, 8, 12, 0, 5).getTime()),
      ),
      sentEntry(sent('last night', new Date(2026, 8, 11, 23).getTime())),
      sentEntry(sent('the day before', new Date(2026, 8, 10, 12).getTime())),
      sentEntry(sent('earlier still', new Date(2026, 8, 10, 7).getTime())),
    ];

    const days = groupByDay(entries, now);

    expect(days.map((day) => day.kind)).toEqual([
      'today',
      'yesterday',
      'earlier',
    ]);
    expect(days.map((day) => day.entries.length)).toEqual([2, 1, 2]);
  });

  it('numbers a take among the kept takes of its request', () => {
    const takes = [
      draft('t0', 1, { requestId: 'r', takeIndex: 0 }),
      draft('t2', 1, { requestId: 'r', takeIndex: 2 }),
      draft('solo', 1),
    ];
    expect(takeOf(takes[1], takes)).toEqual({ index: 2, total: 2 });
    expect(takeOf(takes[2], takes)).toBeNull();
  });

  it('keeps the negative box alone for a draft without one, and clears it for a sent prompt', () => {
    expect(entryUse(draftEntry(draft('a', 1)))).toEqual({
      prompt: 'draft a',
      negative: null,
      source: 'draft',
    });
    expect(entryUse(sentEntry(sent('a fox', 1)))).toEqual({
      prompt: 'a fox',
      negative: '',
      source: 'sent',
    });
  });
});

describe('PromptLibraryComponent', () => {
  let fixture: ComponentFixture<PromptLibraryComponent>;
  let component: PromptLibraryComponent;
  let drafts: StoredPromptDraft[];
  let sentPrompts: StoredSentPrompt[];
  let draftDb: {
    listAll: ReturnType<typeof vi.fn>;
    removeMany: ReturnType<typeof vi.fn>;
    putMany: ReturnType<typeof vi.fn>;
  };
  let sentDb: {
    listAll: ReturnType<typeof vi.fn>;
    removeMany: ReturnType<typeof vi.fn>;
    putMany: ReturnType<typeof vi.fn>;
  };
  let toasts: ToastService;

  async function create(
    initialTab: 'drafts' | 'sent' = 'drafts',
  ): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [
        PromptLibraryComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        { provide: PromptDraftDbService, useValue: draftDb },
        { provide: PromptHistoryDbService, useValue: sentDb },
      ],
    }).compileComponents();
    toasts = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(PromptLibraryComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('initialTab', initialTab);
    fixture.detectChanges();
    // The lists are read on init; a macrotask lets both reads settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function lastToast(): Toast {
    const toast = toasts.toasts().at(-1);
    if (!toast) {
      throw new Error('no toast was shown');
    }
    return toast;
  }

  beforeEach(() => {
    const now = Date.now();
    drafts = [
      draft('d1', now - HOUR, { origin: 'alchemy', model: 'text/b' }),
      draft('d2', now - 2 * HOUR, { negative: 'washed out' }),
    ];
    sentPrompts = [
      sent('a castle', now - HOUR, { negative: 'blurry', count: 3 }),
      sent('a lighthouse', now - 3 * HOUR, { model: 'sdxl' }),
    ];
    draftDb = {
      listAll: vi.fn(() => Promise.resolve([...drafts])),
      removeMany: vi.fn().mockResolvedValue(undefined),
      putMany: vi.fn().mockResolvedValue(undefined),
    };
    sentDb = {
      listAll: vi.fn(() => Promise.resolve([...sentPrompts])),
      removeMany: vi.fn().mockResolvedValue(undefined),
      putMany: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('opens on the tab it was asked for and switches between the two lists', async () => {
    const host = await create('sent');
    expect(component.tab()).toBe('sent');
    expect(component.shown().map((entry) => entry.prompt)).toEqual([
      'a castle',
      'a lighthouse',
    ]);
    expect(host.querySelectorAll('.gs-pl-row')).toHaveLength(2);

    component.setModelFilter('sdxl');
    component.setTab('drafts');
    fixture.detectChanges();

    expect(component.modelFilter()).toBe('');
    expect(component.shown().map((entry) => entry.id)).toEqual(['d1', 'd2']);
    expect(host.querySelector('.gs-pl-origin')).not.toBeNull();
  });

  it('searches and filters what it lists', async () => {
    await create('drafts');

    component.setQuery('washed');
    expect(component.shown().map((entry) => entry.id)).toEqual(['d2']);

    component.setQuery('');
    component.setOriginFilter('alchemy');
    expect(component.shown().map((entry) => entry.id)).toEqual(['d1']);

    component.setOriginFilter('all');
    component.setModelFilter('text/a');
    expect(component.shown().map((entry) => entry.id)).toEqual(['d2']);
    expect(component.modelOptions()).toEqual(['text/a', 'text/b']);
  });

  it('names today on the day rail and headings', async () => {
    const now = Date.now();
    sentPrompts = [sent('now', now), sent('last week', now - 8 * 24 * HOUR)];
    const host = await create('sent');

    expect(component.days().map((day) => day.labelKey)).toEqual([
      'prompt_library.day_today',
      null,
    ]);
    expect(component.railEntries()).toHaveLength(2);
    expect(host.querySelector('app-gs-index-rail')).not.toBeNull();
  });

  it('draws fifty entries at a time', async () => {
    const now = Date.now();
    sentPrompts = Array.from({ length: 120 }, (_, i) =>
      sent(`prompt ${i}`, now - i * 1000),
    );
    const host = await create('sent');

    expect(component.shown()).toHaveLength(PROMPT_LIBRARY_PAGE_SIZE);
    expect(host.querySelectorAll('.gs-pl-row')).toHaveLength(50);
    const more = host.querySelector<HTMLButtonElement>('.gs-pl-more');
    expect(more).not.toBeNull();

    more?.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('.gs-pl-row')).toHaveLength(100);

    component.showMore();
    fixture.detectChanges();
    expect(component.shown()).toHaveLength(120);
    expect(host.querySelector('.gs-pl-more')).toBeNull();

    component.setQuery('prompt 1');
    expect(component.pages()).toBe(1);
  });

  it('reads the chosen entry in full and hands it back through use', async () => {
    const host = await create('sent');
    const uses: PromptLibraryUse[] = [];
    component.use.subscribe((use) => uses.push(use));

    host.querySelector<HTMLButtonElement>('.gs-pl-row-open')?.click();
    fixture.detectChanges();
    expect(component.detail()?.prompt).toBe('a castle');
    expect(host.querySelector('.gs-pl-detail')?.textContent).toContain(
      'blurry',
    );

    host.querySelector<HTMLButtonElement>('.gs-pl-use')?.click();
    expect(uses).toEqual([
      { prompt: 'a castle', negative: 'blurry', source: 'sent' },
    ]);
  });

  it('deletes one entry and puts it back on Undo', async () => {
    await create('drafts');
    const target = component.shown()[1];
    component.open(target);

    await component.deleteEntry(target);

    expect(draftDb.removeMany).toHaveBeenCalledWith(['d2']);
    expect(component.shown().map((entry) => entry.id)).toEqual(['d1']);
    expect(component.selectedId()).toBeNull();
    const toast = lastToast();
    expect(toast.message).toBe('prompt_library.deleted_one');

    toast.action?.run();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(draftDb.putMany).toHaveBeenCalledWith([drafts[1]]);
    expect(component.shown().map((entry) => entry.id)).toEqual(['d1', 'd2']);
  });

  it('keeps the Undo up for ten seconds', async () => {
    const show = vi.fn().mockReturnValue('t');
    await create('sent');
    toasts.show = show;

    await component.deleteEntry(component.shown()[0]);

    expect(show).toHaveBeenCalledWith(
      'success',
      'prompt_library.deleted_one',
      expect.objectContaining({ autoDismissMs: 10_000 }),
    );
  });

  it('selects several entries, deletes them together and restores them all', async () => {
    const host = await create('sent');

    component.toggleSelectMode();
    fixture.detectChanges();
    expect(host.querySelectorAll('.gs-pl-check')).toHaveLength(2);
    expect(host.querySelector('.gs-pl-use')).toBeNull();

    component.markAllShown();
    expect(component.markedCount()).toBe(2);
    host.querySelector<HTMLInputElement>('.gs-pl-check')?.click();
    expect(component.markedCount()).toBe(1);
    component.markAllShown();

    await component.deleteMarked();

    expect(sentDb.removeMany).toHaveBeenCalledWith([
      'k-a castle',
      'k-a lighthouse',
    ]);
    expect(component.shown()).toEqual([]);
    expect(component.selectMode()).toBe(false);
    const toast = lastToast();
    expect(toast.message).toBe('prompt_library.deleted_other');
    expect(toast.messageParams).toEqual({ count: 2 });

    toast.action?.run();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sentDb.putMany).toHaveBeenCalledWith(sentPrompts);
    expect(component.shown().map((entry) => entry.prompt)).toEqual([
      'a castle',
      'a lighthouse',
    ]);
  });

  it('shows requests still under way ahead of the drafts only', async () => {
    const host = await create('drafts');
    fixture.componentRef.setInput('liveRequests', [
      {
        id: 'live-1',
        stateKey: 'prompt_library.live_title',
        preview: 'a fox in snow',
        createdAt: Date.now(),
      },
    ]);
    fixture.detectChanges();
    expect(host.querySelector('.gs-pl-row--live')?.textContent).toContain(
      'a fox in snow',
    );

    component.setTab('sent');
    fixture.detectChanges();
    expect(host.querySelector('.gs-pl-row--live')).toBeNull();
  });

  it('closes on Escape', async () => {
    const host = await create('drafts');
    const closed = vi.fn();
    component.closed.subscribe(closed);

    host
      .querySelector('.gs-modal-overlay')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
