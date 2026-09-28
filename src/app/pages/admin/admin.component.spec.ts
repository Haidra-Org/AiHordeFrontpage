import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AdminComponent } from './admin.component';
import { AuthService } from '../../services/auth.service';
import { FooterColorService } from '../../services/footer-color.service';
import { HordeStatusService } from '../../services/horde-status.service';
import { ModerationCountsService } from '../../services/moderation-counts.service';
import { TranslatorService } from '../../services/translator.service';
import { ListCount } from '../../types/moderation';

describe('AdminComponent', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let currentUser: WritableSignal<{
    username: string;
    moderator: boolean;
  } | null>;
  let anyAvailable: WritableSignal<boolean>;
  let total: WritableSignal<ListCount | null>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const tabLabels = (): string[] =>
    Array.from(host().querySelectorAll('.hd-subtab')).map(
      (tab) => tab.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );

  const render = async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [
        AdminComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser,
            isLoggedIn: signal(true),
          },
        },
        {
          provide: ModerationCountsService,
          useValue: { anyAvailable, total },
        },
        {
          provide: HordeStatusService,
          useValue: {
            getStatusModes: () =>
              of({
                maintenance_mode: true,
                invite_only_mode: false,
              }),
          },
        },
        { provide: FooterColorService, useValue: { setDarkMode: vi.fn() } },
        { provide: TranslatorService, useValue: { get: () => of('') } },
        { provide: Title, useValue: { setTitle: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
  };

  beforeEach(() => {
    currentUser = signal({ username: 'mod', moderator: true });
    anyAvailable = signal(true);
    total = signal<ListCount | null>({ count: 100, atLeast: true });
  });

  it('gives a moderator every tab, Review with its count', async () => {
    await render();

    expect(tabLabels()).toEqual([
      'admin.nav.dashboard',
      expect.stringContaining('admin.nav.review'),
      'admin.nav.workers',
      'admin.nav.users',
      'admin.nav.filters',
      'admin.nav.operations',
    ]);
    const review = host().querySelectorAll('.hd-subtab')[1];
    expect(review.querySelector('.admin-tab-count')).not.toBeNull();
    expect(review.textContent).toContain('admin.moderation.count_at_least');
  });

  it('leaves Review out while no review list can be shown', async () => {
    anyAvailable.set(false);
    total.set(null);
    await render();

    expect(tabLabels()).not.toContain('admin.nav.review');
    expect(tabLabels()).toContain('admin.nav.users');
  });

  it('gives an account that is not a moderator the dashboard and workers only', async () => {
    currentUser.set({ username: 'someone', moderator: false });
    await render();

    expect(tabLabels()).toEqual(['admin.nav.dashboard', 'admin.nav.workers']);
  });

  it('states each horde mode in words as well as colour', async () => {
    await render();

    const modes = Array.from(host().querySelectorAll('.admin-status-mode'));
    expect(modes.length).toBe(2);
    expect(modes[0].classList).toContain('admin-status-mode--on');
    expect(modes[0].textContent).toContain('admin.status.active');
    expect(modes[1].textContent).toContain('admin.status.inactive');
    expect(host().textContent).toContain('admin.status.title');
  });
});
