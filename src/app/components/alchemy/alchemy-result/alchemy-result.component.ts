import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  AlchemyForm,
  InterrogationDetails,
  ALCHEMY_DATA_FORMS,
} from '../../../types/generation';
import {
  isLikelyImageFileLink,
  sanitizeGenerationResponsePayload,
  toRenderableImageSource,
} from '../../../helper/generation-image';
import { JsonInspectorComponent } from '../../json-inspector/json-inspector.component';
import type { JsonInspectorSection } from '../../json-inspector/json-inspector.component';
import { JsonInspectorTriggerComponent } from '../../json-inspector-trigger/json-inspector-trigger.component';
import { IconComponent } from '../../icon/icon.component';

type ResultKind = 'caption' | 'nsfw' | 'interrogation' | 'image' | 'unknown';

/** Display order for interrogation sections: subject first, provenance last. */
const SECTION_ORDER = [
  'tags',
  'mediums',
  'techniques',
  'movements',
  'flavors',
  'artists',
  'sites',
] as const;

interface InterrogationEntry {
  text: string;
  confidence: number;
  /** Bar width 0-100, normalized to the strongest tag in its own section. */
  weight: number;
}

interface InterrogationSection {
  key: string;
  entries: InterrogationEntry[];
}

function sectionRank(key: string): number {
  const index = (SECTION_ORDER as readonly string[]).indexOf(key);
  return index === -1 ? SECTION_ORDER.length : index;
}

/**
 * Renders a single completed alchemy form result, dispatching on form name.
 * Known shapes get a tailored view; anything unrecognized falls back to a raw
 * JSON dump so an unexpected worker payload can never break the page.
 */
@Component({
  selector: 'app-alchemy-result',
  imports: [
    TranslocoPipe,
    JsonInspectorComponent,
    JsonInspectorTriggerComponent,
    IconComponent,
  ],
  templateUrl: './alchemy-result.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlchemyResultComponent {
  public readonly form = input.required<AlchemyForm>();

  public readonly rawJsonOpen = signal(false);

  /** Tags shown per facet before the "+N more" reveal. */
  private static readonly SECTION_PREVIEW = 10;

  /**
   * Per-result open state. `null` means "follow the default for this kind":
   * compact results (caption, image, nsfw) open on their own, but an
   * interrogation, which is by far the tallest, stays folded to its summary
   * until asked for. A manual toggle pins an explicit value.
   */
  private readonly openOverride = signal<boolean | null>(null);

  public readonly isOpen = computed(() => {
    const override = this.openOverride();
    if (override !== null) return override;
    return this.kind() !== 'interrogation';
  });

  public toggleOpen(): void {
    this.openOverride.set(!this.isOpen());
  }

  /** Facets whose full tag list has been revealed past the preview cap. */
  private readonly expandedSections = signal<ReadonlySet<string>>(new Set());

  public isSectionExpanded(key: string): boolean {
    return this.expandedSections().has(key);
  }

  public toggleSection(key: string): void {
    this.expandedSections.update((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  public visibleEntries(section: InterrogationSection): InterrogationEntry[] {
    if (this.isSectionExpanded(section.key)) return section.entries;
    return section.entries.slice(0, AlchemyResultComponent.SECTION_PREVIEW);
  }

  public hiddenCount(section: InterrogationSection): number {
    return Math.max(
      0,
      section.entries.length - AlchemyResultComponent.SECTION_PREVIEW,
    );
  }

  /** Confidence band driving a tag row's visual weight (text + bar emphasis). */
  public tagTier(weight: number): 'high' | 'mid' | 'low' {
    if (weight >= 75) return 'high';
    if (weight >= 40) return 'mid';
    return 'low';
  }

  /** True when this form returns an image rather than text/data. */
  public readonly returnsImage = computed(
    () => !(ALCHEMY_DATA_FORMS as readonly string[]).includes(this.form().form),
  );

  public readonly kind = computed<ResultKind>(() => {
    const f = this.form();
    const result = f.result;
    if (!result) return 'unknown';

    if (f.form === 'caption' && typeof result.caption === 'string') {
      return 'caption';
    }
    if (f.form === 'nsfw' && typeof result.nsfw === 'boolean') {
      return 'nsfw';
    }
    if (f.form === 'interrogation' && this.interrogationDetails()) {
      return 'interrogation';
    }
    if (this.imageUrl()) {
      return 'image';
    }
    return 'unknown';
  });

  public readonly caption = computed(() => this.form().result?.caption ?? '');

  public readonly nsfw = computed(() => this.form().result?.nsfw === true);

  /**
   * The interrogation payload. Workers normally nest it under `interrogation`,
   * but tolerate an unwrapped payload (section arrays at the result root) so a
   * minor server shape change never hides the tags.
   */
  private readonly interrogationDetails = computed<InterrogationDetails | null>(
    () => {
      const f = this.form();
      if (f.form !== 'interrogation' || !f.result) return null;
      if (f.result.interrogation) return f.result.interrogation;
      const hasSectionArrays = Object.values(f.result).some((v) =>
        Array.isArray(v),
      );
      return hasSectionArrays
        ? (f.result as unknown as InterrogationDetails)
        : null;
    },
  );

  /** Post-processor forms key the result by the form name with an image URL. */
  public readonly imageUrl = computed<string | null>(() => {
    const f = this.form();
    if ((ALCHEMY_DATA_FORMS as readonly string[]).includes(f.form)) {
      return null;
    }
    const value = f.result?.[f.form];
    if (typeof value === 'string' && isLikelyImageFileLink(value)) {
      return toRenderableImageSource(value);
    }
    return null;
  });

  public readonly sections = computed<InterrogationSection[]>(() => {
    const details = this.interrogationDetails();
    if (!details) return [];
    return Object.entries(details)
      .filter(
        (entry): entry is [string, InterrogationEntry[]] =>
          Array.isArray(entry[1]) && entry[1].length > 0,
      )
      .map(([key, entries]) => {
        const sorted = [...entries].sort((a, b) => b.confidence - a.confidence);
        const top = sorted[0]?.confidence ?? 0;
        return {
          key,
          entries: sorted.map((tag) => ({
            text: tag.text,
            confidence: tag.confidence,
            weight: top > 0 ? Math.round((tag.confidence / top) * 100) : 0,
          })),
        };
      })
      .sort((a, b) => sectionRank(a.key) - sectionRank(b.key));
  });

  public readonly facetCount = computed(() => this.sections().length);

  public readonly totalTags = computed(() =>
    this.sections().reduce((sum, section) => sum + section.entries.length, 0),
  );

  public readonly rawJsonSections = computed<readonly JsonInspectorSection[]>(
    () => {
      const result = this.form().result;
      if (result === undefined) return [];
      return [
        {
          id: 'result',
          label: this.form().form,
          value: sanitizeGenerationResponsePayload(result),
        },
      ];
    },
  );

  public formatConfidence(confidence: number): string {
    return `${confidence.toFixed(1)}%`;
  }

  public openRawJson(): void {
    this.rawJsonOpen.set(true);
  }

  public closeRawJson(): void {
    this.rawJsonOpen.set(false);
  }
}
