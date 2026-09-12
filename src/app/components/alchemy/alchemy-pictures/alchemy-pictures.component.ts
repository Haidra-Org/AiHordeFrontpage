import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { NgTemplateOutlet } from '@angular/common';
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

interface PixelSize {
  width: number;
  height: number;
}

interface Box {
  width: number;
  height: number;
}

/** The named sizes above Fit: the result's own pixels, and twice them. */
const ZOOM_STEPS = [
  { id: 'full', scale: 1, labelKey: 'generate.sweeps.zoom_full' },
  { id: 'double', scale: 2, labelKey: 'generate.sweeps.zoom_double' },
] as const;

type ZoomStep = 'fit' | 'full' | 'double';

/** The tallest the stage on the card is drawn, in CSS pixels. */
const CARD_STAGE_MAX_HEIGHT = 520;
/** The share of the window the card's stage may take before that cap. */
const CARD_STAGE_MAX_SHARE = 0.48;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-3;
}

/**
 * Every processed picture of one request on one stage: a filmstrip to pick
 * from, the picked picture wiped against the source, and the same pair at the
 * size the window allows.
 *
 * Several maps or upscales drawn as separate full-width cards cost a screen
 * each, and none of them can be read against the source they came from,
 * which is the question an upscale or a map is asked. One stage costs one
 * height however many pictures the request returned.
 *
 * A pair fitted into one box says nothing about an upscale: both sides are
 * shrunk to the same size and look the same. So the stage offers the result's
 * own pixels (100%) and twice them (200%), with the source enlarged to match
 * and both sides panned together, which is where the resampling shows.
 */
