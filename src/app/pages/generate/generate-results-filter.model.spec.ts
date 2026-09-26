import { describe, expect, it } from 'vitest';
import {
  RESULT_FILTERS,
  RESULT_FILTER_PLACES,
  ResultQuerySubject,
  matchesResultQuery,
  parseResultQuery,
} from './generate-results-filter.model';

function tile(
  prompt: string,
  models: string[] = [],
  model?: string,
): ResultQuerySubject {
  return {
    prompt: prompt.split('###')[0].trim(),
    model,
    request: { prompt, models },
  };
}

function matches(subject: ResultQuerySubject, query: string): boolean {
  return matchesResultQuery(subject, parseResultQuery(query));
}

describe('parseResultQuery', () => {
  it('reads nothing from an empty or blank query', () => {
    expect(parseResultQuery('')).toEqual([]);
    expect(parseResultQuery('   ')).toEqual([]);
  });

  it('splits bare words on whitespace and lowercases them', () => {
    expect(parseResultQuery('  Red   FOX ')).toEqual([
      { key: null, value: 'red' },
      { key: null, value: 'fox' },
    ]);
  });

  it('keeps a quoted phrase as one term', () => {
    expect(parseResultQuery('"red fox" snow')).toEqual([
      { key: null, value: 'red fox' },
      { key: null, value: 'snow' },
    ]);
  });

  it('runs an unclosed quote to the end of the query', () => {
    expect(parseResultQuery('"red fo')).toEqual([
      { key: null, value: 'red fo' },
    ]);
  });

  it('reads key:value and key:"a phrase" for a registered key', () => {
    expect(
      parseResultQuery('negative:blurry prompt:"red fox" Model:SDXL'),
    ).toEqual([
      { key: 'negative', value: 'blurry' },
      { key: 'prompt', value: 'red fox' },
      { key: 'model', value: 'sdxl' },
    ]);
  });

  it('reads an unknown key as a bare term, colon included', () => {
    expect(parseResultQuery('lighting:soft')).toEqual([
      { key: null, value: 'lighting:soft' },
    ]);
  });

  it('reads a quoted key:value as a bare phrase', () => {
    expect(parseResultQuery('"model:x"')).toEqual([
      { key: null, value: 'model:x' },
    ]);
  });

  it('adds no term for a known key with no value yet', () => {
    expect(parseResultQuery('fox model:')).toEqual([
      { key: null, value: 'fox' },
    ]);
  });

  it('registers a label for every filter', () => {
    expect(RESULT_FILTERS.map((filter) => filter.key)).toEqual([
      'prompt',
      'negative',
      'model',
      'sampler',
      'steps',
      'cfg',
      'size',
      'seed',
      'lora',
      'style',
    ]);
    expect(RESULT_FILTER_PLACES).toEqual([
      'prompt:',
      'negative:',
      'model:',
      'sampler:',
      'steps:',
      'cfg:',
      'size:',
      'seed:',
      'lora:',
      'style:',
    ]);
  });
});

describe('matchesResultQuery', () => {
  const fox = tile('A red fox in snow ### blurry, watermark', [
    'AlbedoBase XL',
  ]);

  it('passes everything for an empty query', () => {
    expect(matches(fox, '')).toBe(true);
    expect(matches({}, '')).toBe(true);
  });

  it('folds case on both sides', () => {
    expect(matches(fox, 'RED')).toBe(true);
    expect(matches(fox, 'Blurry')).toBe(true);
  });

  it('looks in both halves of the prompt for a bare term', () => {
    expect(matches(fox, 'snow')).toBe(true);
    expect(matches(fox, 'watermark')).toBe(true);
    expect(matches(fox, 'cat')).toBe(false);
  });

  it('requires every term to match', () => {
    expect(matches(fox, 'fox watermark')).toBe(true);
    expect(matches(fox, 'fox cat')).toBe(false);
  });

  it('matches a quoted phrase as a whole', () => {
    expect(matches(fox, '"red fox"')).toBe(true);
    expect(matches(fox, '"fox red"')).toBe(false);
  });

  it('narrows a keyed term to its half of the prompt', () => {
    expect(matches(fox, 'negative:blurry')).toBe(true);
    expect(matches(fox, 'prompt:blurry')).toBe(false);
    expect(matches(fox, 'prompt:fox')).toBe(true);
    expect(matches(fox, 'negative:fox')).toBe(false);
  });

  it('reads the positive half from the request when the tile has none', () => {
    const bare: ResultQuerySubject = {
      request: { prompt: 'castle ### fog' },
    };

    expect(matches(bare, 'prompt:castle')).toBe(true);
    expect(matches(bare, 'prompt:fog')).toBe(false);
  });

  it('matches a model by any of the requested models', () => {
    const two = tile('x', ['Deliberate', 'AlbedoBase XL']);

    expect(matches(two, 'model:albedo')).toBe(true);
    expect(matches(two, 'model:deliberate')).toBe(true);
    expect(matches(two, 'model:flux')).toBe(false);
  });

  it('matches a model by the one a finished or adopted image reports', () => {
    const adopted: ResultQuerySubject = {
      prompt: 'a lighthouse',
      model: 'Juggernaut XL',
    };

    expect(matches(adopted, 'model:juggernaut')).toBe(true);
    expect(matches(adopted, 'negative:anything')).toBe(false);
    expect(matches(adopted, 'lighthouse')).toBe(true);
  });

  it('does not let a bare term match the model', () => {
    expect(matches(fox, 'albedo')).toBe(false);
  });

  it('searches a colon in the prompt through an unknown key', () => {
    const lit = tile('lighting:soft, a bridge');

    expect(matches(lit, 'lighting:soft')).toBe(true);
  });
});

