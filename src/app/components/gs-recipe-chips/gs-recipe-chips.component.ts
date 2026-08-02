import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SettingValue } from '../../content/settings';
import { GsSettingChipComponent } from '../gs-setting-chip/gs-setting-chip.component';

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
  /** The setting the chip stands for, in the studio's own vocabulary. */
  id: string;
  /** What the request set it to, in the type the payload carries it in. */
  value: SettingValue;
}

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
 * Reading the request is this component's whole job; what a setting is called
 * and which card it lives on belongs to the shared vocabulary, and drawing it
 * belongs to the setting chip.
 */
@Component({
  selector: 'app-gs-recipe-chips',
  imports: [TranslocoPipe, GsSettingChipComponent],
  template: `
    @if (chips().length) {
      <ul
        class="gs-recipe"
        [attr.aria-label]="'generate.tutorials.recipe_label' | transloco"
      >
        @for (chip of chips(); track chip.id + chip.value) {
          <li>
            <app-gs-setting-chip [settingId]="chip.id" [value]="chip.value" />
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
      chips.push({ id: 'model', value: model });
    }
    if (params.width !== undefined && params.height !== undefined) {
      chips.push({ id: 'size', value: `${params.width}×${params.height}` });
    }
    if (params.steps !== undefined) {
      chips.push({ id: 'steps', value: params.steps });
    }
    if (params.cfg_scale !== undefined) {
      chips.push({ id: 'cfg', value: params.cfg_scale });
    }
    if (params.sampler_name) {
      chips.push({ id: 'sampler', value: params.sampler_name });
    }
    if (params.seed !== undefined && params.seed !== '') {
      chips.push({ id: 'seed', value: String(params.seed) });
    }
    if (params.denoising_strength !== undefined) {
      chips.push({ id: 'denoise', value: params.denoising_strength });
    }
    // Present rather than true: a request that turned the sigmas off said so,
    // and that is as much a choice as turning them on.
    if (params.karras !== undefined) {
      chips.push({ id: 'karras', value: params.karras });
    }
    if (params.hires_fix !== undefined) {
      chips.push({ id: 'hires', value: params.hires_fix });
    }
    for (const processor of params.post_processing ?? []) {
      chips.push({ id: 'post', value: processor });
    }
    // One image is what a request that never mentions a batch would have made,
    // so it is only worth a chip once it is more than that.
    if (params.n !== undefined && params.n > 1) {
      chips.push({ id: 'batch', value: params.n });
    }

    return chips;
  });
}
