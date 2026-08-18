import { describe, expect, it } from 'vitest';
import live from '../testing/fixtures/sampler-constraints.stub.json';
import {
  SAMPLER_SETTING_NAMES,
  availableSchedulers,
  coerceSamplerConstraints,
} from './sampler-constraints';

/**
 * The panel's sampler controls are built from a document this repository never
 * writes, and the parser answers a shape it does not recognise with null: the
 * controls then vanish rather than fail, which is indistinguishable from an API
 * that publishes no contract. These read a captured response from a horde
 * serving schema 1.0, so a parser that stops recognising the real document says
 * so here instead of in an empty panel.
 */
describe('the published sampler contract', () => {
  const contract = coerceSamplerConstraints(live);

  it('is recognised, with every sampler and tier it publishes', () => {
    expect(contract).not.toBeNull();
    expect(contract!.schema_version).toBe('1.0');
    expect(Object.keys(contract!.samplers)).toHaveLength(
      Object.keys(live.samplers).length,
    );
    expect(contract!.presentation_tiers.recommended).toContain('k_euler');
    // Every recommended name resolves to a record, so no tier lists a sampler
    // the picker could not then offer.
    const unresolved = contract!.presentation_tiers.recommended.filter(
      (name) => contract!.samplers[name] === undefined,
    );
    expect(unresolved).toEqual([]);
  });

  it('keeps every solver setting the document carries', () => {
    const published = new Set(
      Object.values(live.samplers).flatMap((record) =>
        Object.keys(record.accepted_settings),
      ),
    );
    const kept = new Set(
      Object.values(contract!.samplers).flatMap((record) =>
        Object.keys(record.accepted_settings),
      ),
    );

    // A setting the horde accepts but this list omits is one the panel silently
    // stops offering.
    expect([...kept].sort()).toEqual([...published].sort());
    expect([...published].sort()).toEqual([...SAMPLER_SETTING_NAMES].sort());
  });

  it('reads the solver vocabulary off the record rather than a local list', () => {
    expect(contract!.samplers['dpmpp_2m_sde'].solver_type_choices).toEqual([
      'midpoint',
      'heun',
    ]);
    expect(contract!.samplers['k_euler'].solver_type_choices).toEqual([]);
  });

  it('withholds the schedules the document rules out', () => {
    // A pairing the horde rejects outright.
    expect(
      availableSchedulers(contract!, 'dpmpp_3m_sde', ['stable_diffusion_1']),
    ).not.toContain('normal');
    // A sigma generator derived for particular model families.
    expect(
      availableSchedulers(contract!, 'k_euler', ['stable_diffusion_1']),
    ).toContain('align_your_steps');
    expect(availableSchedulers(contract!, 'k_euler', ['flux_1'])).not.toContain(
      'align_your_steps',
    );
    // Everything else stays available whatever the model is.
    expect(availableSchedulers(contract!, 'k_euler', ['flux_1'])).toContain(
      'karras',
    );
  });

  it('offers no model-specific schedule while no model is chosen', () => {
    // With no baseline to check against, a schedule that names the families it
    // applies to cannot be shown to apply.
    expect(availableSchedulers(contract!, 'k_euler', [])).not.toContain('gits');
    expect(availableSchedulers(contract!, 'k_euler', [])).toContain('karras');
  });
});
