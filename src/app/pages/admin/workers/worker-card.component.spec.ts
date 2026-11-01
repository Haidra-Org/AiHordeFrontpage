import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { WorkerCardComponent } from './worker-card.component';
import { AuthService } from '../../../services/auth.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { GlossaryService } from '../../../services/glossary.service';
import { ToastService } from '../../../services/toast.service';
import { UnitConversionService } from '../../../services/unit-conversion.service';
import { EndpointAvailability } from '../../../types/moderation';
import { HordeWorker } from '../../../types/horde-worker';

function makeWorker(overrides: Partial<HordeWorker> = {}): HordeWorker {
  return {
    type: 'image',
    name: 'WorkerOne',
    id: 'worker-1',
    online: true,
    requests_fulfilled: 12,
    kudos_rewards: 34,
    performance: '1.5 megapixelsteps per second',
    threads: 2,
    uptime: 100,
    maintenance_mode: false,
    paused: false,
    nsfw: false,
    trusted: false,
    flagged: false,
    suspicious: 7,
    uncompleted_jobs: 1,
    bridge_agent: 'agent',
    ...overrides,
  };
}

describe('WorkerCardComponent', () => {
  let fixture: ComponentFixture<WorkerCardComponent>;
  let getWorkerSuspicionEvents: ReturnType<typeof vi.fn>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (
    isModerator: boolean,
    prompts: EndpointAvailability = 'unknown',
    worker: HordeWorker = makeWorker(),
  ): Promise<void> => {
    getWorkerSuspicionEvents = vi.fn(() =>
      of({ events: [], next_cursor: null }),
    );
    await TestBed.configureTestingModule({
      imports: [
        WorkerCardComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              'admin.workers.chat.features_count':
                '{{ declared }} of {{ total }} declared',
            },
          },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: signal(null) },
        },
        { provide: AdminWorkerService, useValue: {} },
        {
          provide: AdminModerationService,
          useValue: {
            workerSuspicionEventsAvailability:
              signal<EndpointAvailability>('unknown'),
            promptEventsAvailability: signal<EndpointAvailability>(prompts),
            getWorkerSuspicionEvents,
          },
        },
        { provide: GlossaryService, useValue: { open: vi.fn() } },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn() },
        },
        {
          provide: UnitConversionService,
          useValue: {
            parseWorkerPerformance: () => 0,
            formatWorkerPerformanceImage: () => null,
            formatWorkerPerformanceText: () => null,
            formatWorkerMegapixelstepsGenerated: () => null,
            formatWorkerTokensGenerated: () => null,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkerCardComponent);
    fixture.componentRef.setInput('worker', worker);
    fixture.componentRef.setInput('isModerator', isModerator);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('shows neither the suspicion count nor its history to others', async () => {
    await render(false);

    expect(host().textContent).not.toContain('admin.workers.card.suspicion');
    expect(host().querySelector('app-suspicion-history')).toBeNull();
    expect(getWorkerSuspicionEvents).not.toHaveBeenCalled();
  });

  it('links moderators to the reports the worker made once the prompt log answers', async () => {
    await render(true);
    expect(host().querySelector('[data-prompts-link]')).toBeNull();
    TestBed.resetTestingModule();

    await render(true, 'available');
    const link = host().querySelector('[data-prompts-link]');
    expect(link?.getAttribute('href')).toContain('/admin/review?');
    expect(link?.getAttribute('href')).toContain('tab=prompts');
    expect(link?.getAttribute('href')).toContain('worker_id=worker-1');
  });

  it('never links others to the reports', async () => {
    await render(false, 'available');
    expect(host().querySelector('[data-prompts-link]')).toBeNull();
  });

  it('shows moderators the count, with the history folded and unread', async () => {
    await render(true);

    const row = Array.from(host().querySelectorAll('.worker-card-row')).find(
      (el) => el.textContent?.includes('admin.workers.card.suspicion'),
    );
    expect(row?.textContent).toContain('7');
    expect(host().querySelector('.suspicion-disclosure')).not.toBeNull();
    expect(getWorkerSuspicionEvents).not.toHaveBeenCalled();
  });

  it("reads the worker's history when a moderator opens it", async () => {
    await render(true);

    host()
      .querySelector<HTMLButtonElement>('.suspicion-disclosure-head')
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(getWorkerSuspicionEvents).toHaveBeenCalledTimes(1);
    expect(getWorkerSuspicionEvents).toHaveBeenCalledWith(
      expect.objectContaining({ worker_id: 'worker-1' }),
    );
  });

  const textWorker = (overrides: Partial<HordeWorker> = {}): HordeWorker =>
    makeWorker({
      type: 'text',
      performance: '10 tokens per second',
      models: ['koboldcpp/Model-A'],
      max_context_length: 8192,
      max_length: 512,
      ...overrides,
    });

  const chatWorker = (overrides: Partial<HordeWorker> = {}): HordeWorker =>
    textWorker({
      accepts_chat_jobs: true,
      accepts_prompt_jobs: true,
      nonconformant_replies: 3,
      chat: {
        model_id: 'koboldcpp/Model-A',
        features: ['json_schema', 'prompt_overflow_refused', 'seed', 'vision'],
        limits: {
          max_context_length: 16384,
          max_length: 1024,
          tools_max_temperature: 1.0,
        },
        image_transports: ['base64', 'messages_url'],
      },
      ...overrides,
    });

  const capabilities = (): HTMLElement | null =>
    host().querySelector('[data-text-capabilities]');

  const chatSection = (): HTMLElement | null =>
    host().querySelector('[data-chat-section]');

  const limitsRow = (kind: 'prompt' | 'chat'): string | null => {
    const row = host().querySelector(`[data-limits="${kind}"]`);
    if (!row) return null;
    return Array.from(row.children)
      .map((cell) => cell.textContent?.trim())
      .join(' ');
  };

  const jobKind = (kind: string): Element | null =>
    host().querySelector(`[data-job-kind="${kind}"]`);

  const chatToggle = (): HTMLButtonElement | null =>
    host().querySelector<HTMLButtonElement>('[data-chat-toggle]');

  /** Opens the folded chat features so their badges render. */
  const openChatFeatures = async (): Promise<void> => {
    chatToggle()?.click();
    fixture.detectChanges();
    await fixture.whenStable();
  };

  /** Each group's names, with the undeclared ones marked by a leading `-`. */
  const groups = (): Record<string, string[]> =>
    Object.fromEntries(
      Array.from(host().querySelectorAll('[data-chat-group]')).map((group) => [
        group.getAttribute('data-chat-group'),
        Array.from(group.querySelectorAll('[data-chat-capability]')).map(
          (badge) =>
            (badge.getAttribute('data-declared') === 'true' ? '' : '-') +
            badge.getAttribute('data-chat-capability'),
        ),
      ]),
    );

  it("lists a chat worker's job kinds and the limits for each", async () => {
    await render(false, 'unknown', chatWorker());

    expect(host().querySelector('[data-chat-indicator]')).not.toBeNull();
    expect(jobKind('prompt')?.getAttribute('data-declared')).toBe('true');
    expect(jobKind('chat')?.getAttribute('data-declared')).toBe('true');
    expect(limitsRow('prompt')).toBe(
      'admin.workers.text.prompt_jobs 8,192 512',
    );
    expect(limitsRow('chat')).toBe('admin.workers.text.chat_jobs 16,384 1,024');
    expect(capabilities()?.textContent).toContain(
      'admin.workers.chat.tools_max_temperature',
    );
    expect(host().querySelector('[data-chat-only]')).toBeNull();
  });

  it('folds the chat features by default and counts the declared names in the head', async () => {
    await render(false, 'unknown', chatWorker());

    expect(chatToggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(host().querySelector('app-chat-capabilities')).toBeNull();
    expect(host().querySelector('[data-chat-count]')?.textContent?.trim()).toBe(
      '6 of 16 declared',
    );

    await openChatFeatures();
    expect(chatToggle()?.getAttribute('aria-expanded')).toBe('true');
    expect(chatToggle()?.getAttribute('aria-controls')).toBeTruthy();
    expect(host().querySelector('app-chat-capabilities')).not.toBeNull();
    const listed = host().querySelectorAll('[data-chat-capability]');
    const declared = host().querySelectorAll(
      '[data-chat-capability][data-declared="true"]',
    );
    expect(listed.length).toBe(16);
    expect(declared.length).toBe(6);
  });

  it('counts a declared name without a description in both numbers', async () => {
    const worker = chatWorker();
    worker.chat = { ...worker.chat!, features: ['seed', 'future_feature'] };
    await render(false, 'unknown', worker);

    expect(host().querySelector('[data-chat-count]')?.textContent?.trim()).toBe(
      '4 of 17 declared',
    );
  });

  it('groups every chat feature, guarantee and image transport and marks the undeclared ones', async () => {
    await render(false, 'unknown', chatWorker());
    await openChatFeatures();

    expect(groups()).toEqual({
      sampling: [
        'seed',
        '-presence_penalty',
        '-frequency_penalty',
        '-reasoning_effort',
      ],
      images: ['vision', '-url', 'base64', 'messages_url'],
      tools: ['-tools', '-tools_with_response_format'],
      format: ['-json_object', 'json_schema'],
      guarantees: [
        '-tool_choice_enforced',
        '-single_tool_call_enforced',
        '-structured_output_enforced',
        'prompt_overflow_refused',
      ],
    });
    const off = host().querySelector('[data-chat-capability="tools"]');
    expect(off?.classList).toContain('worker-cap--off');
    expect(off?.getAttribute('aria-label')).toBe(
      'admin.workers.chat.capability_off',
    );
  });

  it('labels each chat badge in words and keeps the API name for its tooltip', async () => {
    await render(false, 'unknown', chatWorker());
    await openChatFeatures();

    const seed = host().querySelector('[data-chat-capability="seed"]');
    expect(seed?.textContent?.trim()).toBe(
      'admin.workers.chat.feature.seed.title',
    );
    expect(
      host().querySelector(
        '[data-chat-capability="prompt_overflow_refused"] app-icon[name="badge-check"]',
      ),
    ).not.toBeNull();
    expect(
      host().querySelector('[data-chat-capability="seed"] app-icon'),
    ).toBeNull();
  });

  it('shows the chat model only when the card does not already show it', async () => {
    await render(false, 'unknown', chatWorker());
    expect(capabilities()?.textContent).not.toContain(
      'admin.workers.chat.model',
    );
    TestBed.resetTestingModule();

    await render(
      false,
      'unknown',
      chatWorker({ models: ['koboldcpp/Model-A', 'koboldcpp/Model-B'] }),
    );
    expect(capabilities()?.textContent).toContain('admin.workers.chat.model');
    expect(capabilities()?.textContent).toContain('koboldcpp/Model-A');
  });

  it('notes once that a chat-only worker does not take plain text jobs and omits their limits', async () => {
    await render(false, 'unknown', chatWorker({ accepts_prompt_jobs: false }));

    expect(jobKind('prompt')?.classList).toContain('worker-cap--off');
    expect(host().querySelectorAll('[data-chat-only]').length).toBe(1);
    expect(limitsRow('prompt')).toBeNull();
    expect(limitsRow('chat')).not.toBeNull();
  });

  it('reports reading images only with vision and a url or base64 transport', async () => {
    await render(false, 'unknown', chatWorker());
    expect(jobKind('images')?.getAttribute('data-declared')).toBe('true');
    TestBed.resetTestingModule();

    const onlyMessages = chatWorker();
    onlyMessages.chat = {
      ...onlyMessages.chat!,
      image_transports: ['messages_url'],
    };
    await render(false, 'unknown', onlyMessages);
    expect(jobKind('images')?.getAttribute('data-declared')).toBe('false');
    expect(jobKind('images')?.classList).toContain('worker-cap--off');
  });

  it('lists an undescribed name under Other, without a description', async () => {
    const worker = chatWorker();
    worker.chat = { ...worker.chat!, features: ['seed', 'future_feature'] };
    await render(false, 'unknown', worker);
    await openChatFeatures();

    expect(groups()['other']).toEqual(['future_feature']);
    const unknown = host().querySelector(
      '[data-chat-capability="future_feature"]',
    );
    expect(unknown?.textContent?.trim()).toBe('future_feature');
    expect(unknown?.hasAttribute('tabindex')).toBe(false);
  });

  it('counts refused replies beside the other job counters on a chat worker', async () => {
    await render(false, 'unknown', chatWorker());
    expect(
      host().querySelector('[data-nonconformant-replies]')?.textContent,
    ).toContain('3');
  });

  it('keeps an earlier refused-reply count on a worker that no longer takes chat jobs', async () => {
    await render(
      false,
      'unknown',
      textWorker({ accepts_chat_jobs: false, nonconformant_replies: 0 }),
    );
    expect(host().querySelector('[data-nonconformant-replies]')).toBeNull();
    TestBed.resetTestingModule();

    await render(
      false,
      'unknown',
      textWorker({ accepts_chat_jobs: false, nonconformant_replies: 2 }),
    );
    expect(
      host().querySelector('[data-nonconformant-replies]')?.textContent,
    ).toContain('2');
  });

  it('shows a text worker that does not take chat jobs with chat struck out and its plain text limits', async () => {
    await render(
      false,
      'unknown',
      textWorker({ accepts_chat_jobs: false, accepts_prompt_jobs: true }),
    );

    expect(host().querySelector('[data-chat-indicator]')).toBeNull();
    expect(
      host().querySelector(
        '.worker-status-icon-muted app-worker-status-icon[type="chat"]',
      ),
    ).not.toBeNull();
    expect(jobKind('chat')?.classList).toContain('worker-cap--off');
    expect(limitsRow('prompt')).toBe(
      'admin.workers.text.prompt_jobs 8,192 512',
    );
    expect(limitsRow('chat')).toBeNull();
    expect(chatSection()).toBeNull();
  });

  it('badges the name with the text section the worker belongs to', async () => {
    const kind = (): string | null =>
      host()
        .querySelector('.worker-card-kind')
        ?.getAttribute('data-text-kind') ?? null;

    const show = (worker: HordeWorker): void => {
      fixture.componentRef.setInput('worker', worker);
      fixture.detectChanges();
    };

    await render(false, 'unknown', chatWorker());
    expect(kind()).toBe('chat');

    show(chatWorker({ accepts_prompt_jobs: false }));
    expect(kind()).toBe('chat_only');

    show(textWorker({ accepts_chat_jobs: false }));
    expect(kind()).toBe('text');

    show(textWorker());
    expect(kind()).toBeNull();

    show(makeWorker());
    expect(kind()).toBeNull();
  });

  it('shows only plain text limits when the horde does not send the job kinds', async () => {
    await render(false, 'unknown', textWorker());

    expect(
      host().querySelector('app-worker-status-icon[type="chat"]'),
    ).toBeNull();
    expect(jobKind('prompt')).toBeNull();
    expect(limitsRow('prompt')).toBe(
      'admin.workers.text.prompt_jobs 8,192 512',
    );
    expect(chatSection()).toBeNull();
    expect(host().querySelector('[data-nonconformant-replies]')).toBeNull();
  });

  it('does not show text capabilities on an image worker that has the counter', async () => {
    await render(false, 'unknown', makeWorker({ nonconformant_replies: 0 }));

    expect(capabilities()).toBeNull();
    expect(host().querySelector('[data-nonconformant-replies]')).toBeNull();
  });

  const bridgeLine = (): HTMLElement | null =>
    host().querySelector('[data-bridge-agent]');

  it('links the bridge name to its contact when the contact is a web address', async () => {
    await render(
      false,
      'unknown',
      makeWorker({
        bridge_agent:
          'AI Horde Worker reGen:10.1.2:https://github.com/Haidra-Org/horde-worker-reGen',
      }),
    );

    const link = bridgeLine()?.querySelector('[data-bridge-link]');
    expect(link?.getAttribute('href')).toBe(
      'https://github.com/Haidra-Org/horde-worker-reGen',
    );
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.textContent).toContain('AI Horde Worker reGen v10.1.2');
    expect(bridgeLine()?.querySelector('[data-bridge-contact]')).toBeNull();
    expect(host().textContent).not.toContain(
      'admin.workers.card.software_contact:',
    );
  });

  it('shows the bridge name and a contact that is not a web address as text', async () => {
    await render(
      false,
      'unknown',
      makeWorker({ bridge_agent: 'KoboldCpp:1.2:someone@example.com' }),
    );

    expect(bridgeLine()?.querySelector('a')).toBeNull();
    expect(bridgeLine()?.textContent).toContain('KoboldCpp v1.2');
    expect(
      bridgeLine()?.querySelector('[data-bridge-contact]')?.textContent,
    ).toBe('someone@example.com');
  });

  it('does not link a contact with a scheme other than http or https', async () => {
    await render(
      false,
      'unknown',
      makeWorker({ bridge_agent: 'Bridge:1:javascript:alert(1)' }),
    );

    expect(bridgeLine()?.querySelector('a')).toBeNull();
    expect(
      bridgeLine()?.querySelector('[data-bridge-contact]')?.textContent,
    ).toBe('javascript:alert(1)');
  });

  it('shows an unsplittable bridge agent string as written', async () => {
    await render(false, 'unknown', makeWorker({ bridge_agent: 'agent' }));

    expect(bridgeLine()?.textContent).toContain('agent');
    expect(bridgeLine()?.querySelector('a')).toBeNull();
  });

  it('leaves out the info line when the worker has not set it', async () => {
    await render(false);
    expect(host().querySelector('[data-worker-info]')).toBeNull();
    expect(host().textContent).not.toContain('admin.workers.card.info');
    TestBed.resetTestingModule();

    await render(false, 'unknown', makeWorker({ info: 'RX 6600 8GB' }));
    expect(host().querySelector('[data-worker-info]')?.textContent).toContain(
      'RX 6600 8GB',
    );
  });

  it('keeps an unset info line for a moderator, who can set it', async () => {
    await render(true);

    const info = host().querySelector('[data-worker-info]');
    expect(info?.querySelector('button')?.textContent).toContain(
      'admin.workers.button.set_info',
    );
  });

  it('does not repeat the worker type in a row, and labels the type icon with it', async () => {
    await render(false, 'unknown', textWorker());

    expect(host().textContent).not.toContain('admin.workers.card.type');
    expect(
      host().querySelector('[data-worker-type]')?.getAttribute('aria-label'),
    ).toBe('admin.workers.type.text_worker');
  });

  it('lists the counters as label and value pairs', async () => {
    await render(false);

    const pairs = Array.from(host().querySelectorAll('[data-stats] > div')).map(
      (pair) =>
        `${pair.querySelector('dt')?.textContent?.trim()}=${pair.querySelector('dd')?.textContent?.trim()}`,
    );
    expect(pairs).toContain('admin.workers.card.threads=2');
    expect(pairs).toContain('admin.workers.card.requests_fulfilled=12');
  });
});