@Component({
  selector: 'app-alchemy-pictures',
  imports: [
    TranslocoPipe,
    NgTemplateOutlet,
    GsCompareWipeComponent,
    IconComponent,
    A11yModule,
  ],
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
  /** Asks for the picked picture to become this studio's source. */
  public readonly useAsSource = output<string>();

  private readonly openOverride = signal<boolean | null>(null);
  private readonly pickedKey = signal<string | null>(null);
  public readonly viewerOpen = signal(false);

  public readonly zoomSteps = ZOOM_STEPS;

  /* ---------- what is on the stage ---------- */

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

  private readonly pickedUrl = computed(() => this.picked()?.url ?? null);

  public pick(key: string): void {
    this.pickedKey.set(key);
  }

  public isPicked(picture: AlchemyPicture): boolean {
    return this.picked()?.key === picture.key;
  }

  public nameKey(picture: AlchemyPicture): string {
    return `alchemy.form_names.${picture.form}`;
  }

  public openViewer(): void {
    if (this.picked()) this.viewerOpen.set(true);
  }

  public closeViewer(): void {
    this.viewerOpen.set(false);
  }

  /* ---------- how close in it is drawn ---------- */

  /** The picked result's own pixels, once the browser has read them. */
  private readonly resultSize = signal<PixelSize | null>(null);
  /**
   * The picked picture could not be loaded: the horde's link has expired and
   * no copy was kept, so the stage says so rather than drawing nothing.
   */
  public readonly resultGone = signal(false);
  /** The source's own pixels, for the note that says it was enlarged. */
  private readonly sourceSize = signal<PixelSize | null>(null);
  /** The room the card's stage has, and the room the viewer has. */
  private readonly stageBox = signal<Box>({ width: 0, height: 0 });
  private readonly viewerBox = signal<Box>({ width: 0, height: 0 });
  /** Image pixels per device pixel asked for; null is whatever fits. */
  private readonly zoomAsked = signal<number | null>(null);
  private readonly pan = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  private readonly stageEl = viewChild<ElementRef<HTMLElement>>('stageEl');
  private readonly viewerEl = viewChild<ElementRef<HTMLElement>>('viewerEl');

  constructor() {
    effect(() => {
      const pin = this.foldPin();
      if (pin) untracked(() => this.openOverride.set(pin.open));
    });
    // Keyed on the picked URL rather than the picked object: the host hands
    // over a fresh `pictures` array on every change detection pass, and a
    // probe restarted on each of them would drop the measured size, and the
    // fitted box with it, for a frame at a time.
    effect((onCleanup) => {
      const url = this.pickedUrl();
      untracked(() => {
        this.pan.set({ x: 0, y: 0 });
        this.resultGone.set(false);
      });
      onCleanup(
        this.probe(url, this.resultSize, () => this.resultGone.set(true)),
      );
    });
    effect((onCleanup) => {
      onCleanup(this.probe(this.source(), this.sourceSize));
    });
    effect((onCleanup) => {
      onCleanup(this.watchBox(this.stageEl()?.nativeElement, this.stageBox));
    });
    effect((onCleanup) => {
      onCleanup(this.watchBox(this.viewerEl()?.nativeElement, this.viewerBox));
    });
  }

  /** The room the pair is being drawn into right now. */
  private readonly box = computed(() =>
    this.viewerOpen() ? this.viewerBox() : this.stageBox(),
  );

  private pixelRatio(): number {
    return globalThis.devicePixelRatio || 1;
  }

  /**
   * The scale at which the result fits its room, in image pixels per device
   * pixel: the floor of the zoom and what the Fit pill means.
   */
  public readonly fitScale = computed(() => {
    const size = this.resultSize();
    const box = this.box();
    if (!size || size.width <= 0 || box.width <= 0 || box.height <= 0) {
      return 1;
    }
    const ratio = this.pixelRatio();
    return Math.min(
      (box.width * ratio) / size.width,
      (box.height * ratio) / size.height,
    );
  });

  private readonly zoomScale = computed(
    () => this.zoomAsked() ?? this.fitScale(),
  );

  /** The multiplier the fitted pair is drawn at. */
  public readonly zoomFactor = computed(() => {
    const fit = this.fitScale();
    return fit > 0 ? this.zoomScale() / fit : 1;
  });

  /** The box both sides are fitted into, in CSS pixels. */
  public readonly fitBox = computed<Box | null>(() => {
    const size = this.resultSize();
    const box = this.box();
    if (!size || box.width <= 0) return null;
    const drawn = this.fitScale() / this.pixelRatio();
    return { width: size.width * drawn, height: size.height * drawn };
  });

  public readonly zoomStep = computed<ZoomStep | null>(() => {
    const asked = this.zoomAsked();
    if (asked === null) return 'fit';
    const step = ZOOM_STEPS.find((entry) => near(asked, entry.scale));
    return step ? step.id : null;
  });

  public readonly zoomedIn = computed(
    () =>
      this.zoomAsked() !== null && this.zoomScale() > this.fitScale() + 1e-3,
  );

  /**
   * Whether the pills are worth offering: where the result has more pixels
   * than the room draws it with, which is where there is something to go and
   * look at. A map the size of the stage has nothing behind 100%.
   */
  public readonly offersZoom = computed(
    () => this.fitScale() < 0.999 || this.zoomAsked() !== null,
  );

  /** Go to one of the named sizes; null is whatever the picture fits at. */
  public zoomTo(scale: number | null): void {
    this.zoomAsked.set(scale);
    this.pan.set({ x: 0, y: 0 });
  }

  /** One named size closer in, or further out; Fit is the floor. */
  private stepZoom(direction: 1 | -1): void {
    const steps: (number | null)[] = [
      null,
      ...ZOOM_STEPS.map((step) => step.scale),
    ];
    const asked = this.zoomAsked();
    const at = steps.findIndex((step) =>
      step === null ? asked === null : asked !== null && near(step, asked),
    );
    const next = steps[Math.min(steps.length - 1, Math.max(0, at + direction))];
    if (next !== undefined && next !== steps[at]) this.zoomTo(next);
  }

  /**
   * The keys the stage answers: arrows move the pair while it is drawn closer
   * in than its room, plus and minus step the size, zero fits it again. The
   * wipe's divider keeps its own arrow keys, so a press that started there is
   * left alone.
   */
  public onStageKeydown(event: KeyboardEvent): void {
    if (
      event.target instanceof Element &&
      event.target.closest('.gs-wipe-divider, button, a')
    ) {
      return;
    }
    const nudge = 40;
    const over = this.overflow();
    const clamp = (value: number, limit: number) =>
      Math.min(limit, Math.max(-limit, value));
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!this.zoomedIn()) return;
        const dx =
          event.key === 'ArrowLeft'
            ? nudge
            : event.key === 'ArrowRight'
              ? -nudge
              : 0;
        const dy =
          event.key === 'ArrowUp'
            ? nudge
            : event.key === 'ArrowDown'
              ? -nudge
              : 0;
        const pan = this.pan();
        this.pan.set({
          x: clamp(pan.x + dx, over.x),
          y: clamp(pan.y + dy, over.y),
        });
        break;
      }
      case '+':
      case '=':
        this.stepZoom(1);
        break;
      case '-':
      case '_':
        this.stepZoom(-1);
        break;
      case '0':
        this.zoomTo(null);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /** How far the drawn pair overhangs its room on each side, in CSS pixels. */
  private readonly overflow = computed(() => {
    const fit = this.fitBox();
    const box = this.box();
    if (!fit) return { x: 0, y: 0 };
    const factor = this.zoomFactor();
    return {
      x: Math.max(0, (fit.width * factor - box.width) / 2),
      y: Math.max(0, (fit.height * factor - box.height) / 2),
    };
  });

  public readonly panX = computed(() => this.pan().x);
  public readonly panY = computed(() => this.pan().y);

  /** The source was drawn larger than it is, to meet the result's pixels. */
  public readonly sourceEnlarged = computed(() => {
    const source = this.sourceSize();
    const result = this.resultSize();
    return !!source && !!result && source.width < result.width;
  });

  /* ---------- dragging the pair about ---------- */

  private drag: { x: number; y: number; panX: number; panY: number } | null =
    null;

  /**
   * A press on the picture while it is drawn closer in than its room starts
   * a pan. The divider keeps its own presses: the wipe claims those before
   * they reach here.
   */
  public onStagePointerDown(event: PointerEvent): void {
    if (!this.zoomedIn() || event.button !== 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest('.gs-wipe-divider, button, a')
    ) {
      return;
    }
    event.preventDefault();
    const pan = this.pan();
    this.drag = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
      event.pointerId,
    );
  }

  public onStagePointerMove(event: PointerEvent): void {
    if (!this.drag) return;
    const over = this.overflow();
    const clamp = (value: number, limit: number) =>
      Math.min(limit, Math.max(-limit, value));
    this.pan.set({
      x: clamp(this.drag.panX + (event.clientX - this.drag.x), over.x),
      y: clamp(this.drag.panY + (event.clientY - this.drag.y), over.y),
    });
  }

  public onStagePointerUp(): void {
    this.drag = null;
  }

  /* ---------- measuring ---------- */

  /**
   * Reads a picture's own pixels. The browser decodes the same bytes it is
   * drawing, so this costs nothing beyond what the stage already asked for.
   */
  private probe(
    url: string | null,
    into: { set(value: PixelSize | null): void },
    onFail?: () => void,
  ): () => void {
    into.set(null);
    if (!url || typeof Image === 'undefined') return () => undefined;
    let live = true;
    const image = new Image();
    image.onload = () => {
      if (live && image.naturalWidth > 0) {
        into.set({ width: image.naturalWidth, height: image.naturalHeight });
      }
    };
    image.onerror = () => {
      if (live) onFail?.();
    };
    image.src = url;
    return () => {
      live = false;
    };
  }

  /**
   * Keeps a box signal at the element's size. The card's stage is bounded by
   * width alone, so its height is what the window allows a card's picture;
   * the viewer's is measured on both sides.
   */
  private watchBox(
    element: HTMLElement | undefined,
    into: { set(value: Box): void },
  ): () => void {
    if (!element) return () => undefined;
    const isViewer = element === this.viewerEl()?.nativeElement;
    const measure = (): void => {
      const rect = element.getBoundingClientRect();
      const height = isViewer
        ? rect.height
        : Math.min(
            CARD_STAGE_MAX_HEIGHT,
            (globalThis.innerHeight || 0) * CARD_STAGE_MAX_SHARE ||
              CARD_STAGE_MAX_HEIGHT,
          );
      into.set({ width: rect.width, height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return () => undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }
}
