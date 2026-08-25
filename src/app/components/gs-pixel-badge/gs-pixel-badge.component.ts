import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** A picture's size in its own pixels, wherever one is known. */
export interface PixelSize {
  width: number;
  height: number;
}

/**
 * How big a picture is, in the pixels it was made at, and how much of that is
 * currently on screen.
 *
 * Every surface that shows a rendered picture is asked the same two questions
 * about it, and a reader comparing an upscaler against the render it grew from
 * cannot answer either from the picture alone: two frames drawn at the same
 * size on the page can be four times apart in pixels. The badge says the size
 * wherever the picture is shown, and adds what the current view is drawing it
 * at wherever the view can be zoomed.
 *
 * `shown` is the ratio of image pixels to device pixels as a percentage, so 100
 * means one pixel of the file per pixel of the display, whatever the display's
 * own scaling is.
 */
@Component({
  selector: 'app-gs-pixel-badge',
  imports: [TranslocoPipe],
  template: `
    @if (has()) {
      <span
        class="gs-pixels-text"
        [attr.aria-label]="spoken() | transloco: parts()"
      >
        {{ written() | transloco: parts() }}
      </span>
    }
  `,
  host: {
    class: 'gs-pixels',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsPixelBadgeComponent {
  /** The picture's own size in pixels. Either missing renders nothing at all. */
  public readonly width = input<number | null | undefined>(null);
  public readonly height = input<number | null | undefined>(null);
  /**
   * Image pixels per device pixel, as a percentage, where the surface can zoom.
   * Null on the surfaces that draw at whatever size they are given.
   */
  public readonly shown = input<number | null | undefined>(null);
  /** What this size belongs to, where a surface shows more than one. */
  public readonly label = input('');

  public readonly has = computed(
    () => !!this.width() && !!this.height() && this.width()! > 0,
  );

  /** The numbers the two texts are built from, rounded as they are read. */
  public readonly parts = computed(() => ({
    width: Math.round(this.width() ?? 0),
    height: Math.round(this.height() ?? 0),
    percent: Math.round(this.shown() ?? 0),
    label: this.label(),
  }));

  public readonly written = computed(() => {
    if (this.label()) {
      return 'generate.pixels.size_labelled';
    }
    return this.shown() ? 'generate.pixels.size_shown' : 'generate.pixels.size';
  });

  /**
   * The same thing said in words. "2048 × 2048" is a multiplication read aloud,
   * and a percentage with no verb in front of it is a number with no subject.
   */
  public readonly spoken = computed(() =>
    this.shown() ? 'generate.pixels.spoken_shown' : 'generate.pixels.spoken',
  );
}
