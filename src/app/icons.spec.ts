import { readFileSync, globSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');
const ICONS_FILE = join(__dirname, 'icons.ts');

/** Top-level `'key':` / `key:` entries of the `APP_ICONS` object literal. */
function readIconKeys(): string[] {
  const source = readFileSync(ICONS_FILE, 'utf-8');
  const matches = source.matchAll(/^\s*(?:'([^']+)'|([A-Za-z_$][\w$]*)):/gm);
  return [...matches].map((match) => match[1] ?? match[2]);
}

/**
 * The string literals passed to `<app-icon>`'s `name` input across templates,
 * either as a plain attribute or as a bound expression built from string
 * literals (e.g. a ternary). A bound expression that names a property instead
 * of a literal (e.g. `[name]="icon.name"`) carries nothing this can check
 * statically, so it is left out.
 */
function readTemplateIconNames(): string[] {
  const files = globSync('src/app/**/*.html', { cwd: REPO_ROOT });
  const names: string[] = [];
  for (const file of files) {
    const html = readFileSync(join(REPO_ROOT, file), 'utf-8');
    for (const tag of html.matchAll(/<app-icon\b[^>]*>/g)) {
      const attrs = tag[0];
      const plain = attrs.match(/\bname="([^"]+)"/);
      if (plain) {
        names.push(plain[1]);
        continue;
      }
      const bound = attrs.match(/\[name\]="([^"]*)"/);
      if (bound) {
        const expr = bound[1].trim();
        // A bare literal, or a ternary whose branches are both literals (e.g.
        // `cond ? 'a' : 'b'`); anything else names a property this cannot
        // check without evaluating the template.
        const literal = expr.match(/^'([^']+)'$/);
        const ternary = expr.match(/\?\s*'([^']+)'\s*:\s*'([^']+)'$/);
        if (literal) {
          names.push(literal[1]);
        } else if (ternary) {
          names.push(ternary[1], ternary[2]);
        }
      }
    }
  }
  return names;
}

describe('APP_ICONS registry', () => {
  it('declares no duplicate keys', () => {
    const keys = readIconKeys();
    const unique = new Set(keys);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.length).toBe(unique.size);
  });

  it('registers every icon name used by <app-icon> across the app templates', () => {
    const keys = new Set(readIconKeys());
    const used = readTemplateIconNames();
    expect(used.length).toBeGreaterThan(0);
    const missing = [...new Set(used)].filter((name) => !keys.has(name));
    expect(missing).toEqual([]);
  });
});
