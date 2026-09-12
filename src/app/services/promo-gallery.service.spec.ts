import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PromoGalleryService } from './promo-gallery.service';
import { environment } from '../../environments/environment';
import stubManifest from '../testing/fixtures/promo-gallery.stub.json';

describe('PromoGalleryService', () => {
  let gallery: PromoGalleryService;
  let http: HttpTestingController;

  const manifestUrl = `${environment.promoBaseUrl}/gallery/gallery.json`;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    gallery = TestBed.inject(PromoGalleryService);
    http = TestBed.inject(HttpTestingController);
  });

  it('fetches the manifest from the configured promo base url', async () => {
    const loaded = gallery.ensureLoaded();
    http.expectOne(manifestUrl).flush(stubManifest);
    await loaded;

    expect(gallery.loaded()).toBe(true);
    expect(gallery.failed()).toBe(false);
    expect(gallery.images().map((entry) => entry.id)).toEqual([
      'snail-cathedral',
      'fox-snow',
      'tram-rainbow',
    ]);
  });

  it('never offers a picture the manifest lists as censored', async () => {
    const loaded = gallery.ensureLoaded();
    http.expectOne(manifestUrl).flush(stubManifest);
    await loaded;

    expect(gallery.byId('teacup-pool')).toBeNull();
  });

  it('fetches once however many callers ask for it', async () => {
    const first = gallery.ensureLoaded();
    const second = gallery.ensureLoaded();
    http.expectOne(manifestUrl).flush(stubManifest);
    await Promise.all([first, second]);

    await gallery.ensureLoaded();
    http.expectNone(manifestUrl);
    expect(gallery.images()).toHaveLength(3);
  });

  it('reports a failure when the bucket cannot be reached', async () => {
    const loaded = gallery.ensureLoaded();
    http
      .expectOne(manifestUrl)
      .error(new ProgressEvent('offline'), { status: 0, statusText: '' });
    await loaded;

    expect(gallery.loaded()).toBe(true);
    expect(gallery.failed()).toBe(true);
    expect(gallery.images()).toEqual([]);
  });

  it('fetches again when a failed load is retried', async () => {
    const failed = gallery.ensureLoaded();
    http
      .expectOne(manifestUrl)
      .error(new ProgressEvent('offline'), { status: 0, statusText: '' });
    await failed;

    const retried = gallery.reload();
    http.expectOne(manifestUrl).flush(stubManifest);
    await retried;

    expect(gallery.failed()).toBe(false);
    expect(gallery.images()).toHaveLength(3);
  });

  it('addresses a picture under the promo root', async () => {
    const loaded = gallery.ensureLoaded();
    http.expectOne(manifestUrl).flush(stubManifest);
    await loaded;

    const picture = gallery.byId('snail-cathedral');
    expect(picture).not.toBeNull();
    expect(gallery.pictureUrl(picture!)).toBe(
      `${environment.promoBaseUrl}/gallery/snail-cathedral/result.webp`,
    );
    expect(picture!.request?.params?.sampler_name).toBe('k_dpmpp_2m');
  });

  it('leaves a picture published without a request without one', async () => {
    const loaded = gallery.ensureLoaded();
    http.expectOne(manifestUrl).flush(stubManifest);
    await loaded;

    expect(gallery.byId('tram-rainbow')?.request).toBeUndefined();
  });
});
