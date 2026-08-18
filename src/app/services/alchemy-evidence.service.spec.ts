import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AlchemyEvidenceService } from './alchemy-evidence.service';
import {
  ALCHEMY_EVIDENCE_ROOT,
  AlchemyEvidenceManifest,
} from '../content/alchemy-evidence';

const manifestUrl = `${ALCHEMY_EVIDENCE_ROOT}/manifest.json`;

const manifest: AlchemyEvidenceManifest = {
  generated_against: 'https://aihorde.net/api/v2',
  entries: [
    {
      use_case: 'describe',
      form: 'caption',
      title: 'A dog on a beach',
      files: {
        source: 'describe/source.webp',
        result_text: 'describe/cap.txt',
      },
    },
    {
      use_case: 'enlarge',
      form: 'RealESRGAN_x4plus',
      title: 'Four times',
      files: {
        source: 'enlarge/source.webp',
        result: 'enlarge/realesrgan.webp',
      },
      model: 'RealESRGAN_x4plus',
    },
    // Neither a picture nor words came back, so there is nothing to show.
    {
      use_case: 'cut_out',
      form: 'strip_background',
      title: 'Nothing published',
      files: { source: 'cut_out/source.webp' },
    },
    {
      use_case: 'control_map',
      form: 'annotation',
      title: 'canny',
      control_type: 'canny',
      files: {
        source: 'sources/anchor.webp',
        result: 'control_map/canny/result.webp',
      },
    },
    // The detector ran and nothing came back. Kept, because the page reads the
    // detectors as a set and has to say which one is missing.
    {
      use_case: 'control_map',
      form: 'annotation',
      title: 'openpose',
      control_type: 'openpose',
      notes: 'Draws the people as skeletons.',
      files: { source: 'sources/anchor.webp' },
    },
  ],
};

describe('AlchemyEvidenceService', () => {
  let evidence: AlchemyEvidenceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    evidence = TestBed.inject(AlchemyEvidenceService);
    http = TestBed.inject(HttpTestingController);
  });

  it('fetches the manifest from the configured base url', async () => {
    const loaded = evidence.ensureLoaded();
    http.expectOne(manifestUrl).flush(manifest);
    await loaded;

    expect(evidence.isSettled()).toBe(true);
    expect(evidence.entriesFor('enlarge').map((entry) => entry.form)).toEqual([
      'RealESRGAN_x4plus',
    ]);
  });

  it('drops a run that produced neither a picture nor words', async () => {
    const loaded = evidence.ensureLoaded();
    http.expectOne(manifestUrl).flush(manifest);
    await loaded;

    expect(evidence.entriesFor('cut_out')).toEqual([]);
  });

  it('picks a run by the detector it asked for, not by its form alone', async () => {
    const loaded = evidence.ensureLoaded();
    http.expectOne(manifestUrl).flush(manifest);
    await loaded;

    expect(
      evidence.entryFor('control_map', 'annotation', 'canny')?.files.result,
    ).toBe('control_map/canny/result.webp');
    expect(evidence.entryFor('control_map', 'annotation')?.title).toBe('canny');
    expect(
      evidence.entryFor('control_map', 'annotation', 'not_a_detector'),
    ).toBeUndefined();
  });

  it('keeps a detector that published no map, so the page can say so', async () => {
    const loaded = evidence.ensureLoaded();
    http.expectOne(manifestUrl).flush(manifest);
    await loaded;

    const entry = evidence.entryFor('control_map', 'annotation', 'openpose');
    expect(entry?.files.result).toBeUndefined();
    expect(entry?.notes).toBe('Draws the people as skeletons.');
  });

  it('fetches the manifest once however many callers ask for it', async () => {
    const first = evidence.ensureLoaded();
    const second = evidence.ensureLoaded();
    http.expectOne(manifestUrl).flush(manifest);
    await Promise.all([first, second]);

    await evidence.ensureLoaded();
    http.expectNone(manifestUrl);
    expect(evidence.hasEntries()).toBe(true);
  });

  it('reports nothing published when the library cannot be reached', async () => {
    const loaded = evidence.ensureLoaded();
    http
      .expectOne(manifestUrl)
      .error(new ProgressEvent('error'), { status: 404, statusText: 'nope' });
    await loaded;

    expect(evidence.isSettled()).toBe(true);
    expect(evidence.hasEntries()).toBe(false);
    expect(evidence.entriesFor('describe')).toEqual([]);
  });

  it('fetches the words a form answered with, once, and trims them', async () => {
    const loaded = evidence.ensureLoaded();
    http.expectOne(manifestUrl).flush(manifest);
    await loaded;

    const entry = evidence.entriesFor('describe')[0];
    expect(evidence.resultText(entry)).toBeNull();

    const textUrl = `${ALCHEMY_EVIDENCE_ROOT}/describe/cap.txt`;
    http.expectOne(textUrl).flush('a black dog sitting on the ground\n');
    await Promise.resolve();

    expect(evidence.resultText(entry)).toBe(
      'a black dog sitting on the ground',
    );
    http.expectNone(textUrl);
  });

  it('says nothing where the words could not be fetched', async () => {
    const loaded = evidence.ensureLoaded();
    http.expectOne(manifestUrl).flush(manifest);
    await loaded;

    const entry = evidence.entriesFor('describe')[0];
    evidence.resultText(entry);
    http
      .expectOne(`${ALCHEMY_EVIDENCE_ROOT}/describe/cap.txt`)
      .error(new ProgressEvent('error'));
    await Promise.resolve();

    expect(evidence.resultText(entry)).toBeNull();
  });
});
