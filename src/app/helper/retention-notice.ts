/**
 * Whether the reader has already been shown the full "results live in this
 * browser" note during this visit. Both studios show the whole note once and a
 * one-line reminder after that, so the flag is kept for the tab's lifetime
 * rather than per studio.
 */
const RETENTION_SEEN_KEY = 'aihorde.studio.retention_seen';

export function retentionNoticeSeen(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(RETENTION_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markRetentionNoticeSeen(): void {
  try {
    globalThis.sessionStorage?.setItem(RETENTION_SEEN_KEY, '1');
  } catch {
    // A browser that refuses session storage shows the full note every time.
  }
}
