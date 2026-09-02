import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIELD_LABEL_KEY,
  GROUP_IDS,
  GenerateFormComponent,
} from './generate-form.component';
import {
  DEFAULT_GENERATE_FORM_VALUE,
  FACE_FIXERS,
  GenerateFormGroup,
  GenerateFormValue,
  MAX_STEPS,
  QR_MODULE_DRAWERS,
  SAMPLERS,
  STEPS_SLIDER_MAX,
  UPSCALERS,
  buildStyledImageRequest,
  coerceFormValue,
  createGenerateForm,
  kudosBreakdown,
  modelWaitEstimate,
} from '../generate-form.model';
import {
  AppliedStyle,
  StyleForcedParams,
} from '../../../services/style-record';
import type { ModelRequirements } from '../../../services/model-reference.service';
import { evaluateRequestLint, type RequestWarning } from '../request-lint';
import type { ActiveModel } from '../../../types/active-model';
import type { HordeWorker } from '../../../types/horde-worker';
import { ToastService } from '../../../services/toast.service';
import { FullscreenService } from '../../../services/fullscreen.service';
import { DOCS_IMAGE_SETTINGS } from '../../../content/docs-links';
import { GenerateSourceImageComponent } from '../generate-source-image/generate-source-image.component';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { provideRouter } from '@angular/router';
import en from '../../../../assets/i18n/en.json';
import {
  SAMPLER_SETTING_NAMES,
  SamplerConstraintsDocument,
  coerceSamplerConstraints,
} from '../../../types/sampler-constraints';
import live from '../../../testing/fixtures/sampler-constraints.stub.json';

const FORCED: StyleForcedParams = {
  model: 'Flux.1-Schnell fp8',
  width: 1216,
  height: 832,
  steps: 8,
  cfg_scale: 1,
  sampler_name: 'k_euler',
  clip_skip: 2,
  karras: false,
  hires_fix: true,
};

async function createComponent(
  forced: StyleForcedParams | null,
  styleName = 'Cinematic',
): Promise<{
  fixture: ComponentFixture<GenerateFormComponent>;
  component: GenerateFormComponent;
  form: GenerateFormGroup;
  submits: () => number;
}> {
  // Transloco is needed even with the template thrown away: the panel words its
  // own summary lines, so the component asks for translations directly.
  await TestBed.configureTestingModule({
    imports: [
      GenerateFormComponent,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
  })
    .overrideComponent(GenerateFormComponent, { set: { template: '' } })
    .compileComponents();

  const fixture = TestBed.createComponent(GenerateFormComponent);
  const form = createGenerateForm({
    ...DEFAULT_GENERATE_FORM_VALUE,
    prompt: 'a fox',
    model: 'my model',
    width: 512,
    height: 512,
    steps: 30,
    styleName: forced ? styleName : '',
  });
  fixture.componentRef.setInput('form', form);
  fixture.componentRef.setInput('forcedParams', forced);
  let submits = 0;
  fixture.componentInstance.create.subscribe(() => submits++);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    form,
    submits: () => submits,
  };
}

/** The request the parent would submit for the form's current raw value. */
function submitted(form: GenerateFormGroup, forced: StyleForcedParams | null) {
  const applied: AppliedStyle | null = forced
    ? { prompt: 'styled a fox', forcedParams: forced }
    : null;
  return buildStyledImageRequest(form.getRawValue(), applied);
}

describe('GenerateFormComponent style locks', () => {
  it('locks nothing when no style is selected', async () => {
    const { component, form } = await createComponent(null);
    expect(component.stylePins('model')).toBe(false);
    expect(component.stylePins('dimensions')).toBe(false);
    expect(component.stylePins('sampling')).toBe(false);
    expect(form.controls.model.disabled).toBe(false);
    expect(form.controls.width.disabled).toBe(false);
    expect(form.controls.steps.disabled).toBe(false);
  });

  it('disables the controls a style pins', async () => {
    const { component, form } = await createComponent(FORCED);
    expect(component.isSectionLocked('model')).toBe(true);
    expect(component.isSectionLocked('dimensions')).toBe(true);
    expect(component.isSectionLocked('sampling')).toBe(true);
    for (const control of [
      form.controls.model,
      form.controls.width,
      form.controls.height,
      form.controls.steps,
      form.controls.cfg_scale,
      form.controls.sampler_name,
      form.controls.clip_skip,
      form.controls.scheduler,
      form.controls.hires_fix,
    ]) {
      expect(control.disabled).toBe(true);
    }
    // Controls no style field touches stay editable.
    expect(form.controls.seed.disabled).toBe(false);
    expect(form.controls.tiling.disabled).toBe(false);
  });

  it('only disables the fields a partial style actually pins', async () => {
    const { component, form } = await createComponent({ steps: 12 });
    expect(component.isSectionLocked('sampling')).toBe(true);
    expect(component.stylePins('model')).toBe(false);
    expect(form.controls.steps.disabled).toBe(true);
    expect(form.controls.cfg_scale.disabled).toBe(false);
    expect(form.controls.model.disabled).toBe(false);
  });

  it('keeps the submitted request unchanged while locked', async () => {
    const { form } = await createComponent(FORCED);
    const request = submitted(form, FORCED);
    expect(request.models).toEqual([FORCED.model]);
    expect(request.params?.width).toBe(FORCED.width);
    expect(request.params?.steps).toBe(FORCED.steps);
  });

  it('detaching a section re-enables it, holding the values it replaced', async () => {
    const { fixture, component, form } = await createComponent(FORCED);
    component.detachSection('dimensions');
    fixture.detectChanges();

    expect(component.isSectionDetached('dimensions')).toBe(true);
    expect(component.isSectionLocked('dimensions')).toBe(false);
    expect(form.controls.width.disabled).toBe(false);
    expect(form.controls.height.disabled).toBe(false);
    expect(form.controls.width.value).toBe(512);
    expect(form.controls.height.value).toBe(512);
    // Other sections keep their locks.
    expect(component.isSectionLocked('model')).toBe(true);
    expect(form.controls.steps.disabled).toBe(true);
  });

  it('submits the form values for a detached section only', async () => {
    const { fixture, component, form } = await createComponent(FORCED);
    component.detachSection('dimensions');
    fixture.detectChanges();
    form.controls.width.setValue(640);
    form.controls.height.setValue(960);

    const request = submitted(form, FORCED);
    expect(request.params?.width).toBe(640);
    expect(request.params?.height).toBe(960);
    expect(request.models).toEqual([FORCED.model]);
    expect(request.params?.steps).toBe(FORCED.steps);
    expect(request.params?.sampler_name).toBe(FORCED.sampler_name);
  });

  it('re-attaching restores the style values and the lock', async () => {
    const { fixture, component, form } = await createComponent(FORCED);
    component.detachSection('sampling');
    fixture.detectChanges();
    form.controls.steps.setValue(40);
    form.controls.scheduler.setValue('karras');

    component.reattachSection('sampling');
    fixture.detectChanges();

    expect(component.isSectionDetached('sampling')).toBe(false);
    expect(component.isSectionLocked('sampling')).toBe(true);
    expect(form.controls.steps.value).toBe(FORCED.steps);
    // The style names its schedule as the legacy flag, so 'no karras' comes
    // back as the schedule that flag stands for.
    expect(form.controls.scheduler.value).toBe('normal');
    expect(form.controls.steps.disabled).toBe(true);
    expect(submitted(form, FORCED).params?.steps).toBe(FORCED.steps);
  });

  it('drops detachments when the selected style changes', async () => {
    const { fixture, component, form } = await createComponent(FORCED);
    component.detachSection('model');
    fixture.detectChanges();
    expect(component.detachedSections()).toEqual(['model']);

    form.controls.styleName.setValue('Other style');
    fixture.detectChanges();

    expect(component.detachedSections()).toEqual([]);
    expect(form.controls.styleDetach.value.sections).toEqual([]);
    expect(form.controls.model.disabled).toBe(true);
    expect(submitted(form, FORCED).models).toEqual([FORCED.model]);
  });

  it('clears the style and every lock through the control', async () => {
    const { fixture, component, form } = await createComponent(FORCED);
    component.detachSection('dimensions');
    fixture.detectChanges();

    component.clearStyle();
    fixture.detectChanges();

    expect(form.controls.styleName.value).toBe('');
    expect(component.selectedStyleName()).toBe('');
    expect(component.detachedSections()).toEqual([]);
    expect(component.stylePins('model')).toBe(true);
    // With no style selected the parent clears forcedParams; until then nothing
    // is detached, so the pinned controls are locked again rather than stranded.
    expect(form.controls.width.disabled).toBe(true);
  });

  it('drops detachments when the style is cleared', async () => {
    const { fixture, component, form } = await createComponent(FORCED);
    component.detachSection('sampling');
    fixture.detectChanges();

    form.controls.styleName.setValue('');
    fixture.detectChanges();

    expect(component.detachedSections()).toEqual([]);
    expect(form.controls.styleDetach.value.sections).toEqual([]);
  });
});

describe('GenerateFormComponent shortcuts', () => {
  it('submits on the Ctrl/Cmd+Enter shortcut', async () => {
    const { component, submits } = await createComponent(null);
    component.onSubmitShortcut();
    expect(submits()).toBe(1);
  });

  it('does not submit while the form is not submittable', async () => {
    const { component, form, submits } = await createComponent(null);
    // Mirrors the Generate button's own disabled binding.
    form.controls.prompt.setErrors({ required: true });
    component.onSubmitShortcut();
    expect(submits()).toBe(0);

    form.controls.prompt.setErrors(null);
    component.onSubmitShortcut();
    expect(submits()).toBe(1);
  });

  it('opens and closes the style browser', async () => {
    const { component } = await createComponent(null);
    expect(component.styleBrowserOpen()).toBe(false);
    component.openStyleBrowser();
    expect(component.styleBrowserOpen()).toBe(true);
    component.closeStyleBrowser();
    expect(component.styleBrowserOpen()).toBe(false);
  });
});

describe('GenerateFormComponent prompt history', () => {
  /**
   * The history popover needs its anchor and the prompt box itself, so this
   * stands in a minimal template holding just those two refs.
   */
  async function createWithPromptBox(): Promise<{
    component: GenerateFormComponent;
    form: GenerateFormGroup;
    anchor: HTMLElement;
    promptBox: HTMLTextAreaElement;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    })
      .overrideComponent(GenerateFormComponent, {
        set: {
          template:
            '<div #historyContainer><textarea #promptInput></textarea></div>',
        },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      prompt: 'a fox',
      negativePrompt: 'blurry',
    });
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('promptHistory', [
      { prompt: 'a castle', negativePrompt: 'washed out' },
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return {
      component: fixture.componentInstance,
      form,
      anchor: root.querySelector('div') as HTMLElement,
      promptBox: root.querySelector('textarea') as HTMLTextAreaElement,
    };
  }

  it('fills both prompt halves from a picked entry and closes the popover', async () => {
    const { component, form } = await createWithPromptBox();
    component.toggleHistory();

    component.pickHistory({ prompt: 'a castle', negativePrompt: 'washed out' });

    expect(form.controls.prompt.value).toBe('a castle');
    expect(form.controls.negativePrompt.value).toBe('washed out');
    expect(component.historyOpen()).toBe(false);
  });

  it('clears the negative prompt when the picked entry had none', async () => {
    const { component, form } = await createWithPromptBox();
    component.pickHistory({ prompt: 'a castle', negativePrompt: '' });
    expect(form.controls.negativePrompt.value).toBe('');
  });

  it('leaves the negative prompt alone when only a prompt is supplied', async () => {
    const { component, form } = await createWithPromptBox();
    component.fillPrompt('a lighthouse');
    expect(form.controls.prompt.value).toBe('a lighthouse');
    expect(form.controls.negativePrompt.value).toBe('blurry');
  });

  it('focuses the prompt box after filling it', async () => {
    const { component, promptBox } = await createWithPromptBox();
    component.fillPrompt('a lighthouse');
    expect(document.activeElement).toBe(promptBox);
  });

  it('pins one row open at a time', async () => {
    const { component } = await createWithPromptBox();

    component.toggleHistoryDetail(1);
    expect(component.historyDetail()).toBe(1);
    component.toggleHistoryDetail(0);
    expect(component.historyDetail()).toBe(0);
    component.toggleHistoryDetail(0);
    expect(component.historyDetail()).toBeNull();
  });

  it('backs escape out of an expanded row before the popover', async () => {
    const { component } = await createWithPromptBox();
    component.toggleHistory();
    component.toggleHistoryDetail(0);

    component.onDocumentEscape();
    expect(component.historyDetail()).toBeNull();
    expect(component.historyOpen()).toBe(true);

    component.onDocumentEscape();
    expect(component.historyOpen()).toBe(false);
  });

  it('drops any expanded row when the popover closes', async () => {
    const { component } = await createWithPromptBox();
    component.toggleHistory();
    component.toggleHistoryDetail(0);

    component.toggleHistory();

    expect(component.historyDetail()).toBeNull();
  });

  it('dismisses on escape and on a press outside the anchor', async () => {
    const { component, anchor } = await createWithPromptBox();

    component.toggleHistory();
    component.onDocumentEscape();
    expect(component.historyOpen()).toBe(false);

    component.toggleHistory();
    component.onDocumentPointerDown(new PointerEvent('pointerdown'));
    expect(component.historyOpen()).toBe(false);

    component.toggleHistory();
    const inside = new PointerEvent('pointerdown');
    Object.defineProperty(inside, 'target', { value: anchor });
    component.onDocumentPointerDown(inside);
    expect(component.historyOpen()).toBe(true);
  });
});

