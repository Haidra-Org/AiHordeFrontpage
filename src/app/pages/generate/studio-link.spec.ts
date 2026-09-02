import { describe, expect, it } from 'vitest';
import { convertToParamMap, type ParamMap } from '@angular/router';
import { deflateSync, strToU8 } from 'fflate';
import {
  parseStudioLink,
  studioLinkFromText,
  studioLinkParams,
  studioPayloadFromImage,
} from './studio-link';
import { webpFile } from '../../testing/webp-fixture';
import { buildParametersText } from './image-metadata';
import {
  DEFAULT_GENERATE_FORM_VALUE,
  GenerateFormValue,
  buildImageRequest,
  requestToFormValue,
} from './generate-form.model';

function value(overrides: Partial<GenerateFormValue> = {}): GenerateFormValue {
  return { ...DEFAULT_GENERATE_FORM_VALUE, ...overrides };
}

function mapOf(params: Readonly<Record<string, string>>): ParamMap {
  return convertToParamMap({ ...params });
}

/** Encode an arbitrary body the way a link does, to test what refuses it. */
function pack(body: unknown): string {
  const bytes = deflateSync(strToU8(JSON.stringify(body)));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('studioLinkParams', () => {
  it('carries a whole request there and back', () => {
    const settings = value({
      prompt: 'a fox in the snow',
      negativePrompt: 'blurry',
      model: 'Deliberate',
      steps: 33,
      cfg_scale: 6.5,
      width: 768,
      height: 512,
      sampler_name: 'k_euler_a',
      clip_skip: 2,
      seed: '1234',
    });
    const request = buildImageRequest(settings);
    const parsed = parseStudioLink(
      mapOf({ ...studioLinkParams(request, null) }),
    );
    expect(parsed?.kind).toBe('full');
    expect(requestToFormValue(parsed!.request)).toEqual(
      requestToFormValue(request),
    );
  });

  it('carries a preset name beside the request', () => {
    const request = buildImageRequest(value({ prompt: 'a fox' }));
    const parsed = parseStudioLink(
      mapOf({ ...studioLinkParams(request, 'curated:Watercolour') }),
    );
    expect(parsed?.styleKey).toBe('curated:Watercolour');
  });

  it('carries a published style by its id beside the request', () => {
    const request = buildImageRequest(value({ prompt: 'a fox' }));
    const parsed = parseStudioLink(
      mapOf({ ...studioLinkParams(request, 'native:abc-123') }),
    );
    expect(parsed?.styleKey).toBe('native:abc-123');
  });

  it('stays short enough for an address bar', () => {
    const request = buildImageRequest(
      value({
        prompt: 'a fox in the snow, golden hour, sharp focus',
        negativePrompt: 'blurry, watermark',
        model: 'Deliberate',
        steps: 30,
        cfg_scale: 7,
        width: 1024,
        height: 1024,
      }),
    );
    expect(studioLinkParams(request, null).r.length).toBeLessThan(400);
  });
});

describe('parseStudioLink', () => {
  it('reads nothing from an empty query', () => {
    expect(parseStudioLink(mapOf({}))).toBeNull();
  });

  it('reads a model named openly', () => {
    const parsed = parseStudioLink(mapOf({ model: 'Deliberate' }));
    expect(parsed).toEqual({
      request: { prompt: '', models: ['Deliberate'] },
      styleKey: null,
      kind: 'simple',
    });
  });

  it('reads a preset named openly', () => {
    const parsed = parseStudioLink(mapOf({ style: 'Watercolour' }));
    expect(parsed?.kind).toBe('simple');
    expect(parsed?.styleKey).toBe('curated:Watercolour');
    expect(parsed?.request.models).toBeUndefined();
  });

  it('reads a published style named openly by its id', () => {
    const parsed = parseStudioLink(mapOf({ styleId: 'abc-123' }));
    expect(parsed?.kind).toBe('simple');
    expect(parsed?.styleKey).toBe('native:abc-123');
  });

  it('answers the id when an address names both an id and a preset', () => {
    const parsed = parseStudioLink(
      mapOf({ style: 'Watercolour', styleId: 'abc-123' }),
    );
    expect(parsed?.styleKey).toBe('native:abc-123');
  });

  it('lets an open name win over the packed request', () => {
    const packed = studioLinkParams(
      buildImageRequest(value({ prompt: 'a fox', model: 'Deliberate' })),
      'curated:Packed',
    );
    const parsed = parseStudioLink(
      mapOf({ ...packed, model: 'Anything', style: 'Open' }),
    );
    expect(parsed?.kind).toBe('full');
    expect(parsed?.request.models).toEqual(['Anything']);
    expect(parsed?.styleKey).toBe('curated:Open');
    expect(parsed?.request.prompt).toBe('a fox');
  });

  it('refuses a body with no version', () => {
    expect(
      parseStudioLink(mapOf({ r: pack({ request: { prompt: 'a fox' } }) })),
    ).toBeNull();
  });

  it('refuses a version it does not know', () => {
    expect(
      parseStudioLink(
        mapOf({ r: pack({ v: 2, request: { prompt: 'a fox' } }) }),
      ),
    ).toBeNull();
  });

  it('refuses a request that is not an object', () => {
    expect(
      parseStudioLink(mapOf({ r: pack({ v: 1, request: 'a fox' }) })),
    ).toBeNull();
    expect(
      parseStudioLink(mapOf({ r: pack({ v: 1, request: ['a fox'] }) })),
    ).toBeNull();
  });

  it('refuses a parameter longer than an address bar should carry', () => {
    expect(parseStudioLink(mapOf({ r: 'A'.repeat(4097) }))).toBeNull();
  });

  it('refuses text that is not a packed body', () => {
    expect(parseStudioLink(mapOf({ r: 'not-base64-deflate' }))).toBeNull();
    expect(parseStudioLink(mapOf({ r: 'has spaces and %%' }))).toBeNull();
  });

  it('falls back to the open names when the packed one is broken', () => {
    const parsed = parseStudioLink(
      mapOf({ r: 'not-a-body', model: 'Deliberate' }),
    );
    expect(parsed?.kind).toBe('simple');
    expect(parsed?.request.models).toEqual(['Deliberate']);
  });

  it('gives the form decoder a prompt it can read', () => {
    const parsed = parseStudioLink(
      mapOf({ r: pack({ v: 1, request: { prompt: 42, params: 'no' } }) }),
    );
    expect(parsed?.request.prompt).toBe('');
    expect(requestToFormValue(parsed!.request).prompt).toBe('');
  });
});

describe('studioLinkFromText', () => {
  it('reads a request body written as JSON', () => {
    const parsed = studioLinkFromText(
      '{"prompt":"a fox","models":["Deliberate"],"params":{"steps":25}}',
    );
    expect(parsed?.kind).toBe('full');
    expect(requestToFormValue(parsed!.request).steps).toBe(25);
    expect(parsed?.styleKey).toBeNull();
  });

  it('reads a studio address copied out of the address bar', () => {
    const packed = studioLinkParams(
      buildImageRequest(value({ prompt: 'a fox', model: 'Deliberate' })),
      'curated:Watercolour',
    );
    const parsed = studioLinkFromText(
      `https://aihorde.net/generate/image?r=${packed.r}`,
    );
    expect(parsed?.kind).toBe('full');
    expect(parsed?.request.prompt).toBe('a fox');
    expect(parsed?.styleKey).toBe('curated:Watercolour');
  });

  it('reads an address that only names a model', () => {
    const parsed = studioLinkFromText('/generate/image?model=Deliberate');
    expect(parsed?.kind).toBe('simple');
    expect(parsed?.request.models).toEqual(['Deliberate']);
  });

  it('reads nothing from text that is neither', () => {
    expect(studioLinkFromText('')).toBeNull();
    expect(studioLinkFromText('a fox in the snow')).toBeNull();
    expect(studioLinkFromText('{not json')).toBeNull();
    expect(studioLinkFromText('[1,2,3]')).toBeNull();
    expect(studioLinkFromText('https://aihorde.net/generate/image')).toBeNull();
  });
});

describe('studioPayloadFromImage', () => {
  it('takes the settings back off an image the studio wrote', async () => {
    const request = buildImageRequest(
      value({ prompt: 'a fox in the snow', model: 'Deliberate', steps: 25 }),
    );
    const payload = await studioPayloadFromImage(
      webpFile(buildParametersText(request, undefined)),
    );

    expect(payload?.kind).toBe('full');
    expect(payload?.styleKey).toBeNull();
    expect(payload?.request.prompt).toBe('a fox in the snow');
    expect(payload?.request.models).toEqual(['Deliberate']);
    expect(payload?.request.params?.steps).toBe(25);
  });

  it('finds nothing in an image that carries no settings', async () => {
    expect(await studioPayloadFromImage(webpFile(null))).toBeNull();
  });

  it('finds nothing in a file that is not an image at all', async () => {
    const file = new File(['not a picture'], 'notes.txt', {
      type: 'text/plain',
    });
    expect(await studioPayloadFromImage(file)).toBeNull();
  });
});
