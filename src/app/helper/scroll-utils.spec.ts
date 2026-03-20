import { scrollToElement, scrollToElementCentered } from './scroll-utils';

describe('scroll-utils', () => {
  function makeElement(rect: Partial<DOMRect>): HTMLElement {
    return {
      getBoundingClientRect: () =>
        ({
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
        }) as DOMRect,
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
});
