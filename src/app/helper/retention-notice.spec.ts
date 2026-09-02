import { beforeEach, describe, expect, it } from 'vitest';
import {
  markRetentionNoticeSeen,
  retentionNoticeSeen,
} from './retention-notice';

describe('retention notice flag', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('is unseen until marked, then seen for the rest of the session', () => {
    expect(retentionNoticeSeen()).toBe(false);
    markRetentionNoticeSeen();
    expect(retentionNoticeSeen()).toBe(true);
  });
});
