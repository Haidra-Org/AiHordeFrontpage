import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  SECTION_BY_HELP_TOPIC,
  SECTION_IDENTITIES,
  SectionId,
  SectionIdentity,
} from '../../pages/generate/section-identity';
import { IconComponent } from '../icon/icon.component';

/** The params block of a submitted request, as far as the chips read it. */
export interface RecipeParams {
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  sampler_name?: string;
  seed?: string | number;
  denoising_strength?: number;
  karras?: boolean;
  hires_fix?: boolean;
  post_processing?: readonly string[];
  n?: number;
}

/**
 * A submitted request, as far as the chips read it. Everything else the payload
 * carries is left to the raw view: the chips are a reading of what shaped the
 * image, not a rendering of the file.
 */
export interface RecipeRequest {
  models?: readonly string[];
  params?: RecipeParams;
}

/** One field of the request, ready to render. */
export interface RecipeChip {
  /** The field the chip stands for, and what it is tracked and tested by. */
  id: string;
  identity: SectionIdentity;
  labelKey: string;
  /** The value as it reads, for fields whose value is data rather than a state. */
  value: string;
  /** Set instead of `value` where the value is a state the page has words for. */
  valueKey?: string;
}

/**
 * The panel area each field belongs to. Fields the panel carries a `?` note for
 * are read through the help-topic map, so a chip cannot come to wear a
 * different glyph from the note about the same setting. `model` and `size` have
 * no help topic of their own and name their area directly.
 */
const FIELD_SECTIONS: Record<string, SectionId> = {
  model: 'model',
  size: 'size',
  steps: SECTION_BY_HELP_TOPIC['steps'],
  cfg: SECTION_BY_HELP_TOPIC['cfg'],
  sampler: SECTION_BY_HELP_TOPIC['sampler'],
  seed: SECTION_BY_HELP_TOPIC['seed'],
  denoise: SECTION_BY_HELP_TOPIC['denoise'],
  karras: SECTION_BY_HELP_TOPIC['karras'],
  post: SECTION_BY_HELP_TOPIC['upscaler'],
  hires: SECTION_BY_HELP_TOPIC['hires_fix'],
  batch: SECTION_BY_HELP_TOPIC['batch'],
};

/** What a request with nothing to say renders, without allocating. */
const NO_CHIPS: readonly RecipeChip[] = [];

/**
 * The settings behind a worked example, read straight off the request that was
 * submitted.
 *
 * Only fields the payload actually carries are shown. The studio's own defaults
 * are deliberately not filled in: a reader comparing the chips against the
 * request below them has to find the same set of settings in both, and a chip
 * for a field the example never set would be the page inventing evidence.
 *
 * Copy lives under `generate.tutorials.recipe_*`, with the rest of the worked
 * examples page this card belongs to.
 */
@Component({
  selector: 'app-gs-recipe-chips',
  imports: [TranslocoPipe, IconComponent],
  template: `
    @if (chips().length) {
      <ul
        class="gs-recipe"
        [attr.aria-label]="'generate.tutorials.recipe_label' | transloco"
      >
        @for (chip of chips(); track chip.id + chip.value) {
          <li class="gs-recipe-chip" [class]="chip.identity.className">
            <span class="gs-sec-chip" aria-hidden="true"
              ><app-icon [name]="chip.identity.icon"
            /></span>
            <span class="gs-recipe-chip-label">
              {{ chip.labelKey | transloco }}
            </span>
            <span class="gs-recipe-chip-value">
              @if (chip.valueKey) {
                {{ chip.valueKey | transloco }}
              } @else {
                {{ chip.value }}
              }
            </span>
          </li>
        }
      </ul>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsRecipeChipsComponent {
  public readonly request = input<RecipeRequest | null>(null);

  public readonly chips = computed<readonly RecipeChip[]>(() => {
    const request = this.request();
    if (!request) {
      return NO_CHIPS;
    }

    const params = request.params ?? {};
    const chips: RecipeChip[] = [];

    const model = request.models?.[0];
    if (model) {
      chips.push(chipFor('model', model));
    }
    if (params.width !== undefined && params.height !== undefined) {
      chips.push(chipFor('size', `${params.width}×${params.height}`));
    }
    if (params.steps !== undefined) {
      chips.push(chipFor('steps', String(params.steps)));
    }
    if (params.cfg_scale !== undefined) {
      chips.push(chipFor('cfg', String(params.cfg_scale)));
    }
    if (params.sampler_name) {
      chips.push(chipFor('sampler', params.sampler_name));
    }
    if (params.seed !== undefined && params.seed !== '') {
      chips.push(chipFor('seed', String(params.seed)));
    }
    if (params.denoising_strength !== undefined) {
      chips.push(chipFor('denoise', String(params.denoising_strength)));
    }
    // Present rather than true: a request that turned the sigmas off said so,
    // and that is as much a choice as turning them on.
    if (params.karras !== undefined) {
      chips.push(stateChipFor('karras', params.karras));
    }
    if (params.hires_fix !== undefined) {
      chips.push(stateChipFor('hires', params.hires_fix));
    }
    for (const processor of params.post_processing ?? []) {
      chips.push(chipFor('post', processor));
    }
    // One image is what a request that never mentions a batch would have made,
    // so it is only worth a chip once it is more than that.
    if (params.n !== undefined && params.n > 1) {
      chips.push(chipFor('batch', String(params.n)));
    }

    return chips;
  });
}

function chipFor(id: string, value: string): RecipeChip {
  return {
    id,
    identity: SECTION_IDENTITIES[FIELD_SECTIONS[id]],
    labelKey: `generate.tutorials.recipe_${id}`,
    value,
  };
}

function stateChipFor(id: string, on: boolean): RecipeChip {
  return {
    ...chipFor(id, ''),
    valueKey: on
      ? 'generate.tutorials.recipe_on'
      : 'generate.tutorials.recipe_off',
  };
}
