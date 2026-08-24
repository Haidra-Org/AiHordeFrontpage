/** The worker software the horde's own bridge reports itself as. */
export const REGEN_BRIDGE_NAME = 'AI Horde Worker reGen';

/**
 * The first reGen major version that accepts a control strength on a request.
 * Older bridges refuse the whole job rather than ignoring the field.
 */
export const CONTROL_STRENGTH_MIN_REGEN_MAJOR = 18;

/** A worker's `bridge_agent` string, split into the parts it names. */
export interface ParsedBridgeAgent {
  /** The worker software, e.g. "AI Horde Worker reGen". */
  name: string;
  /** The version as reported, e.g. "18.0.0" or "18". */
  version: string;
  /**
   * The leading version number, or null when the version is not a number the
   * bridge could have written. Nothing may be concluded from null: a worker
   * whose version cannot be read is treated as not meeting any version bound.
   */
  major: number | null;
  /** The contact or homepage the software points at; empty when it gave none. */
  contact: string;
}

/**
 * Split a `bridge_agent` string, which the horde carries as
 * `software:version:contact`. The contact may itself contain colons (a URL
 * does), so only the first two are separators.
 *
 * Returns null when there is no version to read, which is the only part any
 * caller here decides on. Anything the bridge did not write is left empty
 * rather than guessed at.
 */
export function parseBridgeAgent(agent: string): ParsedBridgeAgent | null {
  if (!agent) return null;

  const firstColon = agent.indexOf(':');
  if (firstColon === -1) return null;

  const secondColon = agent.indexOf(':', firstColon + 1);

  const name = agent.substring(0, firstColon);
  const version =
    secondColon === -1
      ? agent.substring(firstColon + 1)
      : agent.substring(firstColon + 1, secondColon);
  const contact = secondColon === -1 ? '' : agent.substring(secondColon + 1);

  if (!name || !version) return null;

  const leading = version.split('.')[0];
  const major = /^\d+$/.test(leading) ? Number(leading) : null;

  return { name, version, major, contact };
}

/**
 * Whether `agent` names a bridge that can serve a request carrying a control
 * strength. Silent on anything it cannot read: an unparsable or unnumbered
 * agent string reads as "no", so the studio never claims a worker can take
 * something it has no evidence for.
 */
export function bridgeTakesControlStrength(agent: string): boolean {
  const parsed = parseBridgeAgent(agent);
  return (
    parsed !== null &&
    parsed.name === REGEN_BRIDGE_NAME &&
    parsed.major !== null &&
    parsed.major >= CONTROL_STRENGTH_MIN_REGEN_MAJOR
  );
}
