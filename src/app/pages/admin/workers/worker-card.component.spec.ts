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

describe('WorkerCardComponent suspicion', () => {
  let fixture: ComponentFixture<WorkerCardComponent>;
  let getWorkerSuspicionEvents: ReturnType<typeof vi.fn>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (
    isModerator: boolean,
    prompts: EndpointAvailability = 'unknown',
  ): Promise<void> => {
    getWorkerSuspicionEvents = vi.fn(() =>
      of({ events: [], next_cursor: null }),
    );
    await TestBed.configureTestingModule({
      imports: [
        WorkerCardComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
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
    fixture.componentRef.setInput('worker', makeWorker());
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
});
