import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import { UserModerationRecordComponent } from './user-moderation-record.component';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import { EndpointAvailability } from '../../../types/moderation';

describe('UserModerationRecordComponent', () => {
  let fixture: ComponentFixture<UserModerationRecordComponent>;
  let moderation: {
    workerSuspicionEventsAvailability: WritableSignal<EndpointAvailability>;
    getWorkerSuspicionEvents: ReturnType<typeof vi.fn>;
  };

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [
        UserModerationRecordComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AdminModerationService, useValue: moderation },
        { provide: ToastService, useValue: { error: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserModerationRecordComponent);
    fixture.componentRef.setInput('userId', 42);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    moderation = {
      workerSuspicionEventsAvailability:
        signal<EndpointAvailability>('unknown'),
      getWorkerSuspicionEvents: vi.fn(),
    };
  });

  it("offers the account's suspicion history folded, without reading it", async () => {
    await render();

    expect(host().querySelector('.suspicion-disclosure')).not.toBeNull();
    expect(moderation.getWorkerSuspicionEvents).not.toHaveBeenCalled();
  });
});
