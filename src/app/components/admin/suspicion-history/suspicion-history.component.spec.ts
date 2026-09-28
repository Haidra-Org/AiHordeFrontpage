import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  SUSPICION_HISTORY_PAGE_SIZE,
  SuspicionHistoryComponent,
  SuspicionHistoryFilter,
  SuspicionHistoryMode,
} from './suspicion-history.component';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import {
  EndpointAvailability,
  WorkerSuspicionEvent,
  WorkerSuspicionEventQuery,
  WorkerSuspicionEventsPage,
} from '../../../types/moderation';

function event(id: number): WorkerSuspicionEvent {
  return {
    id,
    created: '2026-09-20T10:00:00Z',
    worker_name: `Worker ${id}`,
    reason: 'UNSAFE_IP',
    detail: `detail ${id}`,
  };
}

describe('SuspicionHistoryComponent', () => {
  let fixture: ComponentFixture<SuspicionHistoryComponent>;
  let component: SuspicionHistoryComponent;
  let availability: WritableSignal<EndpointAvailability>;
  let answer: () => Observable<WorkerSuspicionEventsPage>;
  let moderation: {
    workerSuspicionEventsAvailability: WritableSignal<EndpointAvailability>;
    getWorkerSuspicionEvents: ReturnType<
      typeof vi.fn<
        (
          query: WorkerSuspicionEventQuery,
        ) => Observable<WorkerSuspicionEventsPage>
      >
    >;
  };
  let toast: { error: ReturnType<typeof vi.fn> };

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const items = (): string[] =>
    Array.from(host().querySelectorAll('.review-history-item')).map(
      (el) => el.textContent?.trim() ?? '',
    );

  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const render = async (
    filter: SuspicionHistoryFilter,
    mode: SuspicionHistoryMode = 'section',
  ): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [
        SuspicionHistoryComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        { provide: AdminModerationService, useValue: moderation },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SuspicionHistoryComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('filter', filter);
    fixture.componentRef.setInput('mode', mode);
    await settle();
  };

  beforeEach(() => {
    availability = signal<EndpointAvailability>('unknown');
    answer = () => of({ events: [event(2), event(1)], next_cursor: 1 });
    moderation = {
      workerSuspicionEventsAvailability: availability,
      getWorkerSuspicionEvents: vi.fn(() => {
        const result = answer();
        availability.set('available');
        return result;
      }),
    };
    toast = { error: vi.fn() };
  });

  it("asks for one worker's history and lists it", async () => {
    await render({ worker_id: 'worker-1' });

    expect(moderation.getWorkerSuspicionEvents).toHaveBeenCalledWith({
      worker_id: 'worker-1',
      limit: SUSPICION_HISTORY_PAGE_SIZE,
    });
    expect(items().length).toBe(2);
    expect(items()[0]).not.toContain('Worker 2');
  });

  it("asks for an account's history and names the worker on each event", async () => {
    await render({ user_id: 42 });

    expect(moderation.getWorkerSuspicionEvents).toHaveBeenCalledWith({
      user_id: 42,
      limit: SUSPICION_HISTORY_PAGE_SIZE,
    });
    expect(items()[0]).toContain('Worker 2');
  });

  it('loads the next page from the cursor and appends it', async () => {
    await render({ worker_id: 'worker-1' });
    answer = () => of({ events: [event(0)], next_cursor: null });

    host().querySelector<HTMLButtonElement>('.review-load-more')?.click();
    await settle();

    expect(moderation.getWorkerSuspicionEvents).toHaveBeenLastCalledWith({
      worker_id: 'worker-1',
      limit: SUSPICION_HISTORY_PAGE_SIZE,
      before_id: 1,
    });
    expect(items().length).toBe(3);
    expect(host().querySelector('.review-load-more')).toBeNull();
  });

  it('reads the history again when the filter changes', async () => {
    await render({ worker_id: 'worker-1' });
    fixture.componentRef.setInput('filter', { worker_id: 'worker-2' });
    await settle();

    expect(moderation.getWorkerSuspicionEvents).toHaveBeenLastCalledWith({
      worker_id: 'worker-2',
      limit: SUSPICION_HISTORY_PAGE_SIZE,
    });
  });

  it('shows nothing and says nothing when the request never reaches the horde', async () => {
    moderation.getWorkerSuspicionEvents = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 0 })),
    );
    await render({ worker_id: 'worker-1' });

    expect(host().querySelector('section')).toBeNull();
    expect(host().textContent?.trim()).toBe('');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows nothing when the horde has no such endpoint', async () => {
    moderation.getWorkerSuspicionEvents = vi.fn(() => {
      availability.set('absent');
      return throwError(() => new HttpErrorResponse({ status: 404 }));
    });
    await render({ worker_id: 'worker-1' });

    expect(host().textContent?.trim()).toBe('');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('says the history failed, rather than that it is empty, on a refusal', async () => {
    moderation.getWorkerSuspicionEvents = vi.fn(() => {
      availability.set('available');
      return throwError(() => new HttpErrorResponse({ status: 429 }));
    });
    await render({ worker_id: 'worker-1' });

    expect(host().textContent).toContain('admin.suspicion_history.error');
    expect(host().textContent).not.toContain(
      'admin.suspicion_history.none_worker',
    );
    expect(toast.error).toHaveBeenCalled();
  });

  describe('as a disclosure', () => {
    it('asks for nothing until it is opened, and once after that', async () => {
      await render({ worker_id: 'worker-1' }, 'disclosure');
      const head = host().querySelector<HTMLButtonElement>(
        '.suspicion-disclosure-head',
      );

      expect(head).not.toBeNull();
      expect(head?.getAttribute('aria-expanded')).toBe('false');
      expect(moderation.getWorkerSuspicionEvents).not.toHaveBeenCalled();

      head?.click();
      await settle();
      expect(head?.getAttribute('aria-expanded')).toBe('true');
      expect(moderation.getWorkerSuspicionEvents).toHaveBeenCalledTimes(1);
      expect(items().length).toBe(2);

      head?.click();
      await settle();
      head?.click();
      await settle();
      expect(moderation.getWorkerSuspicionEvents).toHaveBeenCalledTimes(1);
      expect(items().length).toBe(2);
    });

    it('is not offered when the horde has no such endpoint', async () => {
      availability.set('absent');
      await render({ worker_id: 'worker-1' }, 'disclosure');

      expect(host().querySelector('.suspicion-disclosure')).toBeNull();
    });

    it('goes away when opening it never reaches the horde', async () => {
      moderation.getWorkerSuspicionEvents = vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 0 })),
      );
      await render({ user_id: 42 }, 'disclosure');

      component.toggle();
      await settle();

      expect(host().querySelector('.suspicion-disclosure')).toBeNull();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });
});
