import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { StatusComponent } from './status.component';
import { StatusService } from '../../services/status.service';
import { StatusAdminService } from '../../services/status-admin.service';
import { NetworkStatusService } from '../../services/network-status.service';
import { AuthService } from '../../services/auth.service';
import { TranslatorService } from '../../services/translator.service';
import { clientAgentInterceptor } from '../../services/interceptors/client-agent.interceptor';
import { HordeUser } from '../../types/horde-user';

function moderatorUser(): HordeUser {
  return { username: 'Mod#1', id: 1, kudos: 0, moderator: true };
}

function regularUser(): HordeUser {
  return { username: 'User#2', id: 2, kudos: 0, moderator: false };
}

describe('StatusComponent moderator gating', () => {
  let fixture: ComponentFixture<StatusComponent>;
  let currentUser: WritableSignal<HordeUser | null>;

  function setup(initialUser: HordeUser | null): void {
    currentUser = signal(initialUser);

    const statusMock: Partial<StatusService> = {
      getComponents: () => of(null),
      getIncidents: () => of(null),
      getMaintenance: () => of(null),
      getHistory: () => of(null),
    };

    const adminMock: Partial<StatusAdminService> = {
      getComponents: () => of([]),
      getIncidents: () => of([]),
      getMaintenance: () => of([]),
      getAlertSummary: () => of([]),
    };

    TestBed.configureTestingModule({
      imports: [
        StatusComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideHttpClient(withInterceptors([clientAgentInterceptor])),
        provideHttpClientTesting(),
        { provide: StatusService, useValue: statusMock },
        { provide: StatusAdminService, useValue: adminMock },
        {
          provide: NetworkStatusService,
          useValue: { performance: signal(null) },
        },
        { provide: AuthService, useValue: { currentUser } },
        { provide: TranslatorService, useValue: { get: () => of('') } },
      ],
    });

    fixture = TestBed.createComponent(StatusComponent);
    fixture.detectChanges();
  }

  function panelPresent(): boolean {
    return (
      fixture.nativeElement.querySelector('app-moderator-status-panel') !== null
    );
  }

  it('renders the moderator panel when the current user is a moderator', () => {
    setup(moderatorUser());
    expect(panelPresent()).toBe(true);
  });

  it('hides the moderator panel for a non-moderator user', () => {
    setup(regularUser());
    expect(panelPresent()).toBe(false);
  });

  it('hides the moderator panel when logged out', () => {
    setup(null);
    expect(panelPresent()).toBe(false);
  });

  it('reveals the panel reactively once a moderator user resolves', () => {
    setup(null);
    expect(panelPresent()).toBe(false);

    // Simulate auth finishing its async find_user fetch after page load.
    currentUser.set(moderatorUser());
    fixture.detectChanges();

    expect(panelPresent()).toBe(true);
  });
});
