import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GsRecipeChipsComponent,
  RecipeRequest,
} from './gs-recipe-chips.component';
import {
  SETTING_FALLBACK_LABEL_KEY,
  settingLabelKey,
} from '../../pages/generate/setting-vocabulary';
import en from '../../../assets/i18n/en.json';

const TRANSLATIONS = en as Record<string, string>;

/** Everything the chips can read, so the full set can be asserted at once. */
const FULL_REQUEST: RecipeRequest = {
  models: ['Deliberate'],
  params: {
    width: 512,
    height: 768,
    steps: 30,
    cfg_scale: 7.5,
    sampler_name: 'k_euler_a',
    seed: '1234567890',
    denoising_strength: 0.55,
    karras: false,
    hires_fix: true,
    post_processing: ['GFPGAN', 'RealESRGAN_x4plus'],
    n: 4,
  },
};

describe('GsRecipeChipsComponent', () => {
  let fixture: ComponentFixture<GsRecipeChipsComponent>;

  const chips = (): HTMLElement[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.gs-setting-chip',
      ),
    );

  const texts = (): string[] =>
    chips().map((chip) => chip.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  const render = (request: RecipeRequest | null): void => {
    fixture.componentRef.setInput('request', request);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        GsRecipeChipsComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GsRecipeChipsComponent);
  });

  it('reads every field a full request sets, in panel order', () => {
    render(FULL_REQUEST);

    expect(fixture.componentInstance.chips().map((chip) => chip.id)).toEqual([
      'model',
      'size',
      'steps',
      'cfg',
      'sampler',
      'seed',
      'denoise',
      'karras',
      'hires',
      'post',
      'post',
      'batch',
    ]);
    expect(texts()).toContain('Size 512×768');
    expect(texts()).toContain('Post-processing GFPGAN');
    expect(texts()).toContain('Images 4');
  });

  it('fills nothing in for a request that set nothing', () => {
    // The sparse case is the point: a chip for a field this request never
    // carried would be the card claiming a setting the example never made.
    render({ models: ['Deliberate'], params: { steps: 12 } });

    expect(texts()).toEqual(['Model Deliberate', 'Steps 12']);
  });

  it('renders nothing at all without a request', () => {
    render(null);

    expect(chips()).toHaveLength(0);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.gs-recipe'),
    ).toBeNull();
  });

  it('reports the sigmas being turned off as much as being turned on', () => {
    render({ params: { karras: false } });
    expect(texts()).toEqual(['Karras Off']);

    render({ params: { karras: true } });
    expect(texts()).toEqual(['Karras On']);
  });

  it('keeps a single image out of the recipe', () => {
    render({ params: { n: 1 } });
    expect(chips()).toHaveLength(0);

    render({ params: { n: 2 } });
    expect(texts()).toEqual(['Images 2']);
  });

  it('leaves a seed the request never settled out of the recipe', () => {
    render({ params: { seed: '' } });

    expect(chips()).toHaveLength(0);
  });

  it('marks each chip with the panel area its field belongs to', () => {
    render(FULL_REQUEST);

    const classes = chips().map((chip) => chip.className);

    expect(classes[0]).toContain('gs-sec--model');
    expect(classes[1]).toContain('gs-sec--size');
    // Steps, guidance, the sampler and the seed are all the sampling card.
    expect(
      classes.slice(2, 6).every((name) => name.includes('gs-sec--sampling')),
    ).toBe(true);
    expect(classes[6]).toContain('gs-sec--source');
    expect(classes[9]).toContain('gs-sec--finishing');
    // The glyph carries the hue; the label and value are ordinary text.
    expect(chips()[0].querySelector('.gs-sec-chip')).not.toBeNull();
  });

  it('has an English string for every label it can render', () => {
    render(FULL_REQUEST);

    const keys = fixture.componentInstance
      .chips()
      .map((chip) => settingLabelKey(chip.id));

    expect(TRANSLATIONS['generate.tutorials.recipe_label']).toBeTruthy();
    expect(keys.filter((key) => !TRANSLATIONS[key])).toEqual([]);
    // Every field the chips can read is a setting the vocabulary knows about;
    // a chip falling back to "this" would be a chip with no name on it.
    expect(keys.filter((key) => key === SETTING_FALLBACK_LABEL_KEY)).toEqual(
      [],
    );
  });
});
