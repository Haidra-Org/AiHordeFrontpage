import {
  scrollIntoBand,
  scrollToElement,
  scrollToElementCentered,
} from './scroll-utils';

describe('scroll-utils', () => {
  function makeElement(rect: Partial<DOMRect>): HTMLElement {
    return {
      getBoundingClientRect: () => ({
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...rect,
      }),
    } as unknown as HTMLElement;
  }

  describe('scrollToElement', () => {
    it('should align target below sticky offset with padding', () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo');
      vi.spyOn(window, 'scrollY', 'get').mockReturnValue(200);
      const element = makeElement({ top: 300, height: 40 });

      scrollToElement(element, 100);

      expect(scrollSpy).toHaveBeenCalled();
      const options = scrollSpy.mock.calls.at(-1)![0] as ScrollToOptions;
      expect(options.top).toBe(384);
      expect(options.behavior).toBe('smooth');
    });

    it('should support explicit behavior', () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo');
      vi.spyOn(window, 'scrollY', 'get').mockReturnValue(50);
      const element = makeElement({ top: 200, height: 20 });

      scrollToElement(element, 20, 'instant');

      expect(scrollSpy).toHaveBeenCalled();
      const options = scrollSpy.mock.calls.at(-1)![0] as ScrollToOptions;
      expect(options.top).toBe(214);
      expect(options.behavior).toBe('instant');
    });
  });

  describe('scrollToElementCentered', () => {
    it('should center in viewport area below sticky offset', () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo');
      vi.spyOn(window, 'scrollY', 'get').mockReturnValue(1000);
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
      const element = makeElement({ top: 600, height: 100 });

      scrollToElementCentered(element, 200);

      // availableHeight = 800 - 200 = 600; center offset = (600 - 100) / 2 = 250
      // top = 600 + 1000 - 200 - 250 = 1150
      expect(scrollSpy).toHaveBeenCalled();
      const options = scrollSpy.mock.calls.at(-1)![0] as ScrollToOptions;
      expect(options.top).toBe(1150);
      expect(options.behavior).toBe('smooth');
    });

    it('should clamp negative top to 0', () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo');
      vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0);
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
      const element = makeElement({ top: 40, height: 120 });

      scrollToElementCentered(element, 200);

      expect(scrollSpy).toHaveBeenCalled();
      const options = scrollSpy.mock.calls.at(-1)![0] as ScrollToOptions;
      expect(options.top).toBe(0);
      expect(options.behavior).toBe('smooth');
    });
  });

  describe('scrollIntoBand', () => {
    /** A panel that scrolls its own content, on the screen from 100 to 700. */
    function panel(scrollHeight: number, clientHeight: number): HTMLElement {
      const container = document.createElement('div');
      container.style.overflowY = 'auto';
      Object.defineProperty(container, 'scrollHeight', { value: scrollHeight });
      Object.defineProperty(container, 'clientHeight', { value: clientHeight });
      container.scrollTop = 250;
      container.scrollTo = vi.fn();
      container.getBoundingClientRect = () =>
        ({ top: 100, bottom: 700, height: 600 }) as DOMRect;
      document.body.appendChild(container);
      return container;
    }

    function child(container: HTMLElement, top: number, height: number) {
      const element = document.createElement('div');
      element.getBoundingClientRect = () =>
        ({ top, bottom: top + height, height }) as DOMRect;
      container.appendChild(element);
      return element;
    }

    afterEach(() => {
      document.body.replaceChildren();
    });

    it('should centre the element in the band by scrolling the window', () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo');
      vi.spyOn(window, 'scrollY', 'get').mockReturnValue(200);
      const element = makeElement({ top: 500, height: 100 });

      scrollIntoBand(element, 0, 768);

      // spare = 768 - 100 = 668; inset = 334; top = 500 + 200 - 0 - 334 = 366
      expect(scrollSpy).toHaveBeenCalled();
      const options = scrollSpy.mock.calls.at(-1)![0] as ScrollToOptions;
      expect(options.top).toBe(366);
      expect(options.behavior).toBe('smooth');
    });

    it('should scroll the nearest scrolling ancestor within the part of it on screen', () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo');
      vi.spyOn(window, 'scrollY', 'get').mockReturnValue(200);
      const container = panel(2000, 600);
      const element = child(container, 900, 100);

      scrollIntoBand(element, 0, 768, 'instant');

      // band narrows to 100..700; spare = 600 - 100 = 500; inset = 250
      // top = 250 + 900 - 100 - 250 = 800
      expect(container.scrollTo).toHaveBeenCalledWith({
        top: 800,
        behavior: 'instant',
      });
      expect(scrollSpy).not.toHaveBeenCalled();
    });

    it('should scroll the window when the overflow ancestor has nothing to scroll', () => {
      const scrollSpy = vi.spyOn(window, 'scrollTo');
      vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0);
      const container = panel(600, 600);
      const element = child(container, 500, 100);

      scrollIntoBand(element, 0, 768);

      expect(container.scrollTo).not.toHaveBeenCalled();
      expect(scrollSpy).toHaveBeenCalled();
      const options = scrollSpy.mock.calls.at(-1)![0] as ScrollToOptions;
      expect(options.top).toBe(166);
    });
  });
});
