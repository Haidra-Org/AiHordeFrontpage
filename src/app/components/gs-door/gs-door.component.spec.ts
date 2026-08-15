import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GsDoorComponent } from './gs-door.component';

@Component({
  imports: [GsDoorComponent],
  template: `<app-gs-door
    [kind]="kind()"
    [eyebrow]="eyebrow()"
    [title]="title()"
    [meta]="meta()"
    [tiles]="tiles()"
    [controlClass]="controlClass()"
    [disabled]="disabled()"
    (entered)="entered()"
  />`,
})
class HostComponent {
  public readonly kind = signal<'grid' | 'studio'>('grid');
  public readonly eyebrow = signal<string | null>('Sampling · Evidence grid');
  public readonly title = signal('Open the Steps × Guidance grid');
  public readonly meta = signal<string | null>('36 frames · 6 × 6');
  public readonly tiles = signal<readonly string[]>([
    '/a.webp',
    '/b.webp',
    '/c.webp',
  ]);
  public readonly controlClass = signal('');
  public readonly disabled = signal(false);
  public readonly entered = vi.fn();
}

describe('GsDoorComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('leads a grid door with the plate own frames and an arrow', () => {
    // The contact sheet is what tells one grid door from the next, the way the
    // capsule's peek tells one strip from the next.
    expect(
      all<HTMLImageElement>('.gs-door-tile').map((tile) =>
        tile.getAttribute('src'),
      ),
    ).toEqual(['/a.webp', '/b.webp', '/c.webp']);
    expect(find('.gs-cap-eyebrow')?.textContent?.trim()).toBe(
      'Sampling · Evidence grid',
    );
    expect(find('.gs-cap-title')?.textContent?.trim()).toBe(
      'Open the Steps × Guidance grid',
    );
    expect(find('.gs-cap-meta')?.textContent?.trim()).toBe('36 frames · 6 × 6');
    // A door leaves, so it never wears the chevron the capsules wear.
    expect(find('.gs-door-arrow')).not.toBeNull();
    expect(find('.gs-cap-go')).toBeNull();
  });

  it('trades the film for the panel own mark on a studio door', () => {
    fixture.componentInstance.kind.set('studio');
    fixture.componentInstance.eyebrow.set(null);
    fixture.detectChanges();

    // "Go and do" must never look like "stay and see", which is the whole
    // reason the studio door drops the frames.
    expect(find('.gs-door-panel')).not.toBeNull();
    expect(find('.gs-door-sheet')).toBeNull();
    expect(find('.gs-cap-eyebrow')).toBeNull();
  });

  it('reports the press, and reports nothing while it is disabled', () => {
    const button = find<HTMLButtonElement>('button')!;
    button.click();

    expect(fixture.componentInstance.entered).toHaveBeenCalledTimes(1);

    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    button.click();

    expect(button.disabled).toBe(true);
    expect(fixture.componentInstance.entered).toHaveBeenCalledTimes(1);
  });

  it('wears the class the surface mounting it hangs its own rules on', () => {
    fixture.componentInstance.controlClass.set('gs-tut-start-btn');
    fixture.detectChanges();

    const button = find<HTMLButtonElement>('button')!;
    expect(button.classList.contains('gs-tut-start-btn')).toBe(true);
    expect(button.classList.contains('gs-cap')).toBe(true);
  });
});
