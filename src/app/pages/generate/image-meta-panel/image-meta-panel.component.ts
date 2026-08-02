import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { ImageGenerationRequest } from '../../../types/generation';
import { CivitaiService } from '../../../services/civitai.service';
import {
  FormLoraEntry,
  FormTiEntry,
  GenerateFormValue,
  requestToFormValue,
} from '../generate-form.model';
import { ImageMetaProvenance } from '../image-metadata';
import { SectionIdentity, sectionIdentity } from '../../../content/sections';
import { settingSection } from '../../../content/settings';

/** How unchecked parameters are treated when the selection is applied. */
export type MetaApplyMode = 'replace' | 'overlay';

/** What the panel asks the studio to write back into the form. */
export interface MetaApplyEvent {
  localId: string;
  keys: (keyof GenerateFormValue)[];
  mode: MetaApplyMode;
}

/** A parameter row: a human value plus the form fields applying it writes. */
interface MetaRow {
  id: string;
  labelKey: string;
  value: string;
  keys: readonly (keyof GenerateFormValue)[];
  /** The panel card the field lives on, or null where it lives on none. */
  identity: SectionIdentity | null;
}

/** A row as it is written out, before the vocabulary says where its field is. */
type MetaRowSeed = Omit<MetaRow, 'identity'>;

interface MetaGroup {
  id: string;
  titleKey: string;
  rows: MetaRow[];
}

/**
 * Put each row on the card its field belongs to. Row ids are the studio's own
 * setting ids, so the vocabulary answers for them directly; a row it has no
 * answer for takes no mark rather than a neutral one.
 */
function placed(rows: MetaRowSeed[]): MetaRow[] {
  return rows.map((row) => ({
    ...row,
    identity: sectionIdentity(settingSection(row.id)),
  }));
}

/** A read-only provenance row: reported by the horde, never applicable. */
interface MetaInfoRow {
  label: string;
  value: string;
  tone: 'default' | 'good' | 'warn' | 'danger';
}

/** Cache key for a CivitAI lookup, mirroring the service's own keying. */
function nameKey(id: string, isVersion: boolean): string {
  return `${isVersion ? 'v' : 'm'}:${id}`;
}

/**
 * Compare two form-field values. Fields are scalars or arrays of small records
 * (loras/tis/post-processing), so a serialised comparison is both correct and
 * cheap enough for the handful of rows on screen.
 */
function sameFieldValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The structured view of one image's parameters. Groups everything the request
 * carries into readable rows, each of which can be individually deselected, and
 * emits the selection as a set of form-field keys for the studio to apply. It is
 * purely presentational: it neither reads nor writes the form, and the host owns
 * its placement (bottom sheet, docked column, or centred panel).
 */
