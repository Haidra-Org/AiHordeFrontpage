import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GenerateSourceImageComponent,
  GenerateSourceState,
} from './generate-source-image.component';
import {
  DEFAULT_GENERATE_FORM_VALUE,
  GenerateFormGroup,
  createGenerateForm,
} from '../generate-form.model';
import { SourceImage } from '../../../helper/source-image';

async function createComponent(): Promise<{
  fixture: ComponentFixture<GenerateSourceImageComponent>;
  component: GenerateSourceImageComponent;
  form: GenerateFormGroup;
  states: GenerateSourceState[];
}> {
  await TestBed.configureTestingModule({
    imports: [GenerateSourceImageComponent],
    providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
  })
    .overrideComponent(GenerateSourceImageComponent, { set: { template: '' } })
    .compileComponents();

  const fixture = TestBed.createComponent(GenerateSourceImageComponent);
  const form = createGenerateForm({ ...DEFAULT_GENERATE_FORM_VALUE });
  fixture.componentRef.setInput('form', form);

  const component = fixture.componentInstance;
  const states: GenerateSourceState[] = [];
  component.stateChange.subscribe((s) => states.push(s));

  fixture.detectChanges();
  return { fixture, component, form, states };
}

const fakeImage = (): SourceImage => ({
  blob: new Blob([new Uint8Array([1])], { type: 'image/webp' }),
  width: 640,
  height: 480,
});

