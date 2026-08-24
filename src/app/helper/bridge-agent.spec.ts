import { describe, expect, it } from 'vitest';
import { bridgeTakesControlStrength, parseBridgeAgent } from './bridge-agent';

describe('parseBridgeAgent', () => {
  it('splits the software, the version and the contact', () => {
    expect(
      parseBridgeAgent('AI Horde Worker reGen:18.0.0:https://example.com/a:b'),
    ).toEqual({
      name: 'AI Horde Worker reGen',
      version: '18.0.0',
      major: 18,
      contact: 'https://example.com/a:b',
    });
  });

  it('reads an agent that named no contact', () => {
    expect(parseBridgeAgent('AI Horde Worker reGen:18')).toEqual({
      name: 'AI Horde Worker reGen',
      version: '18',
      major: 18,
      contact: '',
    });
  });

  it('leaves the major version unread when it is not a number', () => {
    expect(
      parseBridgeAgent('Bridge:v18.0:https://example.com')?.major,
    ).toBeNull();
    expect(
      parseBridgeAgent('Bridge:nonsense:mail@example.com')?.major,
    ).toBeNull();
  });

  it('gives back nothing where there is no version to read', () => {
    expect(parseBridgeAgent('')).toBeNull();
    expect(parseBridgeAgent('AI Horde Worker reGen')).toBeNull();
    expect(
      parseBridgeAgent('AI Horde Worker reGen::https://example.com'),
    ).toBeNull();
    expect(parseBridgeAgent(':18.0.0:https://example.com')).toBeNull();
  });
});

describe('bridgeTakesControlStrength', () => {
  it('accepts the horde bridge from 18 onwards', () => {
    expect(
      bridgeTakesControlStrength(
        'AI Horde Worker reGen:18.0.0:https://example.com',
      ),
    ).toBe(true);
    expect(bridgeTakesControlStrength('AI Horde Worker reGen:19')).toBe(true);
  });

  it('refuses older versions, other software and unreadable agents', () => {
    expect(
      bridgeTakesControlStrength(
        'AI Horde Worker reGen:17.9.9:https://example.com',
      ),
    ).toBe(false);
    expect(
      bridgeTakesControlStrength(
        'Some Other Bridge:20.0.0:https://example.com',
      ),
    ).toBe(false);
    expect(
      bridgeTakesControlStrength(
        'AI Horde Worker reGen:v18:https://example.com',
      ),
    ).toBe(false);
    expect(bridgeTakesControlStrength('')).toBe(false);
  });
});
