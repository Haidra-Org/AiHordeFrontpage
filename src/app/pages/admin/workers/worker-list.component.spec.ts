import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { WorkerListComponent } from './worker-list.component';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { AuthService } from '../../../services/auth.service';
import { GlossaryService } from '../../../services/glossary.service';
import { NetworkStatusService } from '../../../services/network-status.service';
import { TeamService } from '../../../services/team.service';
import { TranslatorService } from '../../../services/translator.service';
import { UnitConversionService } from '../../../services/unit-conversion.service';
import { HordeWorker } from '../../../types/horde-worker';

const FOLDED_KEY = 'workers.text_sections_folded';

function makeWorker(overrides: Partial<HordeWorker> = {}): HordeWorker {
  return {
    type: 'text',
    name: 'Worker',
    id: 'worker',
    online: true,
    requests_fulfilled: 0,
    kudos_rewards: 0,
    performance: '1 tokens per second',
    threads: 1,
    uptime: 100,
    maintenance_mode: false,
    paused: false,
    nsfw: false,
    trusted: false,
    flagged: false,
    suspicious: 0,
    uncompleted_jobs: 0,
    bridge_agent: 'agent',
    ...overrides,
  };
}

describe('WorkerListComponent text sections', () => {
  let served: HordeWorker[] = [];

  const workerService = {
    getWorkers: vi.fn(() => of(served)),
    getWorker: vi.fn(() => of(null)),
  };

  async function create(): Promise<{
    fixture: ComponentFixture<WorkerListComponent>;
    component: WorkerListComponent;
  }> {
    const fixture = TestBed.createComponent(WorkerListComponent);
    fixture.componentRef.setInput('setPageTitle', false);
    fixture.componentRef.setInput('initialWorkerType', 'text');
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, component: fixture.componentInstance };
  }

  function sectionSummary(component: WorkerListComponent): string[] {
    return component
      .workerSections()
      .map((s) => `${s.id ?? 'all'}:${s.workers.map((w) => w.id).join(',')}`);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    served = [];

    await TestBed.configureTestingModule({
      imports: [WorkerListComponent],
      providers: [
        provideRouter([]),
        { provide: AdminWorkerService, useValue: workerService },
        { provide: TeamService, useValue: { getTeams: () => of([]) } },
        {
          provide: NetworkStatusService,
          useValue: { performance: signal(null) },
        },
        {
          provide: AuthService,
          useValue: { currentUser: signal(null), isLoggedIn: signal(false) },
        },
        {
          provide: UnitConversionService,
          useValue: { parseWorkerPerformance: () => 1 },
        },
        {
          provide: GlossaryService,
          useValue: { registerPageContext: vi.fn(), clearPageContext: vi.fn() },
        },
        { provide: TranslatorService, useValue: {} },
      ],
    })
      .overrideComponent(WorkerListComponent, { set: { template: '' } })
      .compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('puts chat workers, chat-only ones included, under one heading and the rest under another', async () => {
    served = [
      makeWorker({ id: 'a', name: 'a', accepts_chat_jobs: true }),
      makeWorker({ id: 'b', name: 'b', accepts_chat_jobs: false }),
      makeWorker({
        id: 'c',
        name: 'c',
        accepts_chat_jobs: true,
        accepts_prompt_jobs: false,
      }),
      makeWorker({ id: 'd', name: 'd' }),
    ];
    const { component } = await create();

    expect(sectionSummary(component)).toEqual(['chat:a,c', 'plain:b,d']);
  });

  it('keeps search and sort working inside each section', async () => {
    served = [
      makeWorker({ id: 'a', name: 'alpha', accepts_chat_jobs: true }),
      makeWorker({ id: 'b', name: 'beta', accepts_chat_jobs: true }),
      makeWorker({ id: 'c', name: 'alpine', accepts_chat_jobs: false }),
      makeWorker({ id: 'd', name: 'alder', accepts_chat_jobs: true }),
    ];
    const { component } = await create();

    expect(sectionSummary(component)).toEqual(['chat:d,a,b', 'plain:c']);

    component.sortOrder.set('desc');
    component.filterText.set('al');

    expect(sectionSummary(component)).toEqual(['chat:a,d', 'plain:c']);
  });

  it('shows one list when the horde does not send accepts_chat_jobs', async () => {
    served = [
      makeWorker({ id: 'a', name: 'a' }),
      makeWorker({ id: 'b', name: 'b' }),
    ];
    const { component } = await create();

    expect(sectionSummary(component)).toEqual(['all:a,b']);
  });

  it('shows one list on the image tab', async () => {
    served = [
      makeWorker({ id: 'i', name: 'i', type: 'image' }),
      makeWorker({ id: 't', name: 't', accepts_chat_jobs: true }),
    ];
    const { component } = await create();

    component.setWorkerType('image');

    expect(sectionSummary(component)).toEqual(['all:i']);
  });

  it('leaves out a section without any workers', async () => {
    served = [
      makeWorker({ id: 'a', name: 'a', accepts_chat_jobs: true }),
      makeWorker({ id: 'b', name: 'b', accepts_chat_jobs: true }),
    ];
    const { component } = await create();

    expect(sectionSummary(component)).toEqual(['chat:a,b']);

    component.filterText.set('no such worker');

    expect(component.workerSections()).toEqual([]);
  });

  it('starts with both sections open', async () => {
    const { component } = await create();

    expect(component.isTextSectionOpen('chat')).toBe(true);
    expect(component.isTextSectionOpen('plain')).toBe(true);
  });

  it('remembers a folded section for the next visit', async () => {
    const first = await create();
    first.component.toggleTextSection('plain');

    expect(first.component.isTextSectionOpen('plain')).toBe(false);
    expect(localStorage.getItem(FOLDED_KEY)).toBe('["plain"]');

    first.fixture.destroy();
    const second = await create();

    expect(second.component.isTextSectionOpen('plain')).toBe(false);
    expect(second.component.isTextSectionOpen('chat')).toBe(true);

    second.component.toggleTextSection('plain');

    expect(localStorage.getItem(FOLDED_KEY)).toBe('[]');
  });

  it('opens both sections when the stored value is not a list', async () => {
    localStorage.setItem(FOLDED_KEY, '{"plain":true}');
    const { component } = await create();

    expect(component.isTextSectionOpen('plain')).toBe(true);
  });

  it('opens both sections and still folds when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { component } = await create();

    expect(component.isTextSectionOpen('chat')).toBe(true);

    component.toggleTextSection('chat');

    expect(component.isTextSectionOpen('chat')).toBe(false);
  });
});
