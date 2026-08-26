import { describe, expect, it } from 'vitest';
import {
  applyStyle,
  applyStylePrompt,
  fromNativeImageStyle,
  fromPreset,
  parseStyleRecordKey,
  storedStyleKey,
  styleRecordKey,
  type StyleRecord,
} from './style-record';
import type { HordeStylePreset } from './horde-styles.service';
import type { ImageStyle } from '../types/style';

const NATIVE_STYLE: ImageStyle = {
  id: 'abc-123',
  name: 'Ink Wash',
  info: 'Loose brushwork.',
  prompt: 'ink wash painting of {p}###{np}',
  params: {
    steps: 20,
    denoising_strength: 0.6,
    post_processing: ['GFPGAN'],
    tiling: true,
    facefixer_strength: 0.4,
    workflow: 'qr_code',
    transparent: false,
  },
  public: true,
  nsfw: false,
  tags: ['ink', 'painting'],
  models: ['SDXL 1.0', 'AlbedoBase XL (SDXL)'],
  sharedkey: 'shared-1',
  use_count: 12,
  creator: 'someone#1',
  examples: [
    { id: 'e1', url: 'https://example.invalid/one.webp' },
    { id: 'e2', url: 'https://example.invalid/two.webp', primary: true },
  ],
};

describe('styleRecordKey', () => {
  it('qualifies a key by its source', () => {
    expect(styleRecordKey('curated', 'Anime')).toBe('curated:Anime');
    expect(styleRecordKey('native', 'abc-123')).toBe('native:abc-123');
  });

  it('reads a key back into its parts', () => {
    expect(parseStyleRecordKey('curated:Anime')).toEqual({
      source: 'curated',
      value: 'Anime',
    });
    expect(parseStyleRecordKey('native:abc-123')).toEqual({
      source: 'native',
      value: 'abc-123',
    });
  });

  it('keeps a colon inside the name, splitting only at the first one', () => {
    expect(parseStyleRecordKey('curated:art: deco')).toEqual({
      source: 'curated',
      value: 'art: deco',
    });
  });

  it('refuses text that is not a key', () => {
    expect(parseStyleRecordKey('Anime')).toBeNull();
    expect(parseStyleRecordKey('curated:')).toBeNull();
    expect(parseStyleRecordKey(':Anime')).toBeNull();
    expect(parseStyleRecordKey('other:Anime')).toBeNull();
  });
});

describe('storedStyleKey', () => {
  it('reads a stored bare name as a preset', () => {
    expect(storedStyleKey('Anime')).toBe('curated:Anime');
  });

  it('leaves a stored key alone', () => {
    expect(storedStyleKey('native:abc-123')).toBe('native:abc-123');
    expect(storedStyleKey('curated:Anime')).toBe('curated:Anime');
  });

  it('leaves an empty selection empty', () => {
    expect(storedStyleKey('')).toBe('');
    expect(storedStyleKey('   ')).toBe('');
  });
});

describe('fromPreset', () => {
  it('moves the preset fields into the shared parameter shape', () => {
    const preset: HordeStylePreset = {
      prompt: '{p}{np}',
      model: 'SDXL 1.0',
      steps: 8,
      width: 1024,
      height: 1024,
      cfg_scale: 2,
      sampler_name: 'k_dpmpp_sde',
      karras: false,
      hires_fix: true,
      clip_skip: 2,
      loras: [{ name: '247778', is_version: true }],
      tis: [{ name: '7808', inject_ti: 'negprompt', strength: 0.6 }],
    };

    const record = fromPreset('Anime', preset);

    expect(record.source).toBe('curated');
    expect(record.key).toBe('curated:Anime');
    expect(record.id).toBeUndefined();
    expect(record.name).toBe('Anime');
    expect(record.models).toEqual(['SDXL 1.0']);
    expect(record.params).toEqual({
      steps: 8,
      width: 1024,
      height: 1024,
      cfg_scale: 2,
      sampler_name: 'k_dpmpp_sde',
      karras: false,
      hires_fix: true,
      clip_skip: 2,
      loras: [{ name: '247778', is_version: true }],
      tis: [{ name: '7808', inject_ti: 'negprompt', strength: 0.6 }],
    });
  });

  it('leaves the model list empty when the preset names none', () => {
    expect(fromPreset('Plain', { prompt: '{p}' }).models).toEqual([]);
    expect(fromPreset('Plain', { prompt: '{p}', model: '' }).models).toEqual(
      [],
    );
  });
});

describe('fromNativeImageStyle', () => {
  it('carries the id, the models and the extra parameters', () => {
    const record = fromNativeImageStyle(NATIVE_STYLE);

    expect(record.source).toBe('native');
    expect(record.key).toBe('native:abc-123');
    expect(record.id).toBe('abc-123');
    expect(record.name).toBe('Ink Wash');
    expect(record.models).toEqual(['SDXL 1.0', 'AlbedoBase XL (SDXL)']);
    expect(record.tags).toEqual(['ink', 'painting']);
    expect(record.creator).toBe('someone#1');
    expect(record.info).toBe('Loose brushwork.');
    expect(record.sharedkey).toBe('shared-1');
    expect(record.nsfw).toBe(false);
    expect(record.params.denoising_strength).toBe(0.6);
    expect(record.params.post_processing).toEqual(['GFPGAN']);
  });

  it('holds no examples, tags or models when the style declares none', () => {
    const record = fromNativeImageStyle({
      id: 'bare-1',
      name: 'Bare',
      prompt: '{p}',
      public: true,
      nsfw: true,
      use_count: 0,
      creator: 'someone#1',
    });

    expect(record.models).toEqual([]);
    expect(record.tags).toBeUndefined();
    expect(record.examples).toBeUndefined();
    expect(record.params).toEqual({});
    expect(record.nsfw).toBe(true);
  });
});

