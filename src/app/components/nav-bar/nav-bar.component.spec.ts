import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { ModerationCountsService } from '../../services/moderation-counts.service';
import { ListCount } from '../../types/moderation';
import { NavBarComponent } from './nav-bar.component';
import { MODERATION_NAV_ID, NAV_ITEMS } from './nav-items';

const STORAGE_KEY = 'aihorde.nav.github_stars';

const moderationAvailable = signal(false);
const moderationTotal = signal<ListCount | null>(null);

describe('NavBarComponent GitHub star link', () => {
  let fixture: ComponentFixture<NavBarComponent>;
  let fetchMock: ReturnType<typeof vi.fn>;

  const starLink = (): HTMLAnchorElement =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '.github-widget a.github-star-badge',
    )!;
  /** The link's accessible name, which comes from its visible and hidden text. */
  const starName = (): string =>
    (starLink().textContent ?? '').replace(/\s+/g, ' ').trim();

  const render = async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [
        NavBarComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              'nav.github_star': 'Star',
              'nav.github_star_label': 'AI-Horde on GitHub',
              'nav.github_star_label_count_one': 'star, AI-Horde on GitHub',
              'nav.github_star_label_count_other': 'stars, AI-Horde on GitHub',
            },
          },
          translocoConfig: { defaultLang: 'en', availableLangs: ['en'] },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        // HttpClient defaults to the fetch backend. Without the testing
        // backend, icon loads would call the stubbed global fetch and break
        // the call-count checks.
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { isLoggedIn: signal(false), currentUser: signal(null) },
        },
        {
          provide: ModerationCountsService,
          useValue: {
            anyAvailable: moderationAvailable,
            total: moderationTotal,
          },
        },
        {
          provide: ThemeService,
          useValue: {
            isDark: signal(false),
            getTheme: vi.fn().mockReturnValue('system'),
            setTheme: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavBarComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  beforeEach(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.removeItem(STORAGE_KEY);
  });

  it('renders one labelled link with no script or iframe', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await render();

    const link = starLink();
    expect(link).toBeTruthy();
    expect(link.getAttribute('aria-label')).toBeNull();
    expect(starName()).toBe('Star AI-Horde on GitHub');
    const widget = link.closest('.github-widget')!;
    expect(widget.querySelector('iframe, script')).toBeNull();
    expect(document.querySelector('script[src*="buttons.github.io"]')).toBe(
      null,
    );
  });

  it('shows the count from the repository API and caches it', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ stargazers_count: 1234 }), {
        status: 200,
      }),
    );
    await render();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/Haidra-Org/AI-Horde',
    );
    expect(starName()).toBe('Star 1,234 stars, AI-Horde on GitHub');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('1234');
  });

  it('reads a cached count without fetching', async () => {
    sessionStorage.setItem(STORAGE_KEY, '1');
    await render();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(starName()).toBe('Star 1 star, AI-Horde on GitHub');
  });

  it('leaves the count out when the request fails', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 403 }));
    await render();

    expect(starLink().querySelector('.github-star-badge__count')).toBeNull();
    expect(starName()).toBe('Star AI-Horde on GitHub');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('NavBarComponent moderation entry', () => {
  const entry = NAV_ITEMS.flatMap((item) => item.children ?? []).find(
    (child) => child.id === MODERATION_NAV_ID,
  )!;

  const create = async (): Promise<NavBarComponent> => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await TestBed.configureTestingModule({
      imports: [
        NavBarComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { defaultLang: 'en', availableLangs: ['en'] },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { isLoggedIn: signal(true), currentUser: signal(null) },
        },
        {
          provide: ModerationCountsService,
          useValue: {
            anyAvailable: moderationAvailable,
            total: moderationTotal,
          },
        },
        {
          provide: ThemeService,
          useValue: {
            isDark: signal(false),
            getTheme: vi.fn().mockReturnValue('system'),
            setTheme: vi.fn(),
          },
        },
      ],
    }).compileComponents();
    return TestBed.createComponent(NavBarComponent).componentInstance;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    moderationAvailable.set(false);
    moderationTotal.set(null);
  });

  it('lives in the account menu and opens the moderator pages', () => {
    const account = NAV_ITEMS.find((item) => item.dropdownId === 'account');
    expect(account?.children).toContain(entry);
    expect(entry.routerLink).toBe('/admin/');
  });

  it('shows only once a review list has answered', async () => {
    const nav = await create();
    expect(nav.isChildVisible(entry)).toBe(false);

    moderationAvailable.set(true);
    expect(nav.isChildVisible(entry)).toBe(true);
  });

  it('carries the waiting count, floor and all, and nothing at zero', async () => {
    const nav = await create();
    moderationTotal.set({ count: 0, atLeast: false });
    expect(nav.childCount(entry)).toBeNull();

    moderationTotal.set({ count: 100, atLeast: true });
    expect(nav.childCount(entry)).toEqual({ count: 100, atLeast: true });
  });
});
