import { refusalKey } from './review-subjects';
import { HttpErrorResponse } from '@angular/common/http';

describe('refusalKey', () => {
  const refusal = (rc: string) =>
    new HttpErrorResponse({ status: 400, error: { message: 'no', rc } });

  it('names each moderation refusal plainly', () => {
    expect(refusalKey(refusal('InvalidSuspicionID'), 'x')).toBe(
      'admin.review.refusal.suspicion_id',
    );
  });

  it('falls back for anything else', () => {
    expect(refusalKey(refusal('SomethingElse'), 'fallback')).toBe('fallback');
    expect(refusalKey(new HttpErrorResponse({ status: 0 }), 'fallback')).toBe(
      'fallback',
    );
  });
});
