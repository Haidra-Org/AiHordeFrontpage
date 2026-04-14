import {
  extractUserId,
  extractUserAlias,
  isValidUserIdInput,
} from './user-parser';

describe('user-parser', () => {
  describe('extractUserId()', () => {
    it('extracts numeric ID from alias#id format', () => {
      expect(extractUserId('MyUser#12345')).toBe(12345);
    });

    it('handles Anonymous#0', () => {
      expect(extractUserId('Anonymous#0')).toBe(0);
    });

    it('extracts from pure numeric string', () => {
      expect(extractUserId('42')).toBe(42);
    });

    it('returns null for null/undefined/empty', () => {
      expect(extractUserId(null)).toBeNull();
      expect(extractUserId(undefined)).toBeNull();
      expect(extractUserId('')).toBeNull();
    });

    it('returns null for non-numeric strings', () => {
      expect(extractUserId('just-text')).toBeNull();
    });

    it('handles aliases with special characters', () => {
      expect(extractUserId('User Name#999')).toBe(999);
    });

    it('takes the trailing #id when there are multiple hashes', () => {
      expect(extractUserId('name#with#hash#100')).toBe(100);
    });
  });

  describe('extractUserAlias()', () => {
    it('extracts alias from alias#id format', () => {
      expect(extractUserAlias('MyUser#12345')).toBe('MyUser');
    });

    it('returns original string when no #id suffix', () => {
      expect(extractUserAlias('JustAName')).toBe('JustAName');
    });

    it('returns empty string for null/undefined', () => {
      expect(extractUserAlias(null)).toBe('');
      expect(extractUserAlias(undefined)).toBe('');
    });

    it('handles alias with spaces', () => {
      expect(extractUserAlias('Cool User#42')).toBe('Cool User');
    });
  });

  describe('isValidUserIdInput()', () => {
    it('accepts pure numeric strings', () => {
      expect(isValidUserIdInput('12345')).toBe(true);
    });

    it('accepts alias#id format', () => {
      expect(isValidUserIdInput('User#42')).toBe(true);
    });

    it('rejects plain text', () => {
      expect(isValidUserIdInput('hello')).toBe(false);
    });

    it('rejects null/undefined/empty', () => {
      expect(isValidUserIdInput(null)).toBe(false);
      expect(isValidUserIdInput(undefined)).toBe(false);
      expect(isValidUserIdInput('')).toBe(false);
    });

    it('accepts when hash is followed by digits', () => {
      expect(isValidUserIdInput('x#0')).toBe(true);
    });

    it('rejects hash without trailing digits', () => {
      expect(isValidUserIdInput('x#abc')).toBe(false);
    });
  });
});
