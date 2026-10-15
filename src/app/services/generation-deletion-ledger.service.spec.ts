import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GenerationDeletionLedgerService } from './generation-deletion-ledger.service';

describe('GenerationDeletionLedgerService', () => {
  beforeEach(() => localStorage.clear());

  function ledger(): GenerationDeletionLedgerService {
    return TestBed.runInInjectionContext(
      () => new GenerationDeletionLedgerService(),
    );
  }

  it('shares independent deletions between existing and newly opened pages', () => {
    const first = ledger();
    const second = ledger();
    first.remember('local-a', 'horde-a');
    second.remember('local-b', 'horde-b');

    for (const page of [first, second, ledger()]) {
      expect(page.has('local-a')).toBe(true);
      expect(page.has('local-b')).toBe(true);
      expect(page.hasHordeId('horde-a')).toBe(true);
      expect(page.hasHordeId('horde-b')).toBe(true);
      expect(page.has('unknown', 'horde-a')).toBe(true);
      expect(page.has('unknown', 'unrelated')).toBe(false);
    }
  });

  it('keeps local and server ids in separate namespaces', () => {
    const page = ledger();
    page.remember('same-id');
    expect(page.hasHordeId('same-id')).toBe(false);
  });

  it('keeps suppression in memory when browser storage refuses access', () => {
    const page = ledger();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    page.remember('local-a', 'horde-a');
    expect(page.has('local-a')).toBe(true);
    expect(page.hasHordeId('horde-a')).toBe(true);
    expect(page.hasHordeId('unknown')).toBe(false);
  });

  it('does not access browser storage during SSR', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const page = ledger();
    page.remember('local-a', 'horde-a');
    expect(page.has('local-a', 'horde-a')).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
