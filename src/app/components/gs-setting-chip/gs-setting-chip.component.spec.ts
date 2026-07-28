import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GsSettingChipComponent } from './gs-setting-chip.component';
import { SettingValue } from '../../pages/generate/setting-vocabulary';
import en from '../../../assets/i18n/en.json';

@Component({
  imports: [GsSettingChipComponent],
  template: `<app-gs-setting-chip
    [settingId]="settingId"
    [value]="value"
    [glyph]="glyph"
  />`,
})
class HostComponent {
  public settingId = 'steps';
  public value: SettingValue | null = 30;
  public glyph = true;
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
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
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
