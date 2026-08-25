import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GsCompareWipeComponent } from '../gs-compare-wipe/gs-compare-wipe.component';
import { GsPixelBadgeComponent } from '../gs-pixel-badge/gs-pixel-badge.component';

/** One side of the pair: a published crop, and what it is a crop of. */
export interface CropSide {
  src: string;
  /** The crop's own size in pixels, which is what it is drawn at. */
  width: number;
  height: number;
  /** What this side is, already translated: a value, or "before". */
  label: string;
}

/**
 * Two matched crops of one picture, wiped against each other at true pixels.
 *
 * The difference an enlarger or a repass makes lives in a few hundred pixels of
 * a frame that is two thousand across. Shown whole and side by side the two
 * frames are indistinguishable, and shown whole and reduced they are
 * indistinguishable and blurred. The library cuts the same rectangle from both,
 * and this draws that rectangle at one image pixel per screen pixel, which is
 * the only size at which the claim can be checked.
 *
 * Where the two crops are not the same size (a 512-pixel source against its
 * 2048-pixel enlargement) the smaller is drawn up to meet the larger rather
 * than the larger being reduced to meet it, and the side that was enlarged says
 * so: reducing the enlargement would throw away the one thing being compared.
 */
@Component({
  selector: 'app-gs-crop-pair',
  imports: [TranslocoPipe, GsCompareWipeComponent, GsPixelBadgeComponent],
  template: `
    <app-gs-compare-wipe
      [beforeSrc]="before().src"
      [afterSrc]="after().src"
      [beforeLabel]="before().label"
      [afterLabel]="after().label"
      [beforeAlt]="
        'generate.reference.crop_alt' | transloco: { name: before().label }
      "
      [afterAlt]="
        'generate.reference.crop_alt' | transloco: { name: after().label }
      "
      [beforeNote]="notes().before"
      [afterNote]="notes().after"
      [fit]="true"
      [fitWidth]="box().width"
      [fitHeight]="box().height"
    />

    <!-- Under the pair rather than on it: the divider already carries a tag in
         each corner, and a badge standing on the picture would be a third thing
         in the same two corners. -->
    <p class="gs-ref-pair-sizes">
      <app-gs-pixel-badge
        class="gs-pixels--cell"
        [label]="before().label"
        [width]="before().width"
        [height]="before().height"
      />
      <app-gs-pixel-badge
        class="gs-pixels--cell"
        [label]="after().label"
        [width]="after().width"
        [height]="after().height"
      />
    </p>
  `,
  host: {
    class: 'gs-ref-pair-media',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsCropPairComponent {
  private readonly transloco = inject(TranslocoService);

  public readonly before = input.required<CropSide>();
  public readonly after = input.required<CropSide>();

  /** The larger of the two crops, which is the size the pair is read at. */
  private readonly larger = computed(() =>
    this.after().width >= this.before().width ? this.after() : this.before(),
  );

  /**
   * The box both sides are drawn into, in CSS pixels: the larger crop's own
   * pixels, one per pixel of the display. On a display that draws two device
   * pixels per CSS pixel that is half as many CSS pixels, which is what keeps
   * the promise the caption makes.
   */
  public readonly box = computed(() => {
    const ratio = this.pixelRatio();
    const size = this.larger();
    return {
      width: size.width / ratio,
      height: size.height / ratio,
    };
  });

  /** How far the smaller side had to be drawn up, said on that side's tag. */
  public readonly notes = computed<{ before: string; after: string }>(() => {
    const before = this.before().width;
    const after = this.after().width;
    if (before <= 0 || after <= 0 || before === after) {
      return { before: '', after: '' };
    }
    const factor =
      Math.round((Math.max(before, after) / Math.min(before, after)) * 10) / 10;
    const note = this.transloco.translate('generate.sweeps.match_note', {
      factor,
    });
    return before < after
      ? { before: note, after: '' }
      : { before: '', after: note };
  });

  /** How many device pixels the display draws per CSS pixel. */
  private pixelRatio(): number {
    return typeof window !== 'undefined' && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
  }
}
