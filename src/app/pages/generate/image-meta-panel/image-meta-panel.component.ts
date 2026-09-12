import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { ImageGenerationRequest } from '../../../types/generation';
import { CivitaiResolverService } from '../../../services/civitai-resolver.service';
import { GenerateFormValue, requestToFormValue } from '../generate-form.model';
import { PromptCheckReport } from '../../../helper/prompt-check';
import {
  ImageMetaProvenance,
  imageErrorFieldKey,
  imageErrorReasonKey,
  kudosDiverged,
} from '../image-metadata';
import {
  MetaGroup,
  MetaRow,
  MetaRowDeps,
  buildMetaGroups,
  metaAssetIds,
} from './image-meta-rows';

/** How unchecked parameters are treated when the selection is applied. */
export type MetaApplyMode = 'replace' | 'overlay';

/**
 * What the panel knows about the picture having been read back and compared
 * with its prompt. The host owns the reading and the comparison; the panel is
 * handed the answer and draws it.
 */
export interface PromptCheckView {
  /** The comparison, or null while the picture has not been read. */
  report: PromptCheckReport | null;
  /** A reading is on its way. */
  reading: boolean;
  /** A text model is being asked for its opinion. */
  judging: boolean;
  /** Why the last reading produced nothing, as a line to show. */
  failedKey: string | null;
  /** The opinion a text model gave, once there is one. */
  verdict: { text: string; model: string } | null;
  /** What asking for an opinion would cost, where the horde has quoted it. */
  verdictPrice: number | null;
  /**
   * What reading the picture back would cost. The alchemy queue has no dry
   * run, so the host works it out from the horde's pricing rule; null where it
   * cannot be worked out, and then nothing is shown.
   */
  readPrice: number | null;
}

/** Which of the prompt check's three buttons was pressed. */
export interface PromptCheckAction {
  kind: 'check' | 'judge' | 'again';
}

/** A change to the prompt the reader asked for from the comparison. */
export interface PromptEditRequest {
  kind: 'emphasize' | 'negative';
  text: string;
}

/** What the panel asks the studio to write back into the form. */
/** The three things to do with a finished image, wherever it is shown. */
export type ImageQuickAction = 'variation' | 'source' | 'copy';

export interface MetaApplyEvent {
  localId: string;
  keys: (keyof GenerateFormValue)[];
  mode: MetaApplyMode;
}

/** A read-only provenance row: reported by the horde, never applicable. */
interface MetaInfoRow {
  label: string;
  value: string;
  tone: 'default' | 'good' | 'warn' | 'danger';
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
  private readonly resolver = inject(CivitaiResolverService);

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
  /**
   * Whether the panel is a region of a larger surface rather than the dialog
   * it is in the studio. Embedded, it reads the request out and does nothing
   * else: no dialog role of its own to take the surround's other controls out
   * of reach, no close of its own where the host owns the close, and no row
   * checkboxes or apply, because there is no form here to write to.
   */
  public readonly embedded = input(false);
  /** Whether the host keeps this panel open across images. */
  public readonly pinned = input(false);
  /** Whether pinning is on offer at all; hosts with nothing to pin turn it off. */
  public readonly pinnable = input(true);
  /** The panel's heading, so hosts that review something other than an image
   * can say what it is. */
  public readonly titleKey = input('generate.results.metadata_title');
  /**
   * A line explaining why there are no settings rows, for an image whose
   * request this browser never held. Shown in place of them, and null where
   * there is a request to read.
   */
  public readonly noteKey = input<string | null>(null);

  /**
   * Whether the panel offers the three whole-image actions above its own row of
   * checkboxes. Off for hosts reviewing a saved preset, where there is no image
   * to make a variation of or hand to the source slot.
   */
  public readonly quickActions = input(false);

  /**
   * The picture read back against its prompt. Null leaves the block out
   * altogether, which is the answer for a picture whose prompt this browser
   * never held.
   */
  public readonly promptCheckView = input<PromptCheckView | null>(null);

  public readonly apply = output<MetaApplyEvent>();
  public readonly closed = output<void>();
  /** Ask the host to open the raw JSON view of the full metadata export. */
  public readonly rawJson = output<void>();
  public readonly pinToggle = output<void>();
  /** One of the three whole-image actions; the host owns what each one does. */
  public readonly quickAction = output<ImageQuickAction>();
  /** Ask the host to read the picture, ask for an opinion, or read it again. */
  public readonly promptCheck = output<PromptCheckAction>();
  /** Ask the host to change the prompt the comparison was made against. */
  public readonly promptEdit = output<PromptEditRequest>();

