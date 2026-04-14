import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with an empty toasts list', () => {
    expect(service.toasts()).toEqual([]);
  });

  // ===========================================================================
  // show()
  // ===========================================================================

  describe('show()', () => {
    it('adds a toast and returns its id', () => {
      const id = service.show('success', 'Saved');
      expect(id).toMatch(/^toast-/);
      expect(service.toasts()).toHaveLength(1);
      expect(service.toasts()[0].message).toBe('Saved');
      expect(service.toasts()[0].type).toBe('success');
    });

    it('success toasts auto-dismiss after 5 seconds by default', () => {
      service.show('success', 'bye');
      expect(service.toasts()).toHaveLength(1);
      vi.advanceTimersByTime(5000);
      expect(service.toasts()).toHaveLength(0);
    });

    it('error toasts do NOT auto-dismiss by default', () => {
      service.show('error', 'oops');
      vi.advanceTimersByTime(60_000);
      expect(service.toasts()).toHaveLength(1);
    });

    it('respects a custom autoDismissMs', () => {
      service.show('warning', 'heads up', { autoDismissMs: 1000 });
      vi.advanceTimersByTime(999);
      expect(service.toasts()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(service.toasts()).toHaveLength(0);
    });

    it('stores transloco flag and messageParams', () => {
      service.show('success', 'key', {
        transloco: true,
        messageParams: { count: 5 },
      });
      const toast = service.toasts()[0];
      expect(toast.transloco).toBe(true);
      expect(toast.messageParams).toEqual({ count: 5 });
    });
  });

  // ===========================================================================
  // success() / error() / warning() convenience methods
  // ===========================================================================

  describe('success()', () => {
    it('creates a success toast that auto-dismisses', () => {
      service.success('done');
      expect(service.toasts()[0].type).toBe('success');
      vi.advanceTimersByTime(5000);
      expect(service.toasts()).toHaveLength(0);
    });
  });

  describe('error()', () => {
    it('creates an error toast that stays visible', () => {
      service.error('fail');
      expect(service.toasts()[0].type).toBe('error');
      vi.advanceTimersByTime(60_000);
      expect(service.toasts()).toHaveLength(1);
    });

    it('serialises rawError (HttpErrorResponse) into details', () => {
      const httpErr = new HttpErrorResponse({
        error: { code: 'E1', info: 'bad input' },
        status: 400,
      });
      service.error('fail', { rawError: httpErr });
      const toast = service.toasts()[0];
      expect(toast.details).toBeDefined();
      const parsed = JSON.parse(toast.details!);
      expect(parsed.code).toBe('E1');
    });

    it('uses explicit details over rawError', () => {
      service.error('fail', {
        details: 'custom detail',
        rawError: new HttpErrorResponse({ error: {}, status: 500 }),
      });
      expect(service.toasts()[0].details).toBe('custom detail');
    });
  });

  describe('warning()', () => {
    it('creates a warning toast that auto-dismisses after 5s', () => {
      service.warning('watch out');
      expect(service.toasts()[0].type).toBe('warning');
      vi.advanceTimersByTime(5000);
      expect(service.toasts()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // dismiss() / clear()
  // ===========================================================================

  describe('dismiss()', () => {
    it('removes only the toast with the matching id', () => {
      const id1 = service.show('error', 'one');
      const id2 = service.show('error', 'two');
      service.dismiss(id1);
      expect(service.toasts()).toHaveLength(1);
      expect(service.toasts()[0].id).toBe(id2);
    });

    it('is a no-op for an unknown id', () => {
      service.show('error', 'stay');
      service.dismiss('nonexistent');
      expect(service.toasts()).toHaveLength(1);
    });
  });

  describe('clear()', () => {
    it('removes all toasts at once', () => {
      service.show('error', 'a');
      service.show('error', 'b');
      service.show('error', 'c');
      service.clear();
      expect(service.toasts()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Multiple toasts accumulate
  // ===========================================================================

  it('accumulates multiple toasts', () => {
    service.success('1');
    service.error('2');
    service.warning('3');
    expect(service.toasts()).toHaveLength(3);
  });
});
