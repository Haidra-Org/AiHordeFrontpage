import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { authGuard, unsavedChangesGuard, moderatorGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  function setup(opts: { initialized?: boolean; loggedIn?: boolean }) {
    const mockAuth = {
      isInitialized: signal(opts.initialized ?? true),
      isLoggedIn: vi.fn().mockReturnValue(opts.loggedIn ?? false),
      currentUser: signal(null),
    };

    const mockRouter = {
      createUrlTree: vi.fn(
        (segments: string[]) => segments.join('/') as unknown as UrlTree,
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
      ],
    });

    return { mockAuth, mockRouter };
  }

  it('allows access when logged in and initialized', () => {
    setup({ initialized: true, loggedIn: true });
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    );
    expect(result).toBe(true);
  });

  it('redirects to /profile when not logged in', () => {
    const { mockRouter } = setup({ initialized: true, loggedIn: false });
    TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/profile']);
  });
});

describe('unsavedChangesGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('allows navigation when component has no unsaved changes', () => {
    const component = { isDirty: () => false };
    const result = TestBed.runInInjectionContext(() =>
      unsavedChangesGuard(component, {} as never, {} as never, {} as never),
    );
    expect(result).toBe(true);
  });

  it('allows navigation when component has no isDirty method', () => {
    const result = TestBed.runInInjectionContext(() =>
      unsavedChangesGuard({} as never, {} as never, {} as never, {} as never),
    );
    expect(result).toBe(true);
  });
});

describe('moderatorGuard', () => {
  function setup(opts: {
    initialized?: boolean;
    loggedIn?: boolean;
    moderator?: boolean;
  }) {
    const user = opts.loggedIn
      ? { id: 1, username: 'test', moderator: opts.moderator ?? false }
      : null;

    const mockAuth = {
      isInitialized: signal(opts.initialized ?? true),
      isLoggedIn: vi.fn().mockReturnValue(opts.loggedIn ?? false),
      currentUser: signal(user),
    };

    const mockRouter = {
      createUrlTree: vi.fn(
        (segments: string[]) => segments.join('/') as unknown as UrlTree,
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
      ],
    });

    return { mockAuth, mockRouter };
  }

  it('allows access for moderators', () => {
    setup({ initialized: true, loggedIn: true, moderator: true });
    const result = TestBed.runInInjectionContext(() =>
      moderatorGuard({} as never, {} as never),
    );
    expect(result).toBe(true);
  });

  it('redirects to /admin for logged-in non-moderators', () => {
    const { mockRouter } = setup({
      initialized: true,
      loggedIn: true,
      moderator: false,
    });
    TestBed.runInInjectionContext(() =>
      moderatorGuard({} as never, {} as never),
    );
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/admin']);
  });

  it('redirects to /profile when not logged in', () => {
    const { mockRouter } = setup({ initialized: true, loggedIn: false });
    TestBed.runInInjectionContext(() =>
      moderatorGuard({} as never, {} as never),
    );
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/profile']);
  });
});