describe('GenerateFormComponent extras', () => {
  async function createExtras(value: Partial<GenerateFormValue> = {}): Promise<{
    fixture: ComponentFixture<GenerateFormComponent>;
    component: GenerateFormComponent;
    form: GenerateFormGroup;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    })
      .overrideComponent(GenerateFormComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      ...value,
    });
    fixture.componentRef.setInput('form', form);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, form };
  }

  it('adds a drafted worker and clears the draft', async () => {
    const { component, form } = await createExtras();

    component.workerDraft.set('  worker-a  ');
    component.addWorker();

    expect(form.controls.workers.value).toEqual(['worker-a']);
    expect(component.workerDraft()).toBe('');
  });

  it('ignores a blank draft and a repeat of a listed worker', async () => {
    const { component, form } = await createExtras({ workers: ['worker-a'] });

    component.workerDraft.set('   ');
    expect(component.canAddWorker()).toBe(false);
    component.addWorker();

    component.workerDraft.set('worker-a');
    component.addWorker();

    expect(form.controls.workers.value).toEqual(['worker-a']);
  });

  it('stops offering the add control at the worker cap', async () => {
    const { component, form } = await createExtras({
      workers: ['w1', 'w2', 'w3', 'w4', 'w5'],
    });

    component.workerDraft.set('w6');
    expect(component.canAddWorker()).toBe(false);
    component.addWorker();

    expect(form.controls.workers.value).toHaveLength(component.maxWorkers);
    expect(form.controls.workers.value).not.toContain('w6');
  });

  it('removes a worker by position', async () => {
    const { component, form } = await createExtras({
      workers: ['w1', 'w2', 'w3'],
    });

    component.removeWorker(1);

    expect(form.controls.workers.value).toEqual(['w1', 'w3']);
  });

  it('flips the worker list between an allowlist and a blocklist', async () => {
    const { component, form } = await createExtras();

    component.setWorkerBlacklist(true);
    expect(form.controls.workerBlacklist.value).toBe(true);

    component.setWorkerBlacklist(false);
    expect(form.controls.workerBlacklist.value).toBe(false);
  });

  it('hints only on a webhook the request builder would drop', async () => {
    const { component, form } = await createExtras();

    expect(component.webhookInvalid()).toBe(false);

    form.controls.webhook.setValue('example.com/hook');
    expect(component.webhookInvalid()).toBe(true);

    form.controls.webhook.setValue('http://a.io');
    expect(component.webhookInvalid()).toBe(false);

    // Under the horde's 10-character minimum, so it would be dropped silently.
    form.controls.webhook.setValue('http://a');
    expect(component.webhookInvalid()).toBe(true);
  });

  it('leaves the QR control usable until the model is known not to serve it', async () => {
    const { fixture, component } = await createExtras();

    expect(component.qrAllowed()).toBe(true);

    fixture.componentRef.setInput('qrSupported', true);
    expect(component.qrAllowed()).toBe(true);

    fixture.componentRef.setInput('qrSupported', false);
    expect(component.qrAllowed()).toBe(false);
  });

  it('notes the batching rule only for a QR batch of more than one', async () => {
    const { component, form } = await createExtras({ n: 4 });

    expect(component.qrBatchNoteVisible()).toBe(false);

    form.controls.qrText.setValue('https://aihorde.net');
    expect(component.qrBatchNoteVisible()).toBe(true);

    form.controls.n.setValue(1);
    expect(component.qrBatchNoteVisible()).toBe(false);
  });
});

describe('GenerateFormComponent model recommendations', () => {
  async function createWithModel(
    value: Partial<GenerateFormValue> = {},
    baseline: string | null = null,
    requirements: ModelRequirements | null = null,
  ): Promise<{
    fixture: ComponentFixture<GenerateFormComponent>;
    component: GenerateFormComponent;
    form: GenerateFormGroup;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    })
      .overrideComponent(GenerateFormComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      ...value,
    });
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('modelBaseline', baseline);
    fixture.componentRef.setInput('modelRequirements', requirements);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, form };
  }

  it('reads each hint off the live form values', async () => {
    const { component, form } = await createWithModel({}, 'flux_1', {
      min_steps: 3,
      max_steps: 8,
      cfg_scale: 2,
      clip_skip: 1,
      samplers: ['k_euler'],
      schedulers: ['karras'],
    });

    // The form defaults (25 steps, cfg 7.5, k_euler_a) contradict all of these.
    expect(component.stepsAdvisory()?.violated).toBe(true);
    expect(component.cfgAdvisory()?.violated).toBe(true);
    expect(component.samplerHint()?.violated).toBe(true);
    expect(component.clipSkipAdvisory()?.violated).toBe(false);
    expect(component.scheduleAdvisory()?.violated).toBe(false);
    expect(component.isSuggestedSampler('k_euler')).toBe(true);
    expect(component.isSuggestedSampler('k_lms')).toBe(false);

    form.controls.steps.setValue(6);
    form.controls.cfg_scale.setValue(2);
    form.controls.sampler_name.setValue('k_euler');
    form.controls.scheduler.setValue('normal');

    expect(component.stepsAdvisory()?.violated).toBe(false);
    expect(component.cfgAdvisory()?.violated).toBe(false);
    expect(component.samplerHint()?.violated).toBe(false);
    expect(component.scheduleAdvisory()?.violated).toBe(true);
  });

  it('says nothing about a control the style holds', async () => {
    const { fixture, component, form } = await createWithModel({}, 'flux_1', {
      samplers: ['k_euler'],
      schedulers: ['karras'],
    });
    form.controls.scheduler.setValue('normal');
    expect(component.scheduleAdvisory()?.violated).toBe(true);

    form.controls.styleName.setValue('Cinematic');
    fixture.componentRef.setInput('forcedParams', { karras: false });
    fixture.detectChanges();

    // The schedule is the style's, so advice to move it asks for something the
    // reader cannot do from here.
    expect(component.scheduleAdvisory()).toBeNull();
    // A knob the style leaves alone still gets its line.
    expect(component.samplerHint()?.violated).toBe(true);
  });

  it('shows no hints for a model that recommends nothing', async () => {
    const { component } = await createWithModel({}, 'flux_1', null);

    expect(component.stepsAdvisory()).toBeNull();
    expect(component.cfgAdvisory()).toBeNull();
    expect(component.clipSkipAdvisory()).toBeNull();
    expect(component.samplerHint()).toBeNull();
    expect(component.scheduleAdvisory()).toBeNull();
  });

  it('snaps a pristine size onto the baseline native square', async () => {
    const { fixture, component, form } = await createWithModel();

    expect(form.controls.width.value).toBe(1024);

    fixture.componentRef.setInput('modelBaseline', 'stable_diffusion_1');
    fixture.detectChanges();

    expect(form.controls.width.value).toBe(512);
    expect(form.controls.height.value).toBe(512);
    expect(component.sizeBase()).toBe(512);

    // Its own patch must not read as the user customising the size, so a later
    // model change still follows the baseline.
    fixture.componentRef.setInput('modelBaseline', 'stable_diffusion_xl');
    fixture.detectChanges();

    expect(form.controls.width.value).toBe(1024);
    expect(component.sizeBase()).toBe(1024);
  });

  it('never touches dimensions the user chose', async () => {
    const { fixture, form } = await createWithModel({
      width: 1216,
      height: 832,
    });

    fixture.componentRef.setInput('modelBaseline', 'stable_diffusion_1');
    fixture.detectChanges();

    expect(form.controls.width.value).toBe(1216);
    expect(form.controls.height.value).toBe(832);
  });

  it('stands down once the size has been touched this session', async () => {
    const { fixture, component, form } = await createWithModel();

    component.setSizeBase(1024);
    fixture.componentRef.setInput('modelBaseline', 'stable_diffusion_1');
    fixture.detectChanges();

    expect(form.controls.width.value).toBe(1024);
    expect(component.sizeBase()).toBe(1024);
  });

  it('notes an off-family size and the SD 1.5 hires case', async () => {
    const { fixture, component, form } = await createWithModel({
      width: 1024,
      height: 1024,
    });

    // Touched first, so the snap cannot rewrite the size out from under the hint.
    component.setSizeBase(1024);
    fixture.componentRef.setInput('modelBaseline', 'stable_diffusion_1');
    fixture.detectChanges();

    expect(component.sizeAdvisory()?.key).toBe(
      'generate.form.requirement.sd15_hires',
    );
    expect(component.hiresSuggested()).toBe(true);

    form.controls.hires_fix.setValue(true);
    expect(component.hiresSuggested()).toBe(false);
    // With the pass on, 1024 is one of the sizes the panel offers this model
    // and drawing above native is the point, so it is no longer drift.
    expect(component.sizeAdvisory()).toBeNull();
  });
});

describe('GenerateFormComponent reset', () => {
  /** A form carrying a session's worth of choices, in advanced img2img. */
  async function createDirty(): Promise<{
    component: GenerateFormComponent;
    form: GenerateFormGroup;
    toast: ToastService;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    })
      .overrideComponent(GenerateFormComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      prompt: 'a fox in the snow',
      negativePrompt: 'blurry',
      sourceMode: 'img2img',
      styleName: 'Cinematic',
      styleDetach: { style: 'Cinematic', sections: ['sampling'] },
      model: 'my model',
      steps: 40,
      cfg_scale: 12,
      width: 1216,
      height: 832,
      hires_fix: true,
      tiling: true,
      post_processing: ['GFPGAN'],
      loras: [{ name: 'detail', model: 1, clip: 1 }],
      tis: [{ name: 'embedding', strength: 1 }],
      qrText: 'https://aihorde.net',
      workers: ['worker-a'],
      webhook: 'https://example.invalid/hook',
      n: 4,
    });
    fixture.componentRef.setInput('form', form);
    fixture.detectChanges();
    return {
      component: fixture.componentInstance,
      form,
      toast: TestBed.inject(ToastService),
    };
  }

  it('puts every setting back to its default', async () => {
    const { component, form } = await createDirty();

    component.resetSettings();

    const value = form.getRawValue();
    expect(value.styleName).toBe('');
    expect(value.styleDetach).toEqual({ style: '', sections: [] });
    expect(value.model).toBe('');
    expect(value.steps).toBe(DEFAULT_GENERATE_FORM_VALUE.steps);
    expect(value.cfg_scale).toBe(DEFAULT_GENERATE_FORM_VALUE.cfg_scale);
    expect(value.width).toBe(DEFAULT_GENERATE_FORM_VALUE.width);
    expect(value.hires_fix).toBe(false);
    expect(value.tiling).toBe(false);
    expect(value.post_processing).toEqual([]);
    expect(value.loras).toEqual([]);
    expect(value.tis).toEqual([]);
    expect(value.qrText).toBe('');
    expect(value.workers).toEqual([]);
    expect(value.webhook).toBe('');
    expect(value.n).toBe(DEFAULT_GENERATE_FORM_VALUE.n);
  });

  it('keeps the prompts and the attached source mode', async () => {
    const { component, form } = await createDirty();

    component.resetSettings();

    const value = form.getRawValue();
    expect(value.prompt).toBe('a fox in the snow');
    expect(value.negativePrompt).toBe('blurry');
    expect(value.sourceMode).toBe('img2img');
  });

  it('asks before it clears anything, and keeping the settings changes nothing', async () => {
    const { component, form } = await createDirty();
    const before = form.getRawValue();

    component.toggleResetConfirm();
    expect(component.resetConfirmOpen()).toBe(true);
    expect(form.getRawValue()).toEqual(before);

    component.keepSettings();
    expect(component.resetConfirmOpen()).toBe(false);
    expect(form.getRawValue()).toEqual(before);
  });

  it('clears the settings once the confirm is answered, and closes it', async () => {
    const { component, form } = await createDirty();

    component.toggleResetConfirm();
    component.resetSettings();

    expect(component.resetConfirmOpen()).toBe(false);
    expect(form.getRawValue().steps).toBe(DEFAULT_GENERATE_FORM_VALUE.steps);
  });

  it('keeps the settings when the confirm is dismissed with Escape', async () => {
    const { component, form } = await createDirty();
    const before = form.getRawValue();

    component.toggleResetConfirm();
    component.onDocumentEscape();

    expect(component.resetConfirmOpen()).toBe(false);
    expect(form.getRawValue()).toEqual(before);
  });

  it('offers an undo that restores exactly what was there', async () => {
    const { component, form, toast } = await createDirty();
    const before = form.getRawValue();

    component.resetSettings();
    expect(form.getRawValue()).not.toEqual(before);

    const [entry] = toast.toasts();
    expect(entry.message).toBe('generate.form.reset_done');
    expect(entry.action?.label).toBe('generate.form.reset_undo');
    entry.action?.run();

    expect(form.getRawValue()).toEqual(before);
  });
});

describe('GenerateFormComponent request warnings', () => {
  const WARNINGS: RequestWarning[] = [
    {
      id: 'controlnet_baseline',
      section: 'source',
      anchor: 'control_type',
      key: 'generate.lint.controlnet_baseline',
      params: {},
    },
    {
      id: 'qr_code_baseline',
      section: 'workflows',
      anchor: 'qr',
      key: 'generate.form.qr_unsupported',
      params: {},
    },
    {
      id: 'transparent_baseline',
      section: 'workflows',
      anchor: 'transparent',
      key: 'generate.lint.transparent_baseline',
      params: {},
    },
  ];

  it('hands each card only its own warnings, and answers for a named rule', async () => {
    const { fixture, component } = await createComponent(null);
    fixture.componentRef.setInput('lintWarnings', WARNINGS);
    fixture.detectChanges();

    expect(component.warningsFor('source').map((w) => w.id)).toEqual([
      'controlnet_baseline',
    ]);
    expect(component.warningsFor('workflows').map((w) => w.id)).toEqual([
      'qr_code_baseline',
      'transparent_baseline',
    ]);
    expect(component.warningsFor('sampling')).toEqual([]);
    expect(component.qrWarnings().map((w) => w.id)).toEqual([
      'qr_code_baseline',
    ]);
    expect(component.transparentWarnings().map((w) => w.id)).toEqual([
      'transparent_baseline',
    ]);
    expect(component.hasWarning('qr_code_baseline')).toBe(true);
    expect(component.hasWarning('remix_baseline')).toBe(false);
  });

  it('closes the popover on Escape', async () => {
    const { fixture, component } = await createComponent(null);
    fixture.componentRef.setInput('lintWarnings', WARNINGS);
    fixture.detectChanges();

    component.toggleLint();
    expect(component.lintOpen()).toBe(true);

    component.onDocumentEscape();
    expect(component.lintOpen()).toBe(false);
  });
});

/**
 * The control panel is the longest, densest surface in the app, and a reader
 * moving through it by heading is the only one who can skip a card they do not
 * want. These assertions render the real template rather than stubbing it: the
 * structure is the thing being guaranteed.
 */
