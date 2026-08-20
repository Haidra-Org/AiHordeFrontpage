import { describe, expect, it } from 'vitest';
import {
  activeLoras,
  activeTis,
  coerceLoraSelection,
  coerceTiSelection,
  HORDE_MAX_LORAS,
  HORDE_MAX_TIS,
  loraConfigToSelection,
  manualLoraSelection,
  manualTiSelection,
  MAX_INJECT_TRIGGER_LENGTH,
  MAX_ASSET_NAME_LENGTH,
  pickDefaultVersion,
  selectionToLoraConfig,
  selectionToTiConfig,
  tiConfigToSelection,
  type LoraSelection,
  type VersionCandidate,
} from './civitai-asset';

const lora = (
  name: string,
  extra: Partial<LoraSelection> = {},
): LoraSelection => ({
  name,
  model: 1,
  clip: 1,
  ...extra,
});

describe('coercing a stored LoRA selection', () => {
  it('refuses anything without a usable name', () => {
    expect(coerceLoraSelection(null)).toBeNull();
    expect(coerceLoraSelection('nope')).toBeNull();
    expect(coerceLoraSelection({ name: '   ' })).toBeNull();
  });

  it('clamps strengths into the range the horde accepts', () => {
    const entry = coerceLoraSelection({ name: 'x', model: 99, clip: -99 });
    expect(entry).toMatchObject({ model: 5, clip: -5 });
  });

  it('defaults a strength that is missing or not a number', () => {
    expect(coerceLoraSelection({ name: 'x' })).toMatchObject({
      model: 1,
      clip: 1,
    });
    expect(
      coerceLoraSelection({ name: 'x', model: 'loud', clip: NaN }),
    ).toMatchObject({ model: 1, clip: 1 });
  });

  it('drops a trigger longer than the schema allows', () => {
    const long = 'w'.repeat(MAX_INJECT_TRIGGER_LENGTH + 1);
    expect(
      coerceLoraSelection({ name: 'x', inject_trigger: long }),
    ).not.toHaveProperty('inject_trigger');
    const fits = 'w'.repeat(MAX_INJECT_TRIGGER_LENGTH);
    expect(
      coerceLoraSelection({ name: 'x', inject_trigger: fits }),
    ).toMatchObject({ inject_trigger: fits });
  });

  it('truncates an over-long name rather than discarding the entry', () => {
    const entry = coerceLoraSelection({ name: 'n'.repeat(400) });
    expect(entry?.name).toHaveLength(MAX_ASSET_NAME_LENGTH);
  });

  it('keeps a version flag only on a numeric name', () => {
    // The horde answers is_version on a non-numeric name with BadLoraVersion,
    // so the flag is the wrong half of that pairing.
    expect(
      coerceLoraSelection({ name: '12345', is_version: true }),
    ).toMatchObject({ is_version: true });
    expect(
      coerceLoraSelection({ name: 'epi_noiseoffset', is_version: true }),
    ).not.toHaveProperty('is_version');
  });

  it('accepts a sha256 only when it looks like one', () => {
    const hash = 'a'.repeat(64);
    expect(coerceLoraSelection({ name: 'x', sha256: hash })).toMatchObject({
      sha256: hash,
    });
    expect(
      coerceLoraSelection({ name: 'x', sha256: 'not-a-hash' }),
    ).not.toHaveProperty('sha256');
  });

  it('tolerates the shape stored before any of this existed', () => {
    // A bare model-page id with no version flag and no display fields is a
    // valid entry, not something to repair.
    expect(
      coerceLoraSelection({ name: '246091', model: 0.8, clip: 0.8 }),
    ).toEqual({ name: '246091', model: 0.8, clip: 0.8 });
  });

  it('reads display metadata defensively', () => {
    const entry = coerceLoraSelection({
      name: '1',
      label: 'Detail Tweaker',
      modelId: 58390,
      triggerWords: ['detail', 42, null],
      origin: 'manual',
    });
    expect(entry).toMatchObject({
      label: 'Detail Tweaker',
      modelId: 58390,
      triggerWords: ['detail'],
      origin: 'manual',
    });
    expect(coerceLoraSelection({ name: '1', modelId: 'x' })).not.toHaveProperty(
      'modelId',
    );
  });
});

describe('coercing a stored textual inversion', () => {
  it('keeps only a real inject target', () => {
    expect(
      coerceTiSelection({ name: '1', inject_ti: 'negprompt' }),
    ).toMatchObject({ inject_ti: 'negprompt' });
    expect(
      coerceTiSelection({ name: '1', inject_ti: 'somewhere' }),
    ).not.toHaveProperty('inject_ti');
  });

  it('never carries a version flag, which the horde has no field for', () => {
    expect(
      coerceTiSelection({ name: '7808', is_version: true }),
    ).not.toHaveProperty('is_version');
  });
});

describe('hand-entered selections', () => {
  it('produces an entry the stored-entry validator already accepts', () => {
    const entry = manualLoraSelection({ name: ' epi_noiseoffset ' });
    expect(entry).toMatchObject({ name: 'epi_noiseoffset', origin: 'manual' });
    // The manual path is a caller of the one validator, not an exception to it.
    expect(coerceLoraSelection(entry)).toEqual(entry);
  });

  it('refuses a version flag on a name that cannot be one', () => {
    expect(
      manualLoraSelection({ name: 'epi_noiseoffset', isVersion: true }),
    ).not.toHaveProperty('is_version');
    expect(
      manualLoraSelection({ name: '1558543', isVersion: true }),
    ).toMatchObject({ is_version: true });
  });

  it('refuses an empty name', () => {
    expect(manualLoraSelection({ name: '   ' })).toBeNull();
    expect(manualTiSelection({ name: '' })).toBeNull();
  });
});

