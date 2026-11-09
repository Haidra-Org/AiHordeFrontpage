import { describe, expect, it } from 'vitest';
import {
  selectManualTi,
  tiReference,
  tiReferences,
  insertPromptReference,
  insertStyleReference,
  findPromptWord,
  findPromptWords,
  promptHasWord,
  removePromptEntry,
  removePromptWord,
  setTiWeight,
  tiWeightSites,
} from './ti-prompt';
describe('TI prompt references', () => {
  it('replaces an automatic selection in place and leaves other entries unchanged', () => {
    const first = { name: '1', strength: 1 };
    const second = { name: '2', strength: 0.7, inject_ti: 'prompt' as const };
    expect(selectManualTi([first, second], second)).toEqual([
      first,
      { name: '2', strength: 0.7 },
    ]);
  });
  it('formats default and weighted references', () => {
    expect(tiReference('7808')).toBe('embedding:7808');
    expect(tiReference('7808', -0.7)).toBe('(embedding:7808:-0.7)');
  });
  it('recognises plain, weighted and file references, without matching other words', () => {
    expect(
      tiReferences(
        'embedding:1, (embedding:2:0.7) embedding:3.safetensors EMBEDDING:4 foo-embedding:5',
      ),
    ).toEqual(['1', '2', '3']);
    expect(tiReferences('some_embedding:9')).toEqual([]);
  });
  it('locates each written use of one trigger with its weight', () => {
    const prompt =
      'embedding:1, (embedding:1:0.7) (embedding:1.pt) embedding:12 x (embedding:2:0.5)';
    expect(
      tiWeightSites(prompt, '1').map(({ weight, extension }) => [
        weight,
        extension,
      ]),
    ).toEqual([
      [1, ''],
      [0.7, ''],
      [1.1, '.pt'],
    ]);
    expect(tiWeightSites('some_embedding:1', '1')).toEqual([]);
  });
  it('rewrites one use with an explicit, rounded weight', () => {
    const prompt = 'cat, embedding:1, (embedding:1.pt:0.7)';
    const [bare, weighted] = tiWeightSites(prompt, '1');
    expect(setTiWeight(prompt, '1', bare, 0.85)).toBe(
      'cat, (embedding:1:0.85), (embedding:1.pt:0.7)',
    );
    expect(setTiWeight(prompt, '1', weighted, 0.30000000000000004)).toBe(
      'cat, embedding:1, (embedding:1.pt:0.3)',
    );
  });
  it('finds a trigger anywhere in the prompt as a whole word', () => {
    expect(promptHasWord('a photo, sks dog in snow', 'sks dog')).toBe(true);
    expect(promptHasWord('(Detailed:1.2), cat', 'detailed')).toBe(true);
    expect(promptHasWord('undetailed cat', 'detailed')).toBe(false);
    expect(promptHasWord('sksdog', 'sks')).toBe(false);
    expect(promptHasWord('cat', '  ')).toBe(false);
  });
  it('removes only standalone entries of a trigger', () => {
    expect(removePromptEntry('detailed, cat, Detailed', 'detailed')).toBe(
      'cat',
    );
    expect(removePromptEntry('cat, detailed', 'detailed')).toBe('cat');
    expect(removePromptEntry('a detailed cat', 'detailed')).toBeNull();
  });
  it('removes a trigger from phrases and weight groups and tidies the rest', () => {
    expect(removePromptWord('a detailed cat', 'detailed')).toBe('a cat');
    expect(removePromptWord('cat, (Detailed:1.2), dog', 'detailed')).toBe(
      'cat, dog',
    );
    expect(removePromptWord('detailed, cat, detailed', 'detailed')).toBe('cat');
    expect(removePromptWord('(detailed fur:1.1), cat', 'detailed')).toBe(
      '(fur:1.1), cat',
    );
    expect(removePromptWord('undetailed cat', 'detailed')).toBe(
      'undetailed cat',
    );
  });
  it('locates the first whole-word occurrence', () => {
    expect(findPromptWord('undetailed, a Detailed cat', 'detailed')).toEqual({
      start: 14,
      end: 22,
    });
    expect(findPromptWord('cat', 'detailed')).toBeNull();
  });
  it('locates every whole-word occurrence', () => {
    expect(
      findPromptWords('detailed, undetailed, a detailed cat', 'detailed'),
    ).toEqual([
      { start: 0, end: 8 },
      { start: 24, end: 32 },
    ]);
  });
  it('does not duplicate a reference with an existing weight', () => {
    expect(insertPromptReference('a (embedding:1:0.2)', 'embedding:1')).toBe(
      'a (embedding:1:0.2)',
    );
  });
  it('inserts on the requested side of a style delimiter', () => {
    expect(
      insertStyleReference('{p} ### bad, {np}', 'embedding:1', 'prompt'),
    ).toBe('{p}, embedding:1 ### bad, {np}');
    expect(
      insertStyleReference('{p} ### bad, {np}', 'embedding:1', 'negprompt'),
    ).toBe('{p} ### bad, {np}, embedding:1');
    expect(insertStyleReference('{p}', 'embedding:1', 'negprompt')).toBe(
      '{p} ### embedding:1',
    );
  });
});