describe('GenerateFormComponent model availability', () => {
  async function renderWithModel(
    model: string,
    models: { name: string; count: number }[],
  ): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    fixture.componentRef.setInput(
      'form',
      createGenerateForm({
        ...DEFAULT_GENERATE_FORM_VALUE,
        prompt: 'a fox',
        model,
      }),
    );
    fixture.componentRef.setInput('forcedParams', null);
    fixture.componentRef.setInput('models', models);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function modelHint(host: HTMLElement): string {
    const field = host.querySelector<HTMLElement>('[appTutAnchor="model"]');
    return field?.querySelector('.gs-sublabel')?.textContent?.trim() ?? '';
  }

  it('warns that the request will wait when nobody serves the chosen model', async () => {
    const host = await renderWithModel('Pony Diffusion', [
      { name: 'Pony Diffusion', count: 0 },
    ]);

    expect(modelHint(host)).toBe(en['generate.form.model_no_workers']);
    expect(
      host.querySelector('[appTutAnchor="model"] .gs-sublabel--warn'),
    ).not.toBeNull();
  });

  it('counts the workers when the model is being served', async () => {
    const host = await renderWithModel('Deliberate', [
      { name: 'Deliberate', count: 5 },
    ]);

    expect(modelHint(host)).toBe('5 workers online');
    expect(
      host.querySelector('[appTutAnchor="model"] .gs-sublabel--warn'),
    ).toBeNull();
  });
});

describe('GenerateFormComponent structure', () => {
  async function renderFixture(): Promise<
    ComponentFixture<GenerateFormComponent>
  > {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    fixture.componentRef.setInput(
      'form',
      createGenerateForm({
        ...DEFAULT_GENERATE_FORM_VALUE,
        prompt: 'a fox',
      }),
    );
    fixture.componentRef.setInput('forcedParams', null);
    fixture.detectChanges();
    return fixture;
  }

  async function render(): Promise<HTMLElement> {
    const fixture = await renderFixture();
    return fixture.nativeElement as HTMLElement;
  }

  /**
   * Unfold every group, which is what a reader who has opened them has. The
   * panel draws a folded group's controls nowhere, so a structural claim about
   * one of them has to be made against a panel that is showing it.
   */
  function unfoldAll(fixture: ComponentFixture<GenerateFormComponent>): void {
    for (const group of GROUP_IDS) {
      fixture.componentInstance.openGroup(group);
    }
    fixture.detectChanges();
  }

  it('names every card of the panel, by its heading or by the control that opens it', async () => {
    const host = await render();
    const sections = Array.from(
      host.querySelectorAll<HTMLElement>('section[aria-labelledby]'),
    );
    const groups = Array.from(host.querySelectorAll<HTMLElement>('.gs-group'));

    expect(sections.length + groups.length).toBeGreaterThanOrEqual(9);
    for (const section of sections) {
      const id = section.getAttribute('aria-labelledby')!;
      const heading = host.querySelector(`#${id}`);
      expect(heading, `no heading for ${id}`).not.toBeNull();
      expect(heading!.tagName).toBe('H2');
      expect(heading!.textContent?.trim()).toBeTruthy();
    }
    // A folded group carries no heading, so the button that unfolds it is what
    // says the group's name and whether it is open.
    for (const group of groups) {
      const toggle = group.querySelector<HTMLElement>('.gs-group-toggle');
      expect(toggle, 'a group with nothing to open it').not.toBeNull();
      expect(
        group.querySelector('.gs-group-name')?.textContent?.trim(),
      ).toBeTruthy();
      const bodyId = toggle!.getAttribute('aria-controls')!;
      expect(bodyId).toBeTruthy();
      // What the button says it opens is drawn exactly while it says it is open.
      expect(host.querySelector(`#${bodyId}`) !== null).toBe(
        toggle!.getAttribute('aria-expanded') === 'true',
      );
    }
  });

  it('names every pass, and gives the workflows their own', async () => {
    // Four passes, each named wherever it is drawn: in one column the names are
    // also what says where the cards a request cannot be described without end,
    // which is the job the divider used to do.
    const host = await render();
    const zones = Array.from(host.querySelectorAll<HTMLElement>('.gs-zone'));

    expect(
      zones.map((zone) =>
        zone.querySelector('.gs-zone-label')?.textContent?.trim(),
      ),
    ).toEqual(['Compose', 'Refine', 'Deliver', 'Workflows']);
    expect(host.querySelector('.gs-rest-divider')).toBeNull();

    // A workflow is a way of drawing the picture rather than a request setting,
    // and the two share nothing else, so each is its own card.
    const workflows = zones[3];
    expect(
      Array.from(workflows.querySelectorAll('.gs-group-name')).map((name) =>
        name.textContent?.trim(),
      ),
    ).toEqual(['Transparent background', 'QR code']);
  });

  it('names each card once, so two never claim the same heading', async () => {
    const host = await render();
    const ids = Array.from(
      host.querySelectorAll<HTMLElement>('section[aria-labelledby]'),
    ).map((section) => section.getAttribute('aria-labelledby'));

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers the QR layout controls, and only the shapes the workflow accepts', async () => {
    const fixture = await renderFixture();
    unfoldAll(fixture);
    const host = fixture.nativeElement as HTMLElement;
    const drawer = host.querySelector<HTMLSelectElement>('#generate-qr-module');

    expect(host.querySelector('#generate-qr-x-offset')).not.toBeNull();
    expect(host.querySelector('#generate-qr-y-offset')).not.toBeNull();
    expect(drawer).not.toBeNull();
    // The unset option first, then the renderer's own names: a shape it does
    // not know is dropped on the worker, so the panel never offers one.
    expect(Array.from(drawer!.options).map((option) => option.value)).toEqual([
      '',
      ...QR_MODULE_DRAWERS,
    ]);
  });

  it('offers the control strength with the QR payload, unset until it is moved', async () => {
    const fixture = await renderFixture();
    unfoldAll(fixture);
    const host = fixture.nativeElement as HTMLElement;
    const component = fixture.componentInstance;
    const form = component.form();

    expect(host.querySelector('#generate-qr-control-strength')).toBeNull();

    form.controls.qrText.setValue('https://aihorde.net');
    fixture.detectChanges();
    const slider = host.querySelector<HTMLInputElement>(
      '#generate-qr-control-strength',
    );
    expect(slider).not.toBeNull();
    expect(component.controlStrength()).toBeNull();
    // While it is unset the track carries no fill: a painted one would read as
    // a weight that was chosen.
    expect(slider?.style.getPropertyValue('--gs-range-fill')).toBe('0%');

    component.setControlStrength(1.4);
    fixture.detectChanges();
    expect(form.controls.control_strength.value).toBe(1.4);
    expect(slider?.style.getPropertyValue('--gs-range-fill')).not.toBe('0%');

    // Nothing is left carrying a control map, so the weight goes with it.
    form.controls.qrText.setValue('');
    fixture.detectChanges();
    expect(form.controls.control_strength.value).toBeNull();
    expect(host.querySelector('#generate-qr-control-strength')).toBeNull();
  });

  it('disables the QR layout controls with the payload box they belong to', async () => {
    const fixture = await renderFixture();
    unfoldAll(fixture);
    const host = fixture.nativeElement as HTMLElement;

    fixture.componentRef.setInput('qrSupported', false);
    fixture.detectChanges();

    const enabled = [
      'generate-qr-text',
      'generate-qr-x-offset',
      'generate-qr-y-offset',
      'generate-qr-module',
    ].filter((id) => !host.querySelector(`#${id}`)!.hasAttribute('disabled'));

    expect(enabled).toEqual([]);
  });

  it('opens each prompt box in full on the control it belongs to', async () => {
    const fixture = await renderFixture();
    const host = fixture.nativeElement as HTMLElement;
    const buttons =
      host.querySelectorAll<HTMLButtonElement>('.gs-prompt-expand');

    expect(buttons.length).toBe(2);

    buttons[0].click();
    fixture.detectChanges();
    const area = host.querySelector<HTMLTextAreaElement>(
      '.gs-prompt-editor-area',
    );

    expect(area?.value).toBe('a fox');

    area!.value = 'a fox in the snow';
    area!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.form().controls.prompt.value).toBe(
      'a fox in the snow',
    );
  });

  it('lets a typed step count run past the slider, and marks one past the horde', async () => {
    const fixture = await renderFixture();
    unfoldAll(fixture);
    const host = fixture.nativeElement as HTMLElement;
    const form = fixture.componentInstance.form();
    const field = host.querySelector<HTMLInputElement>('#generate-steps')!;
    const slider = host.querySelector<HTMLInputElement>(
      'input[type="range"][formControlName="steps"]',
    )!;

    expect(slider.max).toBe(String(STEPS_SLIDER_MAX));
    expect(field.max).toBe(String(MAX_STEPS));

    field.value = '200';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(form.controls.steps.value).toBe(200);
    expect(form.controls.steps.valid).toBe(true);
    // The thumb parks at the end of its travel; the value it stands for is not
    // pulled back to it.
    expect(slider.value).toBe(String(STEPS_SLIDER_MAX));
    expect(field.classList).not.toContain('gs-field--invalid');

    field.value = String(MAX_STEPS + 1);
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(form.controls.steps.value).toBe(MAX_STEPS + 1);
    expect(
      host.querySelector<HTMLInputElement>('#generate-steps')!.classList,
    ).toContain('gs-field--invalid');
    expect(host.querySelector('#generate-steps-range')).not.toBeNull();
  });

  it('keeps the warnings region in the document before it has anything to say', async () => {
    const host = await render();
    // A live region inserted at the same moment as its content is not
    // announced, so the region has to outlast the warnings it reports.
    const region = host.querySelector('[role="status"].sr-only');

    expect(region).not.toBeNull();
    expect(region!.textContent?.trim()).toBe('');
  });
});

/**
 * The settings past the first cards fold away behind one line of their own
 * current values. What is checked here is the contract of that line: it reports
 * what the form holds, it says so when the form holds something other than what
 * it started at, and which groups the reader left open survives the visit.
 */
