import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { GsParamEntryComponent } from '../../../components/gs-param-entry/gs-param-entry.component';
import { IconComponent } from '../../../components/icon/icon.component';
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
  model: string | null;
  notes: string | null;
}

/** One detector's map in the control map gallery. */
interface ControlMapTile {
  /** The horde's own spelling, which is what a reader picks in the studio. */
  type: string;
  result: string | null;
  notes: string | null;
}

/** The detectors that read the same kind of structure, shown together. */
interface ControlMapGroup {
  id: string;
  labelKey: string;
  introKey: string;
  tiles: readonly ControlMapTile[];
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
  imports: [TranslocoPipe, RouterLink, IconComponent, GsParamEntryComponent],
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

  /** True once the library has answered, whichever way it answered. */
  public readonly evidenceSettled = this.evidence.isSettled;

  public readonly shots = computed<readonly EvidenceShot[]>(() => {
    const useCase = this.useCase();
    if (!useCase) {
      return [];
    }
    return this.evidence.entriesFor(useCase.id).map((entry) => ({
      form: entry.form,
      formNameKey: alchemyFormNameKey(entry.form),
      title: entry.title,
      source: this.evidence.assetUrl(entry.files.source),
      result: entry.files.result
        ? this.evidence.assetUrl(entry.files.result)
        : null,
      text: this.evidence.resultText(entry),
      model: entry.model ?? null,
      notes: entry.notes ?? null,
    }));
  });

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

  /** The one picture every map on the page was read out of. */
  public readonly gallerySource = computed(() => {
    if (!this.isGallery()) {
      return null;
    }
    const entry = this.evidence.entryFor('control_map', 'annotation');
    return entry ? this.evidence.assetUrl(entry.files.source) : null;
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
        };
      }),
    }));
  });

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
    // a reader what there is.
    effect(() => {
      if (this.param() !== '' && this.useCase() === null) {
        void this.router.navigateByUrl(DOCS_ALCHEMY);
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
