import { describe, expect, it } from 'vitest';
import {
  buildPromptCheck,
  emphasizePhrase,
  negativeHasPhrase,
  promptPhrases,
  splitTags,
  stemWord,
  stripPromptSyntax,
} from './prompt-check';

describe('stripPromptSyntax', () => {
  it('takes the weighting off a phrase and keeps the words', () => {
    expect(stripPromptSyntax('(a red umbrella:1.3)')).toBe('a red umbrella');
    expect(stripPromptSyntax('[soft light]')).toBe('soft light');
    expect(stripPromptSyntax('{golden hour}')).toBe('golden hour');
    expect(stripPromptSyntax('rain:1.2')).toBe('rain');
  });

  it('drops asset references and stray operators', () => {
    expect(stripPromptSyntax('<lora:detail-tweaker:0.8>')).toBe('');
    expect(stripPromptSyntax('<ti:easynegative>')).toBe('');
    expect(stripPromptSyntax('neon + rain | glow')).toBe('neon rain glow');
    expect(stripPromptSyntax('street - at night')).toBe('street at night');
  });
});

describe('stemWord', () => {
  it('turns a plural into the word it is a plural of', () => {
    expect(stemWord('umbrellas')).toBe(stemWord('umbrella'));
    expect(stemWord('cities')).toBe('city');
    expect(stemWord('boxes')).toBe('box');
    expect(stemWord('houses')).toBe(stemWord('house'));
  });

  it('leaves short words and doubled endings alone', () => {
    expect(stemWord('cat')).toBe('cat');
    expect(stemWord('is')).toBe('is');
    expect(stemWord('grass')).toBe('grass');
  });

  it('drops a verb ending only while a word is left standing', () => {
    expect(stemWord('sitting')).toBe('sitt');
    expect(stemWord('painted')).toBe('paint');
    expect(stemWord('ring')).toBe('ring');
    expect(stemWord('red')).toBe('red');
  });
});

describe('splitTags', () => {
  it('splits on commas and drops the confidence figures', () => {
    expect(splitTags('cat:0.83, umbrella:0.61, rain')).toEqual([
      'cat',
      'umbrella',
      'rain',
    ]);
  });

  it('answers an empty list for nothing read', () => {
    expect(splitTags(null)).toEqual([]);
    expect(splitTags('  ')).toEqual([]);
  });
});

describe('promptPhrases', () => {
  it('reads only what stands before the negative marker', () => {
    expect(promptPhrases('a cat, a hat ### blurry, extra fingers')).toEqual([
      'a cat',
      'a hat',
    ]);
  });

  it('skips phrases that were nothing but syntax', () => {
    expect(promptPhrases('a cat, <lora:foo:1>, (rain:1.2)')).toEqual([
      'a cat',
      'rain',
    ]);
  });
});

describe('emphasizePhrase', () => {
  it('wraps a phrase that is in the prompt without a weight', () => {
    expect(emphasizePhrase('a cat, red umbrella', 'red umbrella')).toBe(
      'a cat, (red umbrella:1.2)',
    );
  });

  it('raises a weight that is already there, and stops at the ceiling', () => {
    expect(emphasizePhrase('a cat, (rain:1.2)', 'rain')).toBe(
      'a cat, (rain:1.3)',
    );
    expect(emphasizePhrase('a cat, (rain:1.5)', 'rain')).toBe(
      'a cat, (rain:1.5)',
    );
  });

  it('adds a phrase the prompt never had', () => {
    expect(emphasizePhrase('a cat', 'red umbrella')).toBe(
      'a cat, (red umbrella:1.2)',
    );
    expect(emphasizePhrase('', 'rain')).toBe('(rain:1.2)');
  });

  it('leaves the negative half of the prompt where it was', () => {
    expect(emphasizePhrase('a cat ### blurry', 'rain')).toBe(
      'a cat, (rain:1.2) ### blurry',
    );
  });

  it('does not weight a longer word that merely starts the same', () => {
    expect(emphasizePhrase('a catwalk', 'cat')).toBe('a catwalk, (cat:1.2)');
  });
});

describe('negativeHasPhrase', () => {
  it('reads the phrases rather than the letters', () => {
    expect(negativeHasPhrase('blurry, extra limbs', 'extra limbs')).toBe(true);
    expect(negativeHasPhrase('blurry', 'watermark')).toBe(false);
    expect(negativeHasPhrase('(watermark:1.2)', 'watermark')).toBe(true);
  });
});

describe('buildPromptCheck', () => {
  it('finds a phrase the caption words differently', () => {
    const report = buildPromptCheck('a cat under a red umbrella', {
      caption: 'a cat sitting under a red umbrella',
      tags: null,
    });
    expect(report.phrases).toEqual([
      {
        text: 'a cat under a red umbrella',
        state: 'found',
        matchedBy: ['cat', 'red', 'umbrella'],
      },
    ]);
    expect(report.counts).toEqual({ found: 1, partly: 0, missing: 0 });
  });

  it('matches through weighting syntax and plurals', () => {
    const report = buildPromptCheck('(red umbrellas:1.4), <lora:x:0.7>', {
      caption: 'a red umbrella in the rain',
      tags: null,
    });
    expect(report.phrases).toHaveLength(1);
    expect(report.phrases[0]?.text).toBe('red umbrellas');
    expect(report.phrases[0]?.state).toBe('found');
  });

  it('calls a phrase partly seen when only some of its words landed', () => {
    const report = buildPromptCheck('a red umbrella, snowy mountain', {
      caption: 'a red umbrella on a beach',
      tags: null,
    });
    expect(report.phrases.map((phrase) => phrase.state)).toEqual([
      'found',
      'missing',
    ]);
    const partly = buildPromptCheck('snowy mountain', {
      caption: 'a mountain at dawn',
      tags: null,
    });
    expect(partly.phrases[0]?.state).toBe('partly');
    expect(partly.phrases[0]?.matchedBy).toEqual(['mountain']);
    expect(partly.counts).toEqual({ found: 0, partly: 1, missing: 0 });
  });

  it('reads the tags as well as the caption', () => {
    const report = buildPromptCheck('neon signs', {
      caption: 'a street at night',
      tags: 'neon:0.91, sign:0.72',
    });
    expect(report.phrases[0]?.state).toBe('found');
  });

  it('names the tags nothing in the prompt asked for', () => {
    const report = buildPromptCheck('a cat', {
      caption: 'a cat on a windowsill',
      tags: 'cat:0.9, windowsill:0.6, watermark:0.4',
    });
    expect(report.extra).toEqual(['windowsill', 'watermark']);
  });

  it('ignores the negative half of the prompt on both sides of the count', () => {
    const report = buildPromptCheck('a cat ### watermark', {
      caption: 'a cat',
      tags: 'watermark:0.4',
    });
    expect(report.counts.found).toBe(1);
    expect(report.extra).toEqual(['watermark']);
  });

  it('has nothing to say about a prompt of nothing but stopwords', () => {
    const report = buildPromptCheck('of the, a very', {
      caption: 'a cat',
      tags: null,
    });
    expect(report.phrases).toEqual([]);
    expect(report.counts).toEqual({ found: 0, partly: 0, missing: 0 });
  });

  it('calls every phrase missing when nothing was read', () => {
    const report = buildPromptCheck('a cat, a hat', {
      caption: null,
      tags: null,
    });
    expect(report.counts).toEqual({ found: 0, partly: 0, missing: 2 });
    expect(report.extra).toEqual([]);
  });
});