  public readonly mode = linkedSignal(() => this.defaultMode());

  /** The request projected onto form fields; the source of every row's value. */
  private readonly formValue = computed<GenerateFormValue | null>(() => {
    const request = this.request();
    return request ? requestToFormValue(request) : null;
  });

  /**
   * What the row builder needs from this component's injectables. Read inside
   * the computed below, so a name arriving from the resolver still re-runs it.
   */
  private readonly rowDeps: MetaRowDeps = {
    translate: (key, params) => this.transloco.translate(key, params),
    assetLabel: (id, isVersion) =>
      this.resolver.metaFor({ id, isVersion })?.label ?? null,
  };

  public readonly groups = computed<MetaGroup[]>(() => {
    const value = this.formValue();
    return value ? buildMetaGroups(value, this.rowDeps) : [];
  });

  // --- CivitAI asset names -------------------------------------------------

  /**
   * Ask about every CivitAI id in the current request. A stored request carries
   * only the identifier it was given, so a bare number is all a past generation
   * has; the resolver is shared with the studio's own LoRA card so the two
   * cannot disagree about what an asset is called.
   */
  private resolveAssetNames(): void {
    const value = this.formValue();
    if (value) {
      this.resolver.requestAll(metaAssetIds(value));
    }
  }

  public readonly infoRows = computed<MetaInfoRow[]>(() => {
    const provenance = this.provenance();
    if (!provenance) {
      return [];
    }
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.transloco.translate(key, params);
    const rows: MetaInfoRow[] = [];
    // With no request there are no settings rows, so the two things the worker
    // reported that would normally be read off the request are said here
    // instead of being lost.
    if (!this.formValue()) {
      if (provenance.model) {
        rows.push({
          label: t('generate.results.meta_row_model'),
          value: provenance.model,
          tone: 'default',
        });
      }
      if (provenance.seed) {
        rows.push({
          label: t('generate.results.meta_row_seed'),
          value: provenance.seed,
          tone: 'default',
        });
      }
    }
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
      const csam = provenance.censorReason === 'csam';
      rows.push({
        label: t('generate.results.meta_nsfw'),
        value: provenance.censorReason
          ? t('generate.results.censor_' + provenance.censorReason)
          : t('generate.results.meta_flagged'),
        tone: csam ? 'danger' : 'warn',
      });
      if (csam) {
        rows.push({
          label: t('generate.results.censor_csam_details'),
          value: t('generate.results.censor_csam_explanation'),
          tone: 'default',
        });
      }
    }
    if (provenance.aesthetic != null) {
      rows.push({
        label: t('generate.results.meta_aesthetic'),
        value: provenance.aesthetic.toFixed(2),
        tone: 'good',
      });
    }
    // What it was quoted against what it cost. Shown together, and flagged only
    // when they part by more than the fractional tail both carry.
    const kudos = provenance.kudos;
    if (kudos?.quoted != null || kudos?.charged != null) {
      const diverged = kudosDiverged(kudos);
      rows.push({
        label: t('generate.results.meta_kudos'),
        value:
          kudos.quoted == null || kudos.charged == null
            ? t('generate.results.meta_kudos_one', {
                kudos: Math.round(kudos.charged ?? kudos.quoted ?? 0),
              })
            : t(
                diverged
                  ? 'generate.results.meta_kudos_diverged'
                  : 'generate.results.meta_kudos_both',
                {
                  quoted: Math.round(kudos.quoted),
                  charged: Math.round(kudos.charged),
                },
              ),
        tone: diverged ? 'warn' : 'default',
      });
    }
    for (const error of provenance.errors) {
      rows.push({
        label: t(imageErrorFieldKey(error.type)),
        value: t(imageErrorReasonKey(error.value)),
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

  /** The mark a phrase wears, so the three answers differ by shape as well. */
  public stateIcon(
    state: PromptCheckReport['phrases'][number]['state'],
  ): string {
    if (state === 'found') return 'check-circle';
    return state === 'partly' ? 'info-circle' : 'x-circle';
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
