import { Injectable, Signal, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CivitaiCacheService } from './civitai-cache.service';
import {
  CivitaiModel,
  CivitaiModelVersion,
  CivitaiService,
} from './civitai.service';
import { isNumericAssetId } from '../types/civitai-asset';

/** One asset to look up, in the terms a stored request carries. */
export interface CivitaiAssetRef {
  id: string;
  isVersion: boolean;
}

/** What a lookup can tell a panel about an asset it only knows by number. */
export interface CivitaiAssetMeta {
  /** "Detail Tweaker", or "Detail Tweaker · v2.0" for a pinned version. */
  label: string;
  versionLabel: string | null;
  baseModel: string | null;
  thumbnailUrl: string | null;
  modelId: number | null;
  trainedWords: readonly string[];
  availability: string | null;
}

/** The map key for a ref; a version and a model page share no namespace. */
export function assetRefKey(ref: CivitaiAssetRef): string {
  return `${ref.isVersion ? 'v' : 'm'}:${ref.id}`;
}

function metaFromModel(model: CivitaiModel): CivitaiAssetMeta {
  const newest = model.versions[0] ?? null;
  return {
    label: model.name,
    versionLabel: null,
    baseModel: newest?.baseModel ?? null,
    thumbnailUrl: model.preview?.url ?? null,
    modelId: model.id,
    trainedWords: newest?.trainedWords ?? [],
    availability: model.availability,
  };
}

function metaFromVersion(version: CivitaiModelVersion): CivitaiAssetMeta {
  const own = version.name.trim();
  const model = version.modelName?.trim();
  // A version names itself only as "v2.0", which means something alongside its
  // model and very little on its own.
  const label = model && own ? `${model} · ${own}` : model || own || '';
  return {
    label,
    versionLabel: own || null,
    baseModel: version.baseModel || null,
    thumbnailUrl: version.images[0]?.url ?? null,
    modelId: version.modelId,
    trainedWords: version.trainedWords,
    availability: version.availability,
  };
}

/**
 * Turns the bare identifiers a stored request carries back into names.
 *
 * A generation records only what the horde was told, so a past request holds a
 * number and nothing else. Both the studio's LoRA card and the metadata panel
 * need the same repair, and doing it in one place is what stops them disagreeing
 * about what an asset is called.
 *
 * Lookups are published through a signal rather than an observable per id
 * because both callers read them inside a template, where a synchronous answer
 * is the only one that renders.
 */
@Injectable({ providedIn: 'root' })
export class CivitaiResolverService {
  private readonly civitai = inject(CivitaiService);
  private readonly cache = inject(CivitaiCacheService);

  private readonly resolved = signal<ReadonlyMap<string, CivitaiAssetMeta>>(
    new Map(),
  );

  /** Ids already asked about, so each is fetched at most once per session. */
  private readonly requested = new Set<string>();

  /** Everything resolved so far, keyed by {@link assetRefKey}. */
  public readonly metadata: Signal<ReadonlyMap<string, CivitaiAssetMeta>> =
    this.resolved.asReadonly();

  /** What is known about a ref right now, or null if nothing is yet. */
  public metaFor(ref: CivitaiAssetRef): CivitaiAssetMeta | null {
    return this.resolved().get(assetRefKey(ref)) ?? null;
  }

  /**
   * Ask about a ref, at most once per session. Fire and forget: the answer
   * arrives through {@link metadata}.
   *
   * A name that is not all digits is already a horde asset name and is never
   * looked up, because there is nothing in the catalogue to look it up by.
   */
  public request(ref: CivitaiAssetRef): void {
    if (!isNumericAssetId(ref.id)) {
      return;
    }
    const key = assetRefKey(ref);
    if (this.requested.has(key)) {
      return;
    }
    this.requested.add(key);
    void this.resolve(ref, key);
  }

  /** Ask about many refs at once, skipping the ones already known. */
  public requestAll(refs: readonly CivitaiAssetRef[]): void {
    for (const ref of refs) {
      this.request(ref);
    }
  }

  private publish(key: string, meta: CivitaiAssetMeta): void {
    if (!meta.label) {
      return;
    }
    this.resolved.update((current) => new Map(current).set(key, meta));
  }

  private async resolve(ref: CivitaiAssetRef, key: string): Promise<void> {
    const id = Number(ref.id);

    const cached = ref.isVersion
      ? await this.cache.getVersion(id)
      : await this.cache.getModel(id);
    if (cached) {
      this.publish(
        key,
        ref.isVersion
          ? metaFromVersion(cached.data as CivitaiModelVersion)
          : metaFromModel(cached.data as CivitaiModel),
      );
      if (!cached.stale) {
        return;
      }
    }

    const fetched = await this.fetch(ref);
    if (!fetched) {
      // Not remembered as an answer: a transient outage must not blank a name
      // for the rest of the session, so the id stays eligible next time.
      this.requested.delete(key);
      return;
    }
    this.publish(key, fetched.meta);
    // Stored under the key that was asked for as well as its own, so a ref that
    // named the wrong endpoint is repaired rather than re-guessed every time.
    if (fetched.key !== key) {
      this.publish(fetched.key, fetched.meta);
      this.requested.add(fetched.key);
    }
  }

  /**
   * Read a ref, trying the other endpoint once if the named one has nothing.
   *
   * Whether an id is a model page or a version is a guess at every call site: a
   * LoRA stored before version pinning carries a model id, a hand-typed id could
   * be either, and a textual inversion has no version endpoint at all. Trying
   * both settles it once, and costs nothing in the ordinary case.
   */
  private async fetch(
    ref: CivitaiAssetRef,
  ): Promise<{ key: string; meta: CivitaiAssetMeta } | null> {
    const asVersion = async (): Promise<CivitaiAssetMeta | null> => {
      const version = await firstValueFrom(this.civitai.fetchVersion(ref.id));
      if (!version) {
        return null;
      }
      void this.cache.putVersion(version);
      return metaFromVersion(version);
    };
    const asModel = async (): Promise<CivitaiAssetMeta | null> => {
      const model = await firstValueFrom(this.civitai.fetchModel(ref.id));
      if (!model) {
        return null;
      }
      void this.cache.putSearchResult(model);
      return metaFromModel(model);
    };

    const first = ref.isVersion ? asVersion : asModel;
    const second = ref.isVersion ? asModel : asVersion;

    const own = await first();
    if (own) {
      return { key: assetRefKey(ref), meta: own };
    }
    const other = await second();
    if (other) {
      return {
        key: assetRefKey({ id: ref.id, isVersion: !ref.isVersion }),
        meta: other,
      };
    }
    return null;
  }
}
