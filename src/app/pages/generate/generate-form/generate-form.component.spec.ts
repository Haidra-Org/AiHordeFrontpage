import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GenerateFormComponent } from './generate-form.component';
import {
  DEFAULT_GENERATE_FORM_VALUE,
  GenerateFormGroup,
  buildStyledImageRequest,
  createGenerateForm,
} from '../generate-form.model';
import {
  AppliedStyle,
  StyleForcedParams,
} from '../../../services/horde-styles.service';

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
