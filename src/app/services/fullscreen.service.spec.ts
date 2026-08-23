import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenService } from './fullscreen.service';

interface FakeDocument {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void>;
  addEventListener: (type: string, handler: () => void) => void;
  activeElement: Element | null;
  body: Element | null;
}

/**
 * jsdom has no fullscreen of its own, so the document the service talks to is
 * a stand-in that records what was asked of it and announces the change the way
 * a browser would.
 */
const makeDocument = (
  flavour: 'standard' | 'webkit' | 'none',
): { doc: FakeDocument; fire: () => void } => {
  const handlers = new Map<string, () => void>();
  const doc: FakeDocument = {
    fullscreenElement: null,
    activeElement: null,
    body: null,
    addEventListener: (type, handler) => handlers.set(type, handler),
  };

  if (flavour === 'standard') {
    doc.fullscreenEnabled = true;
    doc.exitFullscreen = () => {
      doc.fullscreenElement = null;
      return Promise.resolve();
    };
  }
  if (flavour === 'webkit') {
    doc.webkitFullscreenEnabled = true;
    doc.webkitFullscreenElement = null;
    doc.webkitExitFullscreen = () => {
      doc.webkitFullscreenElement = null;
      return Promise.resolve();
    };
  }

  const fire = (): void => {
    handlers.get('fullscreenchange')?.();
    handlers.get('webkitfullscreenchange')?.();
  };

  return { doc, fire };
};

const makeElement = (
  doc: FakeDocument,
  flavour: 'standard' | 'webkit',
): HTMLElement => {
  const element = {} as Record<string, unknown>;
  const request = vi.fn(() => {
    if (flavour === 'standard') doc.fullscreenElement = element as Element;
    else doc.webkitFullscreenElement = element as Element;
    return Promise.resolve();
  });
  element[
    flavour === 'standard' ? 'requestFullscreen' : 'webkitRequestFullscreen'
  ] = request;
  return element as unknown as HTMLElement;
};

const serviceWith = (doc: FakeDocument): FullscreenService => {
  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: doc }],
  });
  return TestBed.inject(FullscreenService);
};

describe('FullscreenService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('offers nothing where the browser keeps the screen for video', async () => {
    // An iPhone answers to neither name, so the controls that would call this
    // are never drawn and calling it anyway changes nothing.
    const { doc } = makeDocument('none');
    const service = serviceWith(doc);

    expect(service.available).toBe(false);

    service.setTarget(makeElement(doc, 'standard'));
    await service.toggle();

    expect(service.active()).toBe(false);
  });

  it('puts the registered element on the screen and takes it back', async () => {
    const { doc } = makeDocument('standard');
    const service = serviceWith(doc);
    const element = makeElement(doc, 'standard');
    service.setTarget(element);

    expect(service.available).toBe(true);

    await service.toggle();
    expect(doc.fullscreenElement).toBe(element);
    expect(service.active()).toBe(true);

    await service.toggle();
    expect(doc.fullscreenElement).toBeNull();
    expect(service.active()).toBe(false);
  });

  it('uses the prefixed pair where that is all there is', async () => {
    const { doc } = makeDocument('webkit');
    const service = serviceWith(doc);
    const element = makeElement(doc, 'webkit');
    service.setTarget(element);

    expect(service.available).toBe(true);

    await service.toggle();
    expect(doc.webkitFullscreenElement).toBe(element);
    expect(service.active()).toBe(true);

    await service.toggle();
    expect(service.active()).toBe(false);
  });

  it('follows an exit it was not asked for', async () => {
    // Escape and the system gesture end it without going through this service;
    // the browser's own event is what the state reads.
    const { doc, fire } = makeDocument('standard');
    const service = serviceWith(doc);
    service.setTarget(makeElement(doc, 'standard'));

    await service.toggle();
    expect(service.active()).toBe(true);

    doc.fullscreenElement = null;
    fire();

    expect(service.active()).toBe(false);
  });

  it('does nothing while no element has been handed over', async () => {
    const { doc } = makeDocument('standard');
    const service = serviceWith(doc);

    await service.toggle();

    expect(service.active()).toBe(false);
    expect(doc.fullscreenElement).toBeNull();
  });

  it('stays out of the way once the shell that owned the element is gone', async () => {
    const { doc } = makeDocument('standard');
    const service = serviceWith(doc);
    service.setTarget(makeElement(doc, 'standard'));
    service.setTarget(null);

    await service.toggle();

    expect(doc.fullscreenElement).toBeNull();
  });
});
