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
    pipe = new CapitalizePipe(service);
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
  });

  describe('first letter capitalization', () => {
    it('should capitalize first letter only', () => {
      expect(pipe.transform('hello world')).toBe('Hello world');
    });

    it('should handle already capitalized strings', () => {
      expect(pipe.transform('Hello world')).toBe('Hello world');
    });

    it('should handle single character', () => {
      expect(pipe.transform('a')).toBe('A');
    });

    it('should handle empty string', () => {
      expect(pipe.transform('')).toBe('');
    });

    it('should handle all lowercase', () => {
      expect(pipe.transform('hello')).toBe('Hello');
    });

    it('should preserve the rest of the string', () => {
      expect(pipe.transform('hello WORLD test')).toBe('Hello WORLD test');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for null', () => {
      expect(pipe.transform(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(pipe.transform(undefined)).toBe('');
    });

    it('should handle numeric strings', () => {
      expect(pipe.transform('123')).toBe('123');
    });

    it('should handle strings with numbers', () => {
      expect(pipe.transform('test123')).toBe('Test123');
    });

    it('should handle special characters only', () => {
      expect(pipe.transform('!!!')).toBe('!!!');
    });
  });

  describe('integration with EnumDisplayService', () => {
    it('should use service capitalizeFirst method', () => {
      spyOn(service, 'capitalizeFirst').and.returnValue('Mocked');
      pipe.transform('test');
      expect(service.capitalizeFirst).toHaveBeenCalledWith('test');
    });
  });
});
