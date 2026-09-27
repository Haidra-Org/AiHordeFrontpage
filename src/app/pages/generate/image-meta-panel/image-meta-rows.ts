import { SectionIdentity, sectionIdentity } from '../../../content/sections';
import { settingSection } from '../../../content/settings';
import {
  FormLoraEntry,
  FormTiEntry,
  GenerateFormValue,
} from '../generate-form.model';

/** A parameter row: a human value plus the form fields applying it writes. */
export interface MetaRow {
  id: string;
  labelKey: string;
  value: string;
  keys: readonly (keyof GenerateFormValue)[];
  /** The panel card the field lives on, or null where it lives on none. */
  identity: SectionIdentity | null;
}

/** A row as it is written out, before the vocabulary says where its field is. */
type MetaRowSeed = Omit<MetaRow, 'identity'>;

export interface MetaGroup {
  id: string;
  titleKey: string;
  rows: MetaRow[];
}

/** What the caller lends the row builder: words, and names for asset ids. */
export interface MetaRowDeps {
  translate(key: string, params?: Record<string, unknown>): string;
  /** The human name of a CivitAI asset, or null while the id is unresolved. */
  assetLabel(id: string, isVersion: boolean): string | null;
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

function assetName(
  deps: MetaRowDeps,
  id: string,
  isVersion: boolean,
  label: string | undefined,
  fallbackKey: string,
): string {
  if (label) {
    return label;
  }
  const resolved = deps.assetLabel(id, isVersion);
  if (resolved) {
    return resolved;
  }
  // Never show a bare number: an unresolved id still reads as an identifier.
  return /^\d+$/.test(id) ? deps.translate(fallbackKey, { id }) : id;
}

function loraLabel(deps: MetaRowDeps, entry: FormLoraEntry): string {
  const name = assetName(
    deps,
    entry.name,
    entry.is_version === true,
    entry.label,
    'generate.results.meta_lora_id',
  );
  const attributes = [
    deps.translate('generate.results.meta_weight_model', {
      value: entry.model,
    }),
  ];
  // The clip weight is only worth showing when it diverges from the model one.
  if (entry.clip !== entry.model) {
    attributes.push(
      deps.translate('generate.results.meta_weight_clip', {
        value: entry.clip,
      }),
    );
  }
  if (entry.inject_trigger) {
    attributes.push(
      deps.translate('generate.results.meta_inject', {
        target: entry.inject_trigger,
      }),
    );
  }
  return `${name} (${attributes.join(', ')})`;
}

function tiLabel(deps: MetaRowDeps, entry: FormTiEntry): string {
  const name = assetName(
    deps,
    entry.name,
    false,
    entry.label,
    'generate.results.meta_ti_id',
  );
  const attributes = [
    deps.translate('generate.results.meta_weight_strength', {
      value: entry.strength,
    }),
  ];
  if (entry.inject_ti) {
    attributes.push(
      deps.translate('generate.results.meta_inject', {
        target: entry.inject_ti,
      }),
    );
  }
  return `${name} (${attributes.join(', ')})`;
}

/**
 * Every CivitAI id a value carries, so a caller can ask the resolver about all
 * of them before the rows are read.
 *
 * A textual inversion is always a model-page id: the horde's TI payload has no
 * version flag. A stored id that is really a version is repaired by the
 * resolver rather than guessed at here.
 */
export function metaAssetIds(
  value: GenerateFormValue,
): { id: string; isVersion: boolean }[] {
  return [
    ...value.loras.map((lora) => ({
      id: lora.name,
      isVersion: lora.is_version === true,
    })),
    ...value.tis.map((ti) => ({ id: ti.name, isVersion: false })),
  ];
}

/**
 * Turn a request, projected onto form fields, into the grouped rows the studio
 * reads a request by. The single source of that mapping: the results grid's
 * metadata panel and the pre-send review both render what this returns, so the
 * two can never describe the same request differently.
 */
export function buildMetaGroups(
  value: GenerateFormValue,
  deps: MetaRowDeps,
): MetaGroup[] {
  const t = (key: string): string => deps.translate(key);
  const on = t('generate.results.meta_on');
  const off = t('generate.results.meta_off');
  const label = (id: string): string => `generate.results.meta_row_${id}`;

  // An empty prompt is one the horde did not keep for a request read back
  // from it (a request to be sent is never empty), and a row for it would
  // apply nothing over the prompt already in the form.
  const prompt: MetaRowSeed[] = value.prompt
    ? [
        {
          id: 'prompt',
          labelKey: label('prompt'),
          value: value.prompt,
          keys: ['prompt'],
        },
      ]
    : [];
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
      id: 'schedule',
      labelKey: label('schedule'),
      value: value.scheduler,
      keys: ['scheduler'],
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
      value: value.loras.map((lora) => loraLabel(deps, lora)).join(' · '),
      keys: ['loras'],
    });
  }
  if (value.tis.length > 0) {
    sampling.push({
      id: 'tis',
      labelKey: label('tis'),
      value: value.tis.map((ti) => tiLabel(deps, ti)).join(' · '),
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
    // The mode alone no longer names what was sent: the same two chips cover
    // four of the horde's processings, and the choice that tells them apart
    // has to be both shown and carried, or re-applying this row would rebuild
    // a different request from the one it is describing.
    const detail = value.control_type
      ? value.control_type
      : value.sourceMode === 'img2img' && value.maskEnabled
        ? 'masked'
        : value.sourceMode === 'inpainting' && value.outpaintEnabled
          ? 'outpainting'
          : null;
    // A control strength set beside a control type reads as a further note on
    // the detail rather than a row of its own.
    const strength =
      value.control_type && value.control_strength !== null
        ? deps.translate('generate.results.meta_control_strength', {
            value: value.control_strength,
          })
        : null;
    const setup = detail ? `${value.sourceMode} · ${detail}` : value.sourceMode;
    sampling.push({
      id: 'source',
      labelKey: label('source'),
      value: strength ? `${setup} · ${strength}` : setup,
      keys: [
        'sourceMode',
        'maskEnabled',
        'outpaintEnabled',
        'outpaintAnchor',
        'denoising_strength',
        'control_type',
        'control_strength',
        'image_is_control',
        'return_control_map',
      ],
    });
  }

  // The QR workflow applies a control map of its own, with no control type and
  // often no source image, so a strength set under it belongs to the payload
  // row: anywhere else it would be shown nowhere and lost on re-apply.
  if (value.qrText) {
    const carried = value.sourceMode !== 'none' && value.control_type !== '';
    const qrStrength =
      !carried && value.control_strength !== null
        ? deps.translate('generate.results.meta_control_strength', {
            value: value.control_strength,
          })
        : null;
    sampling.push({
      id: 'qr',
      labelKey: label('qr'),
      value: qrStrength ? `${value.qrText} · ${qrStrength}` : value.qrText,
      keys: [
        'qrText',
        'qrXOffset',
        'qrYOffset',
        'qrModuleDrawer',
        ...(carried ? [] : (['control_strength'] as const)),
      ],
    });
  }

  return [
    ...(prompt.length > 0
      ? [
          {
            id: 'prompt',
            titleKey: 'generate.results.meta_group_prompt',
            rows: placed(prompt),
          },
        ]
      : []),
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
}
