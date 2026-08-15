import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GsSettingChipComponent,
  REFERENCE_ORIGIN_STATE,
} from './gs-setting-chip.component';
import { SettingValue } from '../../content/settings';
import { GsHelpDockService } from '../../services/gs-help-dock.service';
import en from '../../../assets/i18n/en.json';

@Component({
  imports: [GsSettingChipComponent],
  template: `<app-gs-setting-chip
    [settingId]="settingId"
    [value]="value"
    [glyph]="glyph"
    [entry]="entry"
  />`,
})
class HostComponent {
  public settingId = 'steps';
  public value: SettingValue | null = 30;
  public glyph = true;
  public entry = false;
}

describe('GsSettingChipComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const chip = (): HTMLElement =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.gs-setting-chip',
    )!;

  const text = (): string =>
    chip().textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const render = (
    settingId: string,
    value: SettingValue | null,
    glyph = true,
  ): void => {
    fixture.componentInstance.settingId = settingId;
    fixture.componentInstance.value = value;
    fixture.componentInstance.glyph = glyph;
    fixture.detectChanges();
  };

  beforeEach(async () => {
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

    // The chip asks the service whether a note exists rather than piping it,
    // so the file has to be loaded before the first render, as it is in the app.
    await firstValueFrom(TestBed.inject(TranslocoService).load('en'));
    fixture = TestBed.createComponent(HostComponent);
  });

  describe('as an entry point', () => {
    const translations = en as Record<string, string>;
    const button = (): HTMLButtonElement =>
      chip().querySelector<HTMLButtonElement>('.gs-setting-chip-btn')!;
    const pop = (): HTMLElement | null =>
      chip().querySelector<HTMLElement>('.gs-setting-pop');

    const open = (settingId = 'steps'): void => {
      fixture.componentInstance.entry = true;
      render(settingId, null);
      button().click();
      fixture.detectChanges();
    };

    it('is a plain token until asked to be a way in', () => {
      render('steps', 30);

      expect(chip().querySelector('button')).toBeNull();
      expect(text()).toBe('Steps 30');
    });

    it('stays a plain token for a setting with no note and no reference to open', () => {
      fixture.componentInstance.entry = true;
      // A setting the vocabulary does not know has neither a note nor a page.
      render('nothing_here', 3);

      expect(chip().querySelector('button')).toBeNull();
    });

    it('presses to open the setting note in place, and reads the same', async () => {
      fixture.componentInstance.entry = true;
      render('steps', 30);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(button().getAttribute('aria-haspopup')).toBe('dialog');
      expect(button().getAttribute('aria-expanded')).toBe('false');
      expect(pop()).toBeNull();

      button().click();
      fixture.detectChanges();

      expect(button().getAttribute('aria-expanded')).toBe('true');
      expect(pop()?.getAttribute('role')).toBe('dialog');
      expect(pop()?.textContent).toContain(
        translations['generate.help.steps.title'],
      );
      expect(pop()?.textContent).toContain(
        translations['generate.help.steps.body'],
      );
      expect(pop()?.textContent).toContain(
        translations['generate.reference.open_full'],
      );
    });

    it('closes on Escape and hands focus back to the chip', () => {
      open();
      button().focus();
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      fixture.detectChanges();

      expect(pop()).toBeNull();
      expect(document.activeElement).toBe(button());
    });

    it('closes when the reader presses anywhere else', () => {
      open();
      document.body.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true }),
      );
      fixture.detectChanges();

      expect(pop()).toBeNull();
    });

    it('docks the entry beside the results while the reader is in a studio', () => {
      const router = TestBed.inject(Router);
      const dock = TestBed.inject(GsHelpDockService);
      vi.spyOn(router, 'url', 'get').mockReturnValue('/generate/image');
      const navigate = vi.spyOn(router, 'navigateByUrl');
      open();

      pop()!.querySelector<HTMLButtonElement>('.gs-setting-pop-go')!.click();
      fixture.detectChanges();

      expect(dock.topic()).toBe('steps');
      expect(navigate).not.toHaveBeenCalled();
      expect(pop()).toBeNull();
    });

    it('goes to the reference page from anywhere else, carrying where the reader was', () => {
      const router = TestBed.inject(Router);
      TestBed.inject(Title).setTitle(
        'Restyle an image you already have | AI Horde',
      );
      vi.spyOn(router, 'url', 'get').mockReturnValue(
        '/docs/image/learn/img2img',
      );
      const navigate = vi
        .spyOn(router, 'navigateByUrl')
        .mockResolvedValue(true);
      open('cfg_scale');

      pop()!.querySelector<HTMLButtonElement>('.gs-setting-pop-go')!.click();

      expect(navigate).toHaveBeenCalledWith('/docs/image/settings/cfg', {
        state: {
          [REFERENCE_ORIGIN_STATE]: {
            url: '/docs/image/learn/img2img',
            title: 'Restyle an image you already have',
          },
        },
      });
    });
  });

  it('names the setting and its value, marked with the card it lives on', () => {
    render('steps', 30);

    expect(text()).toBe('Steps 30');
    expect(chip().className).toContain('gs-sec--sampling');
    expect(chip().querySelector('.gs-sec-chip')).not.toBeNull();
  });

  it('reads a fractional number as the number, not as a filename token', () => {
    // The bug this idiom was built to end: the sweep library labels 0.15 as
    // `0_15`, which is the name of a file rather than a setting anybody set.
    render('denoise', 0.15);

    expect(text()).toBe('Denoise 0.15');
  });

  it('reads a flag that is on as the state the page has words for', () => {
    render('karras', true);

    expect(text()).toBe('Karras On');
  });

  it('reads a flag that is off as a state rather than as nothing at all', () => {
    render('karras', false);

    expect(text()).toBe('Karras Off');
  });

  it('leaves a string exactly as it came', () => {
    render('sampler', 'k_dpmpp_2m');

    expect(text()).toBe('Sampler k_dpmpp_2m');
  });

  it('answers to the API field name as well as to the studio id', () => {
    render('cfg_scale', 7);

    expect(text()).toBe('Guidance 7');
    expect(chip().className).toContain('gs-sec--sampling');
  });

  it('names the setting alone when there is no value to put beside it', () => {
    render('seed', null);

    expect(text()).toBe('Seed');
    expect(chip().querySelector('.gs-setting-chip-value')).toBeNull();
  });

  it('drops the glyph where a row of marks would be noise', () => {
    render('steps', 8, false);

    expect(chip().querySelector('.gs-sec-chip')).toBeNull();
    expect(text()).toBe('Steps 8');
  });

  it('takes no mark at all for a setting the vocabulary does not know', () => {
    render('nothing_here', 3);

    expect(chip().querySelector('.gs-sec-chip')).toBeNull();
    expect(chip().className).not.toContain('gs-sec--');
  });
});
