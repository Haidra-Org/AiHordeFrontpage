import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';
import { GsParamEntryComponent } from '../../../components/gs-param-entry/gs-param-entry.component';
import { GsAnchorLinkComponent } from '../../../components/gs-anchor-link/gs-anchor-link.component';
import {
  GsIndexRailComponent,
  GsIndexRailEntry,
} from '../../../components/gs-index-rail/gs-index-rail.component';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsShotViewerComponent } from '../../../components/gs-shot-viewer/gs-shot-viewer.component';
import { GsPixelBadgeComponent } from '../../../components/gs-pixel-badge/gs-pixel-badge.component';
import { AlchemyResultComponent } from '../../../components/alchemy/alchemy-result/alchemy-result.component';
import { AlchemyForm } from '../../../types/generation';
import { SECTION_IDENTITIES } from '../../../content/sections';
import {
  ALCHEMY_USE_CASES,
  ANNOTATION_DETECTOR_GROUPS,
  alchemyFormNameKey,
  alchemyUseCase,
  alchemyUseCaseLeadKey,
  alchemyUseCaseTitleKey,
  annotationGroupLabelKey,
} from '../../../content/alchemy-usecases';
import { alchemyTopic } from '../../../content/reference-topics';
import {
  DOCS_ALCHEMY,
  DOCS_UNKNOWN_ID_STATE,
  STUDIO_ALCHEMY,
  docsAlchemyUseCaseLink,
} from '../../../content/docs-links';
import { AlchemyEvidenceService } from '../../../services/alchemy-evidence.service';
import { setPageMeta } from '../../../helper/page-meta';

/** One published run, resolved for the template. */
interface EvidenceShot {
  form: string;
  formNameKey: string;
  title: string;
  source: string;
  /** The picture that came back, on the forms that answer with one. */
  result: string | null;
  /** The words that came back, once they have been fetched. */
  text: string | null;
  /**
   * The whole answer, shaped the way the studio's own reader takes it, where
   * the library published it with its structure intact.
   */
  answer: AlchemyForm | null;
  model: string | null;
  notes: string | null;
  /**
   * What went in and what came back, in pixels, as the manifest records them.
   * The pair is drawn at one width on the page, so an enlarger's whole claim is
   * invisible without them.
   */
  sourceWidth: number | null;
  sourceHeight: number | null;
  resultWidth: number | null;
  resultHeight: number | null;
}

/** The one picture a whole band was read out of, drawn once above it. */
interface BandSource {
  src: string;
  width: number | null;
  height: number | null;
}

/**
 * The last full sentence of a published note, or null where it has none. Notes
 * are written in whole sentences ending in a full stop, so the last one can be
 * lifted off the end of several of them and compared.
 */
function lastSentence(note: string): string | null {
  const text = note.trim();
  if (!text.endsWith('.')) {
    return null;
  }
  const boundary = text.lastIndexOf('. ');
  return boundary === -1 ? text : text.slice(boundary + 2);
}

/** One detector's map in the control map gallery. */
interface ControlMapTile {
  /** The horde's own spelling, which is what a reader picks in the studio. */
  type: string;
  result: string | null;
  notes: string | null;
  /** The map's size in pixels, where the manifest records one. */
  width: number | null;
  height: number | null;
}

/** The detectors that read the same kind of structure, shown together. */
interface ControlMapGroup {
  id: string;
  labelKey: string;
  introKey: string;
  tiles: readonly ControlMapTile[];
}

/** A picture of the gallery, opened at the size the grid cannot give it. */
interface EnlargedMap {
  src: string;
  /** What the picture is: the detector's name, or the source's own label. */
  label: string;
  /** Its size in pixels, where the manifest records one. */
  width: number | null;
  height: number | null;
}

/** One way onwards to the next thing the studio is used for. */
interface OnwardUseCase {
  id: string;
  titleKey: string;
  link: string;
}

/**
 * One thing the alchemy studio is used for: what it does, which of its forms do
 * it, and what those forms actually produced when they were run.
 *
 * The written half is the shared reference entry, so a reader who opened the
 * same subject from the panel's `?` glyph is reading these words rather than a
 * paraphrase of them. The pictures are the evidence library's, and the page is
 * written to read as finished when there are none: identity comes from the
 * registry, evidence comes from the library, and only the second can be absent.
 */
