import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsCompareWipeComponent } from '../../gs-compare-wipe/gs-compare-wipe.component';
import { IconComponent } from '../../icon/icon.component';

/** One processed picture of a request, ready to draw. */
export interface AlchemyPicture {
  /** The result key the picture is filed under (detector-qualified for a map). */
  key: string;
  /** The form that produced it, for its name. */
  form: string;
  detector: string | null;
  /** The local copy when there is one, else the horde's own link. */
  url: string;
  /** Whether `url` is the copy held in this browser. */
  stored: boolean;
  downloadName: string;
}

/**
 * A press on "Fold all" or "Open all" in the job head. The stamp makes each
 * press its own event, so pressing the same choice twice still takes effect
 * after a card was toggled by hand in between.
 */
export interface AlchemyFoldPin {
  open: boolean;
  stamp: number;
}

/**
 * Every processed picture of one request on one stage: a filmstrip to pick
 * from, the picked picture wiped against the source, and a press to see it
 * as large as the window allows.
 *
 * Several maps or upscales drawn as separate full-width cards cost a screen
 * each, and none of them can be read against the source they came from,
 * which is the question an upscale or a map is asked. One stage costs one
 * height however many pictures the request returned.
 */
@Component({
  selector: 'app-alchemy-pictures',
  imports: [TranslocoPipe, GsCompareWipeComponent, IconComponent],
  templateUrl: './alchemy-pictures.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-size]': '"tall"',
  },
})
export class AlchemyPicturesComponent {
  /** The request's source image, when the page has one to draw. */
  public readonly source = input<string | null>(null);
  public readonly pictures = input.required<readonly AlchemyPicture[]>();
  /** Pins the initial open state, as on the result card. */
  public readonly defaultOpen = input<boolean | null>(null);
  public readonly foldPin = input<AlchemyFoldPin | null>(null);
  /** Asks for the picked picture to be carried to the image studio. */
  public readonly useInStudio = output<string>();

  private readonly openOverride = signal<boolean | null>(null);
  private readonly pickedKey = signal<string | null>(null);
  public readonly zoomOpen = signal(false);

  constructor() {
    effect(() => {
      const pin = this.foldPin();
      if (pin) untracked(() => this.openOverride.set(pin.open));
    });
  }

  public readonly isOpen = computed(() => {
    const override = this.openOverride();
    if (override !== null) return override;
    return this.defaultOpen() ?? true;
  });

  public toggleOpen(): void {
    this.openOverride.set(!this.isOpen());
  }

  /** The picture on the stage: the one picked, else the first returned. */
  public readonly picked = computed<AlchemyPicture | null>(() => {
    const pictures = this.pictures();
    const key = this.pickedKey();
    return pictures.find((p) => p.key === key) ?? pictures[0] ?? null;
  });

  public pick(key: string): void {
    this.pickedKey.set(key);
  }

  public isPicked(picture: AlchemyPicture): boolean {
    return this.picked()?.key === picture.key;
  }

  public openZoom(): void {
    if (this.picked()) this.zoomOpen.set(true);
  }

  public closeZoom(): void {
    this.zoomOpen.set(false);
  }

  public nameKey(picture: AlchemyPicture): string {
    return `alchemy.form_names.${picture.form}`;
  }
}
