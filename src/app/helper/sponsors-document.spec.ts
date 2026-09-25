import { describe, expect, it } from 'vitest';
import { parseSponsorsDocument } from './sponsors-document';

/** The document as the horde returns it, kept verbatim. */
const DOCUMENT = [
  'Sponsors',
  '========',
  '',
  '* [GetIPIntel.net - Free Proxy/VPN Detection](https://getipintel.net)',
  '* [NLNet: NGI Zero Core Fund](https://nlnet.nl/project/AI-Horde/)',
  '* [Eric Monson](None)',
  '',
  '  ',
  '',
  '[Patrons](https://www.patreon.com/db0)',
  '======================================',
  '',
  'Courage of Link, Entoron95, patron@example.com , Titmouse',
].join('\n');

describe('parseSponsorsDocument', () => {
  it('reads every sponsor in the list', () => {
    expect(parseSponsorsDocument(DOCUMENT).sponsors).toHaveLength(3);
  });

  it('splits a label that carries its own description', () => {
    const [first] = parseSponsorsDocument(DOCUMENT).sponsors;
    expect(first.name).toBe('GetIPIntel.net');
    expect(first.note).toBe('Free Proxy/VPN Detection');
  });

  it('keeps a label with no spaced hyphen whole', () => {
    const [, second] = parseSponsorsDocument(DOCUMENT).sponsors;
    expect(second.name).toBe('NLNet: NGI Zero Core Fund');
    expect(second.note).toBeNull();
  });

  it('gives a sponsor with no address no link', () => {
    const [, , third] = parseSponsorsDocument(DOCUMENT).sponsors;
    expect(third.name).toBe('Eric Monson');
    expect(third.url).toBeNull();
  });

  it('refuses an address that is not http', () => {
    const document = 'Sponsors\n========\n\n* [Someone](javascript:alert(1))';
    expect(parseSponsorsDocument(document).sponsors[0].url).toBeNull();
  });

  it('reads the patrons as separate names', () => {
    expect(parseSponsorsDocument(DOCUMENT).patrons).toEqual([
      'Courage of Link',
      'Entoron95',
      'patron',
      'Titmouse',
    ]);
  });

  it('shows only the local part of a patron credited by address', () => {
    const { patrons } = parseSponsorsDocument(DOCUMENT);
    expect(patrons.some((patron) => patron.includes('@'))).toBe(false);
  });

  it('never reads the patron names as sponsors', () => {
    const names = parseSponsorsDocument(DOCUMENT).sponsors.map((s) => s.name);
    expect(names).not.toContain('Courage of Link');
  });

  it('answers an empty document with empty lists', () => {
    expect(parseSponsorsDocument('')).toEqual({ sponsors: [], patrons: [] });
  });
});
