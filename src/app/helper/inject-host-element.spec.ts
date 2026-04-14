import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { injectHostElement } from './inject-host-element';

describe('injectHostElement', () => {
  it('returns the native HTMLElement when host is an element', () => {
    const el = document.createElement('div');
    TestBed.configureTestingModule({
      providers: [{ provide: ElementRef, useValue: new ElementRef(el) }],
    });

    const result = TestBed.runInInjectionContext(() => injectHostElement());
    expect(result).toBe(el);
  });

  it('throws when nativeElement is not an HTMLElement', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ElementRef, useValue: new ElementRef('not-an-element') },
      ],
    });

    expect(() =>
      TestBed.runInInjectionContext(() => injectHostElement()),
    ).toThrowError('Directive/component host is not an HTMLElement');
  });
});
