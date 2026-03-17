import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
  afterNextRender,
  signal,
} from '@angular/core';

/**
 * Wraps horizontally-scrollable content and shows sticky gradient
 * arrow buttons at the edges when overflow exists.
 *
 * Replaces the former `ScrollFadeDirective` — arrow buttons are now
 * declared in the template instead of injected imperatively.
 *
 * Usage:
 *   <app-scroll-fade class="details-tabs" role="tablist">
 *     <button class="details-tab">Tab 1</button>
 *     ...
 *   </app-scroll-fade>
 */
@Component({
  selector: 'app-scroll-fade',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="details-tabs-arrow details-tabs-arrow--left"
      [class.is-visible]="hasOverflowLeft()"
      aria-label="Scroll tabs left"
      tabindex="-1"
      (click)="scrollLeft()"
    >&#10094;</button>
    <ng-content />
    <button
      type="button"
      class="details-tabs-arrow details-tabs-arrow--right"
      [class.is-visible]="hasOverflowRight()"
      aria-label="Scroll tabs right"
      tabindex="-1"
      (click)="scrollRight()"
    >&#10095;</button>
  `,
  host: {
    '[class.has-overflow-left]': 'hasOverflowLeft()',
    '[class.has-overflow-right]': 'hasOverflowRight()',
  },
})
export class ScrollFadeComponent implements OnDestroy {
  private readonly elementRef = inject(ElementRef);
  private readonly zone = inject(NgZone);

  private hostEl?: HTMLElement;
  private resizeObserver?: ResizeObserver;

  public readonly hasOverflowLeft = signal(false);
  public readonly hasOverflowRight = signal(false);

  private readonly onScroll = () => this.check();

  constructor() {
    afterNextRender(() => {
      this.hostEl = this.elementRef.nativeElement as HTMLElement;
      this.zone.runOutsideAngular(() => {
        this.hostEl!.addEventListener('scroll', this.onScroll, {
          passive: true,
        });
        this.resizeObserver = new ResizeObserver(() => this.check());
        this.resizeObserver.observe(this.hostEl!);
      });
      this.check();
    });
  }

  ngOnDestroy(): void {
    this.hostEl?.removeEventListener('scroll', this.onScroll);
    this.resizeObserver?.disconnect();
  }

  protected scrollLeft(): void {
    this.hostEl?.scrollBy({ left: -200, behavior: 'smooth' });
  }

  protected scrollRight(): void {
    this.hostEl?.scrollBy({ left: 200, behavior: 'smooth' });
  }

  private check(): void {
    if (!this.hostEl) return;
    const el = this.hostEl;
    this.hasOverflowRight.set(
      el.scrollWidth > el.clientWidth &&
        el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    );
    this.hasOverflowLeft.set(el.scrollLeft > 2);
  }
}