describe('what a generation actually carries', () => {
  it('caps LoRAs at the horde limit, keeping the earlier ones', () => {
    const entries = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => lora(n));
    const active = activeLoras(entries);
    expect(active).toHaveLength(HORDE_MAX_LORAS);
    expect(active.map((e) => e.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('de-duplicates before capping, so a repeat never spends a slot', () => {
    const entries = [
      lora('a'),
      lora('a'),
      lora('b'),
      lora('c'),
      lora('d'),
      lora('e'),
    ];
    expect(activeLoras(entries).map((e) => e.name)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('treats a version pin and a bare id as different assets', () => {
    const entries = [lora('123', { is_version: true }), lora('123')];
    expect(activeLoras(entries)).toHaveLength(2);
  });

  it('ignores where an entry came from when de-duplicating', () => {
    // A hand-typed id and a picked one are one LoRA to the horde.
    const entries = [
      lora('123', { is_version: true, origin: 'manual' }),
      lora('123', { is_version: true, origin: 'civitai' }),
    ];
    expect(activeLoras(entries)).toHaveLength(1);
    expect(activeLoras(entries)[0].origin).toBe('manual');
  });

  it('caps textual inversions at their own, larger limit', () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({
      name: `ti-${i}`,
      strength: 1,
    }));
    expect(activeTis(entries)).toHaveLength(HORDE_MAX_TIS);
  });

  it('leaves a list within the caps untouched', () => {
    const entries = [lora('a'), lora('b')];
    expect(activeLoras(entries)).toEqual(entries);
  });
});

describe('picking the version to pin', () => {
  const version = (
    id: number,
    extra: Partial<VersionCandidate> = {},
  ): VersionCandidate => ({
    id,
    baseModel: 'SD 1.5',
    publishedAt: '2024-01-01T00:00:00Z',
    availability: 'Public',
    ...extra,
  });
  const suitsSd15 = (base: string | undefined): boolean => base === 'SD 1.5';

  it('has nothing to pin when there are no versions', () => {
    expect(pickDefaultVersion([], suitsSd15)).toBeNull();
  });

  it('prefers the newest version the model can load', () => {
    const picked = pickDefaultVersion(
      [
        version(1, { publishedAt: '2023-01-01T00:00:00Z' }),
        version(2, { publishedAt: '2025-01-01T00:00:00Z' }),
        version(3, { baseModel: 'Pony', publishedAt: '2026-01-01T00:00:00Z' }),
      ],
      suitsSd15,
    );
    expect(picked?.id).toBe(2);
  });

  it('skips a version no worker could download', () => {
    const picked = pickDefaultVersion(
      [
        version(1, {
          publishedAt: '2026-01-01T00:00:00Z',
          availability: 'EarlyAccess',
        }),
        version(2, { publishedAt: '2025-01-01T00:00:00Z' }),
      ],
      suitsSd15,
    );
    expect(picked?.id).toBe(2);
  });

  it('skips a paid version too', () => {
    const picked = pickDefaultVersion(
      [
        version(1, { publishedAt: '2026-01-01T00:00:00Z', paidAccess: true }),
        version(2, { publishedAt: '2025-01-01T00:00:00Z' }),
      ],
      suitsSd15,
    );
    expect(picked?.id).toBe(2);
  });

  it('falls back to a mismatched family rather than pinning nothing', () => {
    const picked = pickDefaultVersion(
      [version(9, { baseModel: 'Pony' })],
      suitsSd15,
    );
    expect(picked?.id).toBe(9);
  });

  it('falls back to an unfetchable version as a last resort', () => {
    const picked = pickDefaultVersion(
      [version(9, { baseModel: 'Pony', availability: 'EarlyAccess' })],
      suitsSd15,
    );
    expect(picked?.id).toBe(9);
  });

  it('orders by CivitAI index when publish dates cannot separate two', () => {
    const picked = pickDefaultVersion(
      [
        version(1, { publishedAt: null, index: 3 }),
        version(2, { publishedAt: null, index: 0 }),
      ],
      suitsSd15,
    );
    expect(picked?.id).toBe(2);
  });
});

describe('style adapters', () => {
  it('keeps a hash on the way out to a style', () => {
    const hash = 'b'.repeat(64);
    expect(selectionToLoraConfig(lora('1', { sha256: hash }))).toMatchObject({
      sha256: hash,
    });
  });

  it('omits the fields a style has no place for', () => {
    const config = selectionToLoraConfig(
      lora('1', { label: 'Nice LoRA', thumbnailUrl: 'https://x/y.png' }),
    );
    expect(config).toEqual({ name: '1', model: 1, clip: 1 });
  });

  it('round-trips a style config through the selection shape', () => {
    const config = { name: '123', model: 0.7, clip: 0.4, is_version: true };
    expect(selectionToLoraConfig(loraConfigToSelection(config))).toEqual(
      config,
    );
  });

  it('round-trips a textual inversion config', () => {
    const config = {
      name: '7808',
      strength: 0.5,
      inject_ti: 'negprompt' as const,
    };
    expect(selectionToTiConfig(tiConfigToSelection(config))).toEqual(config);
  });
});
