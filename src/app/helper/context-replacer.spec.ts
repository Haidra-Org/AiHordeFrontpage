import { replaceContext } from './context-replacer';

describe('replaceContext()', () => {
  it('replaces placeholders in target fields with context values', () => {
    const obj = { greeting: 'Hello {name}!', name: 'Alice' };
    const result = replaceContext(obj, ['greeting']);
    expect(result.greeting).toBe('Hello Alice!');
  });

  it('does not mutate the original object', () => {
    const obj = { text: '{x}', x: 'val' };
    const result = replaceContext(obj, ['text']);
    expect(obj.text).toBe('{x}');
    expect(result.text).toBe('val');
  });

  it('replaces multiple placeholders in one field', () => {
    const obj = { msg: '{a} and {b}', a: 'X', b: 'Y' };
    const result = replaceContext(obj, ['msg']);
    expect(result.msg).toBe('X and Y');
  });

  it('replaces same placeholder multiple times', () => {
    const obj = { msg: '{x} + {x}', x: '1' };
    const result = replaceContext(obj, ['msg']);
    expect(result.msg).toBe('1 + 1');
  });

  it('skips non-string target fields', () => {
    const obj = { count: 42 as unknown as string, x: 'val' };
    const result = replaceContext(obj, ['count']);
    expect(result.count).toBe(42);
  });

  it('uses a sub-key as context source when provided', () => {
    const obj = {
      template: 'Color is {color}',
      ctx: { color: 'red' } as unknown as string,
    };
    const result = replaceContext(obj, ['template'], 'ctx');
    expect(result.template).toBe('Color is red');
  });

  it('leaves unmatched placeholders untouched', () => {
    const obj = { text: '{missing}', other: 'val' };
    const result = replaceContext(obj, ['text']);
    expect(result.text).toBe('{missing}');
  });
});
