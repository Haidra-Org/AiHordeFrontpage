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
import {
  PublicComponentsResponse,
  PublicHistoryDay,
  PublicHistoryResponse,
} from '../../types/status';

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

describe('StatusComponent service sparkline', () => {
  function day(date: string, operational: number, down = 0): PublicHistoryDay {
    return {
      date,
      status_level: down > 0 ? 2 : 0,
      operational_seconds: operational,
      degraded_seconds: 0,
      down_seconds: down,
      maintenance_seconds: 0,
      unknown_seconds: 0,
    };
  }

  function setup(
    buckets: PublicHistoryDay[],
  ): ComponentFixture<StatusComponent> {
    const components: PublicComponentsResponse = {
      components: [
        {
          id: 'api',
          name: 'AI Horde API',
          description: 'Public REST API',
          status: 'operational',
          uptime_90d: 99.9,
          last_change_at: null,
        },
      ],
      overall: 'operational',
      generated_at: '2026-06-21T00:00:00Z',
    };

    const history: PublicHistoryResponse = {
      component_id: 'api',
      days: buckets.length,
      buckets,
      uptime_percent: 99.9,
    };

    const statusMock: Partial<StatusService> = {
      getComponents: () => of(components),
      getIncidents: () => of(null),
      getMaintenance: () => of(null),
      getHistory: () => of(history),
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
        {
          provide: StatusAdminService,
          useValue: { getComponents: () => of([]) },
        },
        {
          provide: NetworkStatusService,
          useValue: { performance: signal(null) },
        },
        { provide: AuthService, useValue: { currentUser: signal(null) } },
        { provide: TranslatorService, useValue: { get: () => of('') } },
      ],
    });

    const fixture = TestBed.createComponent(StatusComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a sparkline polyline once a component history loads', () => {
    const fixture = setup([
      day('2026-06-19', 86400),
      day('2026-06-20', 80000, 6400),
      day('2026-06-21', 86400),
    ]);
    const line = fixture.nativeElement.querySelector(
      '.status-sparkline__line',
    ) as SVGPolylineElement | null;
    expect(line).not.toBeNull();
    // Three days produce three coordinate pairs in the polyline.
    expect(line?.getAttribute('points')?.trim().split(' ').length).toBe(3);
  });

  it('omits the sparkline when there is too little history to draw a line', () => {
    const fixture = setup([day('2026-06-21', 86400)]);
    expect(fixture.nativeElement.querySelector('.status-sparkline')).toBeNull();
  });
});
