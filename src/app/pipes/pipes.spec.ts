import { StripWrapperTagPipe } from './strip-wrapper-tag.pipe';
import { CutPipe } from './cut.pipe';
import { ReplacePipe } from './replace.pipe';
import { ShiftDecimalsLeftPipe } from './shift-decimals-left.pipe';

describe('StripWrapperTagPipe', () => {
  const pipe = new StripWrapperTagPipe();

  it('strips a wrapping <p> tag from marked output', () => {
    // marked adds a trailing newline; the pipe accounts for it with -1
    expect(pipe.transform('<p>Hello</p>\n')).toBe('Hello');
  });

  it('strips a simple wrapping tag', () => {
    expect(pipe.transform('<em>word</em>\n')).toBe('word');
  });

  it('returns value unchanged when it does not start with <', () => {
    expect(pipe.transform('no tag here')).toBe('no tag here');
  });

  it('returns value unchanged for incomplete tags', () => {
    expect(pipe.transform('< incomplete')).toBe('< incomplete');
  });
});

describe('CutPipe', () => {
  const pipe = new CutPipe();

  it('truncates to the given length', () => {
    expect(pipe.transform('Hello World', 5)).toBe('Hello');
  });

  it('returns full string when length exceeds input', () => {
    expect(pipe.transform('Hi', 10)).toBe('Hi');
  });

  it('returns empty string for length 0', () => {
    expect(pipe.transform('anything', 0)).toBe('');
  });
});

describe('ReplacePipe', () => {
  const pipe = new ReplacePipe();

  it('replaces all occurrences', () => {
    expect(pipe.transform('a-b-c', '-', '/')).toBe('a/b/c');
  });

  it('returns original when pattern is not found', () => {
    expect(pipe.transform('hello', 'x', 'y')).toBe('hello');
  });
});

describe('ShiftDecimalsLeftPipe', () => {
  const pipe = new ShiftDecimalsLeftPipe();

  it('divides large numbers to fit within 3 digits', () => {
    // 1000000 has 7 chars; with default keep=1, loop runs while > 3 digits
    const result = pipe.transform(1000000);
    expect(result).toBeCloseTo(1, 0);
  });

  it('does not change small numbers', () => {
    expect(pipe.transform(42)).toBe(42);
  });

  it('respects keep parameter', () => {
    // keep=2 means we allow up to 6 digit integer part
    const result = pipe.transform(1000000, 2);
    // 1000000 has 7 digits > 6, so divide once → 1000
    expect(result).toBe(1000);
  });

  it('handles numbers that are already within threshold', () => {
    expect(pipe.transform(999)).toBe(999);
  });
});