describe('applyStylePrompt', () => {
  it('injects the positive prompt and drops an empty {np}', () => {
    expect(applyStylePrompt('{p}{np}', 'a fox', '')).toBe('a fox');
  });

  it('folds a negative prompt into a bare {np} with the horde separator', () => {
    expect(applyStylePrompt('{p}{np}', 'a fox', 'blurry')).toBe(
      'a fox ### blurry',
    );
  });

  it('does not double the separator when the template already spells ###', () => {
    expect(applyStylePrompt('{p} ### {np}', 'a fox', 'blurry')).toBe(
      'a fox ### blurry',
    );
  });

  it('places {np} inline when the template positions it mid-string', () => {
    expect(
      applyStylePrompt('art deco {p}, ornate {np}', 'a fox', 'blurry'),
    ).toBe('art deco a fox, ornate ### blurry');
  });

  it('appends a negative when the template omits {np} entirely', () => {
    expect(applyStylePrompt('vintage {p}', 'a fox', 'blurry')).toBe(
      'vintage a fox ### blurry',
    );
  });

  it('leaves a template without {np} unchanged when there is no negative', () => {
    expect(applyStylePrompt('vintage {p}', 'a fox', '')).toBe('vintage a fox');
  });

  it('prepends the positive prompt when the template omits {p}', () => {
    expect(applyStylePrompt('masterpiece', 'a fox', '')).toBe(
      'a fox masterpiece',
    );
  });
});

describe('applyStyle', () => {
  it('forces declared params and maps loras', () => {
    const record = fromPreset('Anime', {
      prompt: '{p}{np}',
      model: 'SDXL 1.0',
      steps: 8,
      width: 1024,
      height: 1024,
      cfg_scale: 2,
      sampler_name: 'k_dpmpp_sde',
      karras: false,
      loras: [{ name: '247778', is_version: true }],
    });

    const applied = applyStyle(record, 'a castle', 'blurry');

    expect(applied.prompt).toBe('a castle ### blurry');
    expect(applied.forcedParams).toEqual({
      model: 'SDXL 1.0',
      models: ['SDXL 1.0'],
      steps: 8,
      width: 1024,
      height: 1024,
      cfg_scale: 2,
      sampler_name: 'k_dpmpp_sde',
      karras: false,
      loras: [{ name: '247778', is_version: true }],
    });
  });

  it('omits undeclared params and carries lora/ti strengths through', () => {
    const record = fromPreset('Sketch', {
      prompt: 'sketch of {p}',
      loras: [{ name: 'MyLora', model: 0.8, clip: 0.5 }],
      tis: [{ name: '7808', inject_ti: 'negprompt', strength: 0.6 }],
    });

    const applied = applyStyle(record, 'a fox', '');

    expect(applied.prompt).toBe('sketch of a fox');
    expect(applied.forcedParams.model).toBeUndefined();
    expect(applied.forcedParams.models).toBeUndefined();
    expect(applied.forcedParams.steps).toBeUndefined();
    expect(applied.forcedParams.loras).toEqual([
      { name: 'MyLora', model: 0.8, clip: 0.5 },
    ]);
    expect(applied.forcedParams.tis).toEqual([
      { name: '7808', inject_ti: 'negprompt', strength: 0.6 },
    ]);
  });

  it('forces every model a published style names, and the extra parameters', () => {
    const record = fromNativeImageStyle(NATIVE_STYLE);

    const applied = applyStyle(record, 'a fox', 'blurry');

    expect(applied.prompt).toBe('ink wash painting of a fox ### blurry');
    expect(applied.forcedParams.model).toBe('SDXL 1.0');
    expect(applied.forcedParams.models).toEqual([
      'SDXL 1.0',
      'AlbedoBase XL (SDXL)',
    ]);
    expect(applied.forcedParams.denoising_strength).toBe(0.6);
    expect(applied.forcedParams.post_processing).toEqual(['GFPGAN']);
    expect(applied.forcedParams.tiling).toBe(true);
    expect(applied.forcedParams.facefixer_strength).toBe(0.4);
    expect(applied.forcedParams.workflow).toBe('qr_code');
    expect(applied.forcedParams.transparent).toBe(false);
  });

  it('copies the parameter arrays rather than sharing them with the style', () => {
    const record: StyleRecord = fromNativeImageStyle(NATIVE_STYLE);

    const applied = applyStyle(record, 'a fox', '');
    applied.forcedParams.post_processing?.push('GFPGANv1.3');
    applied.forcedParams.models?.push('Another');

    expect(record.params.post_processing).toEqual(['GFPGAN']);
    expect(record.models).toEqual(['SDXL 1.0', 'AlbedoBase XL (SDXL)']);
  });
});
