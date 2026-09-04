import { Component, signal, viewChild } from '@angular/core';
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
        [rememberAs]="rememberAs"
        (closed)="closed = closed + 1"
        (swiped)="swiped.push($event)"
      >
        <span sheet-bar>Bar</span>
        <h2>Body heading</h2>
        <p>Body prose</p>
      </app-gs-sheet>
    }
  `,
})
class HostComponent {
  public readonly sheet = viewChild.required(GsSheetComponent);
  public readonly mounted = signal(true);
  public startExpanded = false;
  public rememberAs: string | null = null;
  public closed = 0;
  public readonly swiped: ('forward' | 'back')[] = [];
}

/** A pointer event jsdom can build, with the fields the gesture maths reads. */
function pointer(type: string, clientY: number, clientX = 0): PointerEvent {
  return new MouseEvent(type, {
    clientX,
    clientY,
    bubbles: true,
  }) as unknown as PointerEvent;
}

describe('GsSheetComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const find = <T extends Element>(selector: string): T | null =>
    el().querySelector<T>(selector);
  /** The stop button carrying this label, or null where the sheet has none. */
  const stopButton = (key: string): HTMLButtonElement | null =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('.gs-sheet-btn')).find(
      (button) => button.textContent?.trim() === translations[key],
    ) ?? null;
  const chevron = (): HTMLButtonElement =>
    el().querySelectorAll<HTMLButtonElement>('.gs-sheet-btn')[0];
  const dismiss = (): HTMLButtonElement =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('.gs-sheet-btn')).find(
      (button) =>
        button.getAttribute('aria-label') ===
        translations['generate.sheet.close'],
    )!;
  const grab = (): HTMLElement => find<HTMLElement>('.gs-sheet-grab')!;
  const body = (): HTMLElement => find<HTMLElement>('.gs-sheet-body')!;

  /** Let the sheet's post-render work (focus, clearance) run. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setUp(
    startExpanded = false,
    rememberAs: string | null = null,
  ): Promise<void> {
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
    fixture.componentInstance.rememberAs = rememberAs;
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
    // The only way to go from the bar is up, and the button says so in words.
    expect(stopButton('generate.sheet.show')).not.toBeNull();
    expect(stopButton('generate.sheet.hide')).toBeNull();
  });

  it('opens where the caller asks it to, with focus on the heading', async () => {
    await setUp(true);

    expect(chevron().getAttribute('aria-expanded')).toBe('true');
    expect(body().hidden).toBe(false);
    expect(find('.gs-sheet-slot')?.textContent?.trim()).toBe('Bar');
  });

  it('shows the body from the bar, and hides it again', async () => {
    await setUp();

    stopButton('generate.sheet.show')!.click();
    await settle();
    expect(body().hidden).toBe(false);
    expect(document.activeElement?.tagName).toBe('H2');
    // At half a reader can go either way, and each way is named.
    expect(stopButton('generate.sheet.fill')).not.toBeNull();
    expect(stopButton('generate.sheet.hide')).not.toBeNull();

    stopButton('generate.sheet.hide')!.click();
    await settle();
    expect(body().hidden).toBe(true);
  });

  it('remembers its stop for the visit, and comes back to it', async () => {
    sessionStorage.clear();
    await setUp(false, 'test.sheet.stop');

    stopButton('generate.sheet.show')!.click();
    await settle();
    stopButton('generate.sheet.fill')!.click();
    await settle();
    // The visit, not for ever: a reader who meets the sheet again months later
    // should not find it already over the thing they came back for.
    expect(sessionStorage.getItem('test.sheet.stop')).toBe('full');
    expect(localStorage.getItem('test.sheet.stop')).toBeNull();

    // Remount: the sheet opens where it was left.
    fixture.componentInstance.mounted.set(false);
    fixture.detectChanges();
    fixture.componentInstance.mounted.set(true);
    fixture.detectChanges();
    await settle();
    expect(fixture.componentInstance.sheet().stop()).toBe('full');
    sessionStorage.clear();
  });

  it('fills the viewport from half, and shrinks back to half', async () => {
    await setUp(true);

    stopButton('generate.sheet.fill')!.click();
    await settle();
    expect(fixture.componentInstance.sheet().stop()).toBe('full');
    expect(el().querySelector('.gs-sheet--full')).not.toBeNull();
    // Full has one way to go, down, and never a way to keep growing.
    expect(stopButton('generate.sheet.fill')).toBeNull();
    expect(stopButton('generate.sheet.show')).toBeNull();

    stopButton('generate.sheet.shrink')!.click();
    await settle();
    expect(fixture.componentInstance.sheet().stop()).toBe('half');
    expect(body().hidden).toBe(false);
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
      // From half the sheet follows both ways, because there is a stop above
      // as well as below; from full it follows down only.
      grab().dispatchEvent(pointer('pointermove', 40));
      fixture.detectChanges();
      expect(find<HTMLElement>('.gs-sheet-panel')?.style.transform).toBe(
        'translateY(-60px)',
      );
      grab().dispatchEvent(pointer('pointerup', 40));
      stopButton('generate.sheet.fill')?.click();
      await settle();
      grab().dispatchEvent(pointer('pointerdown', 100));
      grab().dispatchEvent(pointer('pointermove', 40));
      fixture.detectChanges();
      expect(find<HTMLElement>('.gs-sheet-panel')?.style.transform).toBe('');
    });
  });

  describe('the sideways gesture', () => {
    const bar = (): HTMLElement => find<HTMLElement>('.gs-sheet-bar')!;
    /** One gesture across a surface, from the middle of the screen. */
    function across(surface: HTMLElement, dx: number, dy = 0): void {
      surface.dispatchEvent(pointer('pointerdown', 400, 200));
      surface.dispatchEvent(pointer('pointermove', 400 + dy, 200 + dx));
      surface.dispatchEvent(pointer('pointerup', 400 + dy, 200 + dx));
    }

    it('reports a swipe across the bar in the direction it went', async () => {
      await setUp();

      across(bar(), -60);
      expect(fixture.componentInstance.swiped).toEqual(['forward']);

      across(bar(), 60);
      expect(fixture.componentInstance.swiped).toEqual(['forward', 'back']);
    });

    it('reports a swipe across the body too', async () => {
      await setUp(true);

      across(body(), -60);

      expect(fixture.componentInstance.swiped).toEqual(['forward']);
    });

    it('says nothing about a move too short to be meant', async () => {
      await setUp();

      across(bar(), -20);

      expect(fixture.componentInstance.swiped).toEqual([]);
    });

    it('gives a steep gesture to the stops rather than to the content', async () => {
      await setUp();
      const host = find<HTMLElement>('app-gs-sheet')!;
      vi.spyOn(host, 'offsetHeight', 'get').mockReturnValue(400);

      // Far enough sideways to pass the distance on its own, and far enough up
      // that the gesture is plainly a drag towards the stop above.
      across(bar(), -40, -160);
      await settle();

      expect(fixture.componentInstance.swiped).toEqual([]);
      expect(body().hidden).toBe(false);
    });
  });

  it('puts the body back at its top when the caller asks', async () => {
    await setUp(true);
    const scrolled: ScrollToOptions[] = [];
    body().scrollTo = ((options: ScrollToOptions) => {
      scrolled.push(options);
    }) as typeof body.prototype.scrollTo;

    fixture.componentInstance.sheet().scrollBodyToTop();

    expect(scrolled).toEqual([{ top: 0, behavior: 'auto' }]);
  });

  describe('the system Back gesture', () => {
    it('takes the sheet down to its bar before it leaves the page', async () => {
      await setUp(true);

      window.dispatchEvent(new PopStateEvent('popstate'));
      await settle();

      expect(body().hidden).toBe(true);
    });

    it('leaves a sheet that is already a bar alone', async () => {
      await setUp();

      window.dispatchEvent(new PopStateEvent('popstate'));
      await settle();

      expect(fixture.componentInstance.sheet().stop()).toBe('peek');
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
