import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { AlchemyQueueService } from './alchemy-queue.service';
import { ToastService } from './toast.service';
import { HordeApiError, hordeRejectionKey } from '../types/generation';
import {
  AlchemyJob,
  isJobSettled,
  jobFormCards,
  resultPromptText,
} from '../helper/alchemy-job-view';
import {
  base64ByteLength,
  fileToResizedBase64,
} from '../helper/image-encoding';

/**
 * The largest payload the request is allowed to carry, matching alchemy's own
 * picker so a picture the studio accepts here is one alchemy would accept too.
 */
const MAX_ENCODED_BYTES = 4 * 1024 * 1024;

/** The words alchemy found in the picture, each once its form is done. */
export interface DescribeFindings {
  caption: string | null;
  tags: string | null;
}

/**
 * Which picture was read. The studio holds three at once (the one attached as
 * the source, the ones it has made, and one picked only to be read), so the
 * findings say where they came from rather than leaving the reader to guess.
 */
export type DescribeOrigin = 'picked' | 'source' | 'result';

/**
 * Why there is nothing to show: the studio's own line, plus the horde's wording
 * when the refusal carried one the reader needs.
 */
export interface DescribeError {
  key: string;
  reason?: string;
}

const NO_FINDINGS: DescribeFindings = { caption: null, tags: null };

/**
 * Reads a picture the studio already holds by asking alchemy for its caption
 * and its strongest tags, without the reader leaving the studio.
 *
 * The request goes through the shared {@link AlchemyQueueService}, so the job
 * is tracked, polled and archived exactly as one submitted from the alchemy
 * page, and it shows up in that page's history with no work here.
 *
 * One reading at a time: a second call replaces the first, because the studio
 * has one prompt box and showing two sets of findings for it would leave the
 * reader deciding which picture each line came from.
 */
@Injectable({ providedIn: 'root' })
export class StudioDescribeService {
  private readonly injector = inject(Injector);
  private readonly toast = inject(ToastService);

  /**
   * Resolved on the first reading rather than up front: building the alchemy
   * queue opens its store and starts its poll loop, and a session that never
   * asks for a reading should pay for neither.
   */
  private queueRef: AlchemyQueueService | null = null;
  private get queue(): AlchemyQueueService {
    this.queueRef ??= this.injector.get(AlchemyQueueService);
    return this.queueRef;
  }

  private readonly currentJobId = signal<string | null>(null);
  private readonly submitting = signal(false);
  private readonly failure = signal<DescribeError | null>(null);
  private readonly currentOrigin = signal<DescribeOrigin>('picked');
  private readonly attachedSource = signal<Blob | null>(null);

  /** The horde's id for the reading being shown, null when there is none. */
  public readonly jobId = computed(() => this.currentJobId());

  /** Which picture the reading on screen was taken from. */
  public readonly origin = computed(() => this.currentOrigin());

  /**
   * The picture attached to the request right now, offered as a shortcut so a
   * reader who has one need not pick it a second time. Published by the source
   * card because only it knows what is on the bench; reading it never attaches
   * anything and never touches the request's own source setting.
   */
  public readonly sourcePicture = computed(() => this.attachedSource());

  /** Tell the service what the source card currently holds. */
  public offerSourcePicture(blob: Blob | null): void {
    this.attachedSource.set(blob);
  }

  /** Whether an answer is still on its way: submitting, or job unsettled. */
  public readonly pending = computed(() => {
    if (this.submitting()) {
      return true;
    }
    const job = this.job();
    return job !== null && !isJobSettled(job);
  });

  /** True once the horde has finished with the reading, however it ended. */
  public readonly settled = computed(() => {
    const job = this.job();
    return job !== null && isJobSettled(job);
  });

  /**
   * The caption and the tags as they land. The two forms finish independently,
   * so a caption is shown the moment it arrives rather than waiting on tags.
   */
  public readonly findings = computed<DescribeFindings>(() => {
    const job = this.job();
    if (!job) {
      return NO_FINDINGS;
    }
    let caption: string | null = null;
    let tags: string | null = null;
    for (const card of jobFormCards(job)) {
      if (!card.view) continue;
      const text = resultPromptText(card.view.form);
      if (!text) continue;
      if (card.form === 'caption') caption = text;
      if (card.form === 'interrogation') tags = text;
    }
    return { caption, tags };
  });

  /** Whether anything is worth showing yet. */
  public readonly hasFindings = computed(() => {
    const { caption, tags } = this.findings();
    return caption !== null || tags !== null;
  });

  /** Why the reading produced nothing, null while it may still produce something. */
  public readonly error = computed<DescribeError | null>(() => {
    const explicit = this.failure();
    if (explicit) {
      return explicit;
    }
    const job = this.job();
    if (!job || !isJobSettled(job)) {
      return null;
    }
    if (job.faulted || job.notFound || job.status?.state === 'faulted') {
      return { key: 'generate.describe.failed' };
    }
    return null;
  });

  private readonly job = computed<AlchemyJob | null>(() => {
    const id = this.currentJobId();
    if (id === null) {
      return null;
    }
    return this.queue.jobs().find((entry) => entry.id === id) ?? null;
  });

  /**
   * Read a picture for its caption and its tags. The picture is only read:
   * nothing here attaches it to the request or changes what Generate does.
   */
  public async describe(
    blob: Blob,
    origin: DescribeOrigin = 'picked',
  ): Promise<void> {
    this.currentJobId.set(null);
    this.failure.set(null);
    this.currentOrigin.set(origin);
    this.submitting.set(true);
    try {
      const type = blob.type || 'image/webp';
      const extension = type.split('/')[1] ?? 'webp';
      const encoded = await fileToResizedBase64(
        new File([blob], `studio.${extension}`, { type }),
      );
      if (base64ByteLength(encoded.base64) > MAX_ENCODED_BYTES) {
        this.fail({ key: 'generate.describe.too_large' });
        return;
      }
      const outcome = await this.queue.submit({
        forms: ['caption', 'interrogation'],
        // The reading is worth waiting a little longer for; refusing slow
        // workers would turn a quiet background job into a queue failure.
        slowWorkers: true,
        source: encoded.base64,
        sourceMimeType: encoded.mimeType,
      });
      if (outcome.kind === 'refused') {
        this.fail(this.refusal(outcome.error));
        return;
      }
      this.currentJobId.set(outcome.id);
    } catch {
      this.fail({ key: 'generate.describe.encode_failed' });
    } finally {
      this.submitting.set(false);
    }
  }

  /** Forget the reading on screen. */
  public clear(): void {
    this.currentJobId.set(null);
    this.failure.set(null);
    this.submitting.set(false);
  }

  private fail(error: DescribeError): void {
    this.failure.set(error);
    this.toast.error(error.key, {
      transloco: true,
      ...(error.reason ? { messageParams: { reason: error.reason } } : {}),
    });
  }

  /**
   * Say why the horde did not take the reading. A refusal (4xx) is about the
   * request itself, so the reader gets the studio's sentence for that return
   * code where there is one and the horde's own wording otherwise; anything
   * else is the horde not answering, which the generic line covers.
   */
  private refusal(error: HordeApiError): DescribeError {
    if (error.status < 400 || error.status >= 500) {
      return { key: 'generate.describe.failed' };
    }
    const key = hordeRejectionKey(error.rc);
    if (key) {
      return { key };
    }
    return { key: 'generate.describe.refused', reason: error.message };
  }
}