describe('GenerateFormComponent settings groups', () => {
  async function render(value: Partial<GenerateFormValue> = {}): Promise<{
    component: GenerateFormComponent;
    host: HTMLElement;
    fixture: ComponentFixture<GenerateFormComponent>;
  }> {
    // Each render is a fresh visit to the panel, and what a visit remembers of
    // the last one is exactly the point of the folding: the storage is left
    // standing between renders and cleared only between tests.
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    fixture.componentRef.setInput(
      'form',
      createGenerateForm({
        ...DEFAULT_GENERATE_FORM_VALUE,
        prompt: 'a fox',
        ...value,
      }),
    );
    fixture.componentRef.setInput('forcedParams', null);
    fixture.detectChanges();
    return {
      component: fixture.componentInstance,
      host: fixture.nativeElement as HTMLElement,
      fixture,
    };
  }

  /** Which ledger section a changed setting is listed under. */
  function sectionOf(
    component: GenerateFormComponent,
    field: keyof GenerateFormValue,
  ): string | undefined {
    return component
      .ledgerSections()
      .find((section) => section.rows.some((row) => row.field === field))
      ?.section;
  }

  /** The one line a named group shows while it is folded. */
  function groupNamed(host: HTMLElement, name: string): HTMLElement {
    const group = Array.from(
      host.querySelectorAll<HTMLElement>('.gs-group'),
    ).find(
      (candidate) =>
        candidate
          .querySelector('.gs-group-name')
          ?.textContent?.trim()
          .toLowerCase() === name.toLowerCase(),
    );
    expect(group, `no group called ${name}`).not.toBeUndefined();
    return group!;
  }

  function summaryOf(host: HTMLElement, name: string): string {
    const group = Array.from(
      host.querySelectorAll<HTMLElement>('.gs-group'),
    ).find(
      (candidate) =>
        candidate
          .querySelector('.gs-group-name')
          ?.textContent?.trim()
          .toLowerCase() === name.toLowerCase(),
    );
    expect(group, `no group called ${name}`).not.toBeUndefined();
    return group!.querySelector('.gs-group-sum')?.textContent?.trim() ?? '';
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it('reads the sampling values off the form, in the order the card sets them', async () => {
    const { host } = await render({
      sampler_name: 'k_euler_a',
      steps: 30,
      cfg_scale: 7.5,
    });

    expect(summaryOf(host, 'Sampling')).toBe('k_euler_a · 30 steps · CFG 7.5');
  });

  it('counts what the LoRA group holds, and draws no line when it holds nothing', async () => {
    // A group left as it started carries no values to read, and a phrase
    // standing in for the absence reads as a value of its own.
    const { host } = await render();
    expect(summaryOf(host, 'LoRAs & embeddings')).toBe('');

    const { host: loaded } = await render({
      loras: [{ name: 'add-detail', model: 0.8, clip: 0.8 }],
      tis: [{ name: 'easynegative', strength: 1 }],
    });
    expect(summaryOf(loaded, 'LoRAs & embeddings')).toBe(
      '1 LoRA · 1 embedding',
    );
  });

  it('marks only the groups holding something other than the default', async () => {
    const { component } = await render({
      steps: DEFAULT_GENERATE_FORM_VALUE.steps,
    });
    expect(component.groupChanged('sampling')).toBe(false);

    const { component: changed } = await render({ steps: 45 });
    expect(changed.groupChanged('sampling')).toBe(true);
    expect(changed.groupChanged('output')).toBe(false);
  });

  it('gives the QR card the control strength only when the code owns it', async () => {
    // Control strength is set from two cards. With a control type picked it
    // belongs to the source card, and marking the QR card for it would send
    // the reader to a value that is not there.
    const { component: qr } = await render({
      qrText: 'https://aihorde.net',
      control_strength: 0.4,
    });
    expect(sectionOf(qr, 'control_strength')).toBe('qr');

    const { component: controlled } = await render({
      qrText: 'https://aihorde.net',
      control_type: 'canny',
      control_strength: 0.4,
    });
    expect(sectionOf(controlled, 'control_strength')).toBe('compose');
    expect(controlled.groupChanged('qr')).toBe(true);
  });

  it('starts every group folded, and remembers each one opened', async () => {
    // All-folded is the panel's plain face: the cards a request cannot be
    // described without are open, and nothing else is until it is asked for.
    const { component, fixture } = await render();
    expect(GROUP_IDS.filter((group) => component.isGroupOpen(group))).toEqual(
      [],
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.gs-grid-sampling'),
    ).toBeNull();

    component.toggleGroup('sampling');
    fixture.detectChanges();
    expect(component.isGroupOpen('sampling')).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.gs-grid-sampling'),
    ).not.toBeNull();

    const { component: revisited } = await render();
    expect(revisited.isGroupOpen('sampling')).toBe(true);
    expect(revisited.isGroupOpen('output')).toBe(false);
  });

  it('keeps the actions of a group on its head, beside the press that opens it', async () => {
    // Inside the body they stranded themselves on a line above the first field,
    // and inside the button they could not be pressed at all.
    const { component, fixture, host } = await render();
    // Folded, the head is a line of values: a control competing with that line
    // asks the reader to decide something before the group is even open.
    expect(
      groupNamed(host, 'Sampling').querySelector('.gs-group-actions'),
    ).toBeNull();

    component.openGroup('sampling');
    fixture.detectChanges();
    const opened = groupNamed(fixture.nativeElement as HTMLElement, 'Sampling');
    const actions = opened.querySelector('.gs-group-actions');
    expect(actions, 'an open group draws no actions').not.toBeNull();
    expect(actions!.closest('.gs-group-head')).not.toBeNull();
    expect(actions!.closest('.gs-group-toggle')).toBeNull();
    expect(actions!.closest('.gs-group-body')).toBeNull();
    // An open group draws the controls its line described, so the line goes.
    expect(opened.querySelector('.gs-group-sum')).toBeNull();
  });

  it('gives the note a group opens a row under the head, not a slot in it', async () => {
    // The trigger renders its note as its own sibling, so a note opened from a
    // group's head lands in that head: it has to take the row below the name
    // rather than a place in the row beside it.
    const { component, fixture } = await render();
    component.openGroup('sampling');
    fixture.detectChanges();
    const trigger = groupNamed(
      fixture.nativeElement as HTMLElement,
      'Sampling',
    ).querySelector<HTMLElement>('.gs-group-head .gs-help-btn');
    expect(trigger, 'the group head has no note trigger').not.toBeNull();

    trigger!.click();
    fixture.detectChanges();

    const note = groupNamed(
      fixture.nativeElement as HTMLElement,
      'Sampling',
    ).querySelector('[role="note"]');
    expect(note, 'the note did not open').not.toBeNull();
    expect(note!.closest('.gs-group-head')).not.toBeNull();
    expect(note!.closest('.gs-group-toggle')).toBeNull();
  });

  it('never lets a fold hide a problem inside the group', async () => {
    // The fold is the reader's own and stands for nothing having been dealt
    // with, so a warning about a control inside a folded group is counted on
    // its head, and pressing that count opens the group at the control.
    const { component, fixture } = await render();
    fixture.componentRef.setInput('lintWarnings', [
      {
        id: 'steps_high',
        section: 'sampling',
        anchor: 'steps',
        titleKey: 'x',
        bodyKey: 'y',
      },
    ]);
    fixture.detectChanges();

    expect(component.groupLintCount('sampling')).toBe(1);
    expect(component.groupLintCount('output')).toBe(0);
    const chip = groupNamed(
      fixture.nativeElement as HTMLElement,
      'Sampling',
    ).querySelector<HTMLElement>('.gs-group-lint');
    expect(chip, 'the folded group reports nothing').not.toBeNull();
    expect(chip!.textContent?.trim()).toBe('1');

    chip!.click();
    fixture.detectChanges();
    expect(component.isGroupOpen('sampling')).toBe(true);
    // Open, the controls speak for themselves and the count stands down.
    expect(
      groupNamed(
        fixture.nativeElement as HTMLElement,
        'Sampling',
      ).querySelector('.gs-group-lint'),
    ).toBeNull();
  });

  it('folds everything back up in one press, and remembers that too', async () => {
    const { component, fixture } = await render();
    component.openGroup('sampling');
    component.openGroup('horde');
    fixture.detectChanges();
    expect(component.anyGroupOpen()).toBe(true);

    component.foldAllGroups();
    fixture.detectChanges();

    expect(GROUP_IDS.filter((group) => component.isGroupOpen(group))).toEqual(
      [],
    );
    expect(component.anyGroupOpen()).toBe(false);
    const { component: revisited } = await render();
    expect(revisited.anyGroupOpen()).toBe(false);
  });

  it('unfolds the group holding a field the studio wants to point at', async () => {
    const { component } = await render();

    expect(component.openGroupForAnchor('cfg')).toBe(true);
    expect(component.isGroupOpen('sampling')).toBe(true);
    // Nothing moved the second time, and a caller narrating the unfold has to
    // be able to tell the two apart.
    expect(component.openGroupForAnchor('cfg')).toBe(false);

    // An anchor that lives on an always-open card asks nothing of any group.
    component.openGroupForAnchor('prompt');
    expect(component.isGroupOpen('sampling')).toBe(true);
  });

  it('unfolds the dimensions group to point at the size', async () => {
    const { component } = await render();

    expect(component.isGroupOpen('dimensions')).toBe(false);
    expect(component.openGroupForAnchor('size')).toBe(true);
    expect(component.isGroupOpen('dimensions')).toBe(true);
  });

  it('turns the picture on its side without losing the shape it was set to', async () => {
    const { component, fixture, host } = await render({
      width: 1216,
      height: 832,
    });
    component.openGroup('dimensions');
    fixture.detectChanges();

    const chips = Array.from(
      groupNamed(
        fixture.nativeElement as HTMLElement,
        'Dimensions',
      ).querySelectorAll<HTMLElement>('.gs-size-aspect'),
    );
    const threeTwo = chips.find((chip) => chip.textContent?.trim() === '3:2')!;
    expect(threeTwo.classList).toContain('gs-size-aspect--active');

    host.querySelector<HTMLElement>('.gs-chip--swap')!.click();
    fixture.detectChanges();

    const form = component.form();
    expect(form.controls.width.value).toBe(832);
    expect(form.controls.height.value).toBe(1216);
    // The shape is the same one; only which way up it is has changed.
    expect(threeTwo.classList).toContain('gs-size-aspect--active');
    expect(component.isPresetActive(1216, 832)).toBe(true);
  });

  it('applies a shape in the orientation of the current picture', async () => {
    const { component } = await render({ width: 512, height: 768 });

    component.applyPreset(1216, 832);

    expect(component.form().controls.width.value).toBe(832);
    expect(component.form().controls.height.value).toBe(1216);

    component.applyPreset(1024, 1024);

    expect(component.form().controls.width.value).toBe(1024);
    expect(component.form().controls.height.value).toBe(1024);
  });

  it('lifts the shapes and the chosen size when the hires pass goes on', async () => {
    // The pass draws at the trained size and enlarges, so an SD 1.5 request
    // with it on is asked what to enlarge to rather than what to draw.
    const { component, fixture } = await render({ hires_fix: false });
    fixture.componentRef.setInput('modelBaseline', 'stable_diffusion_1');
    fixture.detectChanges();
    expect(component.presets().map((preset) => preset.width)).toEqual([
      512, 704, 768, 896,
    ]);
    component.applyPreset(768, 512);
    fixture.detectChanges();

    component.form().controls.hires_fix.setValue(true);
    fixture.detectChanges();

    expect(component.presets().map((preset) => preset.width)).toEqual([
      1024, 1152, 1216, 1344, 1408, 1536,
    ]);
    // The same shape, at the size the family now in force gives it.
    expect(component.form().controls.width.value).toBe(1216);
    expect(component.form().controls.height.value).toBe(832);

    component.form().controls.hires_fix.setValue(false);
    fixture.detectChanges();
    expect(component.form().controls.width.value).toBe(768);
    expect(component.form().controls.height.value).toBe(512);
  });

  it('leaves a size nobody chose from the shapes where it is', async () => {
    const { component, fixture } = await render({
      width: 960,
      height: 576,
      hires_fix: false,
    });
    fixture.componentRef.setInput('modelBaseline', 'stable_diffusion_1');
    fixture.detectChanges();

    component.form().controls.hires_fix.setValue(true);
    fixture.detectChanges();

    expect(component.form().controls.width.value).toBe(960);
    expect(component.form().controls.height.value).toBe(576);
  });

  it('turns a custom size over too', async () => {
    const { component, fixture } = await render({ width: 960, height: 576 });
    component.openGroup('dimensions');
    fixture.detectChanges();

    component.swapDimensions();

    expect(component.form().controls.width.value).toBe(576);
    expect(component.form().controls.height.value).toBe(960);
  });

  it('normalizes the live size preview for landscape and portrait values', async () => {
    const { component } = await render({ width: 1024, height: 512 });

    expect(component.sizePreviewWidth()).toBe(42);
    expect(component.sizePreviewHeight()).toBe(21);

    component.swapDimensions();

    expect(component.sizePreviewWidth()).toBe(13);
    expect(component.sizePreviewHeight()).toBe(26);

    component.form().patchValue({ width: 768, height: 768 });

    expect(component.sizePreviewWidth()).toBe(26);
    expect(component.sizePreviewHeight()).toBe(26);
  });

  it('offers every upscaler and face fixer the horde knows, named for reading', async () => {
    const { component, fixture } = await render({
      post_processing: ['4xNomos8kSC'],
    });
    component.openGroup('post');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const optionValues = (id: string): string[] =>
      Array.from(host.querySelectorAll<HTMLOptionElement>(`#${id} option`)).map(
        (option) => option.value,
      );

    expect(optionValues('generate-upscaler')).toEqual(['', ...UPSCALERS]);
    expect(optionValues('generate-facefixer')).toEqual(['', ...FACE_FIXERS]);
    // The ids alone cannot be told apart on sight, so each option wears the
    // name alchemy prints for it and the chosen one explains itself.
    expect(
      Array.from(
        host.querySelectorAll<HTMLOptionElement>('#generate-upscaler option'),
      ).map((option) => option.textContent?.trim()),
    ).toContain(en['alchemy.form_names.4xNomos8kSC']);
    expect(
      host.querySelector('#generate-upscaler')?.parentElement?.textContent,
    ).toContain(en['alchemy.form_meta.4xNomos8kSC.desc']);
  });

  it('carries the size on the dimensions line, and the hires pass with it', async () => {
    // Every request has a size, so this group can be folded from the start and
    // still answer the question the card was there to answer.
    const { host } = await render();
    expect(summaryOf(host, 'Dimensions')).toBe('1024 × 1024');

    const { host: enlarged } = await render({
      width: 1216,
      height: 832,
      hires_fix: true,
    });
    expect(summaryOf(enlarged, 'Dimensions')).toBe('1216 × 832 · Hires fix');
  });
});

/**
 * The sampler-specific controls are built from the horde's live contract rather
 * than from a list in this repository, so nothing here can be checked by
 * reading the template: which fields exist, what they are called and which
 * values they offer are all decided at runtime. These render the real template
 * against a contract standing in for the endpoint's answer.
 */
