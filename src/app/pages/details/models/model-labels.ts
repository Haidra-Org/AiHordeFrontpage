/**
 * How the model pages print the numbers and tokens the reference publishes.
 * Both the list and a model's own page read these, so the same model reads the
 * same way wherever it appears.
 */

import {
  baselineSupportsControlNet,
  baselineSupportsMask,
  baselineSupportsQrCode,
  baselineSupportsRemix,
  baselineSupportsTransparent,
} from '../../../services/model-reference.service';

/**
 * The name a reader knows a model family by. The reference records the family
 * in the API's own vocabulary; a family that is not listed here reads as the
 * recorded token rather than being hidden, so a family the horde adds later
 * still names itself.
 */
const BASELINE_LABELS: Record<string, string> = {
  stable_diffusion_1: 'SD 1.5',
  stable_diffusion_2: 'SD 2',
  stable_diffusion_2_512: 'SD 2',
  stable_diffusion_2_768: 'SD 2 (768)',
  stable_diffusion_xl: 'SDXL',
  stable_cascade: 'Stable Cascade',
  flux_1: 'Flux',
  qwen_image: 'Qwen Image',
  z_image_turbo: 'Z-Image Turbo',
};

/** The printed name of a baseline, or the recorded token when it has none. */
export function baselineLabel(baseline: string): string {
  return BASELINE_LABELS[baseline] ?? baseline;
}

/** Print a weight count the way its publisher writes it: 7B, 3.5B, 780M. */
export function formatParameterCount(parameters: number | null): string {
  if (parameters === null || parameters <= 0) {
    return '';
  }
  if (parameters >= 1e9) {
    const billions = parameters / 1e9;
    const rounded =
      billions >= 10 ? Math.round(billions) : Number(billions.toFixed(1));
    return `${rounded}B`;
  }
  if (parameters >= 1e6) {
    return `${Math.round(parameters / 1e6)}M`;
  }
  return String(parameters);
}

/**
 * Print a download size in the units a reader sees on their own disk. Powers of
 * 1024, because that is what an operating system reports for the same file.
 */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) {
    return '';
  }
  const gigabytes = bytes / 1024 ** 3;
  if (gigabytes >= 1) {
    return `${gigabytes.toFixed(gigabytes >= 10 ? 0 : 1)} GB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/** One extra thing a model can do beyond making a picture from a prompt. */
export interface ModelCapability {
  id: string;
  labelKey: string;
  icon: string;
}

/**
 * What a baseline adds beyond making a picture. Each entry is read from the
 * same table the studio gates its own controls with, so the list, a model's
 * page and the studio cannot disagree about what a model will accept.
 */
const CAPABILITY_RULES: readonly (ModelCapability & {
  supports: (baseline: string | null) => boolean;
})[] = [
  {
    id: 'controlnet',
    labelKey: 'details.models.capability.controlnet',
    icon: 'adjustments-horizontal',
    supports: baselineSupportsControlNet,
  },
  {
    id: 'mask',
    labelKey: 'details.models.capability.mask',
    icon: 'paintbrush',
    supports: baselineSupportsMask,
  },
  {
    id: 'remix',
    labelKey: 'details.models.capability.remix',
    icon: 'refresh-alt',
    supports: baselineSupportsRemix,
  },
  {
    id: 'qr_code',
    labelKey: 'details.models.capability.qr_code',
    icon: 'squares-2x2',
    supports: baselineSupportsQrCode,
  },
  {
    id: 'transparent',
    labelKey: 'details.models.capability.transparent',
    icon: 'photo-alt',
    supports: baselineSupportsTransparent,
  },
];

/** Every extra a baseline offers, in the order they are always listed in. */
export function capabilitiesFor(baseline: string): ModelCapability[] {
  // A model the reference has never heard of has no baseline to read, and the
  // rules answer "allow" for an unknown one, so nothing is claimed for it.
  if (baseline === '') {
    return [];
  }
  return CAPABILITY_RULES.filter((rule) => rule.supports(baseline)).map(
    ({ id, labelKey, icon }) => ({ id, labelKey, icon }),
  );
}

/** Every extra the list offers to narrow by. */
export function allCapabilities(): ModelCapability[] {
  return CAPABILITY_RULES.map(({ id, labelKey, icon }) => ({
    id,
    labelKey,
    icon,
  }));
}
