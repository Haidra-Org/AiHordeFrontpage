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
  it('drops the control strength with the control type it was set beside', async () => {
    const { component, form } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.setMode('controlnet');
    form.controls.control_type.setValue('canny');
    expect(component.controlStrength()).toBeNull();

    component.setControlStrength(1.35);
    expect(form.controls.control_strength.value).toBe(1.35);
    expect(component.controlStrength()).toBe(1.35);

    component.setMode('img2img');
    expect(form.controls.control_strength.value).toBeNull();
  });

  it('keeps the control strength the QR workflow can still send', async () => {
    const { component, form } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.setMode('controlnet');
    form.controls.control_type.setValue('canny');
    component.setControlStrength(1.4);
    form.controls.qrText.setValue('https://aihorde.net');

    component.setMode('img2img');

    expect(form.controls.control_type.value).toBe('');
    expect(form.controls.control_strength.value).toBe(1.4);
  });

  it('holds the control strength inside the range the horde takes', async () => {
    const { component, form } = await createComponent();
    component.setControlStrength(9);
    expect(form.controls.control_strength.value).toBe(3);
    component.setControlStrength(0);
    expect(form.controls.control_strength.value).toBe(0.01);
    component.clearControlStrength();
    expect(form.controls.control_strength.value).toBeNull();
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

  it('opens draw-blank editor with colour as the initial ink', async () => {
    const { component, form } = await createComponent();
    form.controls.width.setValue(768);
    form.controls.height.setValue(512);

    component.openBlankEditor();

    expect(component.editorDoc()).toMatchObject({
      image: null,
      mask: null,
      width: 768,
      height: 512,
      offset: null,
      initialInk: 'color',
    });
  });

  it('opens regular image editor without forcing a startup ink', async () => {
    const { component } = await createComponent();
    const image = fakeImage();
    component.sourceImage.set(image);

    component.openEditor();

    expect(component.editorDoc()).toMatchObject({
      image,
      width: image.width,
      height: image.height,
    });
    expect(component.editorDoc()?.initialInk).toBeUndefined();
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

  it('tracks and clears the mask overlay URL when a drawn mask is applied', async () => {
    const { component } = await createComponent();
    const source = fakeImage();
    const mask = new Blob(['m'], { type: 'image/png' });
    const createSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mask-applied');
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);

    component.sourceImage.set(source);
    component.onEditorApplied({ image: source, mask, offset: null });

    expect(createSpy).toHaveBeenCalledWith(mask);
    expect(component.maskPreviewUrl()).toBe('blob:mask-applied');

    component.clearMask();

    expect(revokeSpy).toHaveBeenCalledWith('blob:mask-applied');
    expect(component.maskPreviewUrl()).toBeNull();
  });
});

describe('what the card offers', () => {
  it('offers every way of starting from a picture', async () => {
    // The card is one of the always-open ones and holds no detail level of its
    // own: every mode it can send is a mode the reader can pick.
    const { component } = await createComponent();

    expect([...component.modes]).toEqual([
      'none',
      'img2img',
      'controlnet',
      'inpainting',
      'remix',
    ]);
  });

  it('emits the masked choices as soon as they are made', async () => {
    // The queue and the request lint both read the emitted state, so a mask
    // asked for has to reach it without anything else being opened first.
    const { component, form, states } = await createComponent();
    const mask = new Blob([new Uint8Array([2])], { type: 'image/png' });

    component.sourceImage.set(fakeImage());
    component.maskPainted.set(true);
    component.maskBlob.set(mask);
    form.controls.sourceMode.setValue('img2img');
    form.controls.maskEnabled.setValue(true);

    expect(states.at(-1)!.maskBlob).toBe(mask);
  });
});

describe('the masked choices inside a mode', () => {
  it('carries a mask on image-to-image once masking is asked for', async () => {
    // The queue attaches whatever mask the emitted state names, so this is the
    // wire the whole feature hangs on: without it the request submits as plain
    // image-to-image and the whole picture is redrawn.
    const { component, form, states } = await createComponent();
    component.sourceImage.set(fakeImage());
    component.maskPainted.set(true);
    component.maskBlob.set(new Blob(['m'], { type: 'image/png' }));

    form.controls.sourceMode.setValue('img2img');
    expect(states.at(-1)!.maskBlob).toBeNull();
    expect(component.brushActive()).toBe(false);

    form.controls.maskEnabled.setValue(true);
    expect(component.brushActive()).toBe(true);
    expect(states.at(-1)!.maskBlob).not.toBeNull();
  });

  it('throws the strokes away when masking is switched back off', async () => {
    const { component, form, states } = await createComponent();
    component.sourceImage.set(fakeImage());
    form.controls.sourceMode.setValue('img2img');
    form.controls.maskEnabled.setValue(true);
    component.maskPainted.set(true);
    component.maskBlob.set(new Blob(['m'], { type: 'image/png' }));

    form.controls.maskEnabled.setValue(false);
    expect(component.maskPainted()).toBe(false);
    expect(states.at(-1)!.maskBlob).toBeNull();
  });

  it('stands the choices down when the mode they belong to is left', async () => {
    const { form } = await createComponent();
    form.controls.sourceMode.setValue('img2img');
    form.controls.maskEnabled.setValue(true);

    form.controls.sourceMode.setValue('inpainting');
    expect(form.controls.maskEnabled.value).toBe(false);

    form.controls.outpaintEnabled.setValue(true);
    form.controls.sourceMode.setValue('img2img');
    expect(form.controls.outpaintEnabled.value).toBe(false);
  });

  it('reports the attachment size rather than the canvas grown around it', async () => {
    // A caller asks how much the reader brought so it can say whether the size
    // being requested leaves anything to add; the composed canvas would always
    // match the request and the question could never be answered.
    const { component, form, states } = await createComponent();
    component.sourceImage.set(fakeImage());
    form.controls.sourceMode.setValue('inpainting');
    form.controls.outpaintEnabled.setValue(true);

    const last = states.at(-1)!;
    expect(last.sourceWidth).toBe(640);
    expect(last.sourceHeight).toBe(480);
  });

  it('needs room before a grown canvas counts as complete', async () => {
    const { component, form } = await createComponent();
    component.sourceImage.set(fakeImage());
    form.controls.sourceMode.setValue('inpainting');
    form.controls.outpaintEnabled.setValue(true);

    form.controls.width.setValue(640);
    form.controls.height.setValue(480);
    expect(component.outpaintHasRoom()).toBe(false);
    expect(component.valid()).toBe(false);

    form.controls.width.setValue(1024);
    expect(component.outpaintHasRoom()).toBe(true);
    expect(component.valid()).toBe(true);
  });
});