describe('GenerateFormComponent sampler contract', () => {
  const contract: SamplerConstraintsDocument = {
    schema_version: '1.0',
    samplers: {
      k_euler: {
        name: 'k_euler',
        presentation_tier: 'recommended',
        work_profile: null,
        solver_type_choices: [],
        accepted_settings: {
          sampler_s_churn: {
            minimum: 0,
            maximum: 100,
            default: 0,
            integer_only: false,
          },
        },
        applies_cfg_pp: false,
      },
      dpmpp_2m_sde: {
        name: 'dpmpp_2m_sde',
        presentation_tier: 'advanced',
        work_profile: null,
        solver_type_choices: ['midpoint', 'heun'],
        accepted_settings: {
          sampler_eta: {
            minimum: 0,
            maximum: 10,
            default: 1,
            integer_only: false,
          },
        },
        applies_cfg_pp: false,
      },
    },
    hard_constraints: {
      rejected_sampler_scheduler_pairings: [
        { sampler: 'k_euler', scheduler: 'linear_quadratic' },
      ],
      scheduler_baseline_applicability: {
        align_your_steps: ['stable_diffusion_1'],
      },
    },
    presentation_tiers: { recommended: ['k_euler'] },
    recommendations: [],
    advisories: { cfg_pp_advised_max_cfg_scale: null },
  };

  async function renderWithContract(
    value: Partial<GenerateFormValue> = {},
    baseline: string | null = 'stable_diffusion_1',
  ): Promise<{
    fixture: ComponentFixture<GenerateFormComponent>;
    component: GenerateFormComponent;
    form: GenerateFormGroup;
    host: HTMLElement;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      prompt: 'a fox',
      sampler_name: 'k_euler',
      ...value,
    });
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('samplerContract', contract);
    fixture.componentRef.setInput('modelBaseline', baseline);
    fixture.detectChanges();
    // The sampling controls sit in a folded group, and a claim about a control
    // has to be made against a panel that is drawing it.
    for (const group of GROUP_IDS) {
      fixture.componentInstance.openGroup(group);
    }
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      form,
      host: fixture.nativeElement as HTMLElement,
    };
  }

  it('names every knob the contract offers in English', async () => {
    const { fixture, component, host } = await renderWithContract();
    component.toggleAdvancedSampling();
    fixture.detectChanges();
    const label = host.querySelector('label[for="generate-sampler_s_churn"]');

    expect(label).not.toBeNull();
    // A key that reached the surface is a label nobody can read, and these keys
    // are built from the horde's field names rather than written out.
    expect(label!.textContent).not.toContain('generate.form.');
    const unnamed = SAMPLER_SETTING_NAMES.filter(
      (setting) =>
        !(en as Record<string, string>)[`generate.form.${setting}_label`],
    );
    expect(unnamed).toEqual([]);
  });

  it('offers only the schedules the sampler and the model both allow', async () => {
    const { host } = await renderWithContract();
    const select = host.querySelector<HTMLSelectElement>('#generate-scheduler');
    const offered = Array.from(select!.options).map((option) => option.value);

    // The schedule is always named, so there is no "unset" row to pick.
    expect(offered[0]).toBe('karras');
    expect(offered).toContain('karras');
    expect(offered).toContain('align_your_steps');
    expect(offered).not.toContain('linear_quadratic');
  });

  it('withholds a schedule the selected model was not derived for', async () => {
    const { host } = await renderWithContract({}, 'flux_1');
    const select = host.querySelector<HTMLSelectElement>('#generate-scheduler');

    expect(
      Array.from(select!.options).map((option) => option.value),
    ).not.toContain('align_your_steps');
  });

  it('shows the flow shift only where the model family reads it', async () => {
    const { fixture, component, host } = await renderWithContract({}, 'flux_1');
    component.toggleAdvancedSampling();
    fixture.detectChanges();
    expect(host.querySelector('#generate-flow-shift')).not.toBeNull();

    fixture.componentRef.setInput('modelBaseline', 'stable_diffusion_1');
    fixture.detectChanges();

    expect(host.querySelector('#generate-flow-shift')).toBeNull();
  });

  it('drops a scheduler and solver type the new sampler cannot take', async () => {
    const { fixture, form } = await renderWithContract({
      sampler_name: 'dpmpp_2m_sde',
      scheduler: 'linear_quadratic',
      sampler_solver_type: 'heun',
    });

    form.controls.sampler_name.setValue('k_euler');
    fixture.detectChanges();

    // A select holding a value it no longer offers renders blank while still
    // sending that value, so the schedule falls back to the first one offered.
    expect(form.controls.scheduler.value).toBe('karras');
    expect(form.controls.sampler_solver_type.value).toBe('');
  });

  it('keeps a scheduler the new sampler still accepts', async () => {
    const { fixture, form } = await renderWithContract({
      sampler_name: 'dpmpp_2m_sde',
      scheduler: 'karras',
    });

    form.controls.sampler_name.setValue('k_euler');
    fixture.detectChanges();

    expect(form.controls.scheduler.value).toBe('karras');
  });

  it('locks the schedule while a style pins one', async () => {
    const { fixture, form } = await renderWithContract();
    expect(form.controls.scheduler.disabled).toBe(false);

    fixture.componentRef.setInput('forcedParams', { karras: false });
    fixture.detectChanges();

    expect(form.controls.scheduler.disabled).toBe(true);
  });

  it('reveals the advanced knobs once one of them carries a value', async () => {
    const { fixture, component, form, host } = await renderWithContract();
    expect(component.advancedSamplingOpen()).toBe(false);
    expect(host.querySelector('#generate-sampler_s_churn')).toBeNull();

    form.controls.sampler_s_churn.setValue(4);
    fixture.detectChanges();

    expect(component.advancedSamplingOpen()).toBe(true);
    expect(component.advancedSamplingCount()).toBe(1);
    expect(host.querySelector('#generate-sampler_s_churn')).not.toBeNull();

    // A knob the selected sampler does not accept is not counted.
    form.controls.sampler_eta.setValue(2);
    fixture.detectChanges();
    expect(component.advancedSamplingCount()).toBe(1);
  });

  it('keeps the disclosure for a sampler with nothing to tune, and says so', async () => {
    const { fixture, component, form, host } = await renderWithContract();
    form.controls.sampler_name.setValue('DDIM');
    fixture.detectChanges();

    expect(component.hasAdvancedSampling()).toBe(false);
    expect(
      host.querySelector('[aria-controls="generate-advanced-sampling"]'),
    ).not.toBeNull();

    component.toggleAdvancedSampling();
    fixture.detectChanges();
    const body = host.querySelector('#generate-advanced-sampling');
    expect(body?.tagName).toBe('P');
    expect(host.querySelector('#generate-sampler_eta')).toBeNull();
  });

  it('leaves the knobs closed once the reader closes them', async () => {
    const { fixture, component, form } = await renderWithContract();
    component.toggleAdvancedSampling();
    component.toggleAdvancedSampling();
    fixture.detectChanges();

    form.controls.sampler_s_churn.setValue(4);
    fixture.detectChanges();

    expect(component.advancedSamplingOpen()).toBe(false);
  });

  it('clears every knob at once', async () => {
    const { fixture, component, form } = await renderWithContract({
      sampler_s_churn: 4,
      flow_shift: 3,
      sampler_solver_type: 'heun',
    });

    component.clearAdvancedSampling();
    fixture.detectChanges();

    expect(form.controls.sampler_s_churn.value).toBeNull();
    expect(form.controls.flow_shift.value).toBeNull();
    expect(form.controls.sampler_solver_type.value).toBe('');
    expect(component.advancedSamplingCount()).toBe(0);
  });

  it('files the samplers under the tier the horde puts them in', async () => {
    const { host } = await renderWithContract();
    const groups = Array.from(
      host.querySelectorAll<HTMLOptGroupElement>('#generate-sampler optgroup'),
    );

    expect(groups.length).toBe(2);
    expect(
      Array.from(groups[0].querySelectorAll('option')).map(
        (option) => option.value,
      ),
    ).toEqual(['k_euler']);
    expect(
      Array.from(groups[1].querySelectorAll('option')).map(
        (option) => option.value,
      ),
    ).toEqual(['dpmpp_2m_sde']);
  });

  it('falls back to the built-in samplers with no contract published', async () => {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    })
      .overrideComponent(GenerateFormComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(GenerateFormComponent);
    fixture.componentRef.setInput(
      'form',
      createGenerateForm({ ...DEFAULT_GENERATE_FORM_VALUE }),
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.recommendedSamplers()).toEqual([
      ...SAMPLERS,
    ]);
    expect(fixture.componentInstance.advancedSamplers()).toEqual([]);
  });
});

/**
 * The same panel, driven by a captured response from a horde serving schema
 * 1.0 rather than by a contract written to suit the assertions. What the
 * controls offer is the horde's answer, so a hand-written contract can only
 * show that the wiring runs, not that it runs on the real vocabulary.
 */
describe('GenerateFormComponent on the published contract', () => {
  const contract = coerceSamplerConstraints(live)!;

  async function render(
    value: Partial<GenerateFormValue> = {},
    baseline: string | null = 'stable_diffusion_1',
  ): Promise<{
    fixture: ComponentFixture<GenerateFormComponent>;
    component: GenerateFormComponent;
    form: GenerateFormGroup;
    host: HTMLElement;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      prompt: 'a fox',
      ...value,
    });
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('samplerContract', contract);
    fixture.componentRef.setInput('modelBaseline', baseline);
    fixture.detectChanges();
    // The sampling controls sit in a folded group, and a claim about a control
    // has to be made against a panel that is drawing it.
    for (const group of GROUP_IDS) {
      fixture.componentInstance.openGroup(group);
    }
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      form,
      host: fixture.nativeElement as HTMLElement,
    };
  }

  it('offers every sampler the horde publishes, under its own tier', async () => {
    const { host } = await render();
    const options = Array.from(
      host.querySelectorAll<HTMLOptionElement>('#generate-sampler option'),
    ).map((option) => option.value);

    expect(new Set(options)).toEqual(new Set(Object.keys(live.samplers)));
    expect(options).toHaveLength(Object.keys(live.samplers).length);
  });

  it('builds the solver controls the selected sampler actually accepts', async () => {
    const { fixture, form, host } = await render({
      sampler_name: 'dpmpp_2m_sde',
    });
    fixture.componentInstance.toggleAdvancedSampling();
    fixture.detectChanges();

    const solver = host.querySelector<HTMLSelectElement>(
      '#generate-solver-type',
    );
    expect(Array.from(solver!.options).map((option) => option.value)).toEqual([
      '',
      'midpoint',
      'heun',
    ]);
    expect(host.querySelector('#generate-sampler_eta')).not.toBeNull();

    // A sampler with no knobs leaves none of them behind.
    form.controls.sampler_name.setValue('DDIM');
    fixture.detectChanges();
    expect(host.querySelector('#generate-solver-type')).toBeNull();
    expect(host.querySelector('#generate-sampler_eta')).toBeNull();
  });

  it('prices the samplers that charge more than one pass a step', async () => {
    const { host } = await render();
    const labels = new Map(
      Array.from(
        host.querySelectorAll<HTMLOptionElement>('#generate-sampler option'),
      ).map((option) => [option.value, option.textContent?.trim() ?? '']),
    );

    expect(labels.get('k_heun')).toBe('k_heun · ×2');
    expect(labels.get('heunpp2')).toBe('heunpp2 · ×3');
    expect(labels.get('k_dpm_adaptive')).toBe('k_dpm_adaptive · adaptive');
    // The ordinary rate is the rest of the list, and says nothing.
    expect(labels.get('k_euler')).toBe('k_euler');
  });

  it('says what an advanced sampler costs without calling it a warning', async () => {
    const { component } = await render({ sampler_name: 'k_heun' });

    expect(component.samplerTierKey()).toBe(
      'generate.form.sampler_advanced_note_work',
    );
    expect(component.samplerWork('k_heun')).toBe(2);
  });

  it('says an adaptive sampler sets its own step count', async () => {
    const { component } = await render({ sampler_name: 'k_dpm_adaptive' });

    expect(component.samplerTierKey()).toBe(
      'generate.form.sampler_advanced_note_adaptive',
    );
  });

  it('marks the schedules the horde pairs the sampler with', async () => {
    const { host } = await render({ sampler_name: 'DDIM' });
    const labels = (): string[] =>
      Array.from(
        host.querySelectorAll<HTMLOptionElement>('#generate-scheduler option'),
      ).map((option) => option.textContent?.trim() ?? '');

    // ddim_uniform is the schedule the backend's authors name for DDIM; the
    // entry that names no sampler marks nothing, and the third-party matrix
    // never does.
    expect(labels()).toContain('ddim_uniform · suggested');
    expect(labels()).toContain('karras');
    expect(labels().filter((label) => label.includes('suggested'))).toEqual([
      'ddim_uniform · suggested',
    ]);
  });

  it('withholds a sigma generator the chosen model was not derived for', async () => {
    const { fixture, host } = await render({ sampler_name: 'k_euler' });
    const schedules = (): string[] =>
      Array.from(
        host.querySelectorAll<HTMLOptionElement>('#generate-scheduler option'),
      ).map((option) => option.value);

    expect(schedules()).toContain('align_your_steps');

    fixture.componentRef.setInput('modelBaseline', 'flux_1');
    fixture.detectChanges();

    expect(schedules()).not.toContain('align_your_steps');
    expect(schedules()).toContain('karras');
  });
});

/**
 * The advice that reads the horde's sampler contract and the size together,
 * rendered from the real template: each of these lines exists to be seen beside
 * the control it speaks about, and the count beside Generate is the same list.
 */
describe('GenerateFormComponent cost and size advice', () => {
  const contract = coerceSamplerConstraints(live)!;

  async function render(
    value: Partial<GenerateFormValue> = {},
    baseline: string | null = 'stable_diffusion_1',
  ): Promise<{
    fixture: ComponentFixture<GenerateFormComponent>;
    component: GenerateFormComponent;
    form: GenerateFormGroup;
    host: HTMLElement;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      prompt: 'a fox',
      ...value,
    });
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('samplerContract', contract);
    fixture.componentRef.setInput('modelBaseline', baseline);
    fixture.detectChanges();
    // The controls these lines sit under live in folded groups, and a panel
    // that is not drawing a control draws no line under it either.
    for (const group of GROUP_IDS) {
      fixture.componentInstance.openGroup(group);
    }
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      form,
      host: fixture.nativeElement as HTMLElement,
    };
  }

  function lines(host: HTMLElement, anchor: string): string[] {
    const field = host.querySelector<HTMLElement>(`[appTutAnchor="${anchor}"]`);
    return Array.from(field?.querySelectorAll('.gs-req') ?? []).map(
      (line) => line.textContent?.trim() ?? '',
    );
  }

  it('states the cost of a heavier sampler under a high step count', async () => {
    const { host } = await render({ sampler_name: 'k_heun', steps: 30 });

    expect(lines(host, 'steps')).toContain(
      'k_heun does about \u00d72 the work per step, so 20 steps already cost what 40 do on a plain sampler. More rarely helps.',
    );
  });

  it('says nothing about the cost at a modest count', async () => {
    const { host } = await render({ sampler_name: 'k_heun', steps: 20 });
    expect(lines(host, 'steps')).toEqual([]);
  });

  it('says nothing about the cost of a sampler charging the ordinary rate', async () => {
    const { host } = await render({ sampler_name: 'k_euler', steps: 30 });
    expect(lines(host, 'steps')).toEqual([]);
  });

  it('marks a CLIP skip above 2', async () => {
    const { host } = await render({ clip_skip: 3 });
    expect(lines(host, 'clip_skip')).toEqual([
      en['generate.form.requirement.clip_skip_high'],
    ]);
  });

  it('leaves CLIP skip 2 alone', async () => {
    const { host } = await render({ clip_skip: 2 });
    expect(lines(host, 'clip_skip')).toEqual([]);
  });

  it('shows the hires switch in the dimensions card, under its own anchor', async () => {
    const { host } = await render();
    const size = host.querySelector<HTMLElement>('.gs-sec--size')!;
    const hires = host.querySelector<HTMLElement>('[appTutAnchor="hires"]')!;

    expect(size.contains(hires)).toBe(true);
    expect(hires.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(
      host.querySelector('.gs-sec--sampling [appTutAnchor="hires"]'),
    ).toBeNull();
  });

  it('marks the switch and offers it where an SD 1.5 request outgrows the model', async () => {
    const { host, fixture, component, form } = await render({
      width: 1024,
      height: 768,
    });

    expect(component.hiresSuggested()).toBe(true);
    expect(host.querySelector('.gs-opt--urged')).not.toBeNull();
    expect(lines(host, 'hires')).toContain(en['generate.form.hires_helps']);

    // Once the pass is on there is nothing left to urge.
    host
      .querySelector<HTMLInputElement>(
        '[appTutAnchor="hires"] input[type="checkbox"]',
      )!
      .click();
    fixture.detectChanges();
    expect(form.controls.hires_fix.value).toBe(true);
    expect(component.hiresSuggested()).toBe(false);
    expect(host.querySelector('.gs-opt--urged')).toBeNull();
  });

  it('warns when the pass is on at a size it does nothing for', async () => {
    const { host, component } = await render({
      width: 512,
      height: 512,
      hires_fix: true,
    });

    expect(component.hiresUnneededHint()?.violated).toBe(true);
    expect(lines(host, 'hires')).toContain(
      en['generate.form.requirement.hires_unneeded'],
    );
  });

  it('keeps the switch locked while a style pins the sampling group', async () => {
    const { fixture, host, form } = await render();
    fixture.componentRef.setInput('forcedParams', { hires_fix: true });
    fixture.detectChanges();

    expect(form.controls.hires_fix.disabled).toBe(true);
    expect(
      host.querySelector('[appTutAnchor="hires"] .gs-switch-row.gs-locked'),
    ).not.toBeNull();
  });
});

/**
 * The panel and the count beside Generate are two views of one list, so a
 * warning line the reader can see is a warning the count includes, and a field
 * never carries two advisory lines at once. These render the real template,
 * because the number of lines drawn is exactly what is being guaranteed.
 */
