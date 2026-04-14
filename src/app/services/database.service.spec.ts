import { TestBed } from '@angular/core/testing';
import { DatabaseService, StorageType } from './database.service';

describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(DatabaseService);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // ===========================================================================
  // Ephemeral storage – in-memory only
  // ===========================================================================

  describe('Ephemeral storage', () => {
    it('stores and retrieves a value', () => {
      service.store('key', 'hello', StorageType.Ephemeral);
      expect(service.get('key', StorageType.Ephemeral)).toBe('hello');
    });

    it('returns null for a missing key', () => {
      expect(service.get('missing', StorageType.Ephemeral)).toBeNull();
    });

    it('overwrites an existing value', () => {
      service.store('k', 1, StorageType.Ephemeral);
      service.store('k', 2, StorageType.Ephemeral);
      expect(service.get('k', StorageType.Ephemeral)).toBe(2);
    });

    it('does not leak into session or permanent storage', () => {
      service.store('eph', 'data', StorageType.Ephemeral);
      expect(sessionStorage.getItem('eph')).toBeNull();
      expect(localStorage.getItem('eph')).toBeNull();
    });
  });

  // ===========================================================================
  // Session storage
  // ===========================================================================

  describe('Session storage', () => {
    it('stores and retrieves a value via sessionStorage', () => {
      service.store('sess', { n: 42 }, StorageType.Session);
      expect(service.get('sess', StorageType.Session)).toEqual({ n: 42 });
    });

    it('serialises the value as JSON', () => {
      service.store('sess', [1, 2, 3], StorageType.Session);
      expect(sessionStorage.getItem('sess')).toBe('[1,2,3]');
    });

    it('returns null for a missing key', () => {
      expect(service.get('no-key', StorageType.Session)).toBeNull();
    });
  });

  // ===========================================================================
  // Permanent (localStorage) storage
  // ===========================================================================

  describe('Permanent storage', () => {
    it('stores and retrieves a value via localStorage', () => {
      service.store('perm', 'persisted');
      expect(service.get('perm')).toBe('persisted');
    });

    it('serialises the value as JSON', () => {
      service.store('perm', true);
      expect(localStorage.getItem('perm')).toBe('true');
    });

    it('returns null for a missing key', () => {
      expect(service.get('nope')).toBeNull();
    });

    it('is the default storage type', () => {
      service.store('default-test', 'val');
      expect(localStorage.getItem('default-test')).toBe('"val"');
    });
  });

  // ===========================================================================
  // Default value handling
  // ===========================================================================

  describe('default values', () => {
    it('returns the provided default when key is missing (permanent)', () => {
      expect(service.get('missing', 'fallback')).toBe('fallback');
    });

    it('returns the stored value instead of default when present', () => {
      service.store('exists', 'real');
      expect(service.get('exists', 'fallback')).toBe('real');
    });

    it('returns the provided default with explicit storage type', () => {
      expect(service.get('missing', 'def', StorageType.Session)).toBe('def');
    });
  });

  // ===========================================================================
  // Type preservation
  // ===========================================================================

  describe('type preservation through JSON round-trip', () => {
    it('preserves numbers', () => {
      service.store('num', 3.14);
      // Must pass explicit StorageType to avoid numeric default being
      // misinterpreted as a StorageType enum value.
      expect(service.get<number>('num', -1, StorageType.Permanent)).toBe(3.14);
    });

    it('preserves booleans', () => {
      service.store('bool', false);
      expect(service.get<boolean>('bool', true)).toBe(false);
    });

    it('preserves arrays', () => {
      service.store('arr', [1, 'two', null]);
      expect(service.get('arr', [])).toEqual([1, 'two', null]);
    });

    it('preserves nested objects', () => {
      const data = { a: { b: { c: 1 } } };
      service.store('obj', data);
      expect(service.get('obj', {})).toEqual(data);
    });
  });
});
