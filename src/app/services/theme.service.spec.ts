import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { vi } from 'vitest';
import { ThemeService } from './theme.service';

function mockMatchMedia(matches = false): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('ThemeService (browser)', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    mockMatchMedia(false);
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to system theme when no preference is stored', () => {
    expect(service.getTheme()).toBe('system');
  });

  it('setTheme updates the signal', () => {
    service.setTheme('dark');
    expect(service.theme()).toBe('dark');
  });

  it('setTheme persists to localStorage', () => {
    service.setTheme('light');
    expect(localStorage.getItem('theme-preference')).toBe('light');
  });

  it('getTheme reflects the current signal value', () => {
    service.setTheme('dark');
    expect(service.getTheme()).toBe('dark');
    service.setTheme('light');
    expect(service.getTheme()).toBe('light');
  });

  it('isDark returns true for explicit dark theme', () => {
    service.setTheme('dark');
    expect(service.isDark()).toBe(true);
  });

  it('isDark returns false for explicit light theme', () => {
    service.setTheme('light');
    expect(service.isDark()).toBe(false);
  });

  it('loads a saved preference from localStorage on construction', () => {
    localStorage.setItem('theme-preference', 'light');
    // Re-create the injector to trigger a fresh constructor
    TestBed.resetTestingModule();
    mockMatchMedia(false);
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
    const fresh = TestBed.inject(ThemeService);
    expect(fresh.getTheme()).toBe('light');
  });
});

describe('ThemeService (server / SSR)', () => {
  let service: ThemeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });
    service = TestBed.inject(ThemeService);
  });

  it('defaults to system on the server', () => {
    expect(service.getTheme()).toBe('system');
  });

  it('isDark defaults to true on server (dark default)', () => {
    expect(service.isDark()).toBe(true);
  });
});
