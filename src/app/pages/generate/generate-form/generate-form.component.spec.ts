import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GenerateFormComponent } from './generate-form.component';
import {
  DEFAULT_GENERATE_FORM_VALUE,
  GenerateFormGroup,
  GenerateFormValue,
  MAX_STEPS,
  QR_MODULE_DRAWERS,
  STEPS_SLIDER_MAX,
  buildStyledImageRequest,
  createGenerateForm,
} from '../generate-form.model';
import {
  AppliedStyle,
  StyleForcedParams,
} from '../../../services/horde-styles.service';
import type { ModelRequirements } from '../../../services/model-reference.service';
import type { RequestWarning } from '../request-lint';
import { ToastService } from '../../../services/toast.service';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { provideRouter } from '@angular/router';
import en from '../../../../assets/i18n/en.json';

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
  await TestBed.configureTestingModule({
    imports: [GenerateFormComponent],
  })
    .overrideComponent(GenerateFormComponent, { set: { template: '' } })
    .compileComponents();

  const fixture = TestBed.createComponent(GenerateFormComponent);
  const form = createGenerateForm({
    ...DEFAULT_GENERATE_FORM_VALUE,
    mode: 'advanced',
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
      form.controls.karras,
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

  it('detaching a section re-enables it, prefilled with the style values', async () => {
    const { fixture, component, form } = await createComponent(FORCED);
    component.detachSection('dimensions');
    fixture.detectChanges();

    expect(component.isSectionDetached('dimensions')).toBe(true);
    expect(component.isSectionLocked('dimensions')).toBe(false);
    expect(form.controls.width.disabled).toBe(false);
    expect(form.controls.height.disabled).toBe(false);
    expect(form.controls.width.value).toBe(FORCED.width);
    expect(form.controls.height.value).toBe(FORCED.height);
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
    form.controls.karras.setValue(true);

    component.reattachSection('sampling');
    fixture.detectChanges();

    expect(component.isSectionDetached('sampling')).toBe(false);
    expect(component.isSectionLocked('sampling')).toBe(true);
    expect(form.controls.steps.value).toBe(FORCED.steps);
    expect(form.controls.karras.value).toBe(FORCED.karras);
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
    await TestBed.configureTestingModule({ imports: [GenerateFormComponent] })
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
    await TestBed.configureTestingModule({ imports: [GenerateFormComponent] })
      .overrideComponent(GenerateFormComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      mode: 'advanced',
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
    await TestBed.configureTestingModule({ imports: [GenerateFormComponent] })
      .overrideComponent(GenerateFormComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      mode: 'advanced',
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
    expect(component.stepsHint()?.violated).toBe(true);
    expect(component.cfgHint()?.violated).toBe(true);
    expect(component.samplerHint()?.violated).toBe(true);
    expect(component.clipSkipHint()?.violated).toBe(false);
    expect(component.karrasHint()?.violated).toBe(false);
    expect(component.isSuggestedSampler('k_euler')).toBe(true);
    expect(component.isSuggestedSampler('k_lms')).toBe(false);

    form.controls.steps.setValue(6);
    form.controls.cfg_scale.setValue(2);
    form.controls.sampler_name.setValue('k_euler');
    form.controls.karras.setValue(false);

    expect(component.stepsHint()?.violated).toBe(false);
    expect(component.cfgHint()?.violated).toBe(false);
    expect(component.samplerHint()?.violated).toBe(false);
    expect(component.karrasHint()?.violated).toBe(true);
  });

  it('shows no hints for a model that recommends nothing', async () => {
    const { component } = await createWithModel({}, 'flux_1', null);

    expect(component.stepsHint()).toBeNull();
    expect(component.cfgHint()).toBeNull();
    expect(component.clipSkipHint()).toBeNull();
    expect(component.samplerHint()).toBeNull();
    expect(component.karrasHint()).toBeNull();
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

    expect(component.nativeSizeHint()?.key).toBe(
      'generate.form.requirement.native_size',
    );
    expect(component.hiresHint()?.violated).toBe(true);

    form.controls.hires_fix.setValue(true);
    expect(component.hiresHint()).toBeNull();
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
      imports: [GenerateFormComponent],
    })
      .overrideComponent(GenerateFormComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(GenerateFormComponent);
    const form = createGenerateForm({
      ...DEFAULT_GENERATE_FORM_VALUE,
      mode: 'advanced',
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

  it('keeps the prompts, the detail level and the attached source mode', async () => {
    const { component, form } = await createDirty();

    component.resetSettings();

    const value = form.getRawValue();
    expect(value.prompt).toBe('a fox in the snow');
    expect(value.negativePrompt).toBe('blurry');
    expect(value.mode).toBe('advanced');
    expect(value.sourceMode).toBe('img2img');
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
      key: 'generate.lint.controlnet_baseline',
      params: {},
    },
    {
      id: 'qr_code_baseline',
      section: 'workflows',
      key: 'generate.form.qr_unsupported',
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
    ]);
    expect(component.warningsFor('sampling')).toEqual([]);
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
        mode: 'advanced',
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

  it('gives every card of the panel a heading, and names the card by it', async () => {
    const host = await render();
    const sections = Array.from(
      host.querySelectorAll<HTMLElement>('section[aria-labelledby]'),
    );

    expect(sections.length).toBeGreaterThanOrEqual(9);
    for (const section of sections) {
      const id = section.getAttribute('aria-labelledby')!;
      const heading = host.querySelector(`#${id}`);
      expect(heading, `no heading for ${id}`).not.toBeNull();
      expect(heading!.tagName).toBe('H2');
      expect(heading!.textContent?.trim()).toBeTruthy();
    }
  });

  it('names each card once, so two never claim the same heading', async () => {
    const host = await render();
    const ids = Array.from(
      host.querySelectorAll<HTMLElement>('section[aria-labelledby]'),
    ).map((section) => section.getAttribute('aria-labelledby'));

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers the QR layout controls, and only the shapes the workflow accepts', async () => {
    const host = await render();
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

  it('disables the QR layout controls with the payload box they belong to', async () => {
    const fixture = await renderFixture();
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