describe('GenerateSourceImageComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts valid in txt2img mode with no source blob', async () => {
    const { states } = await createComponent();
    const last = states.at(-1)!;
    expect(last.mode).toBe('none');
    expect(last.valid).toBe(true);
    expect(last.sourceBlob).toBeNull();
  });

  it('is invalid for img2img until an image is attached', async () => {
    const { component, states } = await createComponent();

    component.setMode('img2img');
    expect(states.at(-1)!.valid).toBe(false);
    expect(component.validationMessage()).toBe(
      'generate.source.error_no_image',
    );

    // Attach the image while in none, then enter img2img (which keeps it).
    component.setMode('none');
    component.sourceImage.set(fakeImage());
    component.setMode('img2img');

    const last = states.at(-1)!;
    expect(last.mode).toBe('img2img');
    expect(last.valid).toBe(true);
    expect(last.sourceBlob).not.toBeNull();
  });

  it('requires a control type for controlnet', async () => {
    const { component, form, states } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.setMode('controlnet');

    expect(states.at(-1)!.valid).toBe(false);
    expect(component.validationMessage()).toBe(
      'generate.source.error_no_control_type',
    );

    form.controls.control_type.setValue('canny');
    expect(states.at(-1)!.valid).toBe(true);
  });

  it('flips the local valid/validationMessage computeds when control_type changes', async () => {
    const { component, form } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.setMode('controlnet');

    // Local bindings reflect the missing control type before any other change.
    expect(component.valid()).toBe(false);
    expect(component.validationMessage()).toBe(
      'generate.source.error_no_control_type',
    );

    // Selecting a control type is the ONLY thing that changes; the local
    // computeds must re-evaluate off the mirrored signal, not stay stale.
    form.controls.control_type.setValue('canny');

    expect(component.valid()).toBe(true);
    expect(component.validationMessage()).toBeNull();
  });

  it('requires a painted mask for inpainting', async () => {
    const { component, states } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.setMode('inpainting');

    const last = states.at(-1)!;
    expect(last.valid).toBe(false);
    expect(component.validationMessage()).toBe('generate.source.error_no_mask');
  });

  it('clears the image and resets to valid when switching back to none', async () => {
    const { component, states } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.setMode('img2img');

    component.setMode('none');

    const last = states.at(-1)!;
    expect(last.mode).toBe('none');
    expect(last.valid).toBe(true);
    expect(last.sourceBlob).toBeNull();
    expect(component.sourceImage()).toBeNull();
  });

  it('resets control fields when leaving controlnet', async () => {
    const { component, form } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.setMode('controlnet');
    form.controls.control_type.setValue('depth');
    form.controls.image_is_control.setValue(true);

    component.setMode('img2img');

    expect(form.controls.control_type.value).toBe('');
    expect(form.controls.image_is_control.value).toBe(false);
  });
  it('offers remix while support is unknown and blocks it when unsupported', async () => {
    const { fixture, component, form } = await createComponent();

    // No answer from the parent yet: the mode must stay reachable.
    expect(component.remixAllowed()).toBe(true);
    component.setMode('remix');
    expect(form.controls.sourceMode.value).toBe('remix');

    component.setMode('none');
    fixture.componentRef.setInput('remixSupported', false);
    component.setMode('remix');
    expect(component.remixAllowed()).toBe(false);
    expect(form.controls.sourceMode.value).toBe('none');
  });

  it('is invalid for remix until a primary image is attached', async () => {
    const { component, states } = await createComponent();
    component.setMode('remix');

    expect(states.at(-1)!.valid).toBe(false);
    expect(component.validationMessage()).toBe(
      'generate.source.error_no_image',
    );

    component.setMode('none');
    component.sourceImage.set(fakeImage());
    component.setMode('remix');

    const last = states.at(-1)!;
    expect(last.valid).toBe(true);
    expect(last.extras).toEqual([]);
  });

  it('invalidates an active remix when the model stops supporting it', async () => {
    const { fixture, component, states } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.setMode('remix');
    expect(states.at(-1)!.valid).toBe(true);

    fixture.componentRef.setInput('remixSupported', false);
    fixture.detectChanges();

    const last = states.at(-1)!;
    expect(last.mode).toBe('remix');
    expect(last.valid).toBe(false);
    expect(component.validationMessage()).toBe(
      'generate.source.remix_unsupported',
    );

    fixture.componentRef.setInput('remixSupported', true);
    fixture.detectChanges();
    expect(states.at(-1)!.valid).toBe(true);
  });

  it('emits extras with their strengths and drops them on removal', async () => {
    const { component, states } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.setMode('remix');

    const first = fakeImage();
    const second = fakeImage();
    component.extras.set([
      { image: first, strength: 1, previewUrl: 'blob:one' },
      { image: second, strength: 1, previewUrl: 'blob:two' },
    ]);

    component.setExtraStrength(1, 0.4);
    expect(states.at(-1)!.extras).toEqual([
      { blob: first.blob, strength: 1 },
      { blob: second.blob, strength: 0.4 },
    ]);
    expect(component.canAddExtra()).toBe(true);

    component.removeExtra(0);
    expect(states.at(-1)!.extras).toEqual([
      { blob: second.blob, strength: 0.4 },
    ]);
  });

  it('clamps an out-of-range strength to the slider bounds', async () => {
    const { component, states } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.setMode('remix');
    component.extras.set([
      { image: fakeImage(), strength: 1, previewUrl: 'blob:one' },
    ]);

    component.setExtraStrength(0, 12);
    expect(states.at(-1)!.extras![0].strength).toBe(component.maxExtraStrength);
    component.setExtraStrength(0, -3);
    expect(states.at(-1)!.extras![0].strength).toBe(component.minExtraStrength);
  });

  it('discards the extras when leaving remix', async () => {
    const { component, states } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.setMode('remix');
    component.extras.set([
      { image: fakeImage(), strength: 1, previewUrl: 'blob:one' },
    ]);

    component.setMode('img2img');

    expect(component.extras()).toEqual([]);
    expect(states.at(-1)!.extras).toEqual([]);
  });

  it('routes a file handed over by the page through the shared encode path', async () => {
    const { component, states } = await createComponent();
    const before = states.length;

    await component.applyFile(
      new File(['x'], 'shot.png', { type: 'image/png' }),
    );

    // jsdom cannot decode an image, so the shared failure path is what is
    // observable here: the point is that applyFile goes through it at all.
    expect(component.error()).toBe('generate.source.encode_failed');
    expect(component.encoding()).toBe(false);
    expect(states.length).toBe(before);
  });
});
