import { escapeHtml, stringifyAsJson, highlightJson } from './json-formatter';

describe('escapeHtml', () => {
  it('escapes all five HTML-special characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('leaves normal text untouched', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles an empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes characters embedded in a longer string', () => {
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });
});

describe('stringifyAsJson', () => {
  it('returns pretty-printed JSON for an object', () => {
    expect(stringifyAsJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('returns empty string for null', () => {
    expect(stringifyAsJson(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(stringifyAsJson(undefined)).toBe('');
  });

  it('handles arrays', () => {
    expect(stringifyAsJson([1, 2])).toBe('[\n  1,\n  2\n]');
  });

  it('returns empty string for circular references', () => {
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;
    expect(stringifyAsJson(obj)).toBe('');
  });
});

describe('highlightJson', () => {
  it('returns empty string for falsy input', () => {
    expect(highlightJson('')).toBe('');
  });

  it('wraps object keys in json-key spans', () => {
    const result = highlightJson('{"name": "test"}');
    expect(result).toContain('class="json-key"');
    expect(result).toContain('&quot;name&quot;');
  });

  it('wraps string values in json-string spans', () => {
    const result = highlightJson('{"k": "val"}');
    expect(result).toContain('class="json-string"');
  });

  it('wraps numbers in json-number spans', () => {
    const result = highlightJson('{"n": 42}');
    expect(result).toContain('<span class="json-number">42</span>');
  });

  it('wraps booleans in json-boolean spans', () => {
    const result = highlightJson('{"b": true}');
    expect(result).toContain('<span class="json-boolean">true</span>');
  });

  it('wraps null in json-null span', () => {
    const result = highlightJson('{"x": null}');
    expect(result).toContain('<span class="json-null">null</span>');
  });

  it('escapes HTML in keys to prevent XSS', () => {
    const result = highlightJson('{"<script>": "safe"}');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes HTML in string values to prevent XSS', () => {
    const result = highlightJson('{"k": "<img onerror=alert(1)>"}');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });

  it('handles negative and scientific notation numbers', () => {
    const result = highlightJson('{"a": -3.14, "b": 1e10}');
    expect(result).toContain('class="json-number"');
    expect(result).toContain('-3.14');
    expect(result).toContain('1e10');
  });
});
