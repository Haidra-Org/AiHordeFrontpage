import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Overlay } from '@angular/cdk/overlay';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollLockService, useScrollLock } from './scroll-lock';

const strategy = { enable: vi.fn(), disable: vi.fn() };

const configure = (platformId = 'browser'): void => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platformId },
      {
        provide: Overlay,
        useValue: { scrollStrategies: { block: () => strategy } },
      },
    ],
  });
};

@Component({ selector: 'app-locking-host', template: '' })
class LockingHostComponent {
  public readonly lock = useScrollLock();
}

describe('ScrollLockService', () => {
  beforeEach(() => {
    strategy.enable.mockClear();
    strategy.disable.mockClear();
    configure();
  });

  it('blocks the page for the first holder and frees it for the last', () => {
    const service = TestBed.inject(ScrollLockService);
    service.acquire();
    service.acquire();
    expect(strategy.enable).toHaveBeenCalledTimes(1);

    service.release();
    expect(strategy.disable).not.toHaveBeenCalled();
    service.release();
    expect(strategy.disable).toHaveBeenCalledTimes(1);
  });

  it('ignores a release nobody asked for', () => {
    const service = TestBed.inject(ScrollLockService);
    service.release();
    expect(strategy.disable).not.toHaveBeenCalled();
  });

  it('does nothing on the server, where there is no page to block', () => {
    configure('server');
    const service = TestBed.inject(ScrollLockService);
    service.acquire();
    service.release();
    expect(strategy.enable).not.toHaveBeenCalled();
    expect(strategy.disable).not.toHaveBeenCalled();
  });
});

describe('useScrollLock', () => {
  beforeEach(() => {
    strategy.enable.mockClear();
    strategy.disable.mockClear();
    configure();
  });

  it('counts one holder however often it is enabled', () => {
    const fixture = TestBed.createComponent(LockingHostComponent);
    const lock = fixture.componentInstance.lock;
    lock.enable();
    lock.enable();
    expect(strategy.enable).toHaveBeenCalledTimes(1);
    lock.disable();
    expect(strategy.disable).toHaveBeenCalledTimes(1);
    lock.disable();
    expect(strategy.disable).toHaveBeenCalledTimes(1);
  });

  it('frees the page when the component holding it is destroyed', () => {
    const fixture = TestBed.createComponent(LockingHostComponent);
    fixture.componentInstance.lock.enable();
    fixture.destroy();
    expect(strategy.disable).toHaveBeenCalledTimes(1);
  });
});
