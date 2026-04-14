import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SiPrefixPipe } from './si-prefix.pipe';
import { FormatNumberPipe } from './format-number.pipe';
import { MarkdownPipe } from './markdown.pipe';
import { TranslocoService } from '@jsverse/transloco';

describe('SiPrefixPipe', () => {
  let pipe: SiPrefixPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SiPrefixPipe,
        {
          provide: TranslocoService,
          useValue: { translate: vi.fn((key: string) => key) },
        },
      ],
    });
    pipe = TestBed.inject(SiPrefixPipe);
  });

  it('returns "none" prefix key for small numbers', () => {
    expect(pipe.transform(42)).toBe('si_prefix.none');
  });

  it('returns "kilo" prefix key for thousands', () => {
    expect(pipe.transform(5000)).toBe('si_prefix.kilo');
  });

  it('returns "mega" prefix key for millions', () => {
    expect(pipe.transform(2000000)).toBe('si_prefix.mega');
  });

  it('returns "giga" prefix key for billions', () => {
    expect(pipe.transform(3000000000)).toBe('si_prefix.giga');
  });

  it('strips decimals before computing prefix', () => {
    expect(pipe.transform(1234.567)).toBe('si_prefix.kilo');
  });

  it('respects keep parameter', () => {
    // keep=2 shifts the group count down
    expect(pipe.transform(5000000, 2)).toBe('si_prefix.kilo');
  });

  it('respects startAt parameter', () => {
    // startAt bumps the count up
    expect(pipe.transform(42, 1, 1)).toBe('si_prefix.kilo');
  });

  it('throws for unsupported prefix levels', () => {
    // Use startAt to push groupCount beyond supported range
    expect(() => pipe.transform(1000, 1, 7)).toThrow('Unsupported prefix');
  });
});

describe('FormatNumberPipe', () => {
  let pipe: FormatNumberPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FormatNumberPipe,
        {
          provide: TranslocoService,
          useValue: { getActiveLang: vi.fn(() => 'en') },
        },
      ],
    });
    pipe = TestBed.inject(FormatNumberPipe);
  });

  it('formats integer with no decimals by default', () => {
    expect(pipe.transform(1234)).toBe('1,234');
  });

  it('formats with specified decimal places', () => {
    expect(pipe.transform(1234.5, 2)).toBe('1,234.50');
  });

  it('formats zero', () => {
    expect(pipe.transform(0)).toBe('0');
  });
});

describe('MarkdownPipe', () => {
  const pipe = new MarkdownPipe();

  it('converts markdown bold to HTML', () => {
    const result = pipe.transform('**bold**');
    expect(result).toContain('<strong>bold</strong>');
  });

  it('converts markdown links to anchor tags', () => {
    const result = pipe.transform('[text](https://example.com)');
    expect(result).toContain('<a');
    expect(result).toContain('https://example.com');
  });

  it('returns paragraph wrapper for plain text', () => {
    const result = pipe.transform('plain text');
    expect(result).toContain('<p>');
  });
});
