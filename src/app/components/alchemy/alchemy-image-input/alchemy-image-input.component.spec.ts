import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlchemyImageInputComponent } from './alchemy-image-input.component';
import * as encoding from '../../../helper/image-encoding';

async function createComponent(platformId = 'browser'): Promise<{
  fixture: ComponentFixture<AlchemyImageInputComponent>;
  component: AlchemyImageInputComponent;
  emitted: (string | null)[];
}> {
  await TestBed.configureTestingModule({
    imports: [AlchemyImageInputComponent],
    providers: [{ provide: PLATFORM_ID, useValue: platformId }],
  })
    .overrideComponent(AlchemyImageInputComponent, {
      set: { template: '' },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(AlchemyImageInputComponent);
  const component = fixture.componentInstance;
  const emitted: (string | null)[] = [];
  component.sourceImage.subscribe((v) => emitted.push(v));
  return { fixture, component, emitted };
}

const makeFile = (type = 'image/png'): File =>
  new File([new Uint8Array([1])], 'pic', { type });

describe('AlchemyImageInputComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('URL mode', () => {
    it('emits a valid image URL and sets a preview', async () => {
      const { component, emitted } = await createComponent();

      component.onUrlInput('https://example.com/cat.png');

      expect(emitted.at(-1)).toBe('https://example.com/cat.png');
      expect(component.previewSrc()).toBe('https://example.com/cat.png');
      expect(component.error()).toBeNull();
    });

    it('emits null and an error for a non-URL value', async () => {
      const { component, emitted } = await createComponent();

      component.onUrlInput('not a url');

      expect(emitted.at(-1)).toBeNull();
      expect(component.error()).toBe('alchemy.image_input.invalid_url');
      expect(component.previewSrc()).toBeNull();
    });

    it('emits null when cleared', async () => {
      const { component, emitted } = await createComponent();

      component.onUrlInput('https://example.com/cat.png');
      component.onUrlInput('');

      expect(emitted.at(-1)).toBeNull();
      expect(component.previewSrc()).toBeNull();
    });
  });

  describe('upload mode', () => {
    it('encodes a file and emits the base64 payload', async () => {
      vi.spyOn(encoding, 'fileToResizedBase64').mockResolvedValue({
        base64: 'BASE64DATA',
        mimeType: 'image/webp',
        width: 512,
        height: 256,
      });
      const { component, emitted } = await createComponent();

      component.onFileSelected({
        target: { files: [makeFile()] },
      } as unknown as Event);
      await Promise.resolve();
      await Promise.resolve();

      expect(emitted.at(-1)).toBe('BASE64DATA');
      expect(component.encodedInfo()?.width).toBe(512);
      expect(component.previewSrc()).toBe('data:image/webp;base64,BASE64DATA');
      expect(component.encoding()).toBe(false);
    });

    it('rejects an oversized encoded image', async () => {
      const huge = 'A'.repeat(8 * 1024 * 1024);
      vi.spyOn(encoding, 'fileToResizedBase64').mockResolvedValue({
        base64: huge,
        mimeType: 'image/webp',
        width: 4000,
        height: 4000,
      });
      const { component, emitted } = await createComponent();

      component.onFileSelected({
        target: { files: [makeFile()] },
      } as unknown as Event);
      await Promise.resolve();
      await Promise.resolve();

      expect(component.error()).toBe('alchemy.image_input.too_large');
      // last emission is the null reset issued before encoding
      expect(emitted.at(-1)).toBeNull();
    });

    it('surfaces an encode failure as an error', async () => {
      vi.spyOn(encoding, 'fileToResizedBase64').mockRejectedValue(
        new encoding.ImageEncodingError('bad'),
      );
      const { component } = await createComponent();

      component.onFileSelected({
        target: { files: [makeFile()] },
      } as unknown as Event);
      await Promise.resolve();
      await Promise.resolve();

      expect(component.error()).toBe('alchemy.image_input.encode_failed');
      expect(component.encoding()).toBe(false);
    });

    it('does not encode during SSR (non-browser platform)', async () => {
      const spy = vi.spyOn(encoding, 'fileToResizedBase64');
      const { component } = await createComponent('server');

      component.onFileSelected({
        target: { files: [makeFile()] },
      } as unknown as Event);
      await Promise.resolve();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('setMode switches mode and resets state', async () => {
    const { component, emitted } = await createComponent();
    component.onUrlInput('https://example.com/cat.png');

    component.setMode('upload');

    expect(component.mode()).toBe('upload');
    expect(component.previewSrc()).toBeNull();
    expect(emitted.at(-1)).toBeNull();
  });
});
