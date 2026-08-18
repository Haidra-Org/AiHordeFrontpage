import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AlchemyEvidenceEntry,
  AlchemyEvidenceManifest,
  alchemyEvidenceAssetUrl,
  alchemyEvidenceManifestUrl,
} from '../content/alchemy-evidence';

/**
 * The published alchemy runs, as the documentation reads them.
 *
 * Fetched once, lazily, by the first page that wants pictures. A library that
 * is missing or unreachable leaves the service empty, and every consumer treats
 * empty as "nothing has been published for this yet": no error, no placeholder
 * frame, no gap in the layout. That is also the state the app is in before the
 * library exists at all, and it is the state a prerender is in, which is why the
 * pages take their identity from the registry and only their pictures from here.
 *
 * The word a describe-family form answered with is a file rather than a string
 * in the manifest, so it is fetched on demand and remembered: a page showing
 * seven captions should make seven requests once, not once per render.
 */
@Injectable({ providedIn: 'root' })
export class AlchemyEvidenceService {
  private readonly http = inject(HttpClient);

  private readonly published = signal<readonly AlchemyEvidenceEntry[]>([]);
  private readonly settled = signal(false);
  private readonly texts = signal<Readonly<Record<string, string>>>({});

  private pending: Promise<void> | null = null;
  private readonly textRequests = new Set<string>();

  /** True once a fetch has finished, whether it found anything or not. */
  public readonly isSettled = this.settled.asReadonly();
  public readonly hasEntries = computed(() => this.published().length > 0);

  /** Fetch the manifest if it has not been fetched already. */
  public ensureLoaded(): Promise<void> {
    this.pending ??= this.fetchManifest();
    return this.pending;
  }

  /** What was published for one use case, in the order the manifest lists it. */
  public entriesFor(useCase: string): readonly AlchemyEvidenceEntry[] {
    return this.published().filter((entry) => entry.use_case === useCase);
  }

  /**
   * What was published for one form, or undefined where nothing was. A form
   * that ran once per detector is asked for by detector as well, since every
   * one of its runs carries the same use case and the same form name.
   */
  public entryFor(
    useCase: string,
    form: string,
    controlType?: string,
  ): AlchemyEvidenceEntry | undefined {
    return this.published().find(
      (entry) =>
        entry.use_case === useCase &&
        entry.form === form &&
        (controlType === undefined || entry.control_type === controlType),
    );
  }

  public assetUrl(file: string): string {
    return alchemyEvidenceAssetUrl(file);
  }

  /**
   * The words a form answered with, once they have arrived. Null both while the
   * file is in flight and where there is none, because a caption that has not
   * loaded yet and a caption that was never published look the same on the page:
   * the entry shows its source and says nothing it cannot back up.
   */
  public resultText(entry: AlchemyEvidenceEntry): string | null {
    const file = entry.files.result_text;
    if (!file) {
      return null;
    }
    this.requestText(file);
    return this.texts()[file] ?? null;
  }

  private requestText(file: string): void {
    if (this.textRequests.has(file)) {
      return;
    }
    this.textRequests.add(file);
    void firstValueFrom(
      this.http.get(alchemyEvidenceAssetUrl(file), { responseType: 'text' }),
    )
      .then((text) =>
        this.texts.update((current) => ({ ...current, [file]: text.trim() })),
      )
      .catch(() => {
        // An unpublished or unreachable file is "nothing to show", which is
        // already what an absent entry in the map means.
      });
  }

  private async fetchManifest(): Promise<void> {
    try {
      const manifest = await firstValueFrom(
        this.http.get<AlchemyEvidenceManifest>(alchemyEvidenceManifestUrl()),
      );
      this.published.set(manifest?.entries?.filter(isUsable) ?? []);
    } catch {
      this.published.set([]);
    } finally {
      this.settled.set(true);
    }
  }
}

/**
 * Whether a published entry is one a page can show. An entry naming no source
 * has nothing to compare against, and one with neither a result nor a result
 * file is a run that produced nothing: both would lay out as a gap.
 *
 * A run naming a detector is kept either way. Those are read as a set of every
 * detector the horde offers, where a missing map is itself worth showing and
 * the entry is what says which detector is missing and what it would have read.
 */
function isUsable(entry: AlchemyEvidenceEntry): boolean {
  return (
    !!entry?.use_case &&
    !!entry.form &&
    !!entry.files?.source &&
    (!!entry.files.result || !!entry.files.result_text || !!entry.control_type)
  );
}
