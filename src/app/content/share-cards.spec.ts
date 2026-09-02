import { describe, expect, it } from 'vitest';
import { environment } from '../../environments/environment';
import { settingSweepStrip } from './settings';
import {
  settingCardUrl,
  siteCardUrl,
  sweepCardUrl,
  tutorialCardUrl,
} from './share-cards';

describe('share cards', () => {
  it('addresses every card absolutely, under the promo base', () => {
    for (const url of [
      siteCardUrl(),
      sweepCardUrl('steps'),
      tutorialCardUrl('inpainting'),
    ]) {
      expect(url).toMatch(/^https?:\/\//);
      expect(url.startsWith(environment.promoBaseUrl)).toBe(true);
    }
  });

  it('names a card by its strip parameter or its flow', () => {
    expect(sweepCardUrl('cfg_scale')).toMatch(/\/sweeps\/cfg_scale\.jpg$/);
    expect(tutorialCardUrl('qr_code')).toMatch(/\/tutorials\/qr_code\.jpg$/);
  });

  it('gives a settings entry its strip card, and the site card where it has no strip', () => {
    const strip = settingSweepStrip('steps');
    expect(strip).not.toBeNull();
    expect(settingCardUrl('steps')).toBe(sweepCardUrl(strip as string));
    expect(settingCardUrl('not-a-setting')).toBe(siteCardUrl());
  });
});
