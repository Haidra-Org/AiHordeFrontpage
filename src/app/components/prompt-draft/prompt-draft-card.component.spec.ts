import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptDraftCardComponent } from './prompt-draft-card.component';
import { PromptDraftService } from '../../services/prompt-draft.service';
import {
  PromptDraftDbService,
  StoredPromptDraft,
} from '../../services/prompt-draft-db.service';
import {
  TextGenerationQueueService,
  TextSubmitResult,
} from '../../services/text-generation-queue.service';
import {
  StoredTextRequest,
  TextRequestContext,
  textRequestContextKey,
} from '../../services/text-generation-db.service';
import { AuthService } from '../../services/auth.service';
import {
  DescribeFindings,
  DescribeOrigin,
  PreparePictureOutcome,
  PreparedPicture,
  StudioDescribeService,
} from '../../services/studio-describe.service';

/** Comfortably past the card's own debounce, so a price has been asked for. */
const ESTIMATE_WAIT_MS = 750;

/** A picture as the service hands it back once it has been shrunk. */
const READY: PreparedPicture = {
  base64: 'AAAA',
  mimeType: 'image/webp',
  width: 640,
  height: 480,
};

// jsdom carries no object-URL store, and the card only needs an address it can
// hand to an <img> and give back.
let objectUrls: string[];
let revokedUrls: string[];

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

/** The clock the card's time waited is drawn against. */
const NOW = 1_700_000_100_000;

/** A request as the queue keeps it, finished unless told otherwise. */
function makeRequest(overrides: Partial<StoredTextRequest>): StoredTextRequest {
  return {
    localId: 'local-1',
    hordeId: 'text-1',
    createdAt: NOW - 42_000,
    updatedAt: NOW,
    context: { kind: 'studio' },
    origin: 'alchemy',
    input: { caption: 'a dog on a couch', tags: 'dog, couch', note: '' },
    pick: 'auto',
    takes: 1,
    anonymous: true,
    modelLabel: 'm',
    request: { prompt: 'the body' },
    state: 'done',
    acknowledged: true,
    ...overrides,
  };
}

/** A finished request carrying these takes. */
function doneRequest(
  texts: string[],
  negatives: string[] = [],
  extra: Partial<StoredTextRequest> = {},
): StoredTextRequest {
  return makeRequest({
    state: 'done',
    chargedKudos: 2,
    results: texts.map((text, index) => ({
      draftId: `text-1-${index}`,
      text,
      negative: negatives[index] ?? '',
      model: 'koboldcpp/gemma-4-31B-it-heretic',
      seed: null,
    })),
    ...extra,
  });
}

