import { Directive, ElementRef, inject, input, output } from '@angular/core';

/** A touch that turns into page scrolling must not leave a slider changed. */
@Directive({
  selector: 'input[type=range][appScrollSafeRange]',
  host: {
    class: 'hd-scroll-safe-range',
    '(pointerdown)': 'remember($event)',
    '(pointerup)': 'finish()',
    '(pointercancel)': 'restore()',
  },
})
export class ScrollSafeRangeDirective {
  public readonly appScrollSafeRange = input.required<number>();
  public readonly valueRestored = output<number>();
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private startingValue: number | null = null;

  public remember(event: PointerEvent): void {
    this.startingValue =
      event.pointerType === 'touch' ? this.appScrollSafeRange() : null;
  }

  public finish(): void {
    this.startingValue = null;
  }

  public restore(): void {
    const value = this.startingValue;
    this.finish();
    if (value === null) return;
    this.element.nativeElement.value = String(value);
    // A range rounds off-grid numbers and clamps values outside its track.
    // Restore the bound number so cancelling a scroll preserves typed precision.
    this.valueRestored.emit(value);
  }
}
