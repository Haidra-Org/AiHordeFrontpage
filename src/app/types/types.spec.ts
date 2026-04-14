import {
  getFilterTypeLabel,
  getFilterTypeOptions,
  FILTER_TYPE_LABELS,
} from './filter';
import { isImageStyle, isTextStyle } from './style';
import { ApiError } from './api-error';

describe('filter type utilities', () => {
  describe('getFilterTypeLabel()', () => {
    it('returns known label for type 10', () => {
      expect(getFilterTypeLabel(10)).toBe('CSAM');
    });

    it('returns known label for type 11', () => {
      expect(getFilterTypeLabel(11)).toBe('Specific Person');
    });

    it('returns "Unknown (n)" for unrecognized types', () => {
      expect(getFilterTypeLabel(99)).toBe('Unknown (99)');
    });
  });

  describe('getFilterTypeOptions()', () => {
    it('returns an option for each defined filter type', () => {
      const opts = getFilterTypeOptions();
      expect(opts).toHaveLength(Object.keys(FILTER_TYPE_LABELS).length);
    });

    it('each option has a numeric value and a string label', () => {
      const opts = getFilterTypeOptions();
      for (const opt of opts) {
        expect(typeof opt.value).toBe('number');
        expect(typeof opt.label).toBe('string');
        expect(opt.label).toContain(String(opt.value));
      }
    });
  });
});

describe('style type guards', () => {
  describe('isImageStyle()', () => {
    it('returns true for styles with an examples array', () => {
      const imgStyle = { id: '1', examples: [], prompt: '' } as never;
      expect(isImageStyle(imgStyle)).toBe(true);
    });

    it('returns true for styles with a sharedkey field', () => {
      const imgStyle = { id: '1', sharedkey: 'key', prompt: '' } as never;
      expect(isImageStyle(imgStyle)).toBe(true);
    });

    it('returns false for plain text styles', () => {
      const txtStyle = { id: '1', prompt: '', name: 'test' } as never;
      expect(isImageStyle(txtStyle)).toBe(false);
    });
  });

  describe('isTextStyle()', () => {
    it('returns true when isImageStyle returns false', () => {
      const txtStyle = { id: '1', prompt: '', name: 'test' } as never;
      expect(isTextStyle(txtStyle)).toBe(true);
    });

    it('returns false for image styles', () => {
      const imgStyle = { id: '1', examples: [], prompt: '' } as never;
      expect(isTextStyle(imgStyle)).toBe(false);
    });
  });
});

describe('ApiError', () => {
  it('has correct name, message, status, and rc', () => {
    const err = new ApiError('Not found', 404, 'UserNotFound');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err.rc).toBe('UserNotFound');
  });

  it('has optional rc', () => {
    const err = new ApiError('Server error', 500);
    expect(err.rc).toBeUndefined();
  });
});
