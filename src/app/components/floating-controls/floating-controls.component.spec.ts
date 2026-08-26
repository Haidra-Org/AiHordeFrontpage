import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingControlsComponent } from './floating-controls.component';
import en from '../../../assets/i18n/en.json';

describe('FloatingControlsComponent', () => {
  let fixture: ComponentFixture<FloatingControlsComponent>;
  let position = 0;

  const row = (): HTMLElement =>
    (fixture.nativeElement as HTMLElement).querySelector(
      '.floating-controls',
    ) as HTMLElement;
  const retreated = (): boolean =>
    row().classList.contains('floating-controls--retreated');

  /** Stand the viewport either side of the width where the row gets a margin. */
  const setViewport = (parked: boolean): void => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: parked,
      media,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  };

  /** Move the page and let the throttled handler run. */
  const scrollTo = (to: number): void => {
    position = to;
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(32);
    fixture.detectChanges();
  };

  const build = async (parked = false): Promise<void> => {
    setViewport(parked);
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        FloatingControlsComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FloatingControlsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    vi.advanceTimersByTime(32);
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    position = 0;
    vi.spyOn(window, 'pageYOffset', 'get').mockImplementation(() => position);
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('steps away while the reader moves down the page', async () => {
    await build();
    expect(retreated()).toBe(false);

    scrollTo(600);
    expect(retreated()).toBe(true);
  });

  it('comes back on the way up', async () => {
    await build();
    scrollTo(600);
    expect(retreated()).toBe(true);

    scrollTo(400);
    expect(retreated()).toBe(false);
  });

  it('comes back once the page settles', async () => {
    await build();
    scrollTo(600);
    expect(retreated()).toBe(true);

    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(retreated()).toBe(false);
  });

  it('holds its place through movement too small to be a reader', async () => {
    await build();
    scrollTo(600);
    expect(retreated()).toBe(true);

    scrollTo(596);
    expect(retreated()).toBe(true);
  });

  it('never steps away where it stands in the page margin', async () => {
    await build(true);

    scrollTo(600);
    expect(retreated()).toBe(false);

    scrollTo(1200);
    expect(retreated()).toBe(false);
  });

  it('returns when a control takes focus, and stays put while it holds it', async () => {
    await build();
    scrollTo(600);
    expect(retreated()).toBe(true);

    const fab = row().querySelector('.glossary-fab') as HTMLButtonElement;
    fab.focus();
    fixture.detectChanges();
    expect(retreated()).toBe(false);

    scrollTo(1200);
    expect(retreated()).toBe(false);
  });
});
