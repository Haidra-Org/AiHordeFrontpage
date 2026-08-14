import { TestBed } from '@angular/core/testing';
import { ApplicationRef } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GsTryItService, TryItHost } from './gs-try-it.service';
import {
  HIGHLIGHT_CLASS,
  TutorialAnchorService,
} from './tutorial-anchor.service';
import { SettingApply } from '../content/settings';

const TRY_STEPS: SettingApply = {
  display: '40',
  anchorId: 'steps',
  fields: { steps: 40 },
};

describe('GsTryItService', () => {
  let service: GsTryItService;
  let anchors: TutorialAnchorService;
  let host: TryItHost & {
    applyFields: ReturnType<typeof vi.fn>;
    setMode: ReturnType<typeof vi.fn>;
    currentMode: ReturnType<typeof vi.fn>;
  };
  let row: HTMLElement;

  /** Run the after-render work the flash is scheduled in. */
  async function settle(): Promise<void> {
    TestBed.inject(ApplicationRef).tick();
    await Promise.resolve();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
    service = TestBed.inject(GsTryItService);
    anchors = TestBed.inject(TutorialAnchorService);
    host = {
      applyFields: vi.fn(),
      setMode: vi.fn(),
      currentMode: vi.fn().mockReturnValue('advanced'),
      currentSourceMode: vi.fn().mockReturnValue('img2img'),
    };
    row = document.createElement('div');
    document.body.appendChild(row);
    row.scrollIntoView = vi.fn();
    anchors.register('steps', row);
  });

  it('writes only the fields the value names', () => {
    service.registerHost(host);

    service.apply(TRY_STEPS);

    // A value that needs nothing switched on asks for nothing switched on.
    expect(host.applyFields).toHaveBeenCalledWith({ steps: 40 }, []);
    expect(host.setMode).not.toHaveBeenCalled();
  });

  it('passes on the post-processors a value needs enabled', () => {
    service.registerHost(host);

    service.apply({
      display: '0.75',
      anchorId: 'facefixer_strength',
      fields: { facefixer_strength: 0.75 },
      addPostProcessors: ['GFPGAN'],
    });

    // The service states the need and no more: whether the fixer is actually
    // missing is the studio's question, since only it holds the form.
    expect(host.applyFields).toHaveBeenCalledWith(
      { facefixer_strength: 0.75 },
      ['GFPGAN'],
    );
  });

  it('shows the area the field lives in before writing into it', () => {
    host.currentMode.mockReturnValue('simple');
    service.registerHost(host);

    service.apply(TRY_STEPS);

    expect(host.setMode).toHaveBeenCalledWith('advanced');
  });

  it('writes nothing when no studio is listening', () => {
    service.apply(TRY_STEPS);

    expect(host.applyFields).not.toHaveBeenCalled();
  });

  it('rings the row the value landed in, then lets it go', async () => {
    service.registerHost(host);

    service.apply(TRY_STEPS);
    await settle();

    expect(row.classList.contains(HIGHLIGHT_CLASS)).toBe(true);
    // Sampling's hue, taken from the section identity rather than restated.
    expect(row.classList.contains('gs-sec--sampling')).toBe(true);
    expect(row.scrollIntoView).toHaveBeenCalled();

    vi.advanceTimersByTime(2500);

    expect(row.classList.contains(HIGHLIGHT_CLASS)).toBe(false);
    expect(row.classList.contains('gs-sec--sampling')).toBe(false);
  });

  it('restarts the ring rather than letting the first press end the second', async () => {
    service.registerHost(host);

    service.apply(TRY_STEPS);
    await settle();
    vi.advanceTimersByTime(2000);
    service.apply(TRY_STEPS);
    await settle();
    vi.advanceTimersByTime(2000);

    expect(row.classList.contains(HIGHLIGHT_CLASS)).toBe(true);
  });

  it('leaves a highlight the tutorial is holding exactly where it is', async () => {
    row.classList.add(HIGHLIGHT_CLASS);
    service.registerHost(host);

    service.apply(TRY_STEPS);
    await settle();
    vi.advanceTimersByTime(2500);

    expect(row.classList.contains(HIGHLIGHT_CLASS)).toBe(true);
  });

  it('hands a value on to the studio once and once only', () => {
    service.arm(TRY_STEPS);

    expect(service.consumeArmed()).toBe(TRY_STEPS);
    expect(service.consumeArmed()).toBeNull();
  });

  it('forgets a host that has gone', () => {
    service.registerHost(host);
    service.unregisterHost(host);

    service.apply(TRY_STEPS);

    expect(host.applyFields).not.toHaveBeenCalled();
  });
});
