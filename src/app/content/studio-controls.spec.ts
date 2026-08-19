import { describe, expect, it } from 'vitest';
import { STUDIO_CONTROLS } from './studio-controls';
import { APP_ICONS } from '../icons';
import en from '../../assets/i18n/en.json';

const translations = en as Record<string, string>;

describe('STUDIO_CONTROLS', () => {
  it('names each control once', () => {
    const ids = STUDIO_CONTROLS.map((control) => control.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(15);
  });

  it('draws the glyph the control itself draws', () => {
    const missing = STUDIO_CONTROLS.filter(
      (control) => !APP_ICONS[control.icon],
    ).map((control) => control.id);
    expect(missing).toEqual([]);
  });

  it('says what each one is and what it does, in English', () => {
    for (const control of STUDIO_CONTROLS) {
      expect(control.labelKey).toBe(
        `help.glossary.controls.${control.id}.title`,
      );
      expect(control.bodyKey).toBe(`help.glossary.controls.${control.id}.body`);
    }
    const unwritten = STUDIO_CONTROLS.filter(
      (control) =>
        !translations[control.labelKey] || !translations[control.bodyKey],
    ).map((control) => control.id);
    expect(unwritten).toEqual([]);
  });

  it('opens with the tools that sit beside the panel title', () => {
    expect(STUDIO_CONTROLS.slice(0, 4).map((control) => control.id)).toEqual([
      'presets',
      'reset',
      'request_view',
      'panel_size',
    ]);
  });

  it('says of Start over that it asks before it clears anything', () => {
    expect(translations['help.glossary.controls.reset.body']).toMatch(/asks/i);
  });
});
