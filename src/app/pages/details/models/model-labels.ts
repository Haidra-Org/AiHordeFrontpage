/**
 * How the model pages print the numbers and tokens the reference publishes.
 * Both the list and a model's own page read these, so the same model reads the
 * same way wherever it appears.
 */

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
