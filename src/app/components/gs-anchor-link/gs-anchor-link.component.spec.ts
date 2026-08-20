import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GsAnchorLinkComponent } from './gs-anchor-link.component';
import en from '../../../assets/i18n/en.json';

@Component({
  imports: [GsAnchorLinkComponent],
  template: `
    <h2 id="spec-section">
      Sampling
      <app-gs-anchor-link [targetId]="targetId()" [label]="label()" />
    </h2>
  `,
})
class HostComponent {
  public readonly targetId = signal('spec-section');
  public readonly label = signal('Sampling');
}

describe('GsAnchorLinkComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let writeText: ReturnType<typeof vi.fn>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const link = (): HTMLAnchorElement => {
    const anchor = el().querySelector<HTMLAnchorElement>('.gs-anchor-link');
    if (!anchor) {
      throw new Error('the heading carries no link');
    }
    return anchor;
  };

  /** A press the browser would treat as an ordinary follow. */
  const press = (init: MouseEventInit = {}): MouseEvent => {
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...init,
    });
    link().dispatchEvent(event);
    return event;
  };

  /** Let the copy, which is awaited inside the handler, settle. */
  const settle = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { clipboard: { writeText } } as unknown);

    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('points at the place it names, and says which place that is', () => {
    expect(link().getAttribute('href')).toBe('#spec-section');
    expect(link().getAttribute('aria-label')).toBe('Copy a link to “Sampling”');
  });

  it('takes the whole address, fragment and all, on a plain press', async () => {
    const event = press();
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledWith(
      `${globalThis.location.href.split('#')[0]}#spec-section`,
    );
  });

  it('writes the place into the address bar as well as onto the clipboard', async () => {
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);

    press();
    await settle();

    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ fragment: 'spec-section', replaceUrl: true }),
    );
  });

  it('confirms the copy, then goes back to offering', async () => {
    press();
    await settle();
    expect(el().querySelector('.gs-anchor-said')?.textContent?.trim()).toBe(
      'Link copied',
    );

    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(el().querySelector('.gs-anchor-said')?.textContent?.trim()).toBe('');
  });

  it('leaves a press asking for a new tab to the browser', async () => {
    const event = press({ ctrlKey: true });
    await settle();

    expect(event.defaultPrevented).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('shares the page itself where the heading names no place within it', async () => {
    fixture.componentRef.instance.targetId.set('');
    fixture.detectChanges();

    expect(link().getAttribute('href')).toBe('/');

    press();
    await settle();
    expect(writeText).toHaveBeenCalledWith(
      globalThis.location.href.split('#')[0],
    );
  });

  it('falls back to a nameless offer where the heading gave no words', () => {
    fixture.componentRef.instance.label.set('');
    fixture.detectChanges();

    expect(link().getAttribute('aria-label')).toBe(
      'Copy a link to this part of the page',
    );
  });
});
