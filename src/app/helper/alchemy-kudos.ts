/**
 * What an alchemy request costs, worked out before it is sent.
 *
 * The alchemy queue has no dry run, so a surface that submits one has nothing
 * to quote unless it prices the request itself. The horde charges
 * interrogation forms by a fixed rule rather than by how hard the work turns
 * out to be, so the same rule can be applied here and the answer stated to the
 * reader before they press anything.
 */
import { ALCHEMY_POST_PROCESSOR_FORMS } from '../types/generation';

/**
 * The forms that hand back a processed picture: upscalers, face fixers and
 * background removal. They are the ones priced by the size of the picture
 * rather than at a flat rate.
 */
export const IMAGE_RESULT_ALCHEMY_FORMS: readonly string[] =
  ALCHEMY_POST_PROCESSOR_FORMS;

const IMAGE_RESULT_FORM_SET: ReadonlySet<string> = new Set(
  IMAGE_RESULT_ALCHEMY_FORMS,
);

/**
 * Control maps are priced by the tile count times a per-detector figure that
 * is not modelled here. Quoting them would mean guessing, so a request that
 * asks for one is left unpriced.
 */
const UNPRICED_FORMS: ReadonlySet<string> = new Set(['annotation']);

/** The square the horde counts a picture in when it charges by area. */
const TILE_EDGE = 512;

/** What one tile of a processed picture costs. */
const IMAGE_RESULT_KUDOS_PER_TILE = 3;

/** The flat rate of a form that returns text or structured data. */
const DEFAULT_FORM_KUDOS = 1;

/** The forms the horde charges more than the flat rate for. */
const FORM_KUDOS: ReadonlyMap<string, number> = new Map([['interrogation', 3]]);

/** Every form burns one more on the way out, whatever it cost to ask for. */
const COMPLETION_KUDOS = 1;

/** Letting a slow worker take the job costs one more per form again. */
const SLOW_WORKER_KUDOS = 1;

/** How the caller says what is being priced. */
export interface AlchemyKudosOptions {
  /** Whether the request lets slow workers take it. */
  slowWorkers: boolean;
  /** The picture's width, needed only for the forms priced by area. */
  width?: number;
  /** The picture's height, needed only for the forms priced by area. */
  height?: number;
}

/** Whether a dimension can be counted in tiles. */
function isUsableSize(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * The number of 512px squares a picture covers, each partial square counting
 * as a whole one.
 */
export function alchemyImageTiles(width: number, height: number): number {
  return Math.ceil(width / TILE_EDGE) * Math.ceil(height / TILE_EDGE);
}

/**
 * What a set of alchemy forms would cost on one picture, or null when the
 * request holds something this cannot price: a control map, or a form charged
 * by area on a picture whose size the caller did not give. A caller that gets
 * null shows no figure, which is better than showing a wrong one.
 */
export function estimateAlchemyKudos(
  forms: readonly string[],
  options: AlchemyKudosOptions,
): number | null {
  const perForm =
    COMPLETION_KUDOS + (options.slowWorkers ? SLOW_WORKER_KUDOS : 0);
  let total = 0;
  for (const form of forms) {
    if (UNPRICED_FORMS.has(form)) {
      return null;
    }
    if (IMAGE_RESULT_FORM_SET.has(form)) {
      if (!isUsableSize(options.width) || !isUsableSize(options.height)) {
        return null;
      }
      total +=
        alchemyImageTiles(options.width, options.height) *
        IMAGE_RESULT_KUDOS_PER_TILE;
    } else {
      total += FORM_KUDOS.get(form) ?? DEFAULT_FORM_KUDOS;
    }
    total += perForm;
  }
  return total;
}
