import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptDraftCardComponent } from './prompt-draft-card.component';
import {
  PromptDraftOutcome,
  PromptDraftService,
} from '../../services/prompt-draft.service';
import {
  PromptDraftDbService,
  StoredPromptDraft,
} from '../../services/prompt-draft-db.service';
import { AuthService } from '../../services/auth.service';

/** Comfortably past the card's own debounce, so a price has been asked for. */
const ESTIMATE_WAIT_MS = 750;

function makeStored(id: string, text: string): StoredPromptDraft {
  return {
    id,
    createdAt: 1_700_000_000_000,
    origin: 'alchemy',
    input: { caption: 'a dog' },
    pick: 'auto',
    model: 'm/1',
    seed: null,
    kudos: 3,
    anonymous: false,
    text,
  };
}

describe('PromptDraftCardComponent', () => {
  let fixture: ComponentFixture<PromptDraftCardComponent>;
  let draft: ReturnType<typeof vi.fn>;
  let estimate: ReturnType<typeof vi.fn>;
  let list: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let imagePromptStyles: ReturnType<typeof vi.fn>;
  let previewRequest: ReturnType<typeof vi.fn>;
  let loggedIn: ReturnType<typeof signal<boolean>>;
  let kudos: ReturnType<typeof signal<number | null>>;
  let sent: string | null;

  beforeEach(() => {
    localStorage.clear();
    draft = vi.fn();
    estimate = vi.fn().mockResolvedValue(null);
    list = vi.fn().mockResolvedValue([]);
    remove = vi.fn().mockResolvedValue(undefined);
    imagePromptStyles = vi.fn().mockResolvedValue([]);
    previewRequest = vi
      .fn()
      .mockReturnValue({ prompt: 'the body', slow_workers: true });
    loggedIn = signal(false);
    kudos = signal<number | null>(null);
    TestBed.configureTestingModule({
      imports: [
        PromptDraftCardComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
      providers: [
        {
          provide: PromptDraftService,
          useValue: {
            draft,
            estimate,
            imagePromptStyles,
            previewRequest,
            textModels: vi.fn().mockResolvedValue([
              { name: 'koboldcpp/L3-8B-Stheno-v3.2', count: 4 },
              { name: 'koboldcpp/gemma-4-31B-it-heretic', count: 1 },
            ]),
          },
        },
        {
          provide: PromptDraftDbService,
          useValue: { list, remove, put: vi.fn(), clear: vi.fn() },
        },
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: loggedIn,
            kudos,
            getStoredApiKey: () => null,
          },
        },
      ],
    });
  });

  const build = (): void => {
    fixture = TestBed.createComponent(PromptDraftCardComponent);
    fixture.componentRef.setInput('caption', 'a dog on a couch');
    fixture.componentRef.setInput('tags', 'dog, couch');
    fixture.componentRef.setInput('defaultOpen', true);
    sent = null;
    fixture.componentInstance.apply.subscribe((text) => (sent = text));
    fixture.detectChanges();
  };

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const settlePrice = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, ESTIMATE_WAIT_MS));
    await settle();
  };
  const anonInput = (): HTMLInputElement =>
    el().querySelector('.alchemy-draft__anon input') as HTMLInputElement;

  it('lists the models online once open, curated ones first', async () => {
    build();
    await settle();
    const options = [...el().querySelectorAll('select option')].map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toEqual([
      'auto',
      'any',
      'model:koboldcpp/gemma-4-31B-it-heretic',
      'model:koboldcpp/L3-8B-Stheno-v3.2',
    ]);
  });

  it('asks for a draft from the material and the pick, then offers it to the studio', async () => {
    const outcome: PromptDraftOutcome = {
      kind: 'done',
      texts: ['a dog on a couch, warm light'],
      model: 'koboldcpp/gemma-4-31B-it-heretic',
      kudos: 2,
      seed: null,
      ids: ['draft-1'],
    };
    draft.mockResolvedValue(outcome);
    build();
    await settle();
    fixture.componentInstance.onNoteInput('make it painterly');
    fixture.componentInstance.onPickChange('model:x/y');
    await fixture.componentInstance.draft();
    fixture.detectChanges();

    expect(draft).toHaveBeenCalledWith(
      {
        caption: 'a dog on a couch',
        tags: 'dog, couch',
        note: 'make it painterly',
      },
      { model: 'x/y' },
      expect.any(Array),
      { anonymous: true, origin: 'alchemy' },
      { style: null, takes: 1 },
    );
    expect(
      el().querySelector('.alchemy-draft__text')?.textContent?.trim(),
    ).toBe('a dog on a couch, warm light');
    (
      el().querySelector('.alchemy-draft__actions button') as HTMLButtonElement
    ).click();
    expect(sent).toBe('a dog on a couch, warm light');
  });

  it('shows the refusal as the horde worded it', async () => {
    draft.mockResolvedValue({
      kind: 'refused',
      error: { status: 400, message: 'No workers', rc: 'NoWorkers' },
    });
    build();
    await fixture.componentInstance.draft();
    fixture.detectChanges();
    expect(el().querySelector('.gs-warn')?.textContent).toContain(
      'prompt_draft.refused',
    );
  });

  it('does nothing without material to write from', async () => {
    build();
    fixture.componentRef.setInput('caption', null);
    fixture.componentRef.setInput('tags', null);
    fixture.detectChanges();
    await fixture.componentInstance.draft();
    expect(draft).not.toHaveBeenCalled();
  });

  it('improves a prompt when given one, and asks for that rather than findings', async () => {
    draft.mockResolvedValue({
      kind: 'done',
      texts: ['a dog on a couch, golden hour, 35mm'],
      model: 'm',
      kudos: 1,
      seed: null,
      ids: ['draft-2'],
    });
    build();
    await settle();
    fixture.componentRef.setInput('caption', null);
    fixture.componentRef.setInput('tags', null);
    fixture.componentRef.setInput('seed', 'a dog on a couch');
    fixture.detectChanges();
    expect(fixture.componentInstance.mode()).toBe('improve');
    expect(fixture.componentInstance.hasMaterial()).toBe(true);
    await fixture.componentInstance.draft();
    expect(draft).toHaveBeenCalledWith(
      { prompt: 'a dog on a couch', note: '' },
      'auto',
      expect.anything(),
      { anonymous: true, origin: 'studio' },
      { style: null, takes: 1 },
    );
  });

  it('prices the draft once the card has settled, and names the balance when there is one', async () => {
    loggedIn.set(true);
    kudos.set(1_234);
    estimate.mockResolvedValue(12);
    build();
    await settlePrice();
    expect(estimate).toHaveBeenCalled();
    const line = el().querySelector('.alchemy-draft__cost');
    const cost = line?.textContent ?? '';
    expect(cost).toContain('prompt_draft.cost_lead');
    expect(cost).toContain('prompt_draft.cost_balance_lead');
    expect(cost).toContain('prompt_draft.cost_unit');
    // Both figures are abbreviated the way the studio's balance chip writes them.
    expect(
      [...(line?.querySelectorAll('.gs-mono') ?? [])].map((span) =>
        span.textContent?.trim(),
      ),
    ).toEqual(['12', '1.2K']);
    expect(fixture.componentInstance.estimatedKudos()).toBe(12);
  });

  it('locks the switch on when there is nobody signed in', async () => {
    build();
    await settle();
    expect(anonInput().checked).toBe(true);
    expect(anonInput().disabled).toBe(true);
    expect(fixture.componentInstance.anonymous()).toBe(true);
  });

  it('leaves the switch off and usable for a signed-in reader', async () => {
    loggedIn.set(true);
    kudos.set(400);
    build();
    await settle();
    expect(anonInput().checked).toBe(false);
    expect(anonInput().disabled).toBe(false);
  });

  it('remembers a switch the reader set on a previous visit', async () => {
    localStorage.setItem('aihorde.prompt-draft.anonymous', 'true');
    loggedIn.set(true);
    kudos.set(400);
    build();
    await settle();
    expect(anonInput().checked).toBe(true);

    fixture.componentInstance.onAnonymousChange(false);
    expect(localStorage.getItem('aihorde.prompt-draft.anonymous')).toBe(
      'false',
    );
  });

  it('moves a draft the balance cannot pay for onto the anonymous key, and says why', async () => {
    loggedIn.set(true);
    kudos.set(5);
    estimate.mockResolvedValue(50);
    build();
    await settlePrice();
    expect(fixture.componentInstance.anonymous()).toBe(true);
    expect(fixture.componentInstance.flippedForCost()).toBe(true);
    expect(el().querySelector('.alchemy-draft__cost')?.textContent).toContain(
      'prompt_draft.cost_flipped',
    );
  });

  it('offers no directions while the horde carries no styles for the job', async () => {
    build();
    await settle();
    expect(el().querySelector('.alchemy-draft__chips')).toBeNull();
    expect(el().querySelector('select')).not.toBeNull();
  });

  it('offers the styles of the job as chips, and sends the chosen one', async () => {
    imagePromptStyles.mockResolvedValue([
      {
        id: 's1',
        name: 'Image prompt: photographic',
        role: 'describe',
        direction: 'photographic',
        models: [],
      },
      {
        id: 's2',
        name: 'Image prompt: describe',
        role: 'describe',
        direction: null,
        models: [],
      },
      {
        id: 's3',
        name: 'Image prompt: describe, cinematic',
        role: 'describe',
        direction: null,
        models: [],
      },
      {
        id: 's4',
        name: 'Image prompt: sharpen',
        role: 'improve',
        direction: null,
        models: [],
      },
    ]);
    draft.mockResolvedValue({
      kind: 'done',
      texts: ['a dog, 35mm'],
      model: 'm',
      kudos: 1,
      seed: null,
      ids: ['d1'],
    });
    build();
    await settle();

    const chips = [...el().querySelectorAll('.alchemy-draft__chips button')];
    // A style that names no direction is the plain one of its role, so the
    // chip says that rather than repeating the role beside Built-in.
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      'en.prompt_draft.direction_builtin',
      'photographic',
      'en.prompt_draft.chip_plain',
      'cinematic',
    ]);
    // The improve style belongs to the other job and is offered nowhere here.
    (chips[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.chosenStyle()?.id).toBe('s1');
    // The style names the model, so the override list stands down.
    expect(el().querySelector('select')).toBeNull();

    await fixture.componentInstance.draft();
    expect(draft).toHaveBeenCalledWith(
      expect.anything(),
      'auto',
      expect.anything(),
      expect.anything(),
      { style: expect.objectContaining({ id: 's1' }), takes: 1 },
    );
  });

  it('prices the chip that is chosen', async () => {
    imagePromptStyles.mockResolvedValue([
      {
        id: 's1',
        name: 'Image prompt: photographic',
        role: 'describe',
        direction: 'photographic',
        models: [],
      },
    ]);
    estimate.mockResolvedValue(4);
    build();
    await settlePrice();
    const calls = estimate.mock.calls.length;
    fixture.componentInstance.chooseStyle('s1');
    fixture.detectChanges();
    await settlePrice();
    expect(estimate.mock.calls.length).toBeGreaterThan(calls);
    expect(estimate.mock.calls.at(-1)?.[4]).toEqual({
      style: expect.objectContaining({ id: 's1' }),
      takes: 1,
    });
  });

  it('asks for three takes and shows each of them', async () => {
    draft.mockResolvedValue({
      kind: 'done',
      texts: ['one dog', 'two dogs', 'three dogs'],
      model: 'm',
      kudos: 6,
      seed: null,
      ids: ['d1', 'd2', 'd3'],
    });
    build();
    await settle();
    fixture.componentInstance.onThreeTakesChange(true);
    await fixture.componentInstance.draft();
    fixture.detectChanges();

    expect(draft.mock.calls.at(-1)?.[4]).toEqual({ style: null, takes: 3 });
    const takes = [...el().querySelectorAll('.alchemy-draft__take')];
    expect(takes).toHaveLength(3);
    expect(
      takes.map((take) =>
        take.querySelector('blockquote')?.textContent?.trim(),
      ),
    ).toEqual(['one dog', 'two dogs', 'three dogs']);
    (takes[2].querySelector('button') as HTMLButtonElement).click();
    expect(sent).toBe('three dogs');
  });

  it('names the rendering style the studio already applies', async () => {
    draft.mockResolvedValue({
      kind: 'done',
      texts: ['a dog'],
      model: 'm',
      kudos: 1,
      seed: null,
      ids: ['d1'],
    });
    build();
    fixture.componentRef.setInput('styleWords', 'oil painting, impasto');
    fixture.detectChanges();
    await settle();
    await fixture.componentInstance.draft();
    expect(draft.mock.calls.at(-1)?.[0]).toMatchObject({
      styleWords: 'oil painting, impasto',
    });
  });

  it('shows the request that a press would send, on the key it would use', async () => {
    build();
    await settle();
    const sections = fixture.componentInstance.previewSections();
    expect(sections.map((section) => section.id)).toEqual(['request', 'curl']);
    expect(sections[0].value).toEqual({
      prompt: 'the body',
      slow_workers: true,
    });
    expect(previewRequest).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'a dog on a couch' }),
      'auto',
      expect.any(Array),
      { style: null, takes: 1 },
    );
    // Logged out, the card is anonymous, and the curl line says which key that is.
    expect(sections[1].value).toContain('apikey: 0000000000');
    expect(sections[1].value).toContain('generate/text/async');
    expect(sections[1].value).not.toContain('<your key>');
  });

  it('offers a past draft back to the prompt box, and deletes one on request', async () => {
    list.mockResolvedValue([makeStored('p1', 'an older draft')]);
    build();
    await settle();
    await fixture.componentInstance.toggleHistory();
    fixture.detectChanges();

    const row = el().querySelector('.alchemy-draft__history-row');
    expect(row?.textContent).toContain('an older draft');
    const buttons = [
      ...(row?.querySelectorAll('button') ?? []),
    ] as HTMLButtonElement[];
    buttons[0].click();
    expect(sent).toBe('an older draft');

    list.mockResolvedValue([]);
    buttons[2].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
    expect(remove).toHaveBeenCalledWith('p1');
    expect(el().querySelector('.alchemy-draft__history-row')).toBeNull();
  });
});
