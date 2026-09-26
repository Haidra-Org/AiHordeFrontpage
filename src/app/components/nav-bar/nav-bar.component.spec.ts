import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { NavBarComponent } from './nav-bar.component';

const STORAGE_KEY = 'aihorde.nav.github_stars';

describe('NavBarComponent GitHub star link', () => {
  let fixture: ComponentFixture<NavBarComponent>;
  let fetchMock: ReturnType<typeof vi.fn>;

  const starLink = (): HTMLAnchorElement =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '.github-widget a.github-star-badge',
    )!;

  const render = async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [
        NavBarComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              'nav.github_star': 'Star',
              'nav.github_star_label': 'Star AI-Horde on GitHub',
              'nav.github_star_label_count_one':
                'Star AI-Horde on GitHub, {{ count }} star',
              'nav.github_star_label_count_other':
                'Star AI-Horde on GitHub, {{ count }} stars',
            },
          },
          translocoConfig: { defaultLang: 'en', availableLangs: ['en'] },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isLoggedIn: signal(false) } },
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
    expect(link.textContent).toContain('Star');
    expect(link.getAttribute('aria-label')).toBe('Star AI-Horde on GitHub');
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
    expect(starLink().textContent).toContain('1,234');
    expect(starLink().getAttribute('aria-label')).toBe(
      'Star AI-Horde on GitHub, 1234 stars',
    );
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('1234');
  });

  it('reads a cached count without fetching', async () => {
    sessionStorage.setItem(STORAGE_KEY, '1');
    await render();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(starLink().getAttribute('aria-label')).toBe(
      'Star AI-Horde on GitHub, 1 star',
    );
  });

  it('leaves the count out when the request fails', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 403 }));
    await render();

    expect(starLink().textContent?.trim()).toBe('Star');
    expect(starLink().getAttribute('aria-label')).toBe(
      'Star AI-Horde on GitHub',
    );
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