describe('GenerateFormComponent advisory lines', () => {
  async function render(
    value: Partial<GenerateFormValue>,
    baseline: string | null,
    requirements: ModelRequirements | null,
    contract: SamplerConstraintsDocument | null = null,
  ): Promise<{
    host: HTMLElement;
    fixture: ComponentFixture<GenerateFormComponent>;
    form: GenerateFormGroup;
    warnings: readonly RequestWarning[];
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      prompt: 'a fox',
      model: 'a model',
      ...value,
    });
    const warnings = evaluateRequestLint({
      value: form.getRawValue(),
      baseline,
      requirements,
      hasSourceImage: false,
      contract,
    });
    fixture.componentRef.setInput('form', form);
    fixture.detectChanges();
    // The size has been chosen for this request, so the model-change snap must
    // leave it alone and the panel lints the size the test asked for.
    fixture.componentInstance.setSizeBase(1024);
    fixture.componentRef.setInput('modelBaseline', baseline);
    fixture.componentRef.setInput('modelRequirements', requirements);
    fixture.componentRef.setInput('samplerContract', contract);
    fixture.componentRef.setInput('lintWarnings', warnings);
    fixture.detectChanges();
    // A folded group draws none of its lines, and the claim here is that every
    // warning the count reports is one the reader can read.
    for (const group of GROUP_IDS) {
      fixture.componentInstance.openGroup(group);
    }
    fixture.detectChanges();
    return {
      host: fixture.nativeElement as HTMLElement,
      fixture,
      form,
      warnings,
    };
  }

  /** Every warning line the panel is drawing, in document order. */
  function warnLines(host: HTMLElement): string[] {
    return Array.from(
      host.querySelectorAll<HTMLElement>('.gs-req--warn, .gs-warn'),
    ).map((line) => line.textContent?.trim() ?? '');
  }

  it('draws exactly the lines the count beside Generate reports', async () => {
    const { host, warnings } = await render(
      { steps: 30, clip_skip: 4, width: 1024, height: 1024 },
      'stable_diffusion_1',
      { min_steps: 4, max_steps: 12, samplers: ['k_euler'] },
      coerceSamplerConstraints(live),
    );

    expect(warnings.map((warning) => warning.anchor)).toEqual([
      'steps',
      'clip_skip',
      'sampler',
      'size',
    ]);
    expect(warnLines(host)).toHaveLength(warnings.length);
    expect(host.querySelector('.gs-lint-count')?.textContent?.trim()).toBe(
      String(warnings.length),
    );
  });

  it('shows one line under the steps field however many could apply', async () => {
    const { host } = await render(
      { steps: 30, sampler_name: 'k_heun' },
      null,
      { min_steps: 4, max_steps: 12 },
      coerceSamplerConstraints(live),
    );

    const steps = host.querySelector<HTMLElement>('[appTutAnchor="steps"]');
    const lines = steps?.querySelectorAll('.gs-req') ?? [];
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toContain('4');
  });

  it('offers a way to the control each warning is about', async () => {
    const { host, fixture } = await render(
      { steps: 30 },
      null,
      { min_steps: 4, max_steps: 12 },
      null,
    );

    fixture.componentInstance.toggleLint();
    fixture.detectChanges();

    const gotos = host.querySelectorAll<HTMLButtonElement>('.gs-lint-goto');
    expect(gotos).toHaveLength(1);
    expect(gotos[0].textContent?.trim()).toBe(en['generate.lint.go_to']);

    gotos[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.lintOpen()).toBe(false);
  });

  it('puts a refused knob under that knob, and drops it once it is answered', async () => {
    const { host, fixture } = await render(
      { sampler_name: 'k_euler_a' },
      null,
      null,
      coerceSamplerConstraints(live),
    );
    fixture.componentInstance.advancedSamplingOpen.set(true);
    fixture.componentRef.setInput('fieldRejection', {
      anchor: 'sampler_eta',
      message: 'k_euler_a does not accept eta.',
    });
    fixture.detectChanges();

    const field = host.querySelector<HTMLInputElement>('#generate-sampler_eta');
    const knob = field?.parentElement;
    expect(knob?.querySelector('.gs-warn')?.textContent).toContain(
      'does not accept eta',
    );
    expect(field?.getAttribute('aria-describedby')).toBe(
      'generate-rejection-sampler_eta',
    );

    fixture.componentRef.setInput('fieldRejection', null);
    fixture.detectChanges();
    expect(knob?.querySelector('.gs-warn')).toBeNull();
  });

  it('puts a refused schedule under the schedule select', async () => {
    const { host, fixture } = await render({}, null, null, null);
    fixture.componentRef.setInput('fieldRejection', {
      anchor: 'scheduler',
      message: 'That schedule is not offered for this model.',
    });
    fixture.detectChanges();

    const field = host.querySelector<HTMLElement>('[appTutAnchor="scheduler"]');
    expect(field?.querySelector('.gs-warn')?.textContent).toContain(
      'not offered',
    );
    expect(
      host
        .querySelector('#generate-scheduler')
        ?.getAttribute('aria-describedby'),
    ).toBe('generate-rejection-scheduler');
  });
});

describe('GenerateFormComponent suggested settings', () => {
  async function render(
    requirements: ModelRequirements | null,
    value: Partial<GenerateFormValue> = {},
  ): Promise<{
    host: HTMLElement;
    fixture: ComponentFixture<GenerateFormComponent>;
    form: GenerateFormGroup;
    toast: ToastService;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      prompt: 'a fox',
      model: 'a model',
      ...value,
    });
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('modelRequirements', requirements);
    fixture.detectChanges();
    return {
      host: fixture.nativeElement as HTMLElement,
      fixture,
      form,
      toast: TestBed.inject(ToastService),
    };
  }

  function suggestButton(host: HTMLElement): HTMLButtonElement | null {
    return (
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          '[appTutAnchor="model"] button',
        ),
      ).find(
        (button) =>
          button.textContent?.trim() === en['generate.form.use_suggested'],
      ) ?? null
    );
  }

  it('applies every recommendation the request is not already following', async () => {
    const { host, fixture, form, toast } = await render({
      samplers: ['k_euler'],
      schedulers: ['normal'],
      min_steps: 4,
      max_steps: 12,
      cfg_scale: 3,
      clip_skip: 2,
    });

    suggestButton(host)?.click();
    fixture.detectChanges();

    const value = form.getRawValue();
    expect(value.sampler_name).toBe('k_euler');
    expect(value.scheduler).toBe('normal');
    expect(value.steps).toBe(12);
    expect(value.cfg_scale).toBe(3);
    expect(value.clip_skip).toBe(2);
    expect(toast.toasts()[0].message).toBe('generate.form.use_suggested_done');
    expect(toast.toasts()[0].messageParams).toEqual({ count: 5 });
  });

  it('stands down once the request already follows the advice', async () => {
    const { host, fixture } = await render({
      samplers: ['k_euler'],
      min_steps: 4,
      max_steps: 12,
    });
    expect(suggestButton(host)).not.toBeNull();

    suggestButton(host)?.click();
    fixture.detectChanges();
    expect(suggestButton(host)).toBeNull();
  });

  it('is absent for a model that recommends nothing', async () => {
    const { host } = await render(null);
    expect(suggestButton(host)).toBeNull();
  });
});

/**
 * The estimate is the horde's number and nobody explained it. The popover is
 * the explanation, so what it draws is what is being guaranteed here: the
 * reader's own settings, and a word about the wait.
 */
describe('GenerateFormComponent kudos breakdown', () => {
  async function render(
    value: Partial<GenerateFormValue>,
    models: ActiveModel[] = [],
  ): Promise<{
    host: HTMLElement;
    fixture: ComponentFixture<GenerateFormComponent>;
    component: GenerateFormComponent;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      prompt: 'a fox',
      model: 'a model',
      ...value,
    });
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('kudos', 26.4);
    fixture.componentRef.setInput('models', models);
    fixture.componentRef.setInput(
      'kudosLines',
      kudosBreakdown(form.getRawValue(), coerceSamplerConstraints(live)),
    );
    fixture.componentRef.setInput(
      'waitLine',
      modelWaitEstimate(models[0] ?? null),
    );
    fixture.detectChanges();
    fixture.componentInstance.toggleKudos();
    fixture.detectChanges();
    return {
      host: fixture.nativeElement as HTMLElement,
      fixture,
      component: fixture.componentInstance,
    };
  }

  function popLines(host: HTMLElement): string[] {
    return Array.from(host.querySelectorAll<HTMLElement>('.gs-kudos-item')).map(
      (line) => line.textContent?.trim() ?? '',
    );
  }

  it('names the settings the reader controls, in their own numbers', async () => {
    const { host } = await render({
      width: 1024,
      height: 1024,
      steps: 30,
      sampler_name: 'k_heun',
      hires_fix: true,
      n: 4,
    });

    expect(popLines(host)).toEqual([
      'Size 1024×1024, 1.05 megapixels',
      '30 steps × k_heun at ×2 = 60 units of work',
      'Hires fix, which paints the picture a second time at full size',
      '× 4 images',
    ]);
    expect(host.querySelector('.gs-kudos-title')?.textContent?.trim()).toBe(
      'Why this costs about 26 kudos',
    );
    expect(host.querySelector('.gs-kudos-note')?.textContent?.trim()).toBe(
      en['generate.form.kudos_horde_owns'],
    );
  });

  it('says how long the picked model is taking right now', async () => {
    const { host } = await render({ model: 'a model' }, [
      { name: 'a model', count: 4, eta: 45 },
    ]);

    expect(host.querySelector('.gs-kudos-wait')?.textContent?.trim()).toBe(
      'Usually about 45 seconds right now for this model',
    );
  });

  it('falls back to the workers when the horde states no eta', async () => {
    const { host } = await render({ model: 'a model' }, [
      { name: 'a model', count: 4 },
    ]);

    expect(host.querySelector('.gs-kudos-wait')?.textContent?.trim()).toBe(
      en['generate.form.kudos_wait_unknown'],
    );
  });

  it('reuses the no-worker sentence for a model nobody carries', async () => {
    const { host } = await render({ model: 'a model' }, [
      { name: 'a model', count: 0, eta: 10000 },
    ]);

    expect(host.querySelector('.gs-kudos-wait')?.textContent?.trim()).toBe(
      en['generate.form.model_no_workers'],
    );
  });

  it('says on the trigger whether the breakdown is open', async () => {
    const { host, fixture, component } = await render({});
    const button = host.querySelector<HTMLButtonElement>('.gs-kudos-btn');

    expect(button?.getAttribute('aria-expanded')).toBe('true');

    component.onDocumentEscape();
    fixture.detectChanges();

    expect(component.kudosOpen()).toBe(false);
    expect(host.querySelector('.gs-kudos-pop')).toBeNull();
    expect(
      host
        .querySelector<HTMLButtonElement>('.gs-kudos-btn')
        ?.getAttribute('aria-expanded'),
    ).toBe('false');
  });
});

/** The Options list's trigger, which is the last tool in the header row. */
function optionsButton(host: HTMLElement): HTMLButtonElement {
  return host.querySelector<HTMLButtonElement>('.gs-options .gs-mini-btn')!;
}

function openOptions(
  host: HTMLElement,
  fixture: ComponentFixture<GenerateFormComponent>,
): void {
  optionsButton(host).click();
  fixture.detectChanges();
}

/** A row of the Options list, found the way a reader finds it: by its word. */
function optionRow(host: HTMLElement, label: string): HTMLElement | null {
  return (
    Array.from(host.querySelectorAll<HTMLElement>('.gs-opt-row')).find(
      (row) =>
        row.querySelector('.gs-opt-label')?.textContent?.trim() === label,
    ) ?? null
  );
}

describe('GenerateFormComponent docked Generate', () => {
  async function render(): Promise<{
    host: HTMLElement;
    fixture: ComponentFixture<GenerateFormComponent>;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    fixture.componentRef.setInput(
      'form',
      createGenerateForm({ ...DEFAULT_GENERATE_FORM_VALUE, prompt: 'a fox' }),
    );
    fixture.componentRef.setInput('forcedParams', null);
    fixture.componentRef.setInput('pinnable', true);
    fixture.detectChanges();
    return { host: fixture.nativeElement as HTMLElement, fixture };
  }

  /**
   * Docking is CSS: what a spec can hold is that the class the stylesheet acts
   * on is on the footer's own submit row, and that the row still holds the
   * form's submit button rather than a stand-in for it.
   */
  it('docks the footer row that holds the real submit', async () => {
    const { host, fixture } = await render();
    const row = host.querySelector<HTMLElement>('.gs-submitrow');

    expect(row).not.toBeNull();
    expect(row!.classList.contains('gs-submitrow--pinned')).toBe(false);

    fixture.componentRef.setInput('pinGenerate', true);
    fixture.detectChanges();

    expect(row!.classList.contains('gs-submitrow--pinned')).toBe(true);
    const button = row!.querySelector<HTMLButtonElement>('.gs-genbtn');
    expect(button?.type).toBe('submit');
    expect(button?.closest('form')).not.toBeNull();
    expect(host.querySelectorAll('.gs-genbtn').length).toBe(1);
    expect(row!.querySelector('.gs-batch')).not.toBeNull();
  });

  it('stays pressable whatever the form holds', async () => {
    const { host, fixture } = await render();
    fixture.componentRef.setInput('pinGenerate', true);
    fixture.detectChanges();

    const button = host.querySelector<HTMLButtonElement>(
      '.gs-submitrow--pinned .gs-genbtn',
    );
    expect(button?.disabled).toBe(false);

    // A greyed-out button says only that something somewhere is wrong. The
    // press is taken and answered with the list of what is in the way instead.
    fixture.componentInstance.form().controls.prompt.setErrors({
      required: true,
    });
    fixture.detectChanges();

    expect(button?.disabled).toBe(false);
  });

  it('offers the switch only where the studio owns the screen', async () => {
    const { host, fixture } = await render();
    const pinRow = (): HTMLElement | null =>
      optionRow(host, en['generate.form.pin_generate']);

    openOptions(host, fixture);
    expect(pinRow()?.getAttribute('aria-pressed')).toBe('false');

    let asked: boolean | null = null;
    fixture.componentInstance.pinGenerateChange.subscribe((on) => (asked = on));
    pinRow()!.click();
    expect(asked).toBe(true);

    fixture.componentRef.setInput('pinnable', false);
    fixture.detectChanges();

    expect(pinRow()).toBeNull();
    expect(
      host
        .querySelector<HTMLElement>('.gs-submitrow')
        ?.classList.contains('gs-submitrow--pinned'),
    ).toBe(false);
  });
});