describe('PromptDraftCardComponent', () => {
  let fixture: ComponentFixture<PromptDraftCardComponent>;
  let submit: Mock<(...args: unknown[]) => Promise<TextSubmitResult>>;
  let requests: ReturnType<typeof signal<StoredTextRequest[]>>;
  let cancel: ReturnType<typeof vi.fn>;
  let watch: ReturnType<typeof vi.fn>;
  let release: ReturnType<typeof vi.fn>;
  let cancelling: ReturnType<typeof signal<ReadonlySet<string>>>;
  /** Answer the next press with a request that has already come back. */
  const answerWith = (request: StoredTextRequest): void => {
    submit.mockImplementation(() => {
      requests.set([request]);
      return Promise.resolve({ kind: 'sent', localId: request.localId });
    });
  };
  let estimate: ReturnType<typeof vi.fn>;
  let list: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let imagePromptStyles: ReturnType<typeof vi.fn>;
  let previewRequest: ReturnType<typeof vi.fn>;
  let loggedIn: ReturnType<typeof signal<boolean>>;
  let kudos: ReturnType<typeof signal<number | null>>;
  let sent: string | null;
  let findings: ReturnType<typeof signal<DescribeFindings>>;
  let describePicture: ReturnType<typeof vi.fn>;
  let preparePicture: ReturnType<typeof vi.fn>;
  let readPicture: ReturnType<typeof vi.fn>;
  let pending: ReturnType<typeof signal<boolean>>;
  let sourcePicture: ReturnType<typeof signal<Blob | null>>;

  beforeEach(() => {
    localStorage.clear();
    objectUrls = [];
    revokedUrls = [];
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:picture-${objectUrls.length}`;
      objectUrls.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url);
    });
    submit = vi
      .fn<(...args: unknown[]) => Promise<TextSubmitResult>>()
      .mockResolvedValue({ kind: 'sent', localId: 'local-1' });
    requests = signal<StoredTextRequest[]>([]);
    cancel = vi.fn().mockResolvedValue(undefined);
    release = vi.fn();
    watch = vi.fn().mockReturnValue(release);
    cancelling = signal<ReadonlySet<string>>(new Set());
    const lists = new Map<string, Signal<readonly StoredTextRequest[]>>();
    const requestsFor = (
      context: TextRequestContext,
    ): Signal<readonly StoredTextRequest[]> => {
      const key = textRequestContextKey(context);
      let list = lists.get(key);
      if (!list) {
        list = computed(() =>
          requests().filter(
            (request) => textRequestContextKey(request.context) === key,
          ),
        );
        lists.set(key, list);
      }
      return list;
    };
    estimate = vi.fn().mockResolvedValue(null);
    list = vi.fn().mockResolvedValue([]);
    remove = vi.fn().mockResolvedValue(undefined);
    imagePromptStyles = vi.fn().mockResolvedValue([]);
    previewRequest = vi
      .fn()
      .mockReturnValue({ prompt: 'the body', slow_workers: true });
    loggedIn = signal(false);
    kudos = signal<number | null>(null);
    findings = signal<DescribeFindings>({ caption: null, tags: null });
    describePicture = vi.fn().mockResolvedValue(undefined);
    preparePicture = vi
      .fn<(blob: Blob) => Promise<PreparePictureOutcome>>()
      .mockResolvedValue({ kind: 'ready', picture: READY });
    readPicture = vi.fn().mockResolvedValue(undefined);
    pending = signal(false);
    sourcePicture = signal<Blob | null>(null);
    TestBed.configureTestingModule({
      imports: [
        PromptDraftCardComponent,
        TranslocoTestingModule.forRoot({
          langs: {},
          translocoConfig: { defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: PromptDraftService,
          useValue: {
            submit,
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
          provide: TextGenerationQueueService,
          useValue: {
            requestsFor,
            watch,
            cancel,
            cancelling,
            clock: signal(NOW),
          },
        },
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: loggedIn,
            kudos,
            getStoredApiKey: () => null,
          },
        },
        {
          provide: StudioDescribeService,
          useValue: {
            findings,
            hasFindings: () => {
              const { caption, tags } = findings();
              return caption !== null || tags !== null;
            },
            pending,
            origin: (): DescribeOrigin => 'picked',
            readingKudos: (): number | null => 8,
            sourcePicture,
            describe: describePicture,
            prepare: preparePicture,
            read: readPicture,
            clear: (): void => findings.set({ caption: null, tags: null }),
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
  /** Everything that steers the request is folded away until this is pressed. */
  const openOptions = async (): Promise<void> => {
    fixture.componentInstance.toggleOptions();
    fixture.detectChanges();
    await settle();
  };
  const file = (name: string): File =>
    new File(['x'], name, { type: 'image/png' });
  /** Let a picture go over the card's body, as a reader would. */
  const drop = (picked: File): void => {
    const body = el().querySelector('.alchemy-draft__body') as HTMLElement;
    const event = new Event('drop', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [picked] } as unknown as DataTransfer,
    });
    body.dispatchEvent(event);
  };
  /** A studio card on the picture tab, which is where a reading starts. */
  const showPicture = async (): Promise<void> => {
    build();
    fixture.componentRef.setInput('picture', true);
    fixture.componentRef.setInput('seed', 'a dog');
    fixture.detectChanges();
    await settle();
    fixture.componentInstance.chooseTab('picture');
    fixture.detectChanges();
  };
  /** Put a picture in front of the reader and wait for it to be measured. */
  const stage = async (): Promise<void> => {
    drop(file('p.png'));
    await settle();
  };
  const readButton = (): HTMLButtonElement =>
    el().querySelector(
      '.gs-describe-staged-actions .gs-btn',
    ) as HTMLButtonElement;
  const chip = (text: string): HTMLButtonElement =>
    [...el().querySelectorAll('.gs-describe-staged-actions .gs-chip')].find(
      (button) => (button.textContent ?? '').includes(text),
    ) as HTMLButtonElement;

  it('lists the models online under Options, curated ones first', async () => {
    build();
    await settle();
    await openOptions();
    const options = [...el().querySelectorAll('select option')].map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toEqual([
      'auto',
      'quality',
      'any',
      'model:koboldcpp/gemma-4-31B-it-heretic',
      'model:koboldcpp/L3-8B-Stheno-v3.2',
    ]);
  });

  it('names the value pick, the costly one, and what each model costs', async () => {
    build();
    await settle();
    await openOptions();
    const options = [...el().querySelectorAll('select option')].map((option) =>
      (option.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(options[0]).toBe('en.prompt_draft.model_auto');
    expect(options[1]).toBe('en.prompt_draft.model_quality');
    expect(options[3]).toBe(
      'koboldcpp/gemma-4-31B-it-heretic (1, en.prompt_draft.tier_medium) ★',
    );
    expect(options[4]).toBe(
      'koboldcpp/L3-8B-Stheno-v3.2 (4, en.prompt_draft.tier_small)',
    );
  });

  it('prices whichever pick the reader chooses', async () => {
    estimate.mockResolvedValue(9);
    build();
    await settle();
    await openOptions();
    fixture.componentInstance.onPickChange('quality');
    fixture.detectChanges();
    await settlePrice();
    expect(estimate.mock.calls.at(-1)?.[1]).toBe('quality');
  });

  it('asks for a draft from the material and the pick, then offers it to the studio', async () => {
    answerWith(doneRequest(['a dog on a couch, warm light']));
    build();
    await settle();
    fixture.componentInstance.onNoteInput('make it painterly');
    fixture.componentInstance.onPickChange('model:x/y');
    await fixture.componentInstance.draft();
    fixture.detectChanges();

    expect(submit).toHaveBeenCalledWith(
      {
        caption: 'a dog on a couch',
        tags: 'dog, couch',
        note: 'make it painterly',
      },
      { model: 'x/y' },
      expect.any(Array),
      {
        anonymous: true,
        origin: 'alchemy',
        context: { kind: 'studio' },
        replace: false,
        quotedKudos: null,
      },
      { style: null, takes: 1 },
    );
    expect(
      el().querySelector('.alchemy-draft__text')?.textContent?.trim(),
    ).toBe('a dog on a couch, warm light');
    expect(el().querySelector('.alchemy-draft__meta')?.textContent).toContain(
      'prompt_draft.written_by',
    );
    (
      el().querySelector('.alchemy-draft__actions button') as HTMLButtonElement
    ).click();
    expect(sent).toBe('a dog on a couch, warm light');
  });

  it('files a card under an alchemy job with that job, apart from the studio', async () => {
    requests.set([doneRequest(['the studio take'])]);
    build();
    fixture.componentRef.setInput('jobId', 'job-7');
    fixture.detectChanges();
    await settle();
    // The studio's request is not this card's.
    expect(el().querySelector('.alchemy-draft__text')).toBeNull();

    await fixture.componentInstance.draft();
    expect(submit.mock.calls.at(-1)?.[3]).toMatchObject({
      context: { kind: 'alchemy', jobId: 'job-7' },
    });
  });

  it('shows the refusal as the horde worded it', async () => {
    answerWith(
      makeRequest({
        state: 'refused',
        refusal: { status: 400, message: 'No workers', rc: 'NoWorkers' },
      }),
    );
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
    expect(submit).not.toHaveBeenCalled();
  });

  it('improves a prompt when given one, and asks for that rather than findings', async () => {
    answerWith(doneRequest(['a dog on a couch, golden hour, 35mm']));
    build();
    await settle();
    fixture.componentRef.setInput('caption', null);
    fixture.componentRef.setInput('tags', null);
    fixture.componentRef.setInput('seed', 'a dog on a couch');
    fixture.detectChanges();
    expect(fixture.componentInstance.mode()).toBe('improve');
    expect(fixture.componentInstance.hasMaterial()).toBe(true);
    await fixture.componentInstance.draft();
    expect(submit).toHaveBeenCalledWith(
      { prompt: 'a dog on a couch', note: '' },
      'auto',
      expect.anything(),
      expect.objectContaining({ anonymous: true, origin: 'studio' }),
      { style: null, takes: 1 },
    );
  });

  it('shows the negative line a rewrite came with, and offers it on its own', async () => {
    answerWith(
      doneRequest(['a dog on a couch, golden hour'], ['blurry, extra limbs']),
    );
    build();
    await settle();
    fixture.componentRef.setInput('seed', 'a dog on a couch');
    fixture.detectChanges();
    const applied: string[] = [];
    fixture.componentInstance.applyNegative.subscribe((text) =>
      applied.push(text),
    );
    await fixture.componentInstance.draft();
    fixture.detectChanges();
    expect(
      el().querySelector('.alchemy-draft__negative')?.textContent,
    ).toContain('blurry, extra limbs');
    fixture.componentInstance.sendNegative(0);
    expect(applied).toEqual(['blurry, extra limbs']);
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
    await openOptions();
    expect(anonInput().checked).toBe(true);
    expect(anonInput().disabled).toBe(true);
    expect(fixture.componentInstance.anonymous()).toBe(true);
  });

  it('leaves the switch off and usable for a signed-in reader', async () => {
    loggedIn.set(true);
    kudos.set(400);
    build();
    await settle();
    await openOptions();
    expect(anonInput().checked).toBe(false);
    expect(anonInput().disabled).toBe(false);
  });

  it('remembers a switch the reader set on a previous visit', async () => {
    localStorage.setItem('aihorde.prompt-draft.anonymous', 'true');
    loggedIn.set(true);
    kudos.set(400);
    build();
    await settle();
    await openOptions();
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

  describe('steering away from costly models', () => {
    const nudge = (): HTMLElement | null =>
      el().querySelector('.alchemy-draft__nudge');
    const nudgeButton = (key: string): HTMLButtonElement =>
      [...el().querySelectorAll('.alchemy-draft__nudge button')].find(
        (button) => (button.textContent ?? '').includes(key),
      ) as HTMLButtonElement;
    const price = (): HTMLElement | null =>
      el().querySelector('.alchemy-draft__cost .gs-mono');
    const pickAndSettle = async (value: string): Promise<void> => {
      fixture.componentInstance.onPickChange(value);
      fixture.detectChanges();
      await settle();
    };

    beforeEach(() => {
      loggedIn.set(true);
      kudos.set(1_000);
    });

    it('suggests a smaller model or the anonymous key for the quality pick and bigger models', async () => {
      build();
      await settle();
      await openOptions();
      expect(nudge()).toBeNull();

      await pickAndSettle('quality');
      expect(nudge()?.textContent).toContain('prompt_draft.model_costly_nudge');

      await pickAndSettle('model:koboldcpp/gemma-4-31B-it-heretic');
      expect(nudge()).not.toBeNull();

      await pickAndSettle('model:koboldcpp/L3-8B-Stheno-v3.2');
      expect(nudge()).toBeNull();
    });

    it('says nothing when the request already goes out anonymously', async () => {
      loggedIn.set(false);
      build();
      await settle();
      await openOptions();
      await pickAndSettle('quality');
      expect(nudge()).toBeNull();
    });

    it('offers both ways out as one press each', async () => {
      build();
      await settle();
      await openOptions();
      await pickAndSettle('quality');

      nudgeButton('prompt_draft.model_costly_use_value').click();
      fixture.detectChanges();
      expect(fixture.componentInstance.pick()).toBe('auto');
      expect(nudge()).toBeNull();

      await pickAndSettle('quality');
      nudgeButton('prompt_draft.model_costly_anonymous').click();
      fixture.detectChanges();
      expect(fixture.componentInstance.anonymous()).toBe(true);
      expect(nudge()).toBeNull();
    });

    it('marks a price above 25 kudos', async () => {
      estimate.mockResolvedValue(26);
      build();
      await settlePrice();
      expect(price()?.classList).toContain('alchemy-draft__price--high');
    });

    it('leaves a price of 25 kudos or less unmarked', async () => {
      estimate.mockResolvedValue(25);
      build();
      await settlePrice();
      expect(price()).not.toBeNull();
      expect(price()?.classList).not.toContain('alchemy-draft__price--high');
    });

    it('leaves the price unmarked when the reader asks anonymously', async () => {
      localStorage.setItem('aihorde.prompt-draft.anonymous', 'true');
      estimate.mockResolvedValue(26);
      build();
      await settlePrice();
      expect(price()).not.toBeNull();
      expect(price()?.classList).not.toContain('alchemy-draft__price--high');
    });
  });

  it('offers no directions while the horde carries no styles for the job', async () => {
    build();
    await settle();
    await openOptions();
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
    answerWith(doneRequest(['a dog, 35mm']));
    build();
    await settle();
    await openOptions();

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
    expect(submit).toHaveBeenCalledWith(
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

  it('asks for as many takes as the number says, and shows each of them', async () => {
    answerWith(doneRequest(['one dog', 'two dogs', 'three dogs']));
    build();
    await settle();
    fixture.componentInstance.onTakesInput('3');
    await fixture.componentInstance.draft();
    fixture.detectChanges();

    expect(submit.mock.calls.at(-1)?.[4]).toEqual({ style: null, takes: 3 });
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
    answerWith(doneRequest(['a dog']));
    build();
    fixture.componentRef.setInput('styleWords', 'oil painting, impasto');
    fixture.detectChanges();
    await settle();
    await fixture.componentInstance.draft();
    expect(submit.mock.calls.at(-1)?.[0]).toMatchObject({
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
  it('shows only the note, the button and the price until Options is opened', async () => {
    build();
    await settle();
    expect(el().querySelector('.alchemy-draft__options-toggle')).not.toBeNull();
    expect(el().querySelector('select')).toBeNull();
    expect(el().querySelector('.alchemy-draft__anon')).toBeNull();
    expect(el().querySelector('.alchemy-draft__takes')).toBeNull();
    expect(el().querySelector('.alchemy-draft__preview-trigger')).toBeNull();
    expect(el().querySelector('.alchemy-draft__go')).not.toBeNull();

    await openOptions();
    expect(el().querySelector('select')).not.toBeNull();
    expect(el().querySelector('.alchemy-draft__anon')).not.toBeNull();
    expect(el().querySelector('.alchemy-draft__takes')).not.toBeNull();
    expect(
      el().querySelector('.alchemy-draft__preview-trigger'),
    ).not.toBeNull();
    expect(localStorage.getItem('aihorde.prompt-draft.options')).toBe('true');
  });

  it('opens the fold on a visit where the reader last left it open', async () => {
    localStorage.setItem('aihorde.prompt-draft.options', 'true');
    build();
    await settle();
    expect(fixture.componentInstance.optionsOpen()).toBe(true);
    expect(el().querySelector('select')).not.toBeNull();
  });

  it('keeps the takes number inside the range the card offers', async () => {
    build();
    await settle();
    fixture.componentInstance.onTakesInput('9');
    expect(fixture.componentInstance.takes()).toBe(5);
    fixture.componentInstance.onTakesInput('0');
    expect(fixture.componentInstance.takes()).toBe(1);
    fixture.componentInstance.onTakesInput('');
    expect(fixture.componentInstance.takes()).toBe(1);
  });

  it('opens the fold when it moves a draft onto the anonymous key by itself', async () => {
    loggedIn.set(true);
    kudos.set(5);
    estimate.mockResolvedValue(50);
    build();
    await settlePrice();
    expect(fixture.componentInstance.optionsOpen()).toBe(true);
    expect(anonInput().checked).toBe(true);
    // The card's own fold is not the reader's answer, so it is not remembered.
    expect(localStorage.getItem('aihorde.prompt-draft.options')).toBeNull();
  });

  it('offers both ways into a prompt in the studio, and neither under a job', async () => {
    build();
    await settle();
    expect(el().querySelector('.alchemy-draft__tabs')).toBeNull();

    fixture.componentRef.setInput('picture', true);
    fixture.componentRef.setInput('seed', 'a dog on a couch');
    fixture.detectChanges();
    await settle();
    const tabs = [
      ...el().querySelectorAll('.alchemy-draft__tabs button'),
    ] as HTMLButtonElement[];
    expect(tabs).toHaveLength(2);
    expect(el().querySelector('.gs-describe')).toBeNull();

    tabs[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.activeTab()).toBe('picture');
    expect(el().querySelector('.gs-describe')).not.toBeNull();
    expect(el().querySelector('.alchemy-draft__lead')).toBeNull();
  });

  it('says in the head that a picture was read, and writes from it as well', async () => {
    answerWith(doneRequest(['a dog on a couch, warm light']));
    build();
    fixture.componentRef.setInput('caption', null);
    fixture.componentRef.setInput('tags', null);
    fixture.componentRef.setInput('picture', true);
    fixture.componentRef.setInput('seed', 'a dog');
    fixture.detectChanges();
    await settle();
    expect(el().querySelector('.alchemy-draft__found')).toBeNull();

    findings.set({ caption: 'a dog on a couch', tags: 'dog, couch' });
    fixture.detectChanges();
    expect(el().querySelector('.alchemy-draft__found')?.textContent).toContain(
      'prompt_draft.findings_badge',
    );
    expect(
      el().querySelector('.alchemy-draft__with-findings')?.textContent,
    ).toContain('prompt_draft.with_findings');

    await fixture.componentInstance.draft();
    expect(submit.mock.calls.at(-1)?.[0]).toEqual({
      prompt: 'a dog',
      note: '',
      caption: 'a dog on a couch',
      tags: 'dog, couch',
    });
  });

  it('takes a picture let go anywhere on the body of the picture tab', async () => {
    build();
    fixture.componentRef.setInput('picture', true);
    fixture.componentRef.setInput('seed', 'a dog');
    fixture.detectChanges();
    await settle();

    // The improve tab is showing, so the body is not a drop target.
    drop(file('p.png'));
    expect(preparePicture).not.toHaveBeenCalled();

    await showPicture();
    drop(file('p.png'));
    await settle();
    expect(preparePicture).toHaveBeenCalledTimes(1);
  });

  it('shows the picture and its steps without asking for a reading', async () => {
    await showPicture();
    await stage();

    expect(readPicture).not.toHaveBeenCalled();
    const thumb = el().querySelector('.gs-describe-thumb') as HTMLImageElement;
    expect(thumb.getAttribute('src')).toBe(objectUrls[0]);
    expect(thumb.getAttribute('alt')).toContain(
      'en.generate.describe.staged_alt',
    );
    const steps = [...el().querySelectorAll('.gs-describe-step')];
    expect(steps).toHaveLength(2);
    expect(steps[1].getAttribute('aria-current')).toBe('step');
    expect(steps[1].textContent).toContain('en.generate.describe.step_read');
    // The size on screen is the size that would go out.
    expect(el().querySelector('.gs-pixels')?.textContent).toContain(
      'en.generate.pixels.size',
    );
    // Nothing offers to read the picture on the picker row any more.
    expect(el().querySelector('.gs-describe-open')).toBeNull();
  });

  it('says what the reading costs once a picture is staged', async () => {
    const priceLines = (): string[] =>
      [...el().querySelectorAll('.gs-describe-staged-body p')]
        .map((node) => node.textContent ?? '')
        .filter((text) => text.includes('en.generate.describe.price'));

    await showPicture();
    expect(priceLines()).toHaveLength(0);

    await stage();
    expect(priceLines()).toHaveLength(1);
  });

  it('asks for the reading only once the button is pressed', async () => {
    await showPicture();
    await stage();
    expect(readPicture).not.toHaveBeenCalled();

    readButton().click();
    expect(readPicture).toHaveBeenCalledTimes(1);
    expect(readPicture).toHaveBeenCalledWith(
      expect.objectContaining({ base64: 'AAAA' }),
      'picked',
    );

    // While the horde has it the picture stays put and the step says so.
    pending.set(true);
    fixture.detectChanges();
    expect(el().querySelector('.gs-describe-thumb')).not.toBeNull();
    expect(el().querySelectorAll('.gs-describe-step')[1].textContent).toContain(
      'en.generate.describe.step_reading',
    );
    readButton().click();
    expect(readPicture).toHaveBeenCalledTimes(1);
  });

  it('replaces the picture on a second pick and lets go of the first', async () => {
    await showPicture();
    await stage();
    await stage();

    expect(objectUrls).toHaveLength(2);
    expect(revokedUrls).toEqual([objectUrls[0]]);
    expect(
      (
        el().querySelector('.gs-describe-thumb') as HTMLImageElement
      ).getAttribute('src'),
    ).toBe(objectUrls[1]);
  });

  it('clears the picture on Remove, back to the picker', async () => {
    await showPicture();
    await stage();

    chip('en.generate.describe.remove').click();
    fixture.detectChanges();
    expect(revokedUrls).toEqual([objectUrls[0]]);
    expect(el().querySelector('.gs-describe-thumb')).toBeNull();
    expect(el().querySelector('.gs-describe-open')).not.toBeNull();
    expect(readPicture).not.toHaveBeenCalled();
  });

  it('refuses a picture too large to send before the button, not after', async () => {
    preparePicture.mockResolvedValue({
      kind: 'refused',
      error: { key: 'generate.describe.too_large' },
    });
    await showPicture();
    await stage();

    expect(el().querySelector('.gs-warn')?.textContent).toContain(
      'en.generate.describe.too_large',
    );
    expect(readButton().disabled).toBe(true);
    expect(readPicture).not.toHaveBeenCalled();
  });

  it('says the reading runs as an alchemy job, and where to watch it', async () => {
    await showPicture();
    await stage();

    const note = el().querySelector('.gs-describe-alchemy') as HTMLElement;
    expect(note.textContent).toContain('en.generate.describe.runs_as_alchemy');
    const link = note.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/generate/alchemy');
  });

  it('comes back to the tab the reader last chose, findings and all', async () => {
    await showPicture();
    expect(localStorage.getItem('aihorde.prompt-draft.tab')).toBe('picture');
    // A finished reading is held by the root service, not by the card.
    findings.set({ caption: 'a dog on a couch', tags: 'dog, couch' });

    // The card is torn down with its studio and built again on the way back.
    fixture.destroy();
    build();
    fixture.componentRef.setInput('picture', true);
    fixture.componentRef.setInput('seed', 'a dog');
    fixture.detectChanges();
    await settle();
    expect(fixture.componentInstance.activeTab()).toBe('picture');
    expect(el().querySelector('.gs-describe')).not.toBeNull();
    expect(el().querySelector('.gs-describe-text')?.textContent).toContain(
      'a dog on a couch',
    );
  });

  describe('a request on its way', () => {
    const progress = (): HTMLElement | null =>
      el().querySelector('app-text-request-progress');
    const live = (): string =>
      progress()?.querySelector('[aria-live="polite"]')?.textContent ?? '';
    const pressIn = (root: HTMLElement | null, key: string): void => {
      const button = [...(root?.querySelectorAll('button') ?? [])].find(
        (candidate) => (candidate.textContent ?? '').includes(key),
      );
      if (!button) throw new Error(`no button for ${key}`);
      button.click();
    };
    const show = async (request: StoredTextRequest): Promise<void> => {
      requests.set([request]);
      build();
      await settle();
    };

    it('says it is sending, and offers nothing to press yet', async () => {
      await show(makeRequest({ state: 'sending', hordeId: undefined }));
      expect(live()).toContain('prompt_draft.queue.sending');
      expect(progress()?.querySelectorAll('button')).toHaveLength(0);
    });

    it('gives the queue figures as a guide, and the time waited outside the announced line', async () => {
      await show(
        makeRequest({
          state: 'queued',
          figures: {
            finished: 0,
            processing: 0,
            waiting: 1,
            restarted: 0,
            queuePosition: 12,
            waitTime: 180,
            isPossible: true,
            eligibleWorkers: 3,
          },
        }),
      );
      expect(live()).toContain('prompt_draft.queue.queued');
      expect(live()).not.toContain('prompt_draft.queue.no_worker');
      expect(live()).not.toContain('prompt_draft.queue.waited');
      expect(progress()?.textContent).toContain('prompt_draft.queue.waited');
      expect(progress()?.textContent).not.toContain(
        'prompt_draft.queue.use_value',
      );
    });

    it('cancels the request on show when Cancel is pressed', async () => {
      await show(makeRequest({ state: 'queued', localId: 'live-9' }));
      pressIn(progress(), 'prompt_draft.queue.cancel');
      expect(cancel).toHaveBeenCalledWith('live-9');

      cancelling.set(new Set(['live-9']));
      fixture.detectChanges();
      expect(progress()?.textContent).toContain(
        'prompt_draft.queue.cancelling',
      );
    });

    it('says a worker is writing it, and how many takes are done', async () => {
      await show(
        makeRequest({
          state: 'writing',
          takes: 3,
          figures: {
            finished: 1,
            processing: 1,
            waiting: 1,
            restarted: 0,
            queuePosition: 0,
            waitTime: 20,
            isPossible: true,
          },
        }),
      );
      expect(live()).toContain('prompt_draft.queue.writing');
      expect(progress()?.textContent).toContain('prompt_draft.queue.cancel');
    });

    it('says when no worker can run it, and sends it again with the pick pressed', async () => {
      const waiting = makeRequest({
        state: 'queued',
        input: { prompt: 'a dog', note: 'at night' },
        takes: 2,
        anonymous: false,
        origin: 'studio',
        figures: {
          finished: 0,
          processing: 0,
          waiting: 2,
          restarted: 0,
          queuePosition: 3,
          waitTime: 0,
          isPossible: false,
          eligibleWorkers: 0,
          mightStall: true,
        },
      });
      await show(waiting);
      expect(live()).toContain('prompt_draft.queue.no_worker');
      expect(live()).toContain('prompt_draft.queue.queued_position');
      expect(live()).toContain('prompt_draft.queue.might_stall');

      pressIn(progress(), 'prompt_draft.queue.use_any');
      await settle();
      expect(submit).toHaveBeenCalledWith(
        { prompt: 'a dog', note: 'at night' },
        'any',
        expect.anything(),
        {
          anonymous: false,
          origin: 'studio',
          context: { kind: 'studio' },
          replace: true,
          quotedKudos: null,
        },
        { style: null, takes: 2 },
      );
      expect(fixture.componentInstance.pick()).toBe('any');

      pressIn(progress(), 'prompt_draft.queue.use_value');
      await settle();
      expect(submit.mock.calls.at(-1)?.[1]).toBe('auto');
    });

    it('shows what was written before a cancel, and says what it cost', async () => {
      await show(
        doneRequest(['a dog on a couch'], [], {
          state: 'cancelled',
          anonymous: false,
        }),
      );
      expect(live()).toContain('prompt_draft.queue.cancelled');
      expect(
        el().querySelector('.alchemy-draft__text')?.textContent?.trim(),
      ).toBe('a dog on a couch');
      // The line naming the writer and price belongs to a finished request.
      expect(el().querySelector('.alchemy-draft__meta')).toBeNull();
      pressIn(progress(), 'prompt_draft.again');
      await settle();
      expect(submit).toHaveBeenCalledTimes(1);
    });

    it('says an anonymous cancel cost the reader nothing', async () => {
      await show(makeRequest({ state: 'cancelled', results: [] }));
      expect(live()).toContain('prompt_draft.queue.cancelled_anonymous');
    });

    it('says the horde gave up, and offers the other model choices', async () => {
      await show(makeRequest({ state: 'expired' }));
      expect(live()).toContain('prompt_draft.queue.expired');
      expect(progress()?.textContent).toContain('prompt_draft.queue.use_value');
      expect(progress()?.textContent).toContain('prompt_draft.again');
      expect(progress()?.textContent).not.toContain(
        'prompt_draft.queue.cancel',
      );
    });

    it('says a request failed on the worker, or was lost with the page', async () => {
      await show(makeRequest({ state: 'faulted' }));
      expect(live()).toContain('prompt_draft.faulted');

      requests.set([
        makeRequest({ state: 'faulted', errorKey: 'prompt_draft.queue.lost' }),
      ]);
      fixture.detectChanges();
      expect(live()).toContain('prompt_draft.queue.lost');
    });

    it('asks before cancelling a waiting request to send another', async () => {
      await show(makeRequest({ state: 'queued' }));
      const ask = (): HTMLElement | null =>
        el().querySelector('.alchemy-draft__replace');

      await fixture.componentInstance.draft();
      fixture.detectChanges();
      expect(submit).not.toHaveBeenCalled();
      expect(ask()?.textContent).toContain('prompt_draft.queue.replace_ask');

      pressIn(ask(), 'prompt_draft.queue.replace_no');
      fixture.detectChanges();
      expect(ask()).toBeNull();
      expect(submit).not.toHaveBeenCalled();

      await fixture.componentInstance.draft();
      fixture.detectChanges();
      pressIn(ask(), 'prompt_draft.queue.replace_yes');
      await settle();
      expect(submit.mock.calls.at(-1)?.[3]).toMatchObject({ replace: true });
      expect(ask()).toBeNull();
    });

    it('checks its requests at the quicker pace only while open', async () => {
      requests.set([]);
      build();
      await settle();
      expect(watch).toHaveBeenCalledWith({ kind: 'studio' });
      expect(release).not.toHaveBeenCalled();

      fixture.componentInstance.toggleOpen();
      fixture.detectChanges();
      await settle();
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('says a request is still waiting when the card is folded', async () => {
      requests.set([makeRequest({ state: 'queued' })]);
      build();
      await settle();
      fixture.componentInstance.toggleOpen();
      fixture.detectChanges();
      const summary = (): string =>
        el().querySelector('.alchemy-result__summary')?.textContent ?? '';
      expect(summary()).toContain('prompt_draft.queue.folded_live');

      requests.set([doneRequest(['a dog on a couch'])]);
      fixture.detectChanges();
      expect(summary()).not.toContain('prompt_draft.queue.folded_live');
    });

    it('reads the past drafts again once the request on show lands', async () => {
      await show(makeRequest({ state: 'writing' }));
      const calls = list.mock.calls.length;
      requests.set([doneRequest(['a dog'])]);
      fixture.detectChanges();
      await settle();
      expect(list.mock.calls.length).toBeGreaterThan(calls);
    });
  });
});
