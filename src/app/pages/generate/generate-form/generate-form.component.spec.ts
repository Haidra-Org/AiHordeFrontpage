import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GenerateFormComponent } from './generate-form.component';
import {
  DEFAULT_GENERATE_FORM_VALUE,
  GenerateFormGroup,
  GenerateFormValue,
  MAX_STEPS,
  QR_MODULE_DRAWERS,
  SAMPLERS,
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
    form.controls.scheduler.setValue('normal');

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
        mode: 'advanced',
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
        solver_type_choices: [],
        accepted_settings: {
          sampler_s_churn: {
            minimum: 0,
            maximum: 100,
            default: 0,
            integer_only: false,
          },
        },
      },
      dpmpp_2m_sde: {
        name: 'dpmpp_2m_sde',
        presentation_tier: 'advanced',
        solver_type_choices: ['midpoint', 'heun'],
        accepted_settings: {
          sampler_eta: {
            minimum: 0,
            maximum: 10,
            default: 1,
            integer_only: false,
          },
        },
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
      mode: 'advanced',
      prompt: 'a fox',
      sampler_name: 'k_euler',
      ...value,
    });
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('samplerContract', contract);
    fixture.componentRef.setInput('modelBaseline', baseline);
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
    await TestBed.configureTestingModule({ imports: [GenerateFormComponent] })
      .overrideComponent(GenerateFormComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(GenerateFormComponent);
    fixture.componentRef.setInput(
      'form',
      createGenerateForm({ ...DEFAULT_GENERATE_FORM_VALUE, mode: 'advanced' }),
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
      mode: 'advanced',
      prompt: 'a fox',
      ...value,
    });
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('samplerContract', contract);
    fixture.componentRef.setInput('modelBaseline', baseline);
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
      mode: 'advanced',
      prompt: 'a fox',
      ...value,
    });
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('samplerContract', contract);
    fixture.componentRef.setInput('modelBaseline', baseline);
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
