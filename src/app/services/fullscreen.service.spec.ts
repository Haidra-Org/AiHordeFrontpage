import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FullscreenService,
  restoreFocusOnFullscreenExit,
} from './fullscreen.service';

interface FakeDocument {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void>;
  addEventListener: (type: string, handler: () => void) => void;
  activeElement: Element | null;
  body: HTMLElement | null;
}

/**
 * Stand in for the viewport the service asks about. jsdom answers every media
 * query with `false`, so a phone has to be said outright.
 */
const sayPhone = (phone: boolean): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: phone,
      media: '',
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
    })),
  );
};

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
    body: document.createElement('body'),
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
    if (flavour === 'standard')
      doc.fullscreenElement = element as unknown as Element;
    else doc.webkitFullscreenElement = element as unknown as Element;
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
  afterEach(() => vi.unstubAllGlobals());

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

  it('stays inactive when some other element on the page goes fullscreen', () => {
    // The browser fullscreen state is document-wide; a video player or another
    // widget going fullscreen must not make this service claim it is active.
    const { doc, fire } = makeDocument('standard');
    const service = serviceWith(doc);
    service.setTarget(document.createElement('div'));

    doc.fullscreenElement = document.createElement('video');
    fire();

    expect(service.active()).toBe(false);
  });

  it('stays active when the element the browser reports is nested inside the target', () => {
    const { doc, fire } = makeDocument('standard');
    const service = serviceWith(doc);
    const target = document.createElement('div');
    const nested = document.createElement('div');
    target.appendChild(nested);
    service.setTarget(target);

    doc.fullscreenElement = nested;
    fire();

    expect(service.active()).toBe(true);
  });

  it('names the element it holds so a borrower can put it back', () => {
    const { doc } = makeDocument('standard');
    const service = serviceWith(doc);
    const shell = makeElement(doc, 'standard');
    const picture = makeElement(doc, 'standard');

    expect(service.target()).toBeNull();

    service.setTarget(shell);
    expect(service.target()).toBe(shell);

    const borrowedFrom = service.target();
    service.setTarget(picture);
    expect(service.target()).toBe(picture);

    service.setTarget(borrowedFrom);
    expect(service.target()).toBe(shell);
  });

  it('fills the screen from the page alone where the browser has no such thing', async () => {
    // Every iPhone. Nothing is asked of the browser and the studio still gets
    // the screen; the mark on the body is what the site's bars read.
    sayPhone(true);
    const { doc } = makeDocument('none');
    const service = serviceWith(doc);

    expect(service.available).toBe(false);
    expect(service.phone()).toBe(true);

    await service.toggle();

    expect(service.immersive()).toBe(true);
    expect(service.filling()).toBe(true);
    expect(doc.body?.classList.contains('gs-immersive')).toBe(true);

    await service.toggle();

    expect(service.filling()).toBe(false);
    expect(doc.body?.classList.contains('gs-immersive')).toBe(false);
  });

  it('asks the browser as well where the browser has one', async () => {
    sayPhone(true);
    const { doc } = makeDocument('standard');
    const service = serviceWith(doc);
    const element = makeElement(doc, 'standard');
    service.setTarget(element);

    await service.toggle();

    expect(doc.fullscreenElement).toBe(element);
    expect(service.immersive()).toBe(true);

    await service.toggle();

    expect(doc.fullscreenElement).toBeNull();
    expect(service.immersive()).toBe(false);
  });

  it('gives the page back when the browser ends its half on its own', async () => {
    // A phone drops the browser's fullscreen when the reader switches apps.
    sayPhone(true);
    const { doc, fire } = makeDocument('standard');
    const service = serviceWith(doc);
    service.setTarget(makeElement(doc, 'standard'));

    await service.toggle();
    expect(service.filling()).toBe(true);

    doc.fullscreenElement = null;
    fire();

    expect(service.immersive()).toBe(false);
    expect(service.filling()).toBe(false);
    expect(doc.body?.classList.contains('gs-immersive')).toBe(false);
  });

  it('keeps the page on the screen when the browser refuses its half', async () => {
    sayPhone(true);
    const { doc } = makeDocument('standard');
    const service = serviceWith(doc);
    const element = makeElement(doc, 'standard');
    (
      element as unknown as { requestFullscreen: () => Promise<void> }
    ).requestFullscreen = () => Promise.reject(new Error('refused'));
    service.setTarget(element);

    await service.toggle();

    expect(service.active()).toBe(false);
    expect(service.immersive()).toBe(true);
  });

  it('leaves the page as it is where the pointer is not a finger', async () => {
    sayPhone(false);
    const { doc } = makeDocument('standard');
    const service = serviceWith(doc);
    service.setTarget(makeElement(doc, 'standard'));

    await service.toggle();

    expect(service.active()).toBe(true);
    expect(service.immersive()).toBe(false);
    expect(doc.body?.classList.contains('gs-immersive')).toBe(false);
  });

  it('gives the chrome back when the studio leaves the page', async () => {
    // The studio shell calls this as it is destroyed, which is every navigation
    // away: the next page must not arrive without a nav bar.
    sayPhone(true);
    const { doc } = makeDocument('none');
    const service = serviceWith(doc);
    await service.toggle();

    service.exitImmersive();

    expect(service.immersive()).toBe(false);
    expect(doc.body?.classList.contains('gs-immersive')).toBe(false);
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

describe('restoreFocusOnFullscreenExit', () => {
  beforeEach(() => TestBed.resetTestingModule());

  /** Enter and then leave the screen, flushing the effect each way. */
  const enterAndLeave = async (service: FullscreenService): Promise<void> => {
    await service.toggle();
    TestBed.tick();
    await service.toggle();
    TestBed.tick();
  };

  it('hands focus back to the control when the exit left it on the body', async () => {
    const { doc } = makeDocument('standard');
    const service = serviceWith(doc);
    service.setTarget(makeElement(doc, 'standard'));
    const button = document.createElement('button');
    const focus = vi.spyOn(button, 'focus');
    doc.body = document.body;
    doc.activeElement = document.body;
    TestBed.runInInjectionContext(() =>
      restoreFocusOnFullscreenExit(() => button),
    );
    TestBed.tick();

    await enterAndLeave(service);

    expect(focus).toHaveBeenCalledOnce();
  });

  it('leaves focus where the reader put it', async () => {
    const { doc } = makeDocument('standard');
    const service = serviceWith(doc);
    service.setTarget(makeElement(doc, 'standard'));
    const button = document.createElement('button');
    const focus = vi.spyOn(button, 'focus');
    doc.body = document.body;
    doc.activeElement = document.createElement('input');
    TestBed.runInInjectionContext(() =>
      restoreFocusOnFullscreenExit(() => button),
    );
    TestBed.tick();

    await enterAndLeave(service);

    expect(focus).not.toHaveBeenCalled();
  });

  it('does nothing while the screen was never taken', () => {
    const { doc } = makeDocument('standard');
    serviceWith(doc);
    const button = document.createElement('button');
    const focus = vi.spyOn(button, 'focus');
    doc.body = document.body;
    doc.activeElement = document.body;
    TestBed.runInInjectionContext(() =>
      restoreFocusOnFullscreenExit(() => button),
    );

    TestBed.tick();

    expect(focus).not.toHaveBeenCalled();
  });
});
