import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptCheckService } from './prompt-check.service';
import { AuthService } from './auth.service';
import { GenerationDbService } from './generation-db.service';
import { PromptDraftService } from './prompt-draft.service';
import {
  DescribeError,
  DescribeFindings,
  StudioDescribeService,
} from './studio-describe.service';
import { StoredJobImage, StoredPromptCheck } from '../types/generation-job';

/** The picture every test in here is about. */
const TARGET = { localId: 'job-1', imageId: '0' };

function storedImage(promptCheck?: StoredPromptCheck): StoredJobImage {
  return {
    localId: TARGET.localId,
    imageId: TARGET.imageId,
    kind: 'result',
    blob: new Blob(['bytes'], { type: 'image/webp' }),
    mimeType: 'image/webp',
    ...(promptCheck ? { promptCheck } : {}),
  };
}

describe('PromptCheckService', () => {
  let service: PromptCheckService;
  let findings: ReturnType<typeof signal<DescribeFindings>>;
  let pending: ReturnType<typeof signal<boolean>>;
  let failure: ReturnType<typeof signal<DescribeError | null>>;
  let describe_: ReturnType<typeof vi.fn>;
  let getImage: ReturnType<typeof vi.fn>;
  let updateImagePromptCheck: ReturnType<typeof vi.fn>;
  let draft: ReturnType<typeof vi.fn>;
  let estimate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findings = signal<DescribeFindings>({ caption: null, tags: null });
    pending = signal(false);
    failure = signal<DescribeError | null>(null);
    // The reading answers as the describe service does: the caption and tags
    // land while the job is still open, and the pending flag closes it.
    describe_ = vi.fn(() => {
      pending.set(true);
      findings.set({ caption: 'a lighthouse on a cliff', tags: 'cliff:0.8' });
      return Promise.resolve();
    });
    getImage = vi.fn(() => Promise.resolve(storedImage()));
    updateImagePromptCheck = vi.fn(() => Promise.resolve(undefined));
    draft = vi.fn();
    estimate = vi.fn(() => Promise.resolve({ kudos: 7, resolved: null }));

    TestBed.configureTestingModule({
      providers: [
        {
          provide: StudioDescribeService,
          useValue: {
            describe: describe_,
            findings,
            pending,
            hasFindings: () =>
              findings().caption !== null || findings().tags !== null,
            error: failure,
          },
        },
        {
          provide: GenerationDbService,
          useValue: { getImage, updateImagePromptCheck },
        },
        { provide: PromptDraftService, useValue: { draft, estimate } },
        { provide: AuthService, useValue: { isLoggedIn: () => true } },
      ],
    });
    service = TestBed.inject(PromptCheckService);
  });

  /** Finish the reading the way the alchemy job does, and let the effect run. */
  async function settleReading(): Promise<void> {
    pending.set(false);
    TestBed.tick();
    await Promise.resolve();
  }

  it('reads a picture once and keeps what came back', async () => {
    await service.check(TARGET);
    expect(describe_).toHaveBeenCalledTimes(1);
    await settleReading();

    expect(service.reading(TARGET)).toMatchObject({
      caption: 'a lighthouse on a cliff',
      tags: 'cliff:0.8',
    });
    expect(updateImagePromptCheck).toHaveBeenCalledWith(
      'job-1',
      '0',
      expect.objectContaining({ caption: 'a lighthouse on a cliff' }),
    );

    await service.check(TARGET);
    expect(describe_).toHaveBeenCalledTimes(1);
  });

  it('takes the stored reading rather than asking for another', async () => {
    getImage.mockResolvedValue(
      storedImage({ readAt: 1, caption: 'a cat', tags: null }),
    );
    await service.check(TARGET);

    expect(describe_).not.toHaveBeenCalled();
    expect(service.report(TARGET, 'a cat')?.counts).toEqual({
      found: 1,
      partly: 0,
      missing: 0,
    });
  });

  it('reads again when the reader asks for it', async () => {
    getImage.mockResolvedValue(
      storedImage({ readAt: 1, caption: 'a cat', tags: null }),
    );
    await service.check(TARGET);
    await service.readAgain(TARGET);

    expect(describe_).toHaveBeenCalledTimes(1);
  });

  it('gives up on the reading when the horde refuses it', async () => {
    describe_.mockResolvedValue(undefined);
    await service.check(TARGET);
    failure.set({ key: 'generate.describe.failed' });
    await settleReading();

    expect(service.reading(TARGET)).toBeNull();
    expect(service.isReading(TARGET)).toBe(false);
    expect(service.failure()?.key).toBe('generate.describe.failed');
  });

  it('keeps a verdict with the reading it was written about', async () => {
    getImage.mockResolvedValue(
      storedImage({ readAt: 1, caption: 'a cat', tags: null }),
    );
    draft.mockResolvedValue({
      kind: 'done',
      texts: ['Matches: the cat.'],
      negatives: [''],
      model: 'm/1',
      kudos: 4,
      seed: null,
      ids: ['d1'],
    });
    await service.check(TARGET);
    await service.judge(TARGET, 'a cat');

    expect(draft.mock.calls[0]?.[0]).toMatchObject({
      role: 'judge',
      prompt: 'a cat',
      caption: 'a cat',
    });
    expect(service.reading(TARGET)?.verdict).toMatchObject({
      text: 'Matches: the cat.',
      model: 'm/1',
    });
  });

  it('prices a verdict once for the same picture and prompt', async () => {
    getImage.mockResolvedValue(
      storedImage({ readAt: 1, caption: 'a cat', tags: null }),
    );
    await service.check(TARGET);
    await service.priceVerdict(TARGET, 'a cat');
    await service.priceVerdict(TARGET, 'a cat');

    expect(estimate).toHaveBeenCalledTimes(1);
    expect(service.verdictPrice()).toBe(7);
  });
});
