import { TestBed } from '@angular/core/testing';
import { IconRegistryService } from './icon-registry.service';

describe('IconRegistryService', () => {
  let service: IconRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(IconRegistryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('register', () => {
    it('should register a single icon', () => {
      service.register('test-icon', '<path d="M0 0"/>');
      expect(service.has('test-icon')).toBeTrue();
      expect(service.get('test-icon')).toBe('<path d="M0 0"/>');
    });

    it('should overwrite an existing icon', () => {
      service.register('icon', '<path d="M1"/>');
      service.register('icon', '<path d="M2"/>');
      expect(service.get('icon')).toBe('<path d="M2"/>');
    });
  });

  describe('registerAll', () => {
    it('should register multiple icons at once', () => {
      service.registerAll({
        alpha: '<path d="A"/>',
        beta: '<path d="B"/>',
        gamma: '<path d="C"/>',
      });
      expect(service.has('alpha')).toBeTrue();
      expect(service.has('beta')).toBeTrue();
      expect(service.has('gamma')).toBeTrue();
      expect(service.get('beta')).toBe('<path d="B"/>');
    });
  });

  describe('get', () => {
    it('should return undefined for an unregistered icon', () => {
      expect(service.get('nonexistent')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return false for an unregistered icon', () => {
      expect(service.has('nonexistent')).toBeFalse();
    });

    it('should return true after registration', () => {
      service.register('exists', '<path/>');
      expect(service.has('exists')).toBeTrue();
    });
  });
});