@Component({
  selector: 'app-docs-alchemy-usecase',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    GsAnchorLinkComponent,
    GsIndexRailComponent,
    GsParamEntryComponent,
    GsShotViewerComponent,
    GsPixelBadgeComponent,
    AlchemyResultComponent,
  ],
  templateUrl: './alchemy-usecase.component.html',
  host: {
    class: 'gs-ref-page',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsAlchemyUseCaseComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly evidence = inject(AlchemyEvidenceService);
  private readonly transloco = inject(TranslocoService);

  public readonly indexLink = DOCS_ALCHEMY;
  public readonly studioLink = STUDIO_ALCHEMY;
  public readonly identity = SECTION_IDENTITIES.alchemy;

  /** The use case the URL names, before it is known to be one there is. */
  public readonly param = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('useCase') ?? '')),
    { initialValue: '' },
  );

  /** The use case on screen, or null while the URL names one there is none of. */
  public readonly useCase = computed(
    () => alchemyUseCase(this.param()) ?? null,
  );

  /** The reference topic the shared entry is mounted on. */
  public readonly topic = computed(() => {
    const useCase = this.useCase();
    return useCase ? alchemyTopic(useCase.id) : null;
  });

  /** The gallery picture on the enlarging layer, or null while it is shut. */
  public readonly enlargedMap = signal<EnlargedMap | null>(null);

  /**
   * The tile that opened the layer, so closing hands focus back to it. Held as
   * the element rather than as an index because the grid is thirty-four
   * triggers across eight groups and the layer only ever needs the one.
   */
  private enlargedFrom: HTMLElement | null = null;

  /** True once the library has answered, whichever way it answered. */
  public readonly evidenceSettled = this.evidence.isSettled;

  public readonly shots = computed<readonly EvidenceShot[]>(() => {
    const useCase = this.useCase();
    if (!useCase) {
      return [];
    }
    return this.evidence.entriesFor(useCase.id).map((entry) => {
      const answer = this.evidence.resultJson(entry);
      return {
        form: entry.form,
        formNameKey: alchemyFormNameKey(entry.form),
        title: entry.title,
        source: this.evidence.assetUrl(entry.files.source),
        result: entry.files.result
          ? this.evidence.assetUrl(entry.files.result)
          : null,
        text: this.evidence.resultText(entry),
        answer: answer
          ? { form: entry.form, state: 'done', result: answer }
          : null,
        model: entry.model ?? null,
        notes: entry.notes ?? null,
        sourceWidth: entry.source_width ?? null,
        sourceHeight: entry.source_height ?? null,
        resultWidth: entry.result_width ?? null,
        resultHeight: entry.result_height ?? null,
      };
    });
  });

  /**
   * The one picture the whole band was read out of, where there is one worth
   * drawing once instead of once per row.
   *
   * A form that answers with a picture is read as a pair: what went in beside
   * what came out is the comparison, and half of it says nothing on its own.
   * A form that answers with words or with data has nothing to compare, so the
   * same photograph beside every row is that photograph several times over, and
   * it goes above the rows as the one thing they all started from.
   */
  public readonly bandSource = computed<BandSource | null>(() => {
    const shots = this.shots();
    if (shots.length < 2 || shots.some((shot) => shot.result !== null)) {
      return null;
    }
    const [first, ...rest] = shots;
    return rest.every((shot) => shot.source === first.source)
      ? {
          src: first.source,
          width: first.sourceWidth,
          height: first.sourceHeight,
        }
      : null;
  });

  /**
   * The sentence every note in the band ends with, where they all end with the
   * same one. Said once under the head it is a fact about the band; said once
   * per row it is the same paragraph of small print several times.
   */
  public readonly bandNote = computed<string | null>(() => {
    const notes = this.shots().map((shot) => shot.notes);
    if (notes.length < 2 || notes.some((note) => !note)) {
      return null;
    }
    const shared = lastSentence(notes[0] ?? '');
    return shared !== null &&
      notes.every((note) => lastSentence(note ?? '') === shared)
      ? shared
      : null;
  });

  /** One row's note, without the sentence the band has already said. */
  public shotNote(shot: EvidenceShot): string | null {
    const shared = this.bandNote();
    if (shared === null || shot.notes === null) {
      return shot.notes;
    }
    const text = shot.notes.trim();
    const rest = text.slice(0, text.length - shared.length).trim();
    return rest === '' ? null : rest;
  }

  /**
   * Whether this use case is read as a gallery rather than as a pair per form.
   *
   * The control map form is one operation run thirty-three ways on one source,
   * so the answer to "what does it do" is every map beside its neighbours, and
   * repeating the source thirty-three times would say nothing thirty-three
   * times. Every other use case reads as source beside result.
   */
  public readonly isGallery = computed(
    () => this.useCase()?.forms.includes('annotation') ?? false,
  );

  /** The one picture every map on the page was read out of, and what it is. */
  public readonly gallerySource = computed(() => {
    if (!this.isGallery()) {
      return null;
    }
    const entry = this.evidence.entryFor('control_map', 'annotation');
    return entry
      ? {
          src: this.evidence.assetUrl(entry.files.source),
          width: entry.source_width ?? null,
          height: entry.source_height ?? null,
        }
      : null;
  });

  /**
   * Every detector the picker offers, in the picker's own grouping and order,
   * whether or not a map for it was published. A detector the library is
   * missing is still a detector the studio will run, so it keeps its place and
   * says that nothing has been published for it yet.
   */
  public readonly galleryGroups = computed<readonly ControlMapGroup[]>(() => {
    if (!this.isGallery()) {
      return [];
    }
    return ANNOTATION_DETECTOR_GROUPS.map((group) => ({
      id: group.id,
      labelKey: annotationGroupLabelKey(group.id),
      introKey: `alchemy.usecases.control_map.group_${group.id}`,
      tiles: group.types.map((type) => {
        const entry = this.evidence.entryFor('control_map', 'annotation', type);
        return {
          type,
          result: entry?.files.result
            ? this.evidence.assetUrl(entry.files.result)
            : null,
          notes: entry?.notes ?? null,
          width: entry?.result_width ?? null,
          height: entry?.result_height ?? null,
        };
      }),
    }));
  });

  /**
   * The groups as the contents rail names them, and only once the sections they
   * point at are on the page: a rail whose lines lead nowhere is worse than no
   * rail. No glyph per line, because every group here belongs to the same part
   * of the studio and one mark seven times says nothing.
   */
  public readonly railEntries = computed<readonly GsIndexRailEntry[]>(() =>
    this.evidenceSettled() && this.gallerySource()
      ? this.galleryGroups().map((group) => ({
          id: group.id,
          labelKey: group.labelKey,
          hueClass: this.identity.className,
          targetId: `gs-ref-sec-${group.id}`,
        }))
      : [],
  );

  /** Open one map whole. The press is on the picture, so the picture is the way. */
  public openMap(tile: ControlMapTile, event: Event): void {
    this.enlargeTo(
      { src: tile.result ?? '', label: tile.type },
      tile.width,
      tile.height,
      event,
    );
  }

  /**
   * Open the one picture every map was read out of. It is named by the label
   * the frame already wears, which the template cannot hand over: a pipe is not
   * allowed in an action.
   */
  public openSource(
    source: { src: string; width: number | null; height: number | null },
    event: Event,
  ): void {
    this.enlargeTo(
      {
        src: source.src,
        label: this.transloco.translate('alchemy.usecases.evidence_source'),
      },
      source.width,
      source.height,
      event,
    );
  }

  /** One picture on the enlarging layer, with whatever the manifest says it is. */
  private enlargeTo(
    picture: { src: string; label: string },
    width: number | null,
    height: number | null,
    event: Event,
  ): void {
    const trigger = event.currentTarget;
    this.enlargedFrom = trigger instanceof HTMLElement ? trigger : null;
    this.enlargedMap.set({ ...picture, width, height });
  }

  public closeMap(): void {
    const trigger = this.enlargedFrom;
    this.enlargedFrom = null;
    this.enlargedMap.set(null);
    trigger?.focus();
  }

  private readonly neighbours = computed(() => {
    const at = ALCHEMY_USE_CASES.findIndex(
      (candidate) => candidate.id === this.useCase()?.id,
    );
    if (at === -1) {
      return { previous: null, next: null };
    }
    return {
      previous: this.onward(at - 1),
      next: this.onward(at + 1),
    };
  });

  public readonly previous = computed(() => this.neighbours().previous);
  public readonly next = computed(() => this.neighbours().next);

  constructor() {
    setPageMeta({
      titleKey: () => {
        const useCase = this.useCase();
        return useCase ? alchemyUseCaseTitleKey(useCase.id) : null;
      },
      descriptionKey: () => {
        const useCase = this.useCase();
        return useCase ? alchemyUseCaseLeadKey(useCase.id) : null;
      },
    });
    void this.evidence.ensureLoaded();

    // A URL naming nothing lands on the list rather than on an empty page:
    // these are URLs worth typing at, so getting one slightly wrong should show
    // a reader what there is. The name goes with it, so the list can say why it
    // is the page in front of them.
    effect(() => {
      const named = this.param();
      if (named !== '' && this.useCase() === null) {
        void this.router.navigateByUrl(DOCS_ALCHEMY, {
          state: { [DOCS_UNKNOWN_ID_STATE]: named },
        });
      }
    });
  }

  private onward(at: number): OnwardUseCase | null {
    const useCase = ALCHEMY_USE_CASES[at];
    return useCase
      ? {
          id: useCase.id,
          titleKey: alchemyUseCaseTitleKey(useCase.id),
          link: docsAlchemyUseCaseLink(useCase.id),
        }
      : null;
  }
}
