import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideTransloco } from '@jsverse/transloco';
import { StyleFormComponent } from './style-form.component';
import { signal } from '@angular/core';
import { AiHordeService } from '../../../services/ai-horde.service';
import { SamplerConstraintsService } from '../../../services/sampler-constraints.service';
import { ModelReferenceService } from '../../../services/model-reference.service';
import { ImageStyle, TextStyle } from '../../../types/style';
import { SamplerConstraintsDocument } from '../../../types/sampler-constraints';
import { SAMPLERS } from '../../../pages/generate/generate-form.model';

describe('StyleFormComponent', () => {
  const aiHordeMock = {
    getImageModels: vi.fn().mockReturnValue(of([])),
    getTextModels: vi.fn().mockReturnValue(of([])),
  };

  const imageStyleA: ImageStyle = {
    id: 'img-a',
    name: 'Image Style A',
    info: 'This is image style A info text.',
    prompt: '{p}',
    public: true,
    nsfw: false,
    tags: ['a'],
    models: ['ModelA'],
    params: { width: 512, height: 512 },
    creator: 'user',
    use_count: 1,
  };

  const imageStyleB: ImageStyle = {
    id: 'img-b',
    name: 'Image Style B',
    info: 'This is image style B info text.',
    prompt: '{p}{np}',
    public: false,
    nsfw: true,
    tags: ['b'],
    models: ['ModelB'],
    params: { width: 768, height: 768 },
    creator: 'user',
    use_count: 2,
  };

  const textStyle: TextStyle = {
    id: 'txt-a',
    name: 'Text Style A',
    info: 'This is text style A info text.',
    prompt: '{p}',
    public: true,
    nsfw: false,
    tags: ['t'],
    models: ['TextModel'],
    params: { temperature: 0.7 },
    creator: 'user',
    use_count: 3,
  };

  const contract = signal<SamplerConstraintsDocument | null>(null);
  const samplerConstraintsMock = { contract, load: vi.fn() };

  const referenceNames = signal<string[] | null>(null);
  const referenceBaselines = signal<Record<string, string> | null>(null);
  const modelReferenceMock = {
    names: referenceNames,
    baselines: referenceBaselines,
    load: vi.fn(),
  };

  beforeEach(() => {
    aiHordeMock.getImageModels.mockClear();
    aiHordeMock.getTextModels.mockClear();
    contract.set(null);
    samplerConstraintsMock.load.mockClear();
    referenceNames.set(null);
    referenceBaselines.set(null);
    modelReferenceMock.load.mockClear();

    TestBed.configureTestingModule({
      imports: [StyleFormComponent],
      providers: [
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
        }),
        // LoRA and embedding lookups reach CivitAI through HttpClient. The
        // testing backend keeps them off the network.
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AiHordeService, useValue: aiHordeMock },
        {
          provide: SamplerConstraintsService,
          useValue: samplerConstraintsMock,
        },
        { provide: ModelReferenceService, useValue: modelReferenceMock },
      ],
    });
  });

  describe('sampler choices', () => {
    function contractWith(
      names: readonly string[],
      recommended: readonly string[],
    ) {
      return {
        schema_version: '1.0',
        samplers: Object.fromEntries(
          names.map((name) => [
            name,
            {
              name,
              presentation_tier: recommended.includes(name)
                ? 'recommended'
                : 'advanced',
              solver_type_choices: [],
              accepted_settings: {},
              applies_cfg_pp: false,
              work_profile: {
                kind: 'fixed_rate',
                marginal_work_units_per_trajectory_step: 1,
              },
            },
          ]),
        ),
        hard_constraints: {
          rejected_sampler_scheduler_pairings: [],
          scheduler_baseline_applicability: {},
        },
        presentation_tiers: { recommended: [...recommended] },
        recommendations: [],
        advisories: { cfg_pp_advised_max_cfg_scale: null },
      } as unknown as SamplerConstraintsDocument;
    }

    it('offers the legacy list until the horde publishes a contract, and asks for one', () => {
      const fixture = TestBed.createComponent(StyleFormComponent);
      fixture.componentRef.setInput('styleType', 'image');
      fixture.detectChanges();
      expect(samplerConstraintsMock.load).toHaveBeenCalled();
      expect(fixture.componentInstance.samplerOptions()).toEqual([...SAMPLERS]);
    });

    it('offers the contract, recommended tier first, keeping a sampler the style already names', () => {
      contract.set(contractWith(['uni_pc', 'k_euler', 'seeds_3'], ['k_euler']));
      const fixture = TestBed.createComponent(StyleFormComponent);
      fixture.componentRef.setInput('styleType', 'image');
      fixture.componentRef.setInput('initialValues', {
        ...imageStyleA,
        params: { sampler_name: 'k_lms' },
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.samplerOptions()).toEqual([
        'k_euler',
        'uni_pc',
        'seeds_3',
        'k_lms',
      ]);
    });
  });

  describe('model choices', () => {
    it('offers the reference models with the live worker counts over them', () => {
      aiHordeMock.getImageModels.mockReturnValueOnce(
        of([
          { name: 'Deliberate', count: 3 },
          { name: 'Private Merge', count: 1 },
        ]),
      );
      referenceNames.set(['Deliberate', 'Pony Diffusion']);

      const fixture = TestBed.createComponent(StyleFormComponent);
      fixture.componentRef.setInput('styleType', 'image');
      fixture.detectChanges();

      expect(modelReferenceMock.load).toHaveBeenCalled();
      expect(
        fixture.componentInstance
          .availableModels()
          .map((model) => [model.name, model.count, model.custom ?? false]),
      ).toEqual([
        ['Deliberate', 3, false],
        ['Private Merge', 1, true],
        ['Pony Diffusion', 0, false],
      ]);
    });

    it('leaves a text style on the horde list alone', () => {
      aiHordeMock.getTextModels.mockReturnValueOnce(
        of([
          { name: 'Zephyr', count: 1 },
          { name: 'Airoboros', count: 2 },
        ]),
      );
      referenceNames.set(['Deliberate']);

      const fixture = TestBed.createComponent(StyleFormComponent);
      fixture.componentRef.setInput('styleType', 'text');
      fixture.detectChanges();

      expect(
        fixture.componentInstance.availableModels().map((model) => model.name),
      ).toEqual(['Airoboros', 'Zephyr']);
      expect(modelReferenceMock.load).not.toHaveBeenCalled();
    });
  });

  it('should rebase unsaved-change snapshot when initialValues changes', () => {
    const fixture = TestBed.createComponent(StyleFormComponent);

    fixture.componentRef.setInput('styleType', 'image');
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('initialValues', imageStyleA);
    fixture.detectChanges();

    const component = fixture.componentInstance;

    expect(component.form.controls['name'].value).toBe('Image Style A');
    expect(component.hasUnsavedMeaningfulChanges()).toBe(false);

    component.form.controls['name'].setValue('Locally edited name');
    expect(component.hasUnsavedMeaningfulChanges()).toBe(true);

    fixture.componentRef.setInput('initialValues', imageStyleB);
    fixture.detectChanges();

    expect(component.form.controls['name'].value).toBe('Image Style B');
    expect(component.hasUnsavedMeaningfulChanges()).toBe(false);
  });

  it('should reinitialize form when styleType changes and reset snapshot', () => {
    const fixture = TestBed.createComponent(StyleFormComponent);

    fixture.componentRef.setInput('styleType', 'image');
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('initialValues', imageStyleA);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.form.controls['name'].setValue('Changed while image');
    expect(component.hasUnsavedMeaningfulChanges()).toBe(true);

    fixture.componentRef.setInput('styleType', 'text');
    fixture.componentRef.setInput('initialValues', textStyle);
    fixture.detectChanges();

    expect(component.form.controls['name'].value).toBe('Text Style A');
    expect(component.hasUnsavedMeaningfulChanges()).toBe(false);
    expect(aiHordeMock.getTextModels).toHaveBeenCalled();
  });

  describe('LoRAs and embeddings', () => {
    function imageForm(style: ImageStyle) {
      const fixture = TestBed.createComponent(StyleFormComponent);
      fixture.componentRef.setInput('styleType', 'image');
      fixture.componentRef.setInput('initialValues', style);
      fixture.detectChanges();
      return fixture.componentInstance;
    }

    it('seeds the editable lists from the style it was given', () => {
      const component = imageForm({
        ...imageStyleA,
        params: {
          ...imageStyleA.params,
          loras: [{ name: '246091', model: 0.8, clip: 0.6, is_version: true }],
          tis: [{ name: '7808', strength: 0.5 }],
        },
      });

      expect(component.form.controls['loras'].value).toEqual([
        { name: '246091', model: 0.8, clip: 0.6, is_version: true },
      ]);
      expect(component.form.controls['tis'].value).toEqual([
        { name: '7808', strength: 0.5 },
      ]);
    });

    it('keeps a file hash, which a generation never carries', () => {
      const hash = 'a'.repeat(64);
      const component = imageForm({
        ...imageStyleA,
        params: {
          ...imageStyleA.params,
          loras: [{ name: '1', model: 1, clip: 1, sha256: hash }],
        },
      });

      expect(component.form.controls['loras'].value[0].sha256).toBe(hash);
    });

    // The fold below the editor is read back when it loses focus, so a copy
    // left showing the list as it was before a choice would apply that older
    // list over the choice.
    it('rewrites the text below the editor when the list above it changes', () => {
      const component = imageForm(imageStyleA);

      component.setLoras([
        { name: '246091', model: 0.8, clip: 0.6, is_version: true, label: 'x' },
      ]);
      component.setTis([{ name: '7808', strength: 0.5, label: 'y' }]);

      // The text is the payload's own shape, so the reader's label is not in it.
      expect(
        JSON.parse(component.form.controls['loras_json'].value as string),
      ).toEqual([{ name: '246091', model: 0.8, clip: 0.6, is_version: true }]);
      expect(
        JSON.parse(component.form.controls['tis_json'].value as string),
      ).toEqual([{ name: '7808', strength: 0.5 }]);

      component.setLoras([]);
      expect(component.form.controls['loras_json'].value).toBe('');
    });

    it('says so when the JSON escape hatch cannot be read', () => {
      const component = imageForm(imageStyleA);

      component.applyJson('loras', '{ not a list');

      // The old editor discarded a mistyped list and saved the style without
      // it, saying nothing at all.
      expect(component.assetJsonError()).toBe('loras');
    });

    it('takes a corrected list back onto the real control', () => {
      const component = imageForm(imageStyleA);

      component.applyJson('loras', '[{"name":"42","model":1,"clip":1}]');

      expect(component.assetJsonError()).toBeNull();
      expect(component.form.controls['loras'].value).toEqual([
        { name: '42', model: 1, clip: 1 },
      ]);
    });

    describe('the family the picker starts from', () => {
      it('follows the models the style names when they agree', () => {
        referenceBaselines.set({ ModelA: 'stable_diffusion_1' });
        const component = imageForm(imageStyleA);

        expect(component.styleBaseline()).toBe('stable_diffusion_1');
      });

      it('has no opinion when the style spans two families', () => {
        referenceBaselines.set({
          ModelA: 'stable_diffusion_1',
          ModelB: 'stable_diffusion_xl',
        });
        const component = imageForm({
          ...imageStyleA,
          models: ['ModelA', 'ModelB'],
        });

        // Narrowing to one would be the editor picking a side for the author.
        expect(component.styleBaseline()).toBeNull();
      });

      it('has no opinion before the reference has loaded', () => {
        const component = imageForm(imageStyleA);

        expect(component.styleBaseline()).toBeNull();
      });
    });

    it('puts a trigger word before the negative half of the template', () => {
      const component = imageForm({
        ...imageStyleB,
        prompt: '{p}{np}',
      });

      component.appendToPrompt('detailed');

      expect(component.form.controls['prompt'].value).toBe(
        '{p}, detailed {np}',
      );
    });
  });
});
