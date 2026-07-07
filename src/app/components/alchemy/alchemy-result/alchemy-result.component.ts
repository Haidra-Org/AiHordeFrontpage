import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  input,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
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
import { copyToClipboard } from '../../../helper/copy-to-clipboard';
import { stringifyAsJson } from '../../../helper/json-formatter';

type ResultKind =
  | 'caption'
  | 'nsfw'
  | 'interrogation'
  | 'describe'
  | 'palette'
  | 'vectorize'
  | 'text'
  | 'image'
  | 'unknown';

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

interface DescribeField {
  key: string;
  label: string;
  value: string;
}

interface PaletteColor {
  hex: string;
  proportion: number;
  percentage: string;
}

const DESCRIBE_LABELS: Record<string, string> = {
  dhash: 'dHash',
  phash: 'pHash',
  width: 'Width',
  height: 'Height',
  format: 'Format',
  blurhash: 'BlurHash',
  has_alpha: 'Alpha channel',
  aspect_ratio: 'Aspect ratio',
};

const DESCRIBE_ORDER = [
  'format',
  'width',
  'height',
  'aspect_ratio',
  'has_alpha',
  'dhash',
  'phash',
  'blurhash',
] as const;

function sectionRank(key: string): number {
  const index = (SECTION_ORDER as readonly string[]).indexOf(key);
  return index === -1 ? SECTION_ORDER.length : index;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describeRank(key: string): number {
  const index = (DESCRIBE_ORDER as readonly string[]).indexOf(key);
  return index === -1 ? DESCRIBE_ORDER.length : index;
}

function extractSvgMarkup(value: string): string {
  const match = /<svg\b[\s\S]*<\/svg>/i.exec(value);
  return match?.[0].trim() ?? '';
}

function withSvgViewBox(svg: string): string {
  const openTagMatch = /^<svg\b[^>]*>/i.exec(svg);
  const openTag = openTagMatch?.[0];
  if (!openTag || /\sviewBox\s*=/i.test(openTag)) return svg;

  const width = /(?:^|\s)width\s*=\s*["']?([0-9.]+)/i.exec(openTag)?.[1];
  const height = /(?:^|\s)height\s*=\s*["']?([0-9.]+)/i.exec(openTag)?.[1];
  if (!width || !height) return svg;

  return svg.replace(
    openTag,
    openTag.replace(/>$/, ` viewBox="0 0 ${width} ${height}">`),
  );
}

function sanitizeSvgMarkup(svg: string): string {
  return withSvgViewBox(svg)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[\s\S]*?<\/embed>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s+(?:href|xlink:href)\s*=\s*"javascript:[^"]*"/gi, '')
    .replace(/\s+(?:href|xlink:href)\s*=\s*'javascript:[^']*'/gi, '')
    .replace(/\s+(?:href|xlink:href)\s*=\s*javascript:[^\s>]+/gi, '');
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly sanitizer = inject(DomSanitizer);

  public readonly form = input.required<AlchemyForm>();

  public readonly rawJsonOpen = signal(false);
  public readonly copiedRaw = signal(false);

  private copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  /** Tags shown per facet before the "+N more" reveal. */
  private static readonly SECTION_PREVIEW = 10;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.copyResetTimer != null) {
        clearTimeout(this.copyResetTimer);
      }
    });
  }

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
    if (f.form === 'describe' && this.describeFields().length > 0) {
      return 'describe';
    }
    if (f.form === 'palette' && this.paletteColors().length > 0) {
      return 'palette';
    }
    if (f.form === 'vectorize' && this.vectorSvgMarkup()) {
      return 'vectorize';
    }
    if (this.inlineText()) {
      return 'text';
    }
    if (this.imageUrl()) {
      return 'image';
    }
    return 'unknown';
  });

  public readonly caption = computed(() => this.form().result?.caption ?? '');

  public readonly nsfw = computed(() => this.form().result?.nsfw === true);

  /**
   * Newer alchemy data forms return inline values keyed by their form name
   * (for example `{ describe: "..." }`). Render primitive/stringifiable values
   * directly and keep the raw inspector available for the full shape.
   */
  public readonly inlineText = computed<string>(() => {
    const f = this.form();
    if (!(ALCHEMY_DATA_FORMS as readonly string[]).includes(f.form)) {
      return '';
    }
    const value = f.result?.[f.form];
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value) || (value && typeof value === 'object')) {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return '';
      }
    }
    return '';
  });

  public readonly describeFields = computed<DescribeField[]>(() => {
    const value = this.form().result?.['describe'];
    if (!isRecord(value)) return [];
    return Object.entries(value)
      .map(([key, rawValue]) => ({
        key,
        label: DESCRIBE_LABELS[key] ?? key,
        value: this.formatDescribeValue(key, rawValue),
      }))
      .sort((a, b) => describeRank(a.key) - describeRank(b.key));
  });

  public readonly describeSummary = computed(() => {
    const format = this.describeFieldValue('format');
    const width = this.describeFieldValue('width');
    const height = this.describeFieldValue('height');
    return [format, width && height ? `${width} x ${height}` : '']
      .filter(Boolean)
      .join(' · ');
  });

  public readonly paletteColors = computed<PaletteColor[]>(() => {
    const value = this.form().result?.['palette'];
    const colors = isRecord(value) ? value['colors'] : null;
    if (!Array.isArray(colors)) return [];
    return colors
      .filter((entry): entry is { hex: string; proportion: number } => {
        if (!isRecord(entry)) return false;
        return (
          typeof entry['hex'] === 'string' &&
          /^#[0-9a-f]{6}$/i.test(entry['hex']) &&
          typeof entry['proportion'] === 'number' &&
          Number.isFinite(entry['proportion'])
        );
      })
      .map((entry) => ({
        hex: entry.hex,
        proportion: Math.max(0, Math.min(1, entry.proportion)),
        percentage: this.formatPercent(entry.proportion),
      }));
  });

  public readonly paletteSummary = computed(() => {
    const colors = this.paletteColors();
    return colors.map((color) => color.hex).join(' ');
  });

  public readonly vectorSvgMarkup = computed<string>(() => {
    const value = this.form().result?.['vectorize'];
    if (typeof value !== 'string') return '';
    return extractSvgMarkup(value);
  });

  public readonly vectorSvgPreviewMarkup = computed<string>(() => {
    const svg = this.vectorSvgMarkup();
    if (!svg) return '';
    return sanitizeSvgMarkup(svg);
  });

  public readonly vectorSvgHtml = computed<SafeHtml | null>(() => {
    const svg = this.vectorSvgPreviewMarkup();
    if (!svg) return null;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });

  public readonly rawCopyText = computed<string>(() => {
    const f = this.form();
    const result = f.result;
    if (!result) return '';
    const formValue = result[f.form];
    const value = formValue === undefined ? result : formValue;
    if (typeof value === 'string') return value;
    return stringifyAsJson(value);
  });

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

  public async copyRaw(event: MouseEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const text = this.rawCopyText();
    if (!text) return;
    const copied = await copyToClipboard(text);
    if (!copied) return;

    this.copiedRaw.set(true);
    if (this.copyResetTimer != null) {
      clearTimeout(this.copyResetTimer);
    }
    this.copyResetTimer = setTimeout(() => {
      this.copiedRaw.set(false);
      this.copyResetTimer = null;
    }, 1500);
  }

  public openRawJson(): void {
    this.rawJsonOpen.set(true);
  }

  public closeRawJson(): void {
    this.rawJsonOpen.set(false);
  }

  private formatDescribeValue(key: string, value: unknown): string {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') {
      if (key === 'width' || key === 'height') return `${value}px`;
      if (key === 'aspect_ratio') return value.toFixed(4);
      return String(value);
    }
    if (typeof value === 'string') return value;
    return stringifyAsJson(value);
  }

  private formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  private describeFieldValue(key: string): string {
    return (
      this.describeFields().find((field) => field.key === key)?.value ?? ''
    );
  }
}