describe('matchesResultQuery over settings', () => {
  const tuned: ResultQuerySubject = {
    prompt: 'a harbour at dusk',
    seed: '3141592653',
    styleName: 'Watercolor Dream',
    request: {
      prompt: 'a harbour at dusk',
      models: ['AlbedoBase XL'],
      params: {
        sampler_name: 'k_dpmpp_2m',
        steps: 30,
        cfg_scale: 7.5,
        width: 1024,
        height: 768,
        loras: [{ name: 'Detail Tweaker XL' }, { name: '58390' }],
      },
    },
  };

  it('matches a sampler by part of its name', () => {
    expect(matches(tuned, 'sampler:dpmpp')).toBe(true);
    expect(matches(tuned, 'sampler:K_DPMPP_2M')).toBe(true);
    expect(matches(tuned, 'sampler:euler')).toBe(false);
  });

  it('matches steps by exact value only', () => {
    expect(matches(tuned, 'steps:30')).toBe(true);
    expect(matches(tuned, 'steps:3')).toBe(false);
    expect(matches(tuned, 'steps:abc')).toBe(false);
  });

  it('matches cfg by exact value, decimals included', () => {
    expect(matches(tuned, 'cfg:7.5')).toBe(true);
    expect(matches(tuned, 'cfg:7')).toBe(false);
  });

  it('matches a size as WxH or as either dimension', () => {
    expect(matches(tuned, 'size:1024x768')).toBe(true);
    expect(matches(tuned, 'size:1024X768')).toBe(true);
    expect(matches(tuned, 'size:768x1024')).toBe(false);
    expect(matches(tuned, 'size:1024')).toBe(true);
    expect(matches(tuned, 'size:768')).toBe(true);
    expect(matches(tuned, 'size:512')).toBe(false);
    expect(matches(tuned, 'size:1024x')).toBe(false);
  });

  it('matches the seed a finished image reports or the one requested', () => {
    expect(matches(tuned, 'seed:3141592653')).toBe(true);
    expect(matches(tuned, 'seed:314159')).toBe(false);

    const requested: ResultQuerySubject = {
      request: { prompt: 'x', params: { seed: 'lighthouse' } },
    };
    expect(matches(requested, 'seed:Lighthouse')).toBe(true);
  });

  it('matches a lora by part of any of its names', () => {
    expect(matches(tuned, 'lora:detail')).toBe(true);
    expect(matches(tuned, 'lora:58390')).toBe(true);
    expect(matches(tuned, 'lora:ghibli')).toBe(false);
  });

  it('matches a style by its name, case folded', () => {
    expect(matches(tuned, 'style:watercolor')).toBe(true);
    expect(matches(tuned, 'style:"watercolor dream"')).toBe(true);
    expect(matches(tuned, 'style:oil')).toBe(false);
  });

  it('matches nothing for a setting the tile does not carry', () => {
    const bare: ResultQuerySubject = { prompt: 'a lighthouse' };

    for (const query of [
      'sampler:k',
      'steps:30',
      'cfg:7',
      'size:1024',
      'seed:1',
      'lora:x',
      'style:x',
    ]) {
      expect(matches(bare, query)).toBe(false);
    }
  });
});
