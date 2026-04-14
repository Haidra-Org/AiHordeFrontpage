import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  FloatingActionService,
  FloatingAction,
} from './floating-action.service';

describe('FloatingActionService', () => {
  let service: FloatingActionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FloatingActionService);
  });

  function makeAction(id: string): FloatingAction {
    return {
      id,
      labelKey: `label.${id}`,
      cssClass: 'btn-primary',
      disabled: signal(false),
      visible: signal(true),
      action: () => undefined as void,
    };
  }

  it('starts with no actions', () => {
    expect(service.actions()).toEqual([]);
  });

  it('register adds an action', () => {
    service.register(makeAction('a'));
    expect(service.actions()).toHaveLength(1);
    expect(service.actions()[0].id).toBe('a');
  });

  it('register accumulates multiple actions', () => {
    service.register(makeAction('a'));
    service.register(makeAction('b'));
    expect(service.actions()).toHaveLength(2);
  });

  it('unregister removes only the matching action', () => {
    service.register(makeAction('a'));
    service.register(makeAction('b'));
    service.unregister('a');
    expect(service.actions()).toHaveLength(1);
    expect(service.actions()[0].id).toBe('b');
  });

  it('unregister is a no-op for unknown id', () => {
    service.register(makeAction('a'));
    service.unregister('nonexistent');
    expect(service.actions()).toHaveLength(1);
  });

  it('actions signal is readonly', () => {
    expect(service.actions).toBeDefined();
    // The readonly wrapper should still reflect mutations through the service
    service.register(makeAction('x'));
    expect(service.actions()).toHaveLength(1);
  });
});