@Component({
  selector: 'app-image-meta-panel',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './image-meta-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageMetaPanelComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly civitai = inject(CivitaiService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly request = input<ImageGenerationRequest | null>(null);
  public readonly provenance = input<ImageMetaProvenance | null>(null);
  /** The owning job, so the studio can re-attach its stored source image. */
  public readonly localId = input('');
  /**
   * The form as it stands now, so replace mode can mark the rows that would
   * actually change something. Null disables the markers.
   */
  public readonly currentValue = input<GenerateFormValue | null>(null);
  /** Which apply mode to open on; re-seeds {@link mode} when the host changes it. */
  public readonly defaultMode = input<MetaApplyMode>('replace');
  /** Whether the host keeps this panel open across images. */
  public readonly pinned = input(false);
  /** Whether pinning is on offer at all; hosts with nothing to pin turn it off. */
  public readonly pinnable = input(true);
  /** The panel's heading, so hosts that review something other than an image
   * can say what it is. */
  public readonly titleKey = input('generate.results.metadata_title');

  public readonly apply = output<MetaApplyEvent>();
  public readonly closed = output<void>();
  /** Ask the host to open the raw JSON view of the full metadata export. */
  public readonly rawJson = output<void>();
  public readonly pinToggle = output<void>();

  public readonly mode = linkedSignal(() => this.defaultMode());

  /** The request projected onto form fields; the source of every row's value. */
  private readonly formValue = computed<GenerateFormValue | null>(() => {
    const request = this.request();
    return request ? requestToFormValue(request) : null;
  });

  public readonly groups = computed<MetaGroup[]>(() => {
    const value = this.formValue();
    const request = this.request();
    if (!value || !request) {
      return [];
    }
    const t = (key: string): string => this.transloco.translate(key);
    const on = t('generate.results.meta_on');
    const off = t('generate.results.meta_off');
    const label = (id: string): string => `generate.results.meta_row_${id}`;

    const prompt: MetaRowSeed[] = [
      {
        id: 'prompt',
        labelKey: label('prompt'),
        value: value.prompt,
        keys: ['prompt'],
      },
    ];
    if (value.negativePrompt) {
      prompt.push({
        id: 'negative',
        labelKey: label('negative'),
        value: value.negativePrompt,
        keys: ['negativePrompt'],
      });
    }

    const sampling: MetaRowSeed[] = [
      {
        id: 'model',
        labelKey: label('model'),
        value: value.model || t('generate.results.meta_any_model'),
        keys: ['model'],
      },
      {
        id: 'sampler',
        labelKey: label('sampler'),
        value: value.sampler_name,
        keys: ['sampler_name'],
      },
      {
        id: 'steps',
        labelKey: label('steps'),
        value: String(value.steps),
        keys: ['steps'],
      },
      {
        id: 'cfg',
        labelKey: label('cfg'),
        value: String(value.cfg_scale),
        keys: ['cfg_scale'],
      },
      {
        id: 'seed',
        labelKey: label('seed'),
        value: value.seed || t('generate.results.meta_random'),
        keys: ['seed'],
      },
      {
        id: 'karras',
        labelKey: label('karras'),
        value: value.karras ? on : off,
        keys: ['karras'],
      },
      {
        id: 'hires',
        labelKey: label('hires'),
        value: value.hires_fix ? on : off,
        keys: ['hires_fix', 'hires_fix_denoising_strength'],
      },
    ];
    if (value.loras.length > 0) {
      sampling.push({
        id: 'loras',
        labelKey: label('loras'),
        value: value.loras.map((lora) => this.loraLabel(lora)).join(' · '),
        keys: ['loras'],
      });
    }
    if (value.tis.length > 0) {
      sampling.push({
        id: 'tis',
        labelKey: label('tis'),
        value: value.tis.map((ti) => this.tiLabel(ti)).join(' · '),
        keys: ['tis'],
      });
    }
    if (value.post_processing.length > 0) {
      sampling.push({
        id: 'post',
        labelKey: label('post'),
        value: value.post_processing.join(', '),
        keys: ['post_processing', 'facefixer_strength'],
      });
    }
    // The img2img/controlnet/inpainting setup only exists when the generation
    // actually used a source image, and it travels as one row: applying half of
    // it (a denoise without a source mode, say) would build an invalid request.
    if (value.sourceMode !== 'none') {
      sampling.push({
        id: 'source',
        labelKey: label('source'),
        value: value.control_type
          ? `${value.sourceMode} · ${value.control_type}`
          : value.sourceMode,
        keys: [
          'sourceMode',
          'denoising_strength',
          'control_type',
          'image_is_control',
          'return_control_map',
        ],
      });
    }

    return [
      {
        id: 'prompt',
        titleKey: 'generate.results.meta_group_prompt',
        rows: placed(prompt),
      },
      {
        id: 'sampling',
        titleKey: 'generate.results.meta_group_sampling',
        rows: placed(sampling),
      },
      {
        id: 'size',
        titleKey: 'generate.results.meta_group_size',
        rows: placed([
          {
            // Width and height are one row: nobody wants half a resolution.
            id: 'size',
            labelKey: label('size'),
            value: `${value.width} × ${value.height}`,
            keys: ['width', 'height'],
          },
        ]),
      },
    ];
  });

  // --- CivitAI asset names -------------------------------------------------

  /** Resolved display names, keyed as `m:<id>` / `v:<id>`. */
  private readonly resolvedNames = signal<ReadonlyMap<string, string>>(
    new Map(),
  );
  /** Ids already asked about (resolved or not), so each is fetched at most once. */
  private readonly requestedNames = new Set<string>();

  /**
   * Kick off a lookup for every CivitAI id in the current request. A stored
   * request only carries the identifier the user typed or picked, so a bare
   * numeric id is all a past generation has; anything non-numeric is already a
   * horde asset name and needs no lookup.
   */
  private resolveAssetNames(): void {
    const value = this.formValue();
    if (!value) {
      return;
    }
    const assets = [
      ...value.loras.map((lora) => ({
        id: lora.name,
        isVersion: lora.is_version === true,
      })),
      ...value.tis.map((ti) => ({ id: ti.name, isVersion: false })),
    ];
    for (const asset of assets) {
      if (!/^\d+$/.test(asset.id)) {
        continue;
      }
      const key = nameKey(asset.id, asset.isVersion);
      if (this.requestedNames.has(key)) {
        continue;
      }
      this.requestedNames.add(key);
      this.civitai
        .resolveName(asset.id, asset.isVersion)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((name) => {
          if (name) {
            this.resolvedNames.update((current) =>
              new Map(current).set(key, name),
            );
          }
        });
    }
  }

  /** The best name available right now: picked label, lookup, then the raw id. */
  private assetName(
    id: string,
    isVersion: boolean,
    label: string | undefined,
    fallbackKey: string,
  ): string {
    if (label) {
      return label;
    }
    const resolved = this.resolvedNames().get(nameKey(id, isVersion));
    if (resolved) {
      return resolved;
    }
    // Never show a bare number: an unresolved id still reads as an identifier.
    return /^\d+$/.test(id)
      ? this.transloco.translate(fallbackKey, { id })
      : id;
  }

  private loraLabel(entry: FormLoraEntry): string {
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.transloco.translate(key, params);
    const name = this.assetName(
      entry.name,
      entry.is_version === true,
      entry.label,
      'generate.results.meta_lora_id',
    );
    const attributes = [
      t('generate.results.meta_weight_model', {
        value: entry.model,
      }),
    ];
    // The clip weight is only worth showing when it diverges from the model one.
    if (entry.clip !== entry.model) {
      attributes.push(
        t('generate.results.meta_weight_clip', { value: entry.clip }),
      );
    }
    if (entry.inject_trigger) {
      attributes.push(
        t('generate.results.meta_inject', { target: entry.inject_trigger }),
      );
    }
    return `${name} (${attributes.join(', ')})`;
  }

  private tiLabel(entry: FormTiEntry): string {
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.transloco.translate(key, params);
    const name = this.assetName(
      entry.name,
      false,
      entry.label,
      'generate.results.meta_ti_id',
    );
    const attributes = [
      t('generate.results.meta_weight_strength', { value: entry.strength }),
    ];
    if (entry.inject_ti) {
      attributes.push(
        t('generate.results.meta_inject', { target: entry.inject_ti }),
      );
    }
    return `${name} (${attributes.join(', ')})`;
  }

  public readonly infoRows = computed<MetaInfoRow[]>(() => {
    const provenance = this.provenance();
    if (!provenance) {
      return [];
    }
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.transloco.translate(key, params);
    const rows: MetaInfoRow[] = [];
    if (provenance.styleName) {
      rows.push({
        label: t('generate.results.meta_row_style'),
        value: provenance.styleName,
        tone: 'default',
      });
    }
    const worker = provenance.workerName ?? provenance.workerId;
    if (worker) {
      rows.push({
        label: t('generate.results.meta_row_worker'),
        value: worker,
        tone: 'default',
      });
    }
    if (provenance.state) {
      rows.push({
        label: t('generate.results.meta_row_state'),
        value: provenance.state,
        tone: 'default',
      });
    }
    if (provenance.censored) {
      rows.push({
        label: t('generate.results.meta_nsfw'),
        value: provenance.censorReason
          ? t('generate.results.censor_' + provenance.censorReason)
          : t('generate.results.meta_flagged'),
        tone: provenance.censorReason === 'csam' ? 'danger' : 'warn',
      });
    }
    if (provenance.aesthetic != null) {
      rows.push({
        label: t('generate.results.meta_aesthetic'),
        value: provenance.aesthetic.toFixed(2),
        tone: 'good',
      });
    }
    for (const error of provenance.errors) {
      rows.push({
        label: t('generate.results.meta_error', { field: error.type }),
        value: t('generate.results.error_' + error.value),
        tone: 'danger',
      });
    }
    return rows;
  });

  /**
   * Row ids the user has deselected. Rows start checked, and navigating the
   * viewer to another image resets the selection so it always describes the
   * image on screen rather than the previous one.
   */
  private readonly unchecked = linkedSignal<
    ImageGenerationRequest | null,
    ReadonlySet<string>
  >({
    source: this.request,
    computation: () => new Set<string>(),
  });

  /** Every form field the current selection would write, in group order. */
  public readonly selectedKeys = computed<(keyof GenerateFormValue)[]>(() => {
    const unchecked = this.unchecked();
    const keys: (keyof GenerateFormValue)[] = [];
    for (const group of this.groups()) {
      for (const row of group.rows) {
        if (!unchecked.has(row.id)) {
          keys.push(...row.keys);
        }
      }
    }
    return keys;
  });

  public readonly selectedCount = computed(() => this.selectedKeys().length);

  /**
   * Every form field this panel puts on offer, selected or not. A host applying
   * the selection over a value of its own needs this to tell the fields the user
   * declined from the ones the panel never showed them.
   */
  public readonly offeredKeys = computed<(keyof GenerateFormValue)[]>(() => {
    const keys: (keyof GenerateFormValue)[] = [];
    for (const group of this.groups()) {
      for (const row of group.rows) {
        keys.push(...row.keys);
      }
    }
    return keys;
  });

  /**
   * Rows whose incoming value is not what the form currently holds. Only
   * meaningful in replace mode, where every row is written and the unchecked
   * ones are reset, so "differs" tells the user what a full apply would change.
   */
  private readonly differingRows = computed<ReadonlySet<string>>(() => {
    const current = this.currentValue();
    const incoming = this.formValue();
    const ids = new Set<string>();
    if (!current || !incoming) {
      return ids;
    }
    for (const group of this.groups()) {
      for (const row of group.rows) {
        if (
          row.keys.some((key) => !sameFieldValue(incoming[key], current[key]))
        ) {
          ids.add(row.id);
        }
      }
    }
    return ids;
  });

  public isDifferent(row: MetaRow): boolean {
    return this.mode() === 'replace' && this.differingRows().has(row.id);
  }

  /** Whether the delta legend is worth showing at all. */
  public readonly hasDifferences = computed(
    () => this.mode() === 'replace' && this.differingRows().size > 0,
  );

  public isChecked(row: MetaRow): boolean {
    return !this.unchecked().has(row.id);
  }

  public toggleRow(row: MetaRow): void {
    this.unchecked.update((current) => {
      const next = new Set(current);
      if (!next.delete(row.id)) {
        next.add(row.id);
      }
      return next;
    });
  }

  /** Whether a group is fully, partly, or not selected (drives the tri-state). */
  public groupState(group: MetaGroup): 'all' | 'some' | 'none' {
    const unchecked = this.unchecked();
    const off = group.rows.filter((row) => unchecked.has(row.id)).length;
    if (off === 0) {
      return 'all';
    }
    return off === group.rows.length ? 'none' : 'some';
  }

  /** Select the whole group unless it is already fully selected. */
  public toggleGroup(group: MetaGroup): void {
    const select = this.groupState(group) !== 'all';
    this.unchecked.update((current) => {
      const next = new Set(current);
      for (const row of group.rows) {
        if (select) {
          next.delete(row.id);
        } else {
          next.add(row.id);
        }
      }
      return next;
    });
  }

  public setMode(mode: MetaApplyMode): void {
    this.mode.set(mode);
  }

  public emitApply(): void {
    const keys = this.selectedKeys();
    if (keys.length === 0) {
      return;
    }
    this.apply.emit({ localId: this.localId(), keys, mode: this.mode() });
  }

  public close(): void {
    this.closed.emit();
  }

  constructor() {
    effect(() => this.resolveAssetNames());
  }
}
