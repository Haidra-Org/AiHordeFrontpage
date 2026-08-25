import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GsCompareWipeComponent } from '../gs-compare-wipe/gs-compare-wipe.component';
import { GsPixelBadgeComponent } from '../gs-pixel-badge/gs-pixel-badge.component';
import { LAUNCHER_HOST_PX } from '../gs-sweep-scrub/gs-sweep-scrub.component';

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
 *
 * In a surface narrower than the width the sweep explorer needs for its own
 * instrument, the pair is a preview instead: both crops beside each other,
 * scaled into the room, with nothing to drag. The press to the whole picture at
 * true size is the reading there, and the surface holding this already offers
 * it under the pair.
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
      [sideBySide]="launcher()"
      [fit]="!launcher()"
      [fitWidth]="launcher() ? null : box().width"
      [fitHeight]="launcher() ? null : box().height"
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  public readonly before = input.required<CropSide>();
  public readonly after = input.required<CropSide>();

  /** How wide the surface holding the pair is, as its own container. */
  private readonly hostWidth = signal(0);

  /**
   * Whether the pair stands still rather than being wiped. Under the width the
   * explorer needs for its own instrument, a divider across a crop the column
   * cannot even hold whole is a control with nowhere to travel: the two crops
   * are laid out beside each other, scaled into the room, and the press to the
   * whole picture at true size is the way to the reading. A host of no width
   * has not been measured yet and gets the wipe, which is what it had.
   */
  public readonly launcher = computed(() => {
    const width = this.hostWidth();
    return width > 0 && width < LAUNCHER_HOST_PX;
  });

  constructor() {
    this.observeHostWidth();
  }

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

  private observeHostWidth(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const element = this.host.nativeElement;
    const observer = new ResizeObserver((entries) => {
      this.hostWidth.set(entries[0]?.contentRect.width ?? element.offsetWidth);
    });
    observer.observe(element);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /** How many device pixels the display draws per CSS pixel. */
  private pixelRatio(): number {
    return typeof window !== 'undefined' && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
  }
}