describe('GenerateFormComponent Options list', () => {
  /**
   * A browser that puts an ordinary element on the whole screen, and one that
   * only ever does that to video. `available` is decided in the real service's
   * constructor from the document, so the two cases are separate providers
   * rather than a property a test can move.
   */
  function fullscreenStub(
    available: boolean,
    phone = false,
  ): FullscreenService {
    return {
      available,
      active: signal(false),
      immersive: signal(false),
      filling: signal(false),
      phone: signal(phone),
      toggle: (): Promise<void> => Promise.resolve(),
      setTarget: (): void => undefined,
    } as unknown as FullscreenService;
  }

  async function render(
    available = false,
    phone = false,
  ): Promise<{
    host: HTMLElement;
    fixture: ComponentFixture<GenerateFormComponent>;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: FullscreenService,
          useValue: fullscreenStub(available, phone),
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    fixture.componentRef.setInput(
      'form',
      createGenerateForm({ ...DEFAULT_GENERATE_FORM_VALUE, prompt: 'a fox' }),
    );
    fixture.componentRef.setInput('pinnable', true);
    fixture.detectChanges();
    return { host: fixture.nativeElement as HTMLElement, fixture };
  }

  it('names itself as a menu and says whether it is open', async () => {
    const { host, fixture } = await render();
    const button = optionsButton(host);

    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toContain(en['generate.form.options']);
    expect(host.querySelector('.gs-options-pop')).toBeNull();

    openOptions(host, fixture);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.gs-options-pop')).not.toBeNull();
  });

  it('hands focus back to its button when escape closes it', async () => {
    const { host, fixture } = await render();
    openOptions(host, fixture);

    fixture.componentInstance.onDocumentEscape();
    fixture.detectChanges();

    expect(fixture.componentInstance.optionsOpen()).toBe(false);
    expect(host.querySelector('.gs-options-pop')).toBeNull();
    expect(document.activeElement).toBe(optionsButton(host));
  });

  it('closes on a press beside it', async () => {
    const { host, fixture } = await render();
    openOptions(host, fixture);

    fixture.componentInstance.onDocumentPointerDown({
      target: document.body,
    } as unknown as PointerEvent);
    fixture.detectChanges();

    expect(fixture.componentInstance.optionsOpen()).toBe(false);
  });

  it('shows each standing preference as it stands and flips it', async () => {
    const { host, fixture } = await render();
    openOptions(host, fixture);
    const reviewRow = (): HTMLElement | null =>
      optionRow(host, en['generate.form.review_before_send']);

    expect(reviewRow()?.getAttribute('aria-pressed')).toBe('false');

    let asked: boolean | null = null;
    fixture.componentInstance.reviewBeforeSendChange.subscribe(
      (on) => (asked = on),
    );
    reviewRow()!.click();
    fixture.detectChanges();

    expect(asked).toBe(true);
    // The parent owns the preference, so the row only reads it back.
    fixture.componentRef.setInput('reviewBeforeSend', true);
    fixture.detectChanges();

    expect(reviewRow()?.getAttribute('aria-pressed')).toBe('true');
    expect(reviewRow()?.classList.contains('gs-opt-row--on')).toBe(true);
    // A preference stays put when it is flipped: its state is the answer.
    expect(fixture.componentInstance.optionsOpen()).toBe(true);
  });

  it('leaves out the full-screen row where the browser has no such thing', async () => {
    const { host, fixture } = await render(false);
    openOptions(host, fixture);

    expect(optionRow(host, en['generate.shell.fullscreen'])).toBeNull();
  });

  it('offers full screen where the browser has it', async () => {
    const { host, fixture } = await render(true);
    openOptions(host, fixture);

    expect(optionRow(host, en['generate.shell.fullscreen'])).not.toBeNull();
  });

  it('offers full screen on a phone whose browser has none', async () => {
    // Every iPhone: no fullscreen for an ordinary element, and the screen is
    // where the studio needs the room most, so the row stands anyway.
    const { host, fixture } = await render(false, true);
    openOptions(host, fixture);

    expect(optionRow(host, en['generate.shell.fullscreen'])).not.toBeNull();
  });

  it('stands the page down when that row is pressed on such a phone', async () => {
    // The real service here: what the row does is put the mark on the body,
    // which is what the site's bars read.
    const matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '',
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
      // The CDK's breakpoint observer still reaches for the old pair.
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
    });
    vi.stubGlobal('matchMedia', matchMedia);
    try {
      await TestBed.configureTestingModule({
        imports: [
          GenerateFormComponent,
          TranslocoTestingModule.forRoot({
            langs: { en },
            translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          }),
        ],
        providers: [provideRouter([])],
      }).compileComponents();

      const fixture = TestBed.createComponent(GenerateFormComponent);
      fixture.componentRef.setInput(
        'form',
        createGenerateForm({ ...DEFAULT_GENERATE_FORM_VALUE, prompt: 'a fox' }),
      );
      fixture.componentRef.setInput('pinnable', true);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const fullscreen = TestBed.inject(FullscreenService);

      expect(fullscreen.available).toBe(false);
      expect(fullscreen.phone()).toBe(true);

      openOptions(host, fixture);
      const row = optionRow(host, en['generate.shell.fullscreen']);
      expect(row).not.toBeNull();
      row!.click();
      await Promise.resolve();

      expect(fullscreen.immersive()).toBe(true);
      expect(document.body.classList.contains('gs-immersive')).toBe(true);

      await fullscreen.exit();
      expect(document.body.classList.contains('gs-immersive')).toBe(false);
    } finally {
      document.body.classList.remove('gs-immersive');
      vi.unstubAllGlobals();
    }
  });

  it('is the bottom sheet rather than a popover on a phone', async () => {
    const { host, fixture } = await render();
    fixture.componentRef.setInput('narrow', true);
    fixture.detectChanges();
    openOptions(host, fixture);

    expect(host.querySelector('.gs-options-pop')).toBeNull();
    expect(host.querySelector('app-gs-sheet')).not.toBeNull();
    expect(
      optionRow(host, en['generate.form.review_before_send']),
    ).not.toBeNull();
  });

  it('keeps the settings reference on the title line at every width', async () => {
    const { host, fixture } = await render();
    const titleLink = (): HTMLAnchorElement | null =>
      host.querySelector<HTMLAnchorElement>(
        '.gs-panel-header > a.gs-title-link',
      );

    expect(titleLink()?.getAttribute('href')).toBe(DOCS_IMAGE_SETTINGS);
    expect(titleLink()?.textContent).toContain(
      en['generate.form.open_reference_short'],
    );

    fixture.componentRef.setInput('narrow', true);
    fixture.detectChanges();

    expect(titleLink()?.getAttribute('href')).toBe(DOCS_IMAGE_SETTINGS);
    expect(titleLink()?.textContent).toContain(
      en['generate.form.open_reference_short'],
    );
  });

  it('leaves the settings reference out of the tool row and the list', async () => {
    const { host, fixture } = await render();
    openOptions(host, fixture);

    expect(host.querySelector('.gs-tools a')).toBeNull();
    expect(
      optionRow(host, en['generate.form.open_reference_short']),
    ).toBeNull();
  });

  it('carries a word on every header tool', async () => {
    const { host } = await render();
    const wordless = Array.from(
      host.querySelectorAll<HTMLElement>('.gs-tools .gs-mini-btn'),
    ).filter((button) => !button.querySelector('.gs-mini-btn-label'));

    expect(wordless).toEqual([]);
  });
});

describe('GenerateFormComponent docked chips', () => {
  async function render(): Promise<{
    host: HTMLElement;
    fixture: ComponentFixture<GenerateFormComponent>;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    fixture.componentRef.setInput(
      'form',
      createGenerateForm({ ...DEFAULT_GENERATE_FORM_VALUE, prompt: 'a fox' }),
    );
    fixture.detectChanges();
    return { host: fixture.nativeElement as HTMLElement, fixture };
  }

  const foldChip = (host: HTMLElement): HTMLElement | null =>
    Array.from(
      host.querySelectorAll<HTMLElement>('.gs-dock .gs-dock-chip'),
    ).find(
      (chip) =>
        chip.getAttribute('aria-label') === en['generate.groups.fold_all'],
    ) ?? null;

  it('puts the ledger in the header and keeps the fold-up in the dock', async () => {
    const { host, fixture } = await render();
    // The panel remembers folds, so the starting point is stated rather than
    // assumed: every group folded, then one opened.
    fixture.componentInstance.foldAllGroups();
    fixture.componentInstance.toggleGroup('sampling');
    fixture.detectChanges();

    expect(host.querySelector('.gs-tools .gs-ledger-btn')).not.toBeNull();
    expect(host.querySelector('.gs-dock .gs-ledger-btn')).toBeNull();
    expect(foldChip(host)).not.toBeNull();
    const headerFold = Array.from(
      host.querySelectorAll<HTMLElement>('.gs-tools .gs-mini-btn'),
    ).filter(
      (button) =>
        button.getAttribute('aria-label') === en['generate.groups.fold_all'],
    );
    expect(headerFold).toEqual([]);
  });

  it('puts the ledger in the floating dock in stacked view', async () => {
    const { host, fixture } = await render();
    fixture.componentRef.setInput('narrow', true);
    fixture.detectChanges();

    expect(host.querySelector('.gs-tools .gs-ledger-btn')).toBeNull();
    expect(host.querySelector('.gs-dock .gs-ledger-btn')).not.toBeNull();
  });

  it('counts what has moved on the ledger chip, and says nothing at zero', async () => {
    const { host, fixture } = await render();
    const chip = (): HTMLElement | null =>
      host.querySelector<HTMLElement>('.gs-ledger-btn');

    expect(chip()?.getAttribute('aria-label')).toBe(
      en['generate.form.ledger_label'].replace('{{ count }}', '1'),
    );
    expect(chip()?.textContent).toContain(en['generate.form.ledger_short']);

    fixture.componentInstance.form().controls.prompt.setValue('');
    fixture.detectChanges();

    expect(chip()).toBeNull();
  });

  it('offers the fold-up only while a group is open', async () => {
    const { host, fixture } = await render();
    fixture.componentInstance.foldAllGroups();
    fixture.detectChanges();

    expect(foldChip(host)).toBeNull();

    fixture.componentInstance.toggleGroup('sampling');
    fixture.detectChanges();

    expect(foldChip(host)).not.toBeNull();

    foldChip(host)!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.anyGroupOpen()).toBe(false);
    expect(foldChip(host)).toBeNull();
  });

  it('opens the ledger from its chip, with the reset inside it', async () => {
    const { host, fixture } = await render();
    const chip = host.querySelector<HTMLButtonElement>('.gs-ledger-btn')!;

    expect(chip.getAttribute('aria-expanded')).toBe('false');

    chip.click();
    fixture.detectChanges();
    const pop = host.querySelector<HTMLElement>('.gs-ledger-pop');

    expect(pop).not.toBeNull();
    expect(pop!.getAttribute('role')).toBe('dialog');
    expect(pop!.querySelector('.gs-reset-btn')).not.toBeNull();

    fixture.componentInstance.onDocumentEscape();
    fixture.detectChanges();

    expect(host.querySelector('.gs-ledger-pop')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('.gs-ledger-btn'));
  });
});

describe('GenerateFormComponent changed-settings ledger', () => {
  const COPY = en as Record<string, string>;

  it('names every setting it can list', () => {
    const unnamed = Object.values(FIELD_LABEL_KEY).filter((key) => !COPY[key]);
    expect(unnamed).toEqual([]);
  });

  it('counts what the form is no longer carrying its defaults for', async () => {
    const { component } = await createComponent(null);

    // The harness starts the form with a prompt, a model, a size and steps.
    expect(component.ledgerCount()).toBe(5);
  });

  it('lists a setting under the card it lives in', async () => {
    const { component, fixture, form } = await createComponent(null);
    form.controls.tiling.setValue(true);
    fixture.detectChanges();

    const sampling = component
      .ledgerSections()
      .find((section) => section.section === 'sampling');
    expect(sampling?.rows.map((row) => row.field)).toContain('tiling');

    const compose = component
      .ledgerSections()
      .find((section) => section.section === 'compose');
    expect(compose?.rows.map((row) => row.field)).toContain('prompt');
  });

  it('puts one setting back without touching the rest', async () => {
    const { component, fixture, form } = await createComponent(null);

    component.resetField('steps');
    fixture.detectChanges();

    expect(form.controls.steps.value).toBe(DEFAULT_GENERATE_FORM_VALUE.steps);
    expect(form.controls.prompt.value).toBe('a fox');
    expect(component.ledgerCount()).toBe(4);
  });

  it('restores a list setting as its own copy of the default', async () => {
    const { component, fixture, form } = await createComponent(null);
    form.controls.post_processing.setValue(['GFPGAN']);
    fixture.detectChanges();

    component.resetField('post_processing');
    fixture.detectChanges();

    expect(form.controls.post_processing.value).toEqual([]);
    expect(form.controls.post_processing.value).not.toBe(
      DEFAULT_GENERATE_FORM_VALUE.post_processing,
    );
  });
});

describe('GenerateFormComponent pinned model', () => {
  it('shows the model the style pins rather than the pick it replaces', async () => {
    const { form } = await createComponent(FORCED);

    expect(form.controls.model.value).toBe(FORCED.model);
    expect(form.controls.model.disabled).toBe(true);
  });

  it('hands the reader their own model back when the style stops pinning one', async () => {
    const { fixture, form } = await createComponent(FORCED);
    expect(form.controls.model.value).toBe(FORCED.model);

    fixture.componentRef.setInput('forcedParams', null);
    fixture.detectChanges();

    expect(form.controls.model.value).toBe('my model');
    expect(form.controls.model.disabled).toBe(false);
  });

  it('keeps the reader own model through a reload while a style pins one', async () => {
    const { form } = await createComponent(FORCED);
    expect(form.controls.model.value).toBe(FORCED.model);

    // What the studio would have written to storage and read back afterwards.
    const persisted = coerceFormValue(
      JSON.parse(JSON.stringify(form.getRawValue())),
    );
    expect(persisted.valuesBeforeStyle?.model).toBe('my model');

    const reloaded = TestBed.createComponent(GenerateFormComponent);
    const reloadedForm = createGenerateForm(persisted);
    reloaded.componentRef.setInput('form', reloadedForm);
    reloaded.componentRef.setInput('forcedParams', FORCED);
    reloaded.detectChanges();
    expect(reloadedForm.controls.model.value).toBe(FORCED.model);

    reloaded.componentRef.setInput('forcedParams', null);
    reloadedForm.controls.styleName.setValue('');
    reloaded.detectChanges();

    expect(reloadedForm.controls.model.value).toBe('my model');
    expect(reloadedForm.controls.valuesBeforeStyle.value).toBeNull();
  });

  it('hands the reader their pick back once they take the model back', async () => {
    const { fixture, component, form } = await createComponent(FORCED);

    component.detachSection('model');
    fixture.detectChanges();

    expect(form.controls.model.disabled).toBe(false);
    expect(form.controls.model.value).toBe('my model');
  });
});

