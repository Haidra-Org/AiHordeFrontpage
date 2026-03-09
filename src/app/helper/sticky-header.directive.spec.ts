import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { StickyHeaderDirective } from './sticky-header.directive';
import { StickyRegistryService } from '../services/sticky-registry.service';

@Component({
  template: `<div [appStickyHeader]="order"></div>`,
  imports: [StickyHeaderDirective],
})
class TestHostComponent {
  order = 10;
}

describe('StickyHeaderDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let mockRegistry: jasmine.SpyObj<StickyRegistryService>;

  beforeEach(() => {
    mockRegistry = jasmine.createSpyObj('StickyRegistryService', [
      'register',
      'unregister',
    ]);

    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: StickyRegistryService, useValue: mockRegistry },
      ],
    });

    fixture = TestBed.createComponent(TestHostComponent);
  });

  it('should register the element with the registry on init', () => {
    fixture.detectChanges(); // triggers ngOnInit

    expect(mockRegistry.register).toHaveBeenCalledTimes(1);
    const [element, order] = mockRegistry.register.calls.mostRecent().args;
    expect(element).toBeInstanceOf(HTMLElement);
    expect(order).toBe(10);
  });

  it('should pass the correct order value from the input', () => {
    fixture.componentInstance.order = 25;
    fixture.detectChanges();

    const [, order] = mockRegistry.register.calls.mostRecent().args;
    expect(order).toBe(25);
  });

  it('should unregister the element on destroy', () => {
    fixture.detectChanges();

    const registeredElement = mockRegistry.register.calls.mostRecent().args[0];

    fixture.destroy();

    expect(mockRegistry.unregister).toHaveBeenCalledTimes(1);
    expect(mockRegistry.unregister).toHaveBeenCalledWith(registeredElement);
  });

  it('should register the native DOM element, not a wrapper', () => {
    fixture.detectChanges();

    const registeredElement = mockRegistry.register.calls.mostRecent().args[0];
    expect(registeredElement.tagName).toBe('DIV');
  });
});
