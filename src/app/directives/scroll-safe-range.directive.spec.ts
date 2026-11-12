import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScrollSafeRangeDirective } from './scroll-safe-range.directive';

@Component({
  imports: [ScrollSafeRangeDirective, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<input type="range" min="-5" max="5" step="any" [appScrollSafeRange]="control.value" (valueRestored)="control.setValue($event)" [formControl]="control" />',
})
class HostComponent {
  public readonly control = new FormControl(0.65, { nonNullable: true });
}

describe('ScrollSafeRangeDirective', () => {
  let field: HTMLInputElement;
  let host: HostComponent;
  const pointer = (type: string, pointerType = 'touch'): void => {
    field.dispatchEvent(
      Object.assign(new Event(type, { bubbles: true }), { pointerType }),
    );
  };
  const change = (): void => {
    field.value = '4.5';
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  beforeEach(() => {
    const fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    field = (fixture.nativeElement as HTMLElement).querySelector('input')!;
  });

  it('restores the field and form when the browser takes a touch for scrolling', () => {
    pointer('pointerdown');
    change();
    expect(host.control.value).toBe(4.5);
    pointer('pointercancel');
    expect(field.value).toBe('0.65');
    expect(host.control.value).toBe(0.65);
  });

  it('keeps a completed touch adjustment', () => {
    pointer('pointerdown');
    change();
    pointer('pointerup');
    pointer('pointercancel');
    expect(host.control.value).toBe(4.5);
  });

  it('preserves a typed number that the slider has rounded', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.control.setValue(0.173);
    fixture.detectChanges();
    field = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    field.step = '0.05';
    field.value = '0.15';
    pointer('pointerdown');
    change();
    pointer('pointercancel');
    expect(fixture.componentInstance.control.value).toBe(0.173);
  });

  it('leaves mouse adjustments alone', () => {
    pointer('pointerdown', 'mouse');
    change();
    pointer('pointercancel', 'mouse');
    expect(host.control.value).toBe(4.5);
  });
});
