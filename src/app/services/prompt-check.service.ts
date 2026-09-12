import {
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { AuthService } from './auth.service';
import { GenerationDbService } from './generation-db.service';
import { PromptDraftService } from './prompt-draft.service';
import { StudioDescribeService } from './studio-describe.service';
import { StoredPromptCheck } from '../types/generation-job';
import { PromptCheckReport, buildPromptCheck } from '../helper/prompt-check';

/** Which stored picture a check is about. */
export interface PromptCheckTarget {
  localId: string;
  imageId: string;
}

/** How a picture and its prompt are addressed in the store of readings. */
function targetKey(target: PromptCheckTarget): string {
  return `${target.localId}/${target.imageId}`;
}

/**
 * Checking a finished picture against the prompt that asked for it.
 *
 * The reading is the same one the results panel already offers: alchemy is
 * asked for a caption and tags, through the shared describe service, so a
 * picture read here shows its findings in the prompt help card as well and a
 * reading is paid for once. What comes back is written onto the stored picture,
 * so it survives a reload and travels with an export.
 *
 * How the reading compares with the prompt is never stored. It is worked out
 * again each time it is shown, because the prompt is edited between one look
 * and the next and a saved comparison would be answering the old one.
 */
@Injectable({ providedIn: 'root' })
export class PromptCheckService {
  private readonly describe = inject(StudioDescribeService);
  private readonly db = inject(GenerationDbService);
  private readonly drafts = inject(PromptDraftService);
  private readonly auth = inject(AuthService);

  /** Readings already in hand, by picture. */
  private readonly readings = signal<ReadonlyMap<string, StoredPromptCheck>>(
    new Map(),
  );

  /** Pictures whose record has been looked at, so a miss is not asked twice. */
  private readonly loaded = new Set<string>();

  /** The picture a reading is running for, null when none is. */
  private readonly awaiting = signal<string | null>(null);

  /** The picture a verdict is being written for, null when none is. */
  private readonly judging = signal<string | null>(null);

  /**
   * What a verdict would cost, as the horde quotes it for the same kind of
   * request the prompt help card prices. Null while it is unknown, which
   * leaves the line off rather than showing a figure nobody stands behind.
   */
  public readonly verdictPrice = signal<number | null>(null);

  /** The picture and prompt the price on hand was asked for. */
  private pricedFor: string | null = null;

  /** Why the last reading produced nothing, straight from the describe service. */
  public readonly failure = computed(() => this.describe.error());

  constructor() {
    effect(() => {
      const key = this.awaiting();
      if (key === null) return;
      if (this.describe.pending()) return;
      const findings = this.describe.findings();
      const found = this.describe.hasFindings();
      const failed = this.describe.error() !== null;
      untracked(() => {
        if (found) {
          void this.store(key, {
            readAt: Date.now(),
            caption: findings.caption,
            tags: findings.tags,
          });
          this.awaiting.set(null);
        } else if (failed) {
          this.awaiting.set(null);
        }
      });
    });
  }

  /** Whether this picture is waiting on a reading. */
  public isReading(target: PromptCheckTarget): boolean {
    return this.awaiting() === targetKey(target);
  }

  /** Whether a text model is being asked about this picture. */
  public isJudging(target: PromptCheckTarget): boolean {
    return this.judging() === targetKey(target);
  }

  /** The reading held for this picture, or null when it has not been read. */
  public reading(target: PromptCheckTarget): StoredPromptCheck | null {
    return this.readings().get(targetKey(target)) ?? null;
  }

  /**
   * Bring a picture's stored reading into hand, if it has one. Called when the
   * panel opens on a picture; a picture with no reading is remembered as such
   * so opening it again asks the store nothing.
   */
  public async load(target: PromptCheckTarget): Promise<void> {
    const key = targetKey(target);
    if (this.loaded.has(key)) return;
    this.loaded.add(key);
    const image = await this.db.getImage(target.localId, target.imageId);
    const stored = image?.promptCheck;
    if (stored) this.remember(key, stored);
  }

  /**
   * Read the picture, unless it has already been read. A second look at a
   * picture already read costs nothing; {@link readAgain} is how a reader asks
   * for the reading to be taken over.
   */
  public async check(target: PromptCheckTarget): Promise<void> {
    await this.load(target);
    if (this.reading(target)) return;
    await this.readPicture(target);
  }

  /** Take the reading again, for a picture whose findings were no use. */
  public async readAgain(target: PromptCheckTarget): Promise<void> {
    await this.readPicture(target);
  }

  private async readPicture(target: PromptCheckTarget): Promise<void> {
    if (this.awaiting() !== null) return;
    const image = await this.db.getImage(target.localId, target.imageId);
    if (!image) return;
    this.awaiting.set(targetKey(target));
    await this.describe.describe(image.blob, 'result');
  }

  /**
   * How the prompt and the reading compare, or null while there is nothing to
   * compare with.
   */
  public report(
    target: PromptCheckTarget,
    prompt: string | null,
  ): PromptCheckReport | null {
    const stored = this.reading(target);
    if (!stored || !prompt) return null;
    return buildPromptCheck(prompt, {
      caption: stored.caption,
      tags: stored.tags,
    });
  }

  /**
   * Ask a text model on the horde what it makes of the picture against its
   * prompt. It needs a reading to work from, so a picture that has not been
   * read is left alone.
   */
  public async judge(
    target: PromptCheckTarget,
    prompt: string | null,
  ): Promise<void> {
    const stored = this.reading(target);
    if (!stored || !prompt || this.judging() !== null) return;
    const key = targetKey(target);
    this.judging.set(key);
    try {
      const outcome = await this.drafts.draft(
        {
          role: 'judge',
          prompt,
          caption: stored.caption,
          tags: stored.tags,
        },
        'auto',
        undefined,
        { anonymous: !this.auth.isLoggedIn(), origin: 'studio' },
      );
      if (outcome.kind !== 'done') return;
      const text = outcome.texts.at(0);
      if (!text) return;
      await this.store(key, {
        ...stored,
        verdict: { text, model: outcome.model, at: Date.now() },
      });
    } finally {
      this.judging.set(null);
    }
  }

  /**
   * Ask the horde what a verdict on this picture would cost. The same picture
   * and prompt are priced once: the answer does not move, and a dry run is a
   * request like any other.
   */
  public async priceVerdict(
    target: PromptCheckTarget,
    prompt: string | null,
  ): Promise<void> {
    const stored = this.reading(target);
    if (!stored || !prompt) {
      this.verdictPrice.set(null);
      return;
    }
    const asked = `${targetKey(target)}|${prompt}`;
    if (asked === this.pricedFor) return;
    this.pricedFor = asked;
    try {
      this.verdictPrice.set(
        await this.drafts.estimate(
          {
            role: 'judge',
            prompt,
            caption: stored.caption,
            tags: stored.tags,
          },
          'auto',
          undefined,
          !this.auth.isLoggedIn(),
        ),
      );
    } catch {
      // A price that cannot be fetched leaves the line off; the button works.
      this.verdictPrice.set(null);
    }
  }

  private async store(key: string, check: StoredPromptCheck): Promise<void> {
    this.remember(key, check);
    const [localId, imageId] = key.split('/');
    if (!localId || !imageId) return;
    try {
      await this.db.updateImagePromptCheck(localId, imageId, check);
    } catch {
      // A store that will not take the reading must not cost the reader the
      // reading itself: it stands for this visit and is asked for again later.
    }
  }

  private remember(key: string, check: StoredPromptCheck): void {
    this.readings.update((current) => new Map(current).set(key, check));
  }
}
