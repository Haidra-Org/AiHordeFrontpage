import { TestBed } from '@angular/core/testing';
import { CapitalizePipe } from './capitalize.pipe';
import { EnumDisplayService } from '../services/enum-display.service';

describe('CapitalizePipe', () => {
  let pipe: CapitalizePipe;
  let service: EnumDisplayService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EnumDisplayService],
    });
    service = TestBed.inject(EnumDisplayService);
    pipe = TestBed.runInInjectionContext(() => new CapitalizePipe());
  });

  describe('first letter capitalization', () => {
    it.each([
      ['hello world', 'Hello world'],
      ['Hello world', 'Hello world'],
      ['a', 'A'],
      ['', ''],
      ['hello', 'Hello'],
      ['hello WORLD test', 'Hello WORLD test'],
    ])('should transform "%s" to "%s"', (input, expected) => {
      expect(pipe.transform(input)).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it('should return empty string for null', () => {
      expect(pipe.transform(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(pipe.transform(undefined)).toBe('');
    });

    it.each([
      ['123', '123'],
      ['test123', 'Test123'],
      ['!!!', '!!!'],
    ])('should handle "%s" → "%s"', (input, expected) => {
      expect(pipe.transform(input)).toBe(expected);
    });
  });

  describe('integration with EnumDisplayService', () => {
    it('should delegate to service capitalizeFirst and return its result', () => {
      vi.spyOn(service, 'capitalizeFirst').mockReturnValue('Mocked');

      const result = pipe.transform('test');

      expect(service.capitalizeFirst).toHaveBeenCalledWith('test');
      expect(result).toBe('Mocked');
    });
  });
});