/** A second style, pinning a sampling section the first one shares. */
const OTHER_FORCED: StyleForcedParams = {
  steps: 40,
  cfg_scale: 12,
  karras: true,
};

describe('GenerateFormComponent pinned values', () => {
  /** Select `name` and hand the panel the parameters it forces. */
  function applyStyle(
    fixture: ComponentFixture<GenerateFormComponent>,
    form: GenerateFormGroup,
    forced: StyleForcedParams | null,
    name = 'Cinematic',
  ): void {
    form.controls.styleName.setValue(forced ? name : '');
    fixture.componentRef.setInput('forcedParams', forced);
    fixture.detectChanges();
  }

  /**
   * Put the panel in the state a reader would be in before picking a style. The
   * size is set off the square the panel snaps a pristine one to, so the
   * baseline sync leaves it alone and the values under test are only the ones a
   * style moves.
   */
  function readerValues(
    fixture: ComponentFixture<GenerateFormComponent>,
    form: GenerateFormGroup,
  ): void {
    form.controls.width.setValue(768);
    form.controls.height.setValue(512);
    fixture.detectChanges();
  }

  it('shows every value the style pins in the control that holds it', async () => {
    const { fixture, form } = await createComponent(null);
    readerValues(fixture, form);
    expect(form.controls.scheduler.value).toBe('karras');

    applyStyle(fixture, form, FORCED);

    expect(form.controls.model.value).toBe(FORCED.model);
    expect(form.controls.width.value).toBe(FORCED.width);
    expect(form.controls.height.value).toBe(FORCED.height);
    expect(form.controls.steps.value).toBe(FORCED.steps);
    expect(form.controls.cfg_scale.value).toBe(FORCED.cfg_scale);
    expect(form.controls.sampler_name.value).toBe(FORCED.sampler_name);
    expect(form.controls.clip_skip.value).toBe(FORCED.clip_skip);
    expect(form.controls.hires_fix.value).toBe(true);
    // The style names its schedule as the legacy flag, and a control still
    // reading 'karras' under a style forcing none names a schedule the request
    // will not carry.
    expect(form.controls.scheduler.value).toBe('normal');
  });

  it('hands the reader every value back when the style is cleared', async () => {
    const { fixture, form } = await createComponent(null);
    readerValues(fixture, form);
    applyStyle(fixture, form, FORCED);

    applyStyle(fixture, form, null);

    expect(form.controls.model.value).toBe('my model');
    expect(form.controls.width.value).toBe(768);
    expect(form.controls.height.value).toBe(512);
    expect(form.controls.steps.value).toBe(30);
    expect(form.controls.cfg_scale.value).toBe(
      DEFAULT_GENERATE_FORM_VALUE.cfg_scale,
    );
    expect(form.controls.sampler_name.value).toBe(
      DEFAULT_GENERATE_FORM_VALUE.sampler_name,
    );
    expect(form.controls.scheduler.value).toBe('karras');
    expect(form.controls.hires_fix.value).toBe(false);
    expect(form.controls.valuesBeforeStyle.value).toBeNull();
  });

  it('restores the reader values through a switch from one style to another', async () => {
    const { fixture, form } = await createComponent(null);
    readerValues(fixture, form);
    applyStyle(fixture, form, FORCED);

    applyStyle(fixture, form, OTHER_FORCED, 'Other style');

    // The second style pins its own sampling values, and the fields it leaves
    // alone come back to the reader rather than keeping the first style's.
    expect(form.controls.steps.value).toBe(OTHER_FORCED.steps);
    expect(form.controls.cfg_scale.value).toBe(OTHER_FORCED.cfg_scale);
    expect(form.controls.scheduler.value).toBe('karras');
    expect(form.controls.model.value).toBe('my model');
    expect(form.controls.width.value).toBe(768);

    applyStyle(fixture, form, null);

    expect(form.controls.steps.value).toBe(30);
    expect(form.controls.cfg_scale.value).toBe(
      DEFAULT_GENERATE_FORM_VALUE.cfg_scale,
    );
    expect(form.controls.valuesBeforeStyle.value).toBeNull();
  });

  it('hands back only the section the reader takes their values on', async () => {
    const { fixture, form, component } = await createComponent(null);
    readerValues(fixture, form);
    applyStyle(fixture, form, FORCED);

    component.detachSection('sampling');
    fixture.detectChanges();

    expect(form.controls.steps.value).toBe(30);
    expect(form.controls.cfg_scale.value).toBe(
      DEFAULT_GENERATE_FORM_VALUE.cfg_scale,
    );
    expect(form.controls.scheduler.value).toBe('karras');
    // Every other section is still the style's.
    expect(form.controls.model.value).toBe(FORCED.model);
    expect(form.controls.width.value).toBe(FORCED.width);
    expect(submitted(form, FORCED).params?.steps).toBe(30);
  });

  it('builds the request it built before the style once it is cleared', async () => {
    const { fixture, form } = await createComponent(null);
    readerValues(fixture, form);
    const before = submitted(form, null);

    applyStyle(fixture, form, FORCED);
    expect(submitted(form, FORCED).params?.steps).toBe(FORCED.steps);

    applyStyle(fixture, form, null);

    expect(submitted(form, null)).toEqual(before);
  });
});

describe('GenerateFormComponent sampling locks', () => {
  it('freezes only the knobs a partial style names', async () => {
    const { component, form } = await createComponent({ steps: 12 });

    expect(component.isFieldLocked('steps')).toBe(true);
    for (const field of [
      'cfg_scale',
      'sampler_name',
      'clip_skip',
      'scheduler',
      'hires_fix',
    ] as const) {
      expect(component.isFieldLocked(field)).toBe(false);
      expect(form.controls[field].disabled).toBe(false);
    }
  });

  it('leaves the schedule free when a style pins only the sampler', async () => {
    const { component, form } = await createComponent({
      sampler_name: 'k_euler',
    });

    expect(component.isFieldLocked('scheduler')).toBe(false);
    expect(form.controls.scheduler.disabled).toBe(false);
  });

  it('freezes the schedule when a style names karras', async () => {
    const { component, form } = await createComponent({ karras: true });

    expect(component.isFieldLocked('scheduler')).toBe(true);
    expect(form.controls.scheduler.disabled).toBe(true);
  });
});

/** The fragments a summary line is made of. Translation is not loaded here, so
 *  each fragment comes back as the key that words it. */
function summaryParts(summary: string): string[] {
  return summary.split(' · ');
}

describe('GenerateFormComponent sampling summary', () => {
  it('says nothing about a clip skip or a schedule left as it started', async () => {
    const { component } = await createComponent(null);

    const parts = summaryParts(component.samplingSummary());
    expect(parts).not.toContain('generate.groups.sampling_clip');
    expect(parts).not.toContain('generate.groups.sampling_schedule');
    expect(parts).not.toContain('generate.groups.sampling_knob');
  });

  it('names the clip skip, the schedule and every solver knob carrying a value', async () => {
    const { fixture, component, form } = await createComponent(null);

    form.patchValue({
      clip_skip: 2,
      scheduler: 'normal',
      sampler_eta: 0.5,
      sampler_s_noise: 1.2,
    });
    fixture.detectChanges();

    const parts = summaryParts(component.samplingSummary());
    expect(parts).toContain('generate.groups.sampling_clip');
    expect(parts).toContain('generate.groups.sampling_schedule');
    // The eta and the noise scale, one fragment each.
    expect(
      parts.filter((part) => part === 'generate.groups.sampling_knob'),
    ).toHaveLength(2);
  });

  it('words the clip skip, the schedule and a knob by their own labels', () => {
    expect(en['generate.groups.sampling_clip']).toBe('CLIP skip {{ value }}');
    expect(en['generate.groups.sampling_schedule']).toBe(
      'Schedule {{ value }}',
    );
    expect(en['generate.groups.sampling_knob']).toBe('{{ label }} {{ value }}');
  });
});

describe('GenerateFormComponent censor switch', () => {
  it('reports the censor while adult content is blocked', async () => {
    const { fixture, component, form } = await createComponent(null);

    fixture.detectChanges();
    expect(summaryParts(component.outputSummary())).toContain(
      'generate.groups.output_censor_on',
    );

    form.controls.censor_nsfw.setValue(false);
    fixture.detectChanges();
    expect(summaryParts(component.outputSummary())).toContain(
      'generate.groups.output_censor_off',
    );
  });

  it('says nothing about the censor while adult content is allowed', async () => {
    const { fixture, component, form } = await createComponent(null);

    form.controls.nsfw.setValue(true);
    fixture.detectChanges();

    const parts = summaryParts(component.outputSummary());
    expect(parts).not.toContain('generate.groups.output_censor_on');
    expect(parts).not.toContain('generate.groups.output_censor_off');
  });

  it('freezes the switch while adult content is allowed, keeping what it holds', async () => {
    const { fixture, component, form } = await createComponent(null);

    form.controls.nsfw.setValue(true);
    fixture.detectChanges();

    expect(component.censorInert()).toBe(true);
    expect(form.controls.censor_nsfw.disabled).toBe(true);
    expect(form.getRawValue().censor_nsfw).toBe(true);

    form.controls.nsfw.setValue(false);
    fixture.detectChanges();

    expect(form.controls.censor_nsfw.disabled).toBe(false);
    expect(form.getRawValue().censor_nsfw).toBe(true);
  });
});

describe('GenerateFormComponent worker picker keyboard', () => {
  // Which groups are folded is remembered, so each render starts from nothing.
  beforeEach(() => localStorage.clear());

  const worker = (id: string, name: string): HordeWorker =>
    ({
      type: 'image',
      id,
      name,
      online: true,
      maintenance_mode: false,
      nsfw: false,
      models: ['a model'],
      max_pixels: 1024 * 1024,
      img2img: true,
      requests_fulfilled: 0,
      kudos_rewards: 0,
      performance: '',
      threads: 1,
      uptime: 0,
      paused: false,
      trusted: true,
      flagged: false,
      suspicious: 0,
      uncompleted_jobs: 0,
      bridge_agent: '',
    }) as HordeWorker;

  async function renderPicker(): Promise<{
    host: HTMLElement;
    fixture: ComponentFixture<GenerateFormComponent>;
    options: HTMLButtonElement[];
  }> {
    await TestBed.configureTestingModule({
      imports: [
        GenerateFormComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    fixture.componentRef.setInput(
      'form',
      createGenerateForm({ ...DEFAULT_GENERATE_FORM_VALUE, prompt: 'a fox' }),
    );
    fixture.componentRef.setInput('forcedParams', null);
    fixture.componentRef.setInput('activeWorkers', [
      worker('id-one', 'Alpha'),
      worker('id-two', 'Beta'),
      worker('id-three', 'Gamma'),
    ]);
    fixture.detectChanges();

    if (!fixture.componentInstance.isGroupOpen('horde')) {
      fixture.componentInstance.toggleGroup('horde');
    }
    fixture.detectChanges();
    fixture.componentInstance.toggleWorkerPick();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const options = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.gs-worker-opt'),
    );
    expect(options.length).toBe(3);
    return { host, fixture, options };
  }

  const press = (element: HTMLElement, key: string): void => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  };

  it('moves focus to the next row on ArrowDown', async () => {
    const { fixture, options } = await renderPicker();
    options[0].focus();

    press(options[0], 'ArrowDown');
    fixture.detectChanges();

    expect(document.activeElement).toBe(options[1]);
    expect(options[1].tabIndex).toBe(0);
    expect(options[0].tabIndex).toBe(-1);
  });

  it('wraps at both ends and jumps with Home and End', async () => {
    const { fixture, options } = await renderPicker();
    options[0].focus();

    press(options[0], 'ArrowUp');
    fixture.detectChanges();
    expect(document.activeElement).toBe(options[2]);

    press(options[2], 'ArrowDown');
    fixture.detectChanges();
    expect(document.activeElement).toBe(options[0]);

    press(options[0], 'End');
    fixture.detectChanges();
    expect(document.activeElement).toBe(options[2]);

    press(options[2], 'Home');
    fixture.detectChanges();
    expect(document.activeElement).toBe(options[0]);
  });

  it('leaves one tab stop on the list and names its rows as options', async () => {
    const { host, options } = await renderPicker();

    expect(host.querySelector('.gs-worker-pop')?.getAttribute('role')).toBe(
      'listbox',
    );
    expect(
      options.every((option) => option.getAttribute('role') === 'option'),
    ).toBe(true);
    expect(options.filter((option) => option.tabIndex === 0).length).toBe(1);
  });
});

/**
 * The source card is projected into the panel and keeps its own fold, so the
 * panel's one press has to reach it rather than the group store.
 */
describe('GenerateFormComponent folding the source card', () => {
  @Component({
    imports: [GenerateFormComponent, GenerateSourceImageComponent],
    template: `<app-generate-form [form]="form">
      <app-generate-source-image generateSourceImage [form]="form" />
    </app-generate-form>`,
  })
  class HostComponent {
    public readonly form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
    });
    public readonly panel = viewChild.required(GenerateFormComponent);
    public readonly card = viewChild.required(GenerateSourceImageComponent);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  async function render(): Promise<{
    host: HostComponent;
    fixture: ComponentFixture<HostComponent>;
  }> {
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    })
      .overrideComponent(GenerateSourceImageComponent, {
        set: { template: '' },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { host: fixture.componentInstance, fixture };
  }

  it('folds the card away with the groups, once it has a picture', async () => {
    const { host, fixture } = await render();
    const card = host.card();
    card.sourceImage.set({
      blob: new Blob([new Uint8Array([1])], { type: 'image/webp' }),
      width: 640,
      height: 480,
    });
    card.setMode('img2img');
    fixture.detectChanges();

    // An open card is something to fold, so the panel offers the press even
    // with every group already folded.
    host.panel().foldAllGroups();
    fixture.detectChanges();
    expect(card.open()).toBe(false);
    expect(host.panel().anyGroupOpen()).toBe(false);
  });

  it('folds the source card before a picture is attached', async () => {
    const { host, fixture } = await render();
    expect(host.card().canFold()).toBe(true);
    expect(host.panel().anyGroupOpen()).toBe(true);

    host.panel().foldAllGroups();
    fixture.detectChanges();

    expect(host.card().open()).toBe(false);
    expect(host.panel().anyGroupOpen()).toBe(false);
  });
});
