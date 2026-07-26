import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  StylePreviewsService,
  coercePreviewMap,
  previewsSignature,
} from './style-previews.service';

const PREVIEWS_URL =
  'https://raw.githubusercontent.com/amiantos/AI-Horde-Styles-Previews/main/previews.json';
const HASHES_URL =
  'https://raw.githubusercontent.com/amiantos/AI-Horde-Styles-Previews/main/hashes.json';
const CACHE_KEY = 'aihorde.generate.style_previews';

const PREVIEWS_FIXTURE = {
  Cinematic: {
    person: 'https://img/cinematic-person.webp',
    place: 'https://img/cinematic-place.webp',
    thing: 'https://img/cinematic-thing.webp',
  },
  'Place Only': { place: 'https://img/place-only.webp' },
  Broken: { person: 42 },
  AlsoBroken: 'nope',
};

const HASHES_FIXTURE = { Cinematic: 'abc123' };

function setup(): {
  service: StylePreviewsService;
  http: HttpTestingController;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(StylePreviewsService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('previewsSignature', () => {
  it('is stable for equal payloads and differs for changed ones', () => {
    expect(previewsSignature(HASHES_FIXTURE)).toBe(
      previewsSignature({ Cinematic: 'abc123' }),
    );
    expect(previewsSignature(HASHES_FIXTURE)).not.toBe(
      previewsSignature({ Cinematic: 'def456' }),
    );
  });
});

describe('coercePreviewMap', () => {
  it('keeps URL members and drops malformed entries', () => {
    const map = coercePreviewMap(PREVIEWS_FIXTURE);
    expect(Object.keys(map)).toEqual(['Cinematic', 'Place Only']);
    expect(map['Place Only']).toEqual({
      person: null,
      place: 'https://img/place-only.webp',
      thing: null,
    });
  });

  it('tolerates a non-object payload', () => {
    expect(coercePreviewMap(null)).toEqual({});
    expect(coercePreviewMap('nope')).toEqual({});
  });
});

describe('StylePreviewsService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('fetches nothing until load() is called', () => {
    const { service, http } = setup();
    http.expectNone(HASHES_URL);
    expect(service.previews()).toBeNull();
  });

  it('loads previews and caches them under the digest signature', () => {
    const { service, http } = setup();
    service.load();

    http.expectOne(HASHES_URL).flush(HASHES_FIXTURE);
    http.expectOne(PREVIEWS_URL).flush(PREVIEWS_FIXTURE);

    expect(service.loading()).toBe(false);
    expect(service.previewUrl('Cinematic', 'place')).toBe(
      'https://img/cinematic-place.webp',
    );
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    expect(cached.signature).toBe(previewsSignature(HASHES_FIXTURE));
    expect(Object.keys(cached.previews)).toEqual(['Cinematic', 'Place Only']);
  });

  it('lists every subject a style has, without fallback substitution', () => {
    const { service, http } = setup();
    service.load();
    http.expectOne(HASHES_URL).flush(HASHES_FIXTURE);
    http.expectOne(PREVIEWS_URL).flush(PREVIEWS_FIXTURE);

    expect(service.previewUrls('Cinematic')).toEqual([
      'https://img/cinematic-person.webp',
      'https://img/cinematic-place.webp',
      'https://img/cinematic-thing.webp',
    ]);
    expect(service.previewUrls('Place Only')).toEqual([
      'https://img/place-only.webp',
    ]);
    expect(service.previewUrls('Unknown Style')).toEqual([]);
  });

  it('falls back to another subject, then to null', () => {
    const { service, http } = setup();
    service.load();
    http.expectOne(HASHES_URL).flush(HASHES_FIXTURE);
    http.expectOne(PREVIEWS_URL).flush(PREVIEWS_FIXTURE);

    expect(service.previewUrl('Place Only', 'person')).toBe(
      'https://img/place-only.webp',
    );
    expect(service.previewUrl('Unknown Style', 'person')).toBeNull();
  });

  it('serves the cache immediately and skips the refetch when the digest matches', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        signature: previewsSignature(HASHES_FIXTURE),
        previews: coercePreviewMap(PREVIEWS_FIXTURE),
      }),
    );
    const { service, http } = setup();
    service.load();

    // Cache is published before any response arrives.
    expect(service.previewUrl('Cinematic', 'person')).toBe(
      'https://img/cinematic-person.webp',
    );
    http.expectOne(HASHES_URL).flush(HASHES_FIXTURE);
    http.expectNone(PREVIEWS_URL);
    expect(service.loading()).toBe(false);
  });

  it('refetches when the digest moved', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        signature: 'stale',
        previews: coercePreviewMap(PREVIEWS_FIXTURE),
      }),
    );
    const { service, http } = setup();
    service.load();
    http.expectOne(HASHES_URL).flush(HASHES_FIXTURE);
    http
      .expectOne(PREVIEWS_URL)
      .flush({ Cinematic: { person: 'https://img/new.webp' } });

    expect(service.previewUrl('Cinematic', 'person')).toBe(
      'https://img/new.webp',
    );
    expect(service.previewUrl('Place Only', 'place')).toBeNull();
  });

  it('reports failure when there is no cache and both fetches fail', () => {
    const { service, http } = setup();
    service.load();
    http
      .expectOne(HASHES_URL)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'boom' });
    http
      .expectOne(PREVIEWS_URL)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'boom' });

    expect(service.previews()).toBeNull();
    expect(service.failed()).toBe(true);
    expect(service.loading()).toBe(false);
    expect(service.previewUrl('Cinematic', 'person')).toBeNull();
  });

  it('keeps cached previews when revalidation fails', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        signature: 'stale',
        previews: coercePreviewMap(PREVIEWS_FIXTURE),
      }),
    );
    const { service, http } = setup();
    service.load();
    http
      .expectOne(HASHES_URL)
      .error(new ProgressEvent('error'), { status: 503, statusText: 'down' });

    // With previews already on screen a missing digest is not worth a refetch.
    http.expectNone(PREVIEWS_URL);
    expect(service.failed()).toBe(false);
    expect(service.previewUrl('Cinematic', 'thing')).toBe(
      'https://img/cinematic-thing.webp',
    );
  });

  it('only does the work once, however often load() is called', () => {
    const { service, http } = setup();
    service.load();
    service.load();
    http.expectOne(HASHES_URL).flush(HASHES_FIXTURE);
    http.expectOne(PREVIEWS_URL).flush(PREVIEWS_FIXTURE);
    service.load();
    http.expectNone(HASHES_URL);
    expect(service.previews()).not.toBeNull();
  });
});
