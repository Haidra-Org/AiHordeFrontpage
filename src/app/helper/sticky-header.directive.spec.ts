import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { vi } from 'vitest';
import { StickyHeaderDirective } from './sticky-header.directive';
import { StickyRegistryService } from '../services/sticky-registry.service';

@Component({
  template: `<div [appStickyHeader]="order()"></div>`,
  imports: [StickyHeaderDirective],
})
class TestHostComponent {
  readonly order = signal<number | null>(10);
}

describe('StickyHeaderDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  const mockRegistry = {
    register: vi.fn(),
    unregister: vi.fn(),
  };

  beforeEach(() => {
    mockRegistry.register.mockReset();
    mockRegistry.unregister.mockReset();

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
    const [element, order] = mockRegistry.register.mock.calls.at(-1)!;
    expect(element).toBeInstanceOf(HTMLElement);
    expect(order).toBe(10);
  });

  it('should pass the correct order value from the input', () => {
    fixture.componentInstance.order.set(25);
    fixture.detectChanges();

    const [, order] = mockRegistry.register.mock.calls.at(-1)!;
    expect(order).toBe(25);
  });

  it('should unregister the element on destroy', () => {
    fixture.detectChanges();

    const registeredElement = mockRegistry.register.mock.calls.at(-1)![0];

    fixture.destroy();

    expect(mockRegistry.unregister).toHaveBeenCalledTimes(1);
    expect(mockRegistry.unregister).toHaveBeenCalledWith(registeredElement);
  });

  it('should give the place back when the order becomes null', () => {
    // An element that only pins at some widths says so by dropping its order,
    // and its height has to leave the published offset with it.
    fixture.detectChanges();
    const element = mockRegistry.register.mock.calls.at(-1)![0];

    fixture.componentInstance.order.set(null);
    fixture.detectChanges();

    expect(mockRegistry.unregister).toHaveBeenCalledWith(element);
  });

  it('should take a place back when the order returns', () => {
    fixture.componentInstance.order.set(null);
    fixture.detectChanges();
    expect(mockRegistry.register).not.toHaveBeenCalled();

    fixture.componentInstance.order.set(10);
    fixture.detectChanges();

    expect(mockRegistry.register).toHaveBeenCalledTimes(1);
    expect(mockRegistry.register.mock.calls.at(-1)![1]).toBe(10);
  });

  it('should register the native DOM element, not a wrapper', () => {
    fixture.detectChanges();

    const registeredElement = mockRegistry.register.mock.calls.at(-1)![0];
    expect(registeredElement.tagName).toBe('DIV');
  });
});
