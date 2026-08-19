import { describe, expect, it } from 'vitest';
import {
  ProseRun,
  proseParamSentinels,
  restoreProseParams,
  splitProseBlocks,
  tokenizeProse,
} from './gs-prose';

const text = (runs: readonly ProseRun[]): string =>
  runs.map((run) => (run.kind === 'setting' ? '' : run.text)).join('');

describe('tokenizeProse', () => {
  it('leaves a body with no marks in it as the one string it was written as', () => {
    const runs = tokenizeProse('Press Generate and wait.');

    expect(runs).toEqual([{ kind: 'text', text: 'Press Generate and wait.' }]);
  });

  it('reads a dictionary word and what the sentence calls it', () => {
    const runs = tokenizeProse(
      'Volunteer [[gl:worker|computers]] do the work.',
    );

    expect(runs).toEqual([
      { kind: 'text', text: 'Volunteer ' },
      { kind: 'term', text: 'computers', termId: 'worker' },
      { kind: 'text', text: ' do the work.' },
    ]);
  });

  it('reads a setting as a chip that names itself', () => {
    const runs = tokenizeProse('Set [[set:cfg]] to 7.5.');

    expect(runs).toEqual([
      { kind: 'text', text: 'Set ' },
      { kind: 'setting', settingId: 'cfg' },
      { kind: 'text', text: ' to 7.5.' },
    ]);
  });

  it('reads paired backticks as a quoted literal', () => {
    const runs = tokenizeProse('Add `ink and watercolour` to the prompt.');

    expect(runs).toEqual([
      { kind: 'text', text: 'Add ' },
      { kind: 'code', text: 'ink and watercolour' },
      { kind: 'text', text: ' to the prompt.' },
    ]);
  });

  it('reads the three marks in one body', () => {
    const runs = tokenizeProse(
      'A [[gl:worker|worker]] reads `steps` off [[set:steps]].',
    );

    expect(runs.map((run) => run.kind)).toEqual([
      'text',
      'term',
      'text',
      'code',
      'text',
      'setting',
      'text',
    ]);
  });

  it('leaves an unclosed mark as the characters it is made of', () => {
    const source = 'A [[gl:worker|worker and a `backtick that never closes.';

    expect(tokenizeProse(source)).toEqual([{ kind: 'text', text: source }]);
  });

  it('leaves a mark naming something the app does not have as text', () => {
    const source = 'A [[gl:not_a_term|word]] beside [[set:not_a_setting]].';

    expect(tokenizeProse(source)).toEqual([{ kind: 'text', text: source }]);
  });

  it('leaves a word with nothing to show, and a chip told what to show, as text', () => {
    const source = '[[gl:worker]] and [[set:cfg|guidance]].';

    expect(tokenizeProse(source)).toEqual([{ kind: 'text', text: source }]);
  });

  it('does not carry a backtick pair across a line', () => {
    const source = 'One `open\nand a close` on the next line.';

    expect(tokenizeProse(source)).toEqual([{ kind: 'text', text: source }]);
  });
});

describe('splitProseBlocks', () => {
  it('starts a paragraph at a blank line and nowhere else', () => {
    expect(splitProseBlocks('One.\nStill one.\n\nTwo.')).toEqual([
      { kind: 'paragraph', text: 'One.\nStill one.' },
      { kind: 'paragraph', text: 'Two.' },
    ]);
  });

  it('reads a run of dashed lines as one list, beside the prose around it', () => {
    expect(
      splitProseBlocks(
        'Write it in parts:\n- the subject\n- where they are\nThen send it.',
      ),
    ).toEqual([
      { kind: 'paragraph', text: 'Write it in parts:' },
      { kind: 'list', items: ['the subject', 'where they are'] },
      { kind: 'paragraph', text: 'Then send it.' },
    ]);
  });

  it('leaves a dash inside a sentence as text', () => {
    expect(splitProseBlocks('A value of -1 is not a bullet.')).toEqual([
      { kind: 'paragraph', text: 'A value of -1 is not a bullet.' },
    ]);
  });
});

describe('prose parameters', () => {
  const params = { prompt: 'a `zeppelin` [[gl:worker|worker]]', steps: 30 };
  const names = Object.keys(params);
  const values = names.map((name) =>
    String(params[name as keyof typeof params]),
  );

  /** What the component does: translate to sentinels, cut, then put back. */
  const render = (body: string): ProseRun[] => {
    const sentinels = proseParamSentinels(names);
    const translated = body.replace(
      /\{\{\s*(\w+)\s*}}/g,
      (_whole, name: string) => sentinels[name],
    );
    return tokenizeProse(translated).map((run) =>
      run.kind === 'setting'
        ? run
        : { ...run, text: restoreProseParams(run.text, values) },
    );
  };

  it('puts an interpolated value in as text, marks and all', () => {
    const runs = render('The prompt was “{{ prompt }}”.');

    expect(runs).toEqual([
      {
        kind: 'text',
        text: 'The prompt was “a `zeppelin` [[gl:worker|worker]]”.',
      },
    ]);
  });

  it('still reads the marks the body itself was written with', () => {
    const runs = render('[[set:steps]] was {{ steps }}, per `steps`.');

    expect(runs.map((run) => run.kind)).toEqual([
      'setting',
      'text',
      'code',
      'text',
    ]);
    expect(text(runs)).toBe(' was 30, per steps.');
  });
});
