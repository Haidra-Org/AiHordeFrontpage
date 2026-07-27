import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GsSheetComponent } from './gs-sheet.component';
import en from '../../../assets/i18n/en.json';

const translations = en as Record<string, string>;

/** The var the sheet publishes so the page can scroll clear of it. */
const CLEARANCE_VAR = '--gs-sheet-clearance';

@Component({
  imports: [GsSheetComponent],
  template: `
    @if (mounted()) {
      <app-gs-sheet
        [label]="'Sheet'"
        [startExpanded]="startExpanded"
        (closed)="closed = closed + 1"
      >
        <span sheet-bar>Bar</span>
        <h2>Body heading</h2>
        <p>Body prose</p>
      </app-gs-sheet>
    }
  `,
})
class HostComponent {
  public readonly mounted = signal(true);
  public startExpanded = false;
  public closed = 0;
}

/** A pointer event jsdom can build, with the fields the drag maths reads. */
function pointer(type: string, clientY: number): PointerEvent {
  return new MouseEvent(type, {
    clientY,
    bubbles: true,
  }) as unknown as PointerEvent;
}

describe('GsSheetComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  const chevron = (): HTMLButtonElement =>
    el().querySelectorAll<HTMLButtonElement>('.gs-sheet-btn')[0];
  const dismiss = (): HTMLButtonElement =>
    el().querySelectorAll<HTMLButtonElement>('.gs-sheet-btn')[1];
  const grab = (): HTMLElement => find<HTMLElement>('.gs-sheet-grab')!;
  const body = (): HTMLElement => find<HTMLElement>('.gs-sheet-body')!;

  /** Let the sheet's post-render work (focus, clearance) run. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setUp(startExpanded = false): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.startExpanded = startExpanded;
    await settle();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    document.documentElement.style.removeProperty(CLEARANCE_VAR);
  });

  it('docks as a bar, with the body hidden and the chevron saying so', async () => {
    await setUp();

    expect(chevron().getAttribute('aria-expanded')).toBe('false');
    expect(chevron().getAttribute('aria-controls')).toBe(body().id);
    expect(body().hidden).toBe(true);
    expect(chevron().getAttribute('aria-label')).toBe(
      translations['generate.sheet.expand'],
    );
  });

  it('opens where the caller asks it to, with focus on the heading', async () => {
    await setUp(true);

    expect(chevron().getAttribute('aria-expanded')).toBe('true');
    expect(body().hidden).toBe(false);
    expect(find('.gs-sheet-slot')?.textContent?.trim()).toBe('Bar');
  });

  it('expands and collapses from the chevron', async () => {
    await setUp();

    chevron().click();
    await settle();
    expect(body().hidden).toBe(false);
    expect(document.activeElement?.tagName).toBe('H2');
    expect(chevron().getAttribute('aria-label')).toBe(
      translations['generate.sheet.collapse'],
    );

    chevron().click();
    await settle();
    expect(body().hidden).toBe(true);
  });

  it('expands on a tap of the grabber', async () => {
    await setUp();

    grab().click();
    await settle();

    expect(body().hidden).toBe(false);
  });

  it('unwinds one layer per Escape, and dismisses from the bar', async () => {
    await setUp(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(body().hidden).toBe(true);
    expect(fixture.componentInstance.closed).toBe(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(fixture.componentInstance.closed).toBe(1);
  });

  it('dismisses from its own close button', async () => {
    await setUp();

    dismiss().click();
    await settle();

    expect(fixture.componentInstance.closed).toBe(1);
    expect(dismiss().getAttribute('aria-label')).toBe(
      translations['generate.sheet.close'],
    );
  });

  describe('the drag gesture', () => {
    /** jsdom lays nothing out, so the travel the snap is measured against. */
    function withHeight(height: number): void {
      const host = find<HTMLElement>('app-gs-sheet')!;
      vi.spyOn(host, 'offsetHeight', 'get').mockReturnValue(height);
    }

    it('snaps open when an upward drag crosses a quarter of the travel', async () => {
      await setUp();
      withHeight(400);

      grab().dispatchEvent(pointer('pointerdown', 500));
      grab().dispatchEvent(pointer('pointermove', 380));
      grab().dispatchEvent(pointer('pointerup', 380));
      await settle();

      expect(body().hidden).toBe(false);
    });

    it('restores when the drag stops short of the threshold', async () => {
      await setUp(true);
      withHeight(400);

      grab().dispatchEvent(pointer('pointerdown', 100));
      grab().dispatchEvent(pointer('pointermove', 140));
      grab().dispatchEvent(pointer('pointerup', 140));
      await settle();

      expect(body().hidden).toBe(false);
      expect(find<HTMLElement>('.gs-sheet-panel')?.style.transform).toBe('');
    });

    it('snaps shut on a downward drag, and the drag is not also a tap', async () => {
      await setUp(true);
      withHeight(400);

      grab().dispatchEvent(pointer('pointerdown', 100));
      grab().dispatchEvent(pointer('pointermove', 260));
      grab().dispatchEvent(pointer('pointerup', 260));
      // The browser fires a click after the gesture; it must not re-open.
      grab().click();
      await settle();

      expect(body().hidden).toBe(true);
    });

    it('follows the pointer while the drag is in flight', async () => {
      await setUp(true);
      withHeight(400);

      grab().dispatchEvent(pointer('pointerdown', 100));
      grab().dispatchEvent(pointer('pointermove', 150));
      fixture.detectChanges();

      expect(find<HTMLElement>('.gs-sheet-panel')?.style.transform).toBe(
        'translateY(50px)',
      );
      // An expanded sheet does not follow the pointer upwards.
      grab().dispatchEvent(pointer('pointermove', 40));
      fixture.detectChanges();
      expect(find<HTMLElement>('.gs-sheet-panel')?.style.transform).toBe('');
    });
  });

  it('publishes its clearance while it exists and takes it back when it goes', async () => {
    await setUp();

    expect(document.documentElement.style.getPropertyValue(CLEARANCE_VAR)).toBe(
      '96px',
    );

    fixture.componentInstance.mounted.set(false);
    await settle();

    expect(document.documentElement.style.getPropertyValue(CLEARANCE_VAR)).toBe(
      '',
    );
  });
});
