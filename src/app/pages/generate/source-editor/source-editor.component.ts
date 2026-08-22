import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { A11yModule } from '@angular/cdk/a11y';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { DatabaseService } from '../../../services/database.service';
import { useScrollLock } from '../../../helper/scroll-lock';
import {
  MAX_DENOISE,
  MIN_DENOISE,
  DENOISE_STEP,
  DIMENSION_STEP,
  GenerateFormGroup,
  GenerateSourceMode,
  MAX_DIMENSION,
  MIN_DIMENSION,
  rangeFillPercent,
} from '../generate-form.model';
import {
  type EditorRect,
  type EditorTouched,
  NOTHING_TOUCHED,
  anchorForOffset,
  brushImageSize,
  frameForTarget,
  hasUnappliedWork,
  needsPictureExport,
  offsetForFrame,
  pointSpacing,
  targetForFrame,
} from '../../../helper/source-editor';
import {
  type SourceImage,
  blobToSourceImage,
  canvasToBlob,
  exportMaskFromPaintLayer,
  maskPixelsToAlpha,
} from '../../../helper/source-image';
import type { Stage } from 'konva/lib/Stage';
import type { Layer } from 'konva/lib/Layer';
import type { KonvaEventObject, Node } from 'konva/lib/Node';
import { IconComponent } from '../../../components/icon/icon.component';
import type { Shape } from 'konva/lib/Shape';
import type { Line } from 'konva/lib/shapes/Line';
import type { Rect } from 'konva/lib/shapes/Rect';
import type { Circle } from 'konva/lib/shapes/Circle';
import type { Transformer } from 'konva/lib/shapes/Transformer';

/** The Konva namespace as it arrives from the dynamic import. */
type KonvaNamespace = (typeof import('konva'))['default'];

/**
 * What the editor opens on: an attached picture and the mask already painted
 * over it, or a blank sheet at the size the form is currently asking for.
 */
export interface SourceEditorDoc {
  image: SourceImage | null;
  mask: Blob | null;
  width: number;
  height: number;
  /** Where the picture sits in the canvas being grown, when placed by hand. */
  offset: { x: number; y: number } | null;
  /** Which ink mode to start on when the editor opens. */
  initialInk?: SourceEditorInk;
}

/** What Apply hands back to the source card to commit. */
export interface SourceEditorResult {
  image: SourceImage;
  mask: Blob | null;
  offset: { x: number; y: number } | null;
}

export type SourceEditorTool =
  | 'brush'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'select'
  | 'crop'
  | 'pan';

/** Which of the two inks a brush stroke is laid down in. */
export type SourceEditorInk = 'mask' | 'color';

type PointerOffsetDirection =
  | 'up'
  | 'up-right'
  | 'right'
  | 'down-right'
  | 'down'
  | 'down-left'
  | 'left'
  | 'up-left';

interface SourceEditorPointerPrefs {
  enabled: boolean;
  direction: PointerOffsetDirection;
  x: number;
  y: number;
}

/** The placement an undoable move or resize records, either side of a gesture. */
interface NodePlacement {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  width?: number;
  height?: number;
}

type EditorOp =
  | { kind: 'add'; node: Shape; parent: Layer }
  | { kind: 'remove'; node: Shape; parent: Layer }
  | { kind: 'place'; node: Shape; before: NodePlacement; after: NodePlacement }
  | { kind: 'crop'; before: EditorRect; after: EditorRect }
  | {
      kind: 'frame';
      before: { rect: EditorRect; width: number; height: number };
      after: { rect: EditorRect; width: number; height: number };
    };

/** Brush sizes are the pixels the hand sees, whatever the view is scaled to. */
const MIN_BRUSH = 5;
const MAX_BRUSH = 200;
const MIN_SCALE = 0.02;
const MAX_SCALE = 24;
const ZOOM_STEP = 1.08;
/**
 * Mask strokes are laid down opaque and the whole layer is dimmed instead, so
 * that overlapping strokes read as one even coverage rather than stacking into
 * darker patches where the hand doubled back. The dimming is a style on the
 * layer's own canvas, which is why an export of that layer comes back at full
 * strength: the mask the horde is sent has to be flat white, not a wash.
 */
const MASK_LAYER_OPACITY = 0.5;
const MASK_RGB = { r: 56, g: 189, b: 248 };
const MASK_INK = '#38bdf8';
const FRAME_INK = '#f59e0b';
const CROP_INK = '#22c55e';
/** The ground the request will invent, tinted so it reads as absent rather than
 *  as a surface, over a dark checker as well as a light one. */
const FRAME_TINT = 'rgba(245, 158, 11, 0.22)';
const CROP_TINT = 'rgba(15, 23, 42, 0.45)';
/**
 * How far the pointer has to travel on screen before a stroke takes another
 * point. Points closer than this make `tension` smoothing knot up; measuring it
 * on screen rather than in the picture keeps a zoomed-out flick from being
 * sampled so coarsely that its corners are cut.
 */
const SCREEN_POINT_SPACING = 3;
/** Gentle enough that a fast flick curves rather than overshooting its turns. */
const STROKE_TENSION = 0.3;
/** The checker that says which part of the sheet is see-through, in screen px. */
const CHECKER_SQUARE = 8;
const SHAPE_INK_ATTR = 'editorInk';
const SHAPE_EDITABLE_ATTR = 'editorShapeEditable';
/** A second finger arriving this quickly means "pinch", not "start drawing". */
const PINCH_CANCEL_WINDOW_MS = 450;
/** Past this screen-space travel, a mark is intentional and should not cancel. */
const PINCH_CANCEL_MAX_TRAVEL_PX = 32;
/** Touch must travel this far before a mark is created at all. */
const TOUCH_DRAW_SLOP_PX = 14;
/** Briefly block new touch draw starts after pinch ends. */
const POST_PINCH_DRAW_COOLDOWN_MS = 260;
const MIN_POINTER_OFFSET_PX = 0;
const MAX_POINTER_OFFSET_PX = 200;
const DEFAULT_POINTER_OFFSET_X_PX = 32;
const DEFAULT_POINTER_OFFSET_Y_PX = 56;
const POINTER_PREFS_KEY = 'aihorde.generate.source_editor.pointer_prefs';

interface TouchDrawCandidate {
  node: Shape;
  kind: 'stroke' | 'shape';
  startedAt: number;
  undoDepth: number;
  touchedBefore: EditorTouched;
}

interface PendingTouchDraw {
  point: { x: number; y: number };
  tool: 'brush' | 'eraser' | 'rect' | 'ellipse' | 'line';
}

function placementOf(node: Node): NodePlacement {
  return {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  };
}

function rectOf(node: Rect): EditorRect {
  return {
    x: node.x(),
    y: node.y(),
    width: node.width(),
    height: node.height(),
  };
}

/**
 * The fullscreen editor for the source image. Pixel work is staged on a working
 * copy and only lands on the request when Apply commits it; the settings shown
 * along the bottom are the form's own controls, so changing one here changes it
 * everywhere at once.
 *
 * The picture sits at its native pixel coordinates and the view is what scales,
 * so an export is taken by putting the view back to one-to-one and reading the
 * layers at their own resolution. Konva is fetched on open and never at module
 * load, because the page renders on the server and the editor has to stay out
 * of the initial bundle.
 */
@Component({
  selector: 'app-source-editor',
  imports: [A11yModule, ReactiveFormsModule, TranslocoPipe, IconComponent],
  templateUrl: './source-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceEditorComponent {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private readonly scrollLock = useScrollLock();
  private readonly db = inject(DatabaseService);

  public readonly doc = input.required<SourceEditorDoc>();
  public readonly form = input.required<GenerateFormGroup>();

  public readonly applied = output<SourceEditorResult>();
  public readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly stageHost =
    viewChild<ElementRef<HTMLDivElement>>('stageHost');
  private readonly toolsRail =
    viewChild<ElementRef<HTMLDivElement>>('toolsRail');
  private readonly paramsRow =
    viewChild<ElementRef<HTMLDivElement>>('paramsRow');
  private readonly footerRow =
    viewChild<ElementRef<HTMLDivElement>>('footerRow');

  public readonly tool = signal<SourceEditorTool>('brush');
  private readonly lastDrawTool = signal<SourceEditorTool>('brush');
  public readonly ink = signal<SourceEditorInk>('mask');
  public readonly brushSize = signal(40);
  public readonly color = signal('#f43f5e');
  public readonly background = signal('#ffffff');
  public readonly showImageLayer = signal(true);
  public readonly showMaskLayer = signal(true);
  public readonly pointerOffsetOn = signal(false);
  public readonly pointerOffsetMenuOpen = signal(false);
  public readonly pointerOffsetDirection =
    signal<PointerOffsetDirection>('up-right');
  public readonly pointerOffsetX = signal(DEFAULT_POINTER_OFFSET_X_PX);
  public readonly pointerOffsetY = signal(DEFAULT_POINTER_OFFSET_Y_PX);
  public readonly zoomPercent = signal(100);
  public readonly frameOn = signal(false);
  public readonly frameSize = signal({ width: 0, height: 0 });
  public readonly lockAspect = signal(true);
  public readonly rotateOn = signal(false);
  public readonly cropPending = signal(false);
  public readonly canUndo = signal(false);
  public readonly canRedo = signal(false);
  public readonly ready = signal(false);
  public readonly busy = signal(false);
  public readonly confirmingClose = signal(false);
  public readonly docSize = signal({ width: 0, height: 0 });

  /** Reactive mirrors of the form values the editor shows and writes. */
  public readonly mode = signal<GenerateSourceMode>('none');
  private readonly formWidth = signal(0);
  private readonly formHeight = signal(0);
  private readonly outpaintEnabled = signal(false);

  private readonly touched = signal<EditorTouched>(NOTHING_TOUCHED);
  /**
   * The undo entry the session currently stands on, and the one it stood on
   * when it opened or last applied. Comparing the two, rather than counting
   * them, is what makes stepping back to the same step read as clean while a
   * different step at the same depth reads as staged work.
   */
  private readonly historyStep = signal<EditorOp | null>(null);
  private readonly appliedStep = signal<EditorOp | null>(null);
  /** Whether an edit that takes no undo entry is standing, i.e. the ground. */
  private readonly offHistoryEdit = signal(false);
  public readonly dirty = computed(() =>
    hasUnappliedWork(
      this.historyStep() === this.appliedStep(),
      this.offHistoryEdit(),
    ),
  );

  public readonly minBrush = MIN_BRUSH;
  public readonly maxBrush = MAX_BRUSH;
  public readonly minDenoise = MIN_DENOISE;
  public readonly maxDenoise = MAX_DENOISE;
  public readonly denoiseStep = DENOISE_STEP;
  public readonly minPointerOffset = MIN_POINTER_OFFSET_PX;
  public readonly maxPointerOffset = MAX_POINTER_OFFSET_PX;
  public readonly minDimension = MIN_DIMENSION;
  public readonly maxDimension = MAX_DIMENSION;
  public readonly dimensionStep = DIMENSION_STEP;
  public readonly rangeFill = rangeFillPercent;

  public readonly tools: readonly SourceEditorTool[] = [
    'brush',
    'eraser',
    'rect',
    'ellipse',
    'line',
    'select',
    'crop',
    'pan',
  ];

  public readonly pointerOffsetDirections: readonly PointerOffsetDirection[] = [
    'up',
    'up-right',
    'right',
    'down-right',
    'down',
    'down-left',
    'left',
    'up-left',
  ];

  /**
   * The glyph each tool is known by on the rail. The rail is a column beside the
   * picture, so the tools wear their marks rather than their names; the name is
   * still what the button is called, and still what a hover reports.
   */
  private readonly toolIcons: Readonly<Record<SourceEditorTool, string>> = {
    brush: 'paintbrush',
    eraser: 'eraser',
    rect: 'shape-rect',
    ellipse: 'shape-ellipse',
    line: 'shape-line',
    select: 'cursor-select',
    crop: 'crop',
    pan: 'hand-pan',
  };

  public toolIcon(tool: SourceEditorTool): string {
    return this.toolIcons[tool];
  }

  /** Whether the picture is being grown, which is the only time a frame helps. */
  public readonly frameAvailable = computed(() => this.mode() === 'inpainting');
  /** Denoise only means anything where the model is following a picture. */
  public readonly denoiseAvailable = computed(
    () => this.mode() === 'img2img' || this.mode() === 'controlnet',
  );
  /** A blank sheet is the picture, so its ground is pickable. */
  public readonly fromBlank = computed(() => this.doc().image === null);
  /**
   * Whether a painted mask is something the request can carry. ControlNet and
   * remix send no mask, so offering the ink there would let a reader paint a
   * region that goes nowhere.
   */
  public readonly maskAvailable = computed(
    () => this.mode() === 'img2img' || this.mode() === 'inpainting',
  );

  /** Header copy and accents that make the current ink mode unmistakable. */
  public readonly inkModeLabel = computed(() =>
    this.ink() === 'mask'
      ? 'generate.editor.ink_mode_mask'
      : 'generate.editor.ink_mode_colour',
  );
  public readonly inkModeIcon = computed(() =>
    this.ink() === 'mask' ? 'warning-triangle-filled' : 'paintbrush',
  );

  private konva: KonvaNamespace | null = null;
  private stage: Stage | null = null;
  private groundLayer: Layer | null = null;
  private imageLayer: Layer | null = null;
  private colorLayer: Layer | null = null;
  private maskLayer: Layer | null = null;
  private shapeLayer: Layer | null = null;
  private uiLayer: Layer | null = null;
  private transformer: Transformer | null = null;
  private groundRect: Rect | null = null;
  private blankRect: Rect | null = null;
  private frameRect: Rect | null = null;
  private frameTransformer: Transformer | null = null;
  private cropRect: Rect | null = null;
  private cropTransformer: Transformer | null = null;
  private cropShade: Rect | null = null;
  private brushRing: Circle | null = null;
  private dimRects: Rect[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private readonly scrollHintTeardowns: (() => void)[] = [];

  /** The region of the working sheet that is the picture. Crop moves it. */
  private docRect: EditorRect = { x: 0, y: 0, width: 0, height: 0 };
  /**
   * The picture as the request currently holds it. Apply leaves the editor open,
   * so a second Apply has to measure itself against what the first one handed
   * over rather than against what the session opened on; otherwise a mask-only
   * pass would quietly hand back the pre-session bytes and undo the first.
   */
  private baseImage: SourceImage | null = null;

  private readonly undoStack: EditorOp[] = [];
  private readonly redoStack: EditorOp[] = [];

  /** The stroke or the shape the pointer is currently laying down. */
  private stroke: Line | null = null;
  private draft: Shape | null = null;
  private draftKind: 'rect' | 'ellipse' | 'line' = 'rect';
  private draftOrigin = { x: 0, y: 0 };
  private lastPoint = { x: 0, y: 0 };
  /** Where a pan started, in screen pixels and in the stage's own position. */
  private panFrom: {
    x: number;
    y: number;
    stageX: number;
    stageY: number;
  } | null = null;
  private spaceHeld = false;
  /** Where a drag or resize started from, so undo steps back a whole gesture. */
  private gestureFrom: NodePlacement | null = null;
  private frameGestureFrom: {
    rect: EditorRect;
    width: number;
    height: number;
  } | null = null;
  /**
   * True while the editor is itself writing width and height, so the form's own
   * change notification does not bounce back and fight the drag that caused it.
   */
  private writingSize = false;
  /** How far apart two fingers were, so a pinch can be read as a scale. */
  private pinchFrom: { distance: number; scale: number } | null = null;
  /** Tool held before auto-pan on pinch, so it can be restored afterwards. */
  private pinchToolBefore: SourceEditorTool | null = null;
  private autoPanFromPinch = false;
  private pinchGestureActive = false;
  private suppressDrawUntil = 0;
  private touchDrawCandidate: TouchDrawCandidate | null = null;
  private pendingTouchDraw: PendingTouchDraw | null = null;
  /** Which export is current, so a slow encode overtaken by a newer Apply is
   *  dropped rather than landing on top of it. */
  private exportToken = 0;

  private readonly onWindowPointerMove = (event: PointerEvent): void =>
    this.movePan(event);
  private readonly onWindowPointerUp = (): void => this.endGesture();

  constructor() {
    this.loadPointerPrefs();
    afterNextRender(() => void this.setup());
    if (this.isBrowser) {
      this.scrollLock.enable();
    }
    this.destroyRef.onDestroy(() => this.teardown());
  }

  private teardown(): void {
    if (this.isBrowser) {
      window.removeEventListener('pointermove', this.onWindowPointerMove);
      window.removeEventListener('pointerup', this.onWindowPointerUp);
    }
    this.resizeObserver?.disconnect();
    for (const teardown of this.scrollHintTeardowns) {
      teardown();
    }
    this.scrollHintTeardowns.length = 0;
    this.stage?.destroy();
  }

  // -- settings that are the form's own ------------------------------------

  /**
   * Mirror the form controls the editor shows. Reading them into signals is what
   * lets the frame follow a size typed into the settings while the editor is
   * open, without the editor keeping a second copy of the answer.
   */
  private bindForm(): void {
    const controls = this.form().controls;
    this.mode.set(controls.sourceMode.value);
    this.formWidth.set(controls.width.value);
    this.formHeight.set(controls.height.value);
    this.outpaintEnabled.set(controls.outpaintEnabled.value);
    if (!this.maskAvailable()) {
      this.ink.set('color');
    }
    this.frameOn.set(
      controls.outpaintEnabled.value &&
        controls.sourceMode.value === 'inpainting',
    );

    controls.sourceMode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mode) => {
        this.mode.set(mode);
        if (!this.maskAvailable()) {
          this.setInk('color');
        }
        this.syncFrameVisibility();
      });
    controls.outpaintEnabled.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((on) => {
        this.outpaintEnabled.set(on);
        this.syncFrameVisibility();
      });
    controls.width.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((width) => {
        this.formWidth.set(width);
        this.frameFromForm();
      });
    controls.height.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((height) => {
        this.formHeight.set(height);
        this.frameFromForm();
      });
  }

  /** Honor the caller's starting ink choice when one is provided. */
  private applyInitialInk(): void {
    const requested = this.doc().initialInk;
    if (!requested) {
      return;
    }
    if (requested === 'mask' && !this.maskAvailable()) {
      this.ink.set('color');
      return;
    }
    this.ink.set(requested);
  }

  public setMode(mode: GenerateSourceMode): void {
    this.form().controls.sourceMode.setValue(mode);
  }

  // -- closing -------------------------------------------------------------

  /** Close, asking first when there is staged work that Apply has not taken. */
  public onClose(): void {
    if (this.dirty()) {
      this.confirmingClose.set(true);
      return;
    }
    this.closed.emit();
  }

  public discardAndClose(): void {
    this.confirmingClose.set(false);
    this.closed.emit();
  }

  public keepEditing(): void {
    this.confirmingClose.set(false);
  }

  /** Close only when the backdrop itself is clicked, not the panel within it. */
  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  public setTool(tool: SourceEditorTool): void {
    if (tool !== 'pan') {
      this.lastDrawTool.set(tool);
    }
    this.pendingTouchDraw = null;
    this.tool.set(tool);
    if (tool !== 'select') {
      this.select(null);
    }
    if (tool !== 'crop') {
      this.clearCrop();
    }
    // Only the select and crop tools move things about: otherwise a stroke that
    // starts on a shape or on the frame would drag it instead of painting.
    for (const shape of this.editableShapes()) {
      shape.draggable(tool === 'select');
    }
    this.uiLayer?.listening(tool === 'select' || tool === 'crop');
    this.updateBrushRing();
    this.applyCursor();
  }

  private isDrawTool(
    tool: SourceEditorTool,
  ): tool is 'brush' | 'eraser' | 'rect' | 'ellipse' | 'line' {
    return (
      tool === 'brush' ||
      tool === 'eraser' ||
      tool === 'rect' ||
      tool === 'ellipse' ||
      tool === 'line'
    );
  }

  /** A pinch should own movement; stop any one-finger pan that was running. */
  private stopPanForPinch(): void {
    if (!this.panFrom) {
      return;
    }
    this.panFrom = null;
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    this.applyCursor();
  }

  /** Quick touch affordance: switch between panning and the last draw tool. */
  public togglePanTool(): void {
    if (this.tool() === 'pan') {
      this.setTool(this.lastDrawTool());
      return;
    }
    this.setTool('pan');
  }

  public setInk(ink: SourceEditorInk): void {
    this.ink.set(ink);
    if (ink === 'mask' && !this.showMaskLayer()) {
      this.showMaskLayer.set(true);
      this.syncLayerVisibility();
    }
    this.updateBrushRing();
  }

  public toggleImageVisibility(): void {
    this.showImageLayer.update((shown) => !shown);
    this.syncLayerVisibility();
  }

  public toggleMaskVisibility(): void {
    this.showMaskLayer.update((shown) => !shown);
    this.syncLayerVisibility();
  }

  public togglePointerOffset(): void {
    const next = !this.pointerOffsetOn();
    this.pointerOffsetOn.set(next);
    if (!next) {
      this.pointerOffsetMenuOpen.set(false);
    }
    this.persistPointerPrefs();
  }

  public togglePointerOffsetMenu(): void {
    this.pointerOffsetMenuOpen.update((open) => !open);
  }

  /** Close floating offset settings when a click lands outside it. */
  public onPanelClick(event: MouseEvent): void {
    if (!this.pointerOffsetMenuOpen()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    if (target.closest('#gs-se-offset-menu')) {
      return;
    }
    if (target.closest('[aria-controls="gs-se-offset-menu"]')) {
      return;
    }
    this.pointerOffsetMenuOpen.set(false);
  }

  public setPointerOffsetDirection(value: string): void {
    if (this.isPointerOffsetDirection(value)) {
      this.pointerOffsetDirection.set(value);
      this.persistPointerPrefs();
    }
  }

  public setPointerOffsetX(value: string): void {
    this.pointerOffsetX.set(this.clampPointerOffset(value));
    this.persistPointerPrefs();
  }

  public setPointerOffsetY(value: string): void {
    this.pointerOffsetY.set(this.clampPointerOffset(value));
    this.persistPointerPrefs();
  }

  public setBrushSize(value: string): void {
    this.brushSize.set(Number(value));
    this.updateBrushRing();
  }

  public setColor(value: string): void {
    this.color.set(value);
  }

  public setBackground(value: string): void {
    this.background.set(value);
    this.blankRect?.fill(value);
    this.markTouched('picture');
    this.offHistoryEdit.set(true);
  }

  public toggleLockAspect(): void {
    this.lockAspect.update((on) => !on);
    this.transformer?.keepRatio(this.lockAspect());
    this.cropTransformer?.keepRatio(this.lockAspect());
  }

  public toggleRotate(): void {
    this.rotateOn.update((on) => !on);
    this.transformer?.rotateEnabled(this.rotateOn());
  }

  private markTouched(key: keyof EditorTouched): void {
    this.touched.update((current) =>
      current[key] ? current : { ...current, [key]: true },
    );
  }

  // -- stage ---------------------------------------------------------------

  private async setup(): Promise<void> {
    const host = this.stageHost()?.nativeElement;
    if (!this.isBrowser || !host) {
      return;
    }
    this.bindForm();
    this.applyInitialInk();
    const konva = (await import('konva')).default;
    this.konva = konva;
    const bounds = host.getBoundingClientRect();
    const stage = new konva.Stage({
      container: host,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    });
    this.stage = stage;

    this.groundLayer = new konva.Layer({ listening: false });
    this.imageLayer = new konva.Layer({ listening: false });
    this.colorLayer = new konva.Layer({ listening: true });
    this.shapeLayer = new konva.Layer();
    this.maskLayer = new konva.Layer({ listening: true });
    this.uiLayer = new konva.Layer({ listening: false });
    stage.add(
      this.groundLayer,
      this.imageLayer,
      this.colorLayer,
      this.shapeLayer,
      this.maskLayer,
      this.uiLayer,
    );
    this.syncLayerVisibility();

    const doc = this.doc();
    this.docRect = { x: 0, y: 0, width: doc.width, height: doc.height };
    this.docSize.set({ width: doc.width, height: doc.height });
    this.baseImage = doc.image;

    await this.buildGround();
    if (doc.image) {
      this.imageLayer.add(
        new konva.Image({
          image: await this.pictureCanvas(doc.image),
          x: 0,
          y: 0,
          width: doc.width,
          height: doc.height,
        }),
      );
    } else {
      // A blank sheet's ground is part of the picture, so it is a shape on the
      // picture's own layer rather than anything the editor draws behind it.
      this.blankRect = new konva.Rect({
        x: 0,
        y: 0,
        width: doc.width,
        height: doc.height,
        fill: this.background(),
      });
      this.imageLayer.add(this.blankRect);
    }
    await this.hydrateMask(doc.mask);

    this.transformer = new konva.Transformer({
      ignoreStroke: true,
      rotateEnabled: false,
      keepRatio: this.lockAspect(),
      borderStroke: MASK_INK,
      anchorStroke: MASK_INK,
    });
    this.shapeLayer.add(this.transformer);

    this.buildFrame();
    this.buildCrop();
    this.buildBrushRing();
    this.bindStage();
    this.observeResize(host);
    this.setupScrollHints();
    this.syncFrameVisibility();
    this.fit();
    this.applyCursor();
    this.ready.set(true);
    this.panel()?.nativeElement.focus();
  }

  /**
   * The attached picture drawn at its own size. Nothing is painted underneath
   * it: a picture with see-through parts keeps them, because on the horde that
   * transparency is itself a request to repaint, and filling it here would
   * quietly answer a question the reader never asked.
   */
  private async pictureCanvas(image: SourceImage): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context) {
      const bitmap = await createImageBitmap(image.blob);
      context.drawImage(bitmap, 0, 0, image.width, image.height);
      bitmap.close();
    }
    return canvas;
  }

  /** Paint a stored mask back onto the brush layer it was exported from. */
  private async hydrateMask(mask: Blob | null): Promise<void> {
    const konva = this.konva;
    const layer = this.maskLayer;
    if (!mask || !konva || !layer) {
      return;
    }
    const bitmap = await createImageBitmap(mask);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      pixels.data.set(maskPixelsToAlpha(pixels.data, MASK_RGB));
      context.putImageData(pixels, 0, 0);
      layer.add(
        new konva.Image({
          image: canvas,
          x: 0,
          y: 0,
          width: this.docRect.width,
          height: this.docRect.height,
          listening: false,
        }),
      );
    } finally {
      bitmap.close();
    }
  }

  /** The checker that says which part of the sheet is see-through. */
  private async buildGround(): Promise<void> {
    const konva = this.konva;
    if (!konva || !this.groundLayer) {
      return;
    }
    const tile = document.createElement('canvas');
    tile.width = CHECKER_SQUARE * 2;
    tile.height = CHECKER_SQUARE * 2;
    const context = tile.getContext('2d');
    if (context) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, tile.width, tile.height);
      context.fillStyle = '#cbd5e1';
      context.fillRect(0, 0, CHECKER_SQUARE, CHECKER_SQUARE);
      context.fillRect(
        CHECKER_SQUARE,
        CHECKER_SQUARE,
        CHECKER_SQUARE,
        CHECKER_SQUARE,
      );
    }
    // A pattern fill takes an image rather than a canvas, so the tile is handed
    // over as one; it is a few hundred bytes and decodes immediately.
    const pattern = new Image();
    pattern.src = tile.toDataURL('image/png');
    await pattern.decode().catch(() => undefined);
    this.groundRect = new konva.Rect({
      x: this.docRect.x,
      y: this.docRect.y,
      width: this.docRect.width,
      height: this.docRect.height,
      fillPatternImage: pattern,
      listening: false,
    });
    this.groundLayer.add(this.groundRect);
  }

  /** Hold the checker at a constant size on screen however far the view zooms. */
  private syncGround(): void {
    const scale = this.stage?.scaleX() ?? 1;
    this.groundRect?.setAttrs({
      x: this.docRect.x,
      y: this.docRect.y,
      width: this.docRect.width,
      height: this.docRect.height,
      fillPatternScaleX: 1 / scale,
      fillPatternScaleY: 1 / scale,
    });
  }

  private observeResize(host: HTMLDivElement): void {
    this.resizeObserver = new ResizeObserver(() => {
      const bounds = host.getBoundingClientRect();
      this.stage?.size({
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height),
      });
    });
    this.resizeObserver.observe(host);
  }

  /** Mark rails that still have content to scroll to either side. */
  private setupScrollHints(): void {
    const rows = [
      this.toolsRail()?.nativeElement,
      this.paramsRow()?.nativeElement,
      this.footerRow()?.nativeElement,
    ].filter((row): row is HTMLDivElement => row !== undefined);
    for (const row of rows) {
      this.bindScrollHints(row);
    }
  }

  private bindScrollHints(row: HTMLDivElement): void {
    const update = (): void => {
      const maxScrollLeft = row.scrollWidth - row.clientWidth;
      const canScroll = maxScrollLeft > 1;
      row.dataset['scrollLeft'] =
        canScroll && row.scrollLeft > 1 ? 'true' : 'false';
      row.dataset['scrollRight'] =
        canScroll && row.scrollLeft < maxScrollLeft - 1 ? 'true' : 'false';
    };
    row.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
    requestAnimationFrame(update);
    this.scrollHintTeardowns.push(() => {
      row.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    });
  }

  /** Frame the whole sheet with a margin, and centre it. */
  public fit(): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    const frame = this.frameOn() ? this.frameRect : null;
    // Whatever the request will cover has to be on screen, so a frame that
    // reaches past the picture is what the view is fitted to.
    const left = Math.min(this.docRect.x, frame?.x() ?? this.docRect.x);
    const top = Math.min(this.docRect.y, frame?.y() ?? this.docRect.y);
    const right = Math.max(
      this.docRect.x + this.docRect.width,
      (frame?.x() ?? 0) + (frame?.width() ?? 0),
    );
    const bottom = Math.max(
      this.docRect.y + this.docRect.height,
      (frame?.y() ?? 0) + (frame?.height() ?? 0),
    );
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const scale =
      Math.min(stage.width() / width, stage.height() / height) * 0.9;
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (stage.width() - width * scale) / 2 - left * scale,
      y: (stage.height() - height * scale) / 2 - top * scale,
    });
    this.afterViewChanged(scale);
  }

  public zoomBy(factor: number): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    this.scaleAround(
      { x: stage.width() / 2, y: stage.height() / 2 },
      stage.scaleX() * factor,
    );
  }

  /** Rescale the view, keeping the point of the picture under `pointer` still. */
  private scaleAround(pointer: { x: number; y: number }, next: number): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    const before = stage.scaleX();
    const origin = {
      x: (pointer.x - stage.x()) / before,
      y: (pointer.y - stage.y()) / before,
    };
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: pointer.x - origin.x * scale,
      y: pointer.y - origin.y * scale,
    });
    this.afterViewChanged(scale);
  }

  /** Everything sized in screen pixels has to be redone when the view moves. */
  private afterViewChanged(scale: number): void {
    this.zoomPercent.set(Math.round(scale * 100));
    this.syncGround();
    this.updateBrushRing();
  }

  private bindStage(): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    stage.on('wheel', (event) => {
      event.evt.preventDefault();
      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return;
      }
      const factor = event.evt.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      this.scaleAround(pointer, stage.scaleX() * factor);
    });
    stage.on('pointerdown', (event) => this.onPointerDown(event));
    stage.on('pointermove', (event) => this.onPointerMove(event));
    stage.on('touchstart', (event) => this.onTouchStart(event));
    stage.on('touchmove', (event) => this.onTouchMove(event));
    stage.on('touchend touchcancel', (event) => {
      const touchEvent = event.evt as TouchEvent;
      if (touchEvent.touches.length < 2) {
        this.pinchFrom = null;
        this.endPinchPan();
      }
    });
    window.addEventListener('pointerup', this.onWindowPointerUp);
  }

  /** Two fingers scale the view about the point between them. */
  private onTouchStart(event: KonvaEventObject<TouchEvent>): void {
    if (event.evt.touches.length < 2) {
      return;
    }
    this.pinchGestureActive = true;
    this.pendingTouchDraw = null;
    this.cancelRecentTouchDrawCandidateForPinch(true);
    this.stopPanForPinch();
    if (this.tool() !== 'pan' && !this.autoPanFromPinch) {
      this.pinchToolBefore = this.tool();
      this.autoPanFromPinch = true;
      this.setTool('pan');
    }
  }

  /** Two fingers scale the view about the point between them. */
  private onTouchMove(event: KonvaEventObject<TouchEvent>): void {
    const touches = event.evt.touches;
    const stage = this.stage;
    if (touches.length !== 2 || !stage) {
      this.endPinchPan();
      return;
    }
    this.pinchGestureActive = true;
    event.evt.preventDefault();
    this.pendingTouchDraw = null;
    this.cancelRecentTouchDrawCandidateForPinch();
    this.stopPanForPinch();
    // A pinch is never also a stroke: whatever the first finger began is
    // abandoned rather than dragged about by the second.
    this.stroke = null;
    this.draft = null;
    if (this.tool() !== 'pan' && !this.autoPanFromPinch) {
      this.pinchToolBefore = this.tool();
      this.autoPanFromPinch = true;
      this.setTool('pan');
    }
    const [first, second] = [touches[0], touches[1]];
    const distance = Math.hypot(
      second.clientX - first.clientX,
      second.clientY - first.clientY,
    );
    const box = stage.container().getBoundingClientRect();
    const centre = {
      x: (first.clientX + second.clientX) / 2 - box.left,
      y: (first.clientY + second.clientY) / 2 - box.top,
    };
    if (!this.pinchFrom || this.pinchFrom.distance === 0) {
      this.pinchFrom = { distance, scale: stage.scaleX() };
      return;
    }
    this.scaleAround(
      centre,
      this.pinchFrom.scale * (distance / this.pinchFrom.distance),
    );
  }

  /** Restore the pre-pinch tool when pan was entered automatically. */
  private endPinchPan(): void {
    if (this.pinchGestureActive) {
      this.suppressDrawUntil = Date.now() + POST_PINCH_DRAW_COOLDOWN_MS;
      this.pinchGestureActive = false;
    }
    if (!this.autoPanFromPinch) {
      return;
    }
    this.autoPanFromPinch = false;
    const previous = this.pinchToolBefore;
    this.pinchToolBefore = null;
    if (previous && this.tool() === 'pan') {
      this.setTool(previous);
    }
  }

  // -- drawing -------------------------------------------------------------

  private onPointerDown(event: KonvaEventObject<PointerEvent>): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    const tool = this.tool();
    if (tool === 'pan' || this.spaceHeld || event.evt.button === 1) {
      event.evt.preventDefault();
      this.startPan(event.evt);
      return;
    }
    if (event.evt.button !== 0) {
      return;
    }
    if (tool === 'select') {
      this.selectAt(event.target);
      return;
    }
    const rawPoint = stage.getRelativePointerPosition();
    if (!rawPoint) {
      return;
    }
    const fromTouch = event.evt.pointerType === 'touch';
    if (fromTouch && Date.now() < this.suppressDrawUntil) {
      event.evt.preventDefault();
      return;
    }
    if (tool === 'crop') {
      this.startCrop(rawPoint, event.target);
      return;
    }
    const point = this.offsetDrawPoint(rawPoint, event.evt.pointerType);
    if (fromTouch && this.isDrawTool(tool)) {
      this.pendingTouchDraw = { point, tool };
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      this.startStroke(point, tool, fromTouch);
    } else {
      this.startShape(point, tool, fromTouch);
    }
  }

  private startStroke(
    point: { x: number; y: number },
    tool: 'brush' | 'eraser',
    fromTouch = false,
  ): void {
    const konva = this.konva;
    const target = this.inkLayer();
    if (!konva || !target) {
      return;
    }
    const stroke = new konva.Line({
      points: [point.x, point.y, point.x, point.y],
      stroke: this.ink() === 'mask' ? MASK_INK : this.color(),
      strokeWidth: this.imageBrushSize(),
      lineCap: 'round',
      lineJoin: 'round',
      tension: STROKE_TENSION,
      listening: false,
      globalCompositeOperation:
        tool === 'eraser' ? 'destination-out' : 'source-over',
    });
    target.add(stroke);
    this.stroke = stroke;
    this.lastPoint = point;
    this.push({ kind: 'add', node: stroke, parent: target });
    this.touchDrawCandidate = fromTouch
      ? {
          node: stroke,
          kind: 'stroke',
          startedAt: Date.now(),
          undoDepth: this.undoStack.length - 1,
          touchedBefore: this.touched(),
        }
      : null;
    this.markTouched(this.ink() === 'mask' ? 'mask' : 'picture');
  }

  /** The brush as the picture stores it, from the size the hand chose. */
  private imageBrushSize(): number {
    return brushImageSize(this.brushSize(), this.stage?.scaleX() ?? 1);
  }

  /** The paint layer the current ink lives on, which is what an eraser eats. */
  private inkLayer(): Layer | null {
    return this.ink() === 'mask' ? this.maskLayer : this.colorLayer;
  }

  private startShape(
    point: { x: number; y: number },
    tool: 'rect' | 'ellipse' | 'line',
    fromTouch = false,
  ): void {
    const konva = this.konva;
    const layer = this.inkLayer();
    if (!konva || !layer) {
      return;
    }
    const ink = this.ink();
    const stroke = ink === 'mask' ? MASK_INK : this.color();
    const shape: Shape =
      tool === 'rect'
        ? new konva.Rect({
            x: point.x,
            y: point.y,
            width: 0,
            height: 0,
            fill: stroke,
          })
        : tool === 'ellipse'
          ? new konva.Ellipse({
              x: point.x,
              y: point.y,
              radiusX: 0,
              radiusY: 0,
              fill: stroke,
            })
          : new konva.Line({
              points: [point.x, point.y, point.x, point.y],
              stroke,
              strokeWidth: this.imageBrushSize(),
              lineCap: 'round',
            });
    shape.setAttr(SHAPE_INK_ATTR, ink);
    shape.setAttr(SHAPE_EDITABLE_ATTR, true);
    layer.add(shape);
    this.bindShape(shape);
    this.draft = shape;
    this.draftKind = tool;
    this.draftOrigin = point;
    this.push({ kind: 'add', node: shape, parent: layer });
    this.touchDrawCandidate = fromTouch
      ? {
          node: shape,
          kind: 'shape',
          startedAt: Date.now(),
          undoDepth: this.undoStack.length - 1,
          touchedBefore: this.touched(),
        }
      : null;
    this.markTouched(ink === 'mask' ? 'mask' : 'picture');
  }

  private onPointerMove(event?: KonvaEventObject<PointerEvent>): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    const rawPoint = stage.getRelativePointerPosition();
    if (!rawPoint) {
      return;
    }
    const point = this.offsetDrawPoint(rawPoint, event?.evt.pointerType);
    this.moveBrushRing(point);
    const pendingTouch = this.pendingTouchDraw;
    if (pendingTouch) {
      const scale = this.stage?.scaleX() ?? 1;
      const travelPx =
        Math.hypot(
          point.x - pendingTouch.point.x,
          point.y - pendingTouch.point.y,
        ) * scale;
      if (travelPx < TOUCH_DRAW_SLOP_PX) {
        return;
      }
      if (pendingTouch.tool === 'brush' || pendingTouch.tool === 'eraser') {
        this.startStroke(pendingTouch.point, pendingTouch.tool, true);
        if (this.stroke) {
          this.lastPoint = pendingTouch.point;
          this.stroke.points([
            pendingTouch.point.x,
            pendingTouch.point.y,
            point.x,
            point.y,
          ]);
          this.lastPoint = point;
        }
      } else {
        this.startShape(pendingTouch.point, pendingTouch.tool, true);
        this.resizeDraft(point);
      }
      this.pendingTouchDraw = null;
    }
    if (this.stroke) {
      const gate = pointSpacing(SCREEN_POINT_SPACING, stage.scaleX());
      const dx = point.x - this.lastPoint.x;
      const dy = point.y - this.lastPoint.y;
      if (dx * dx + dy * dy < gate * gate) {
        return;
      }
      this.lastPoint = point;
      this.stroke.points([...this.stroke.points(), point.x, point.y]);
      return;
    }
    if (this.cropDrafting) {
      this.dragCrop(point);
      return;
    }
    if (!this.draft) {
      return;
    }
    this.resizeDraft(point);
  }

  /** Grow the shape being drawn out from where the drag began. */
  private resizeDraft(point: { x: number; y: number }): void {
    const draft = this.draft;
    if (!draft) {
      return;
    }
    const width = point.x - this.draftOrigin.x;
    const height = point.y - this.draftOrigin.y;
    // Holding the aspect lock draws a square, a circle or a straight line.
    const square = this.lockAspect() && this.shiftHeld;
    const side = Math.max(Math.abs(width), Math.abs(height));
    const w = square ? Math.sign(width || 1) * side : width;
    const h = square ? Math.sign(height || 1) * side : height;
    if (this.draftKind === 'rect') {
      draft.setAttrs({
        x: Math.min(this.draftOrigin.x, this.draftOrigin.x + w),
        y: Math.min(this.draftOrigin.y, this.draftOrigin.y + h),
        width: Math.abs(w),
        height: Math.abs(h),
      });
    } else if (this.draftKind === 'ellipse') {
      draft.setAttrs({
        x: this.draftOrigin.x + w / 2,
        y: this.draftOrigin.y + h / 2,
        radiusX: Math.abs(w) / 2,
        radiusY: Math.abs(h) / 2,
      });
    } else {
      (draft as Line).points([
        this.draftOrigin.x,
        this.draftOrigin.y,
        this.draftOrigin.x + w,
        this.draftOrigin.y + h,
      ]);
    }
  }

  private endGesture(): void {
    this.stroke = null;
    this.touchDrawCandidate = null;
    this.pendingTouchDraw = null;
    const drawn = this.draft;
    this.draft = null;
    this.cropDrafting = false;
    if (drawn && this.isDegenerate(drawn)) {
      // A click that drew nothing leaves no shape and no history entry.
      drawn.destroy();
      this.undoStack.pop();
      this.syncHistory();
    }
    if (this.panFrom) {
      this.panFrom = null;
      window.removeEventListener('pointermove', this.onWindowPointerMove);
      this.applyCursor();
    }
  }

  /** Whether a shape came out too small to be anything the reader meant. */
  private isDegenerate(shape: Shape): boolean {
    if (this.draftKind !== 'line') {
      return shape.width() < 1 || shape.height() < 1;
    }
    const points = (shape as Line).points();
    return Math.hypot(points[2] - points[0], points[3] - points[1]) < 1;
  }

  // -- brush preview -------------------------------------------------------

  private buildBrushRing(): void {
    const konva = this.konva;
    if (!konva || !this.uiLayer) {
      return;
    }
    this.brushRing = new konva.Circle({
      x: 0,
      y: 0,
      radius: 0,
      stroke: '#0f172a',
      strokeWidth: 1,
      strokeScaleEnabled: false,
      shadowColor: '#ffffff',
      shadowBlur: 0,
      listening: false,
      visible: false,
    });
    this.uiLayer.add(this.brushRing);
  }

  /** Show exactly how much of the picture the next stroke will cover. */
  private updateBrushRing(): void {
    const ring = this.brushRing;
    if (!ring) {
      return;
    }
    const painting = this.tool() === 'brush' || this.tool() === 'eraser';
    ring.setAttrs({
      radius: this.imageBrushSize() / 2,
      stroke: this.ink() === 'mask' ? MASK_INK : this.color(),
      // The ring only appears once the pointer has said where it is.
      visible: painting && ring.visible(),
    });
  }

  private moveBrushRing(point: { x: number; y: number }): void {
    const ring = this.brushRing;
    if (!ring) {
      return;
    }
    const painting = this.tool() === 'brush' || this.tool() === 'eraser';
    ring.setAttrs({
      x: point.x,
      y: point.y,
      radius: this.imageBrushSize() / 2,
      visible: painting,
    });
  }

  // -- panning -------------------------------------------------------------

  private startPan(event: PointerEvent): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    this.panFrom = {
      x: event.clientX,
      y: event.clientY,
      stageX: stage.x(),
      stageY: stage.y(),
    };
    window.addEventListener('pointermove', this.onWindowPointerMove);
    this.setCursor('grabbing');
  }

  private movePan(event: PointerEvent): void {
    const from = this.panFrom;
    if (!from || !this.stage) {
      return;
    }
    this.stage.position({
      x: from.stageX + (event.clientX - from.x),
      y: from.stageY + (event.clientY - from.y),
    });
  }

  // -- selection -----------------------------------------------------------

  private selectAt(target: Node): void {
    if (target.getParent() === this.transformer) {
      // A grab on a resize handle is the start of a resize, not a new pick.
      return;
    }
    const hit = target === this.stage ? null : target;
    this.select(hit && this.isEditableShape(hit) ? hit : null);
  }

  private select(node: Node | null): void {
    this.transformer?.nodes(node ? [node] : []);
  }

  private bindShape(shape: Shape): void {
    shape.on('dragstart transformstart', () => {
      this.gestureFrom = placementOf(shape);
    });
    shape.on('dragend transformend', () => {
      const before = this.gestureFrom;
      this.gestureFrom = null;
      if (before) {
        this.push({
          kind: 'place',
          node: shape,
          before,
          after: placementOf(shape),
        });
        this.markTouched(
          this.inkOfShape(shape) === 'mask' ? 'mask' : 'picture',
        );
      }
    });
  }

  public deleteSelection(): void {
    const nodes = (this.transformer?.nodes() ?? []) as Shape[];
    if (!nodes.length) {
      return;
    }
    const layerForNode = (node: Shape): Layer | null => {
      const layer = node.getLayer();
      return layer && (layer === this.colorLayer || layer === this.maskLayer)
        ? layer
        : null;
    };
    let touchedPicture = false;
    let touchedMask = false;
    this.select(null);
    for (const node of nodes) {
      const layer = layerForNode(node);
      if (!layer) {
        continue;
      }
      const ink = this.inkOfShape(node);
      if (ink === 'mask') {
        touchedMask = true;
      } else {
        touchedPicture = true;
      }
      node.remove();
      this.push({ kind: 'remove', node, parent: layer });
    }
    if (touchedPicture) {
      this.markTouched('picture');
    }
    if (touchedMask) {
      this.markTouched('mask');
    }
  }

  // -- history -------------------------------------------------------------

  private push(op: EditorOp): void {
    this.undoStack.push(op);
    this.redoStack.length = 0;
    this.syncHistory();
  }

  private syncHistory(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
    this.historyStep.set(this.undoStack.at(-1) ?? null);
  }

  public undo(): void {
    const op = this.undoStack.pop();
    if (!op) {
      return;
    }
    this.invert(op, true);
    this.redoStack.push(op);
    this.syncHistory();
  }

  public redo(): void {
    const op = this.redoStack.pop();
    if (!op) {
      return;
    }
    this.invert(op, false);
    this.undoStack.push(op);
    this.syncHistory();
  }

  /** Play one op backwards or forwards. Nodes are kept, never re-created. */
  private invert(op: EditorOp, backwards: boolean): void {
    if (op.kind === 'place') {
      op.node.setAttrs(backwards ? op.before : op.after);
      return;
    }
    if (op.kind === 'crop') {
      this.applyDocRect(backwards ? op.before : op.after);
      return;
    }
    if (op.kind === 'frame') {
      const target = backwards ? op.before : op.after;
      this.frameRect?.setAttrs(target.rect);
      // The frame and the size being asked for are one thing, so stepping the
      // frame back has to step the request back with it.
      this.writeSize(target.width, target.height);
      this.syncFrame();
      return;
    }
    const attach = op.kind === 'add' ? !backwards : backwards;
    if (attach) {
      op.parent.add(op.node);
    } else {
      this.select(null);
      op.node.remove();
    }
  }

  // -- crop ----------------------------------------------------------------

  private cropDrafting = false;
  private shiftHeld = false;

  private buildCrop(): void {
    const konva = this.konva;
    const layer = this.uiLayer;
    if (!konva || !layer) {
      return;
    }
    this.cropShade = new konva.Rect({
      fill: CROP_TINT,
      listening: false,
      visible: false,
    });
    this.cropRect = new konva.Rect({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      stroke: CROP_INK,
      strokeWidth: 2,
      strokeScaleEnabled: false,
      dash: [8, 5],
      draggable: true,
      visible: false,
    });
    this.cropTransformer = new konva.Transformer({
      rotateEnabled: false,
      ignoreStroke: true,
      keepRatio: this.lockAspect(),
      borderStroke: CROP_INK,
      anchorStroke: CROP_INK,
      visible: false,
    });
    this.cropRect.on('transform', () => {
      const rect = this.cropRect;
      if (!rect) {
        return;
      }
      rect.setAttrs({
        width: Math.max(8, rect.width() * rect.scaleX()),
        height: Math.max(8, rect.height() * rect.scaleY()),
        scaleX: 1,
        scaleY: 1,
      });
    });
    layer.add(this.cropShade, this.cropRect, this.cropTransformer);
  }

  private startCrop(point: { x: number; y: number }, target: Node): void {
    if (
      target === this.cropRect ||
      target.getParent() === this.cropTransformer
    ) {
      return;
    }
    this.draftOrigin = point;
    this.cropDrafting = true;
    this.cropPending.set(true);
    this.cropRect?.setAttrs({
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      visible: true,
    });
    this.cropTransformer?.nodes([]);
  }

  private dragCrop(point: { x: number; y: number }): void {
    const rect = this.cropRect;
    if (!rect) {
      return;
    }
    let width = point.x - this.draftOrigin.x;
    let height = point.y - this.draftOrigin.y;
    if (this.lockAspect() && this.shiftHeld) {
      const side = Math.max(Math.abs(width), Math.abs(height));
      width = Math.sign(width || 1) * side;
      height = Math.sign(height || 1) * side;
    }
    rect.setAttrs({
      x: Math.min(this.draftOrigin.x, this.draftOrigin.x + width),
      y: Math.min(this.draftOrigin.y, this.draftOrigin.y + height),
      width: Math.abs(width),
      height: Math.abs(height),
    });
    this.cropTransformer?.nodes([rect]);
    this.cropTransformer?.visible(true);
  }

  /** Take the selection as the new extent of the picture. */
  public applyCrop(): void {
    const rect = this.cropRect;
    if (!rect || rect.width() < 8 || rect.height() < 8) {
      return;
    }
    const before = { ...this.docRect };
    const after: EditorRect = {
      x: Math.round(rect.x()),
      y: Math.round(rect.y()),
      width: Math.round(rect.width()),
      height: Math.round(rect.height()),
    };
    this.push({ kind: 'crop', before, after });
    this.applyDocRect(after);
    this.clearCrop();
    this.markTouched('picture');
  }

  public clearCrop(): void {
    this.cropPending.set(false);
    this.cropDrafting = false;
    this.cropRect?.visible(false);
    this.cropShade?.visible(false);
    this.cropTransformer?.nodes([]);
    this.cropTransformer?.visible(false);
  }

  /**
   * Move the extent of the picture. The layers are left alone: cropping narrows
   * what an export reads rather than throwing pixels away, which is what lets it
   * be stepped back.
   */
  private applyDocRect(rect: EditorRect): void {
    this.docRect = { ...rect };
    this.docSize.set({ width: rect.width, height: rect.height });
    this.syncGround();
    this.frameFromForm();
    this.fit();
  }

  // -- the frame the canvas grows into -------------------------------------

  private buildFrame(): void {
    const konva = this.konva;
    const layer = this.uiLayer;
    if (!konva || !layer) {
      return;
    }
    this.dimRects = [0, 1, 2, 3].map(
      () =>
        new konva.Rect({ fill: FRAME_TINT, listening: false, visible: false }),
    );
    this.frameRect = new konva.Rect({
      x: this.docRect.x,
      y: this.docRect.y,
      width: this.docRect.width,
      height: this.docRect.height,
      stroke: FRAME_INK,
      strokeWidth: 2,
      strokeScaleEnabled: false,
      dash: [10, 6],
      draggable: true,
      visible: false,
    });
    this.frameTransformer = new konva.Transformer({
      rotateEnabled: false,
      ignoreStroke: true,
      borderStroke: FRAME_INK,
      anchorStroke: FRAME_INK,
      visible: false,
    });
    layer.add(...this.dimRects, this.frameRect, this.frameTransformer);

    const startGesture = (): void => {
      const rect = this.frameRect;
      if (rect) {
        this.frameGestureFrom = {
          rect: rectOf(rect),
          width: this.formWidth(),
          height: this.formHeight(),
        };
      }
    };
    const endGesture = (): void => {
      const before = this.frameGestureFrom;
      const rect = this.frameRect;
      this.frameGestureFrom = null;
      if (!before || !rect) {
        return;
      }
      this.push({
        kind: 'frame',
        before,
        after: {
          rect: rectOf(rect),
          width: this.formWidth(),
          height: this.formHeight(),
        },
      });
      this.markTouched('frame');
    };

    this.frameRect.on('dragstart transformstart', startGesture);
    this.frameRect.on('dragend transformend', endGesture);
    this.frameRect.on('transform', () => {
      const rect = this.frameRect;
      if (!rect) {
        return;
      }
      // The frame carries its size as width and height rather than as a scale,
      // so the readout stays honest and the dashes keep their spacing.
      rect.setAttrs({
        width: Math.max(8, rect.width() * rect.scaleX()),
        height: Math.max(8, rect.height() * rect.scaleY()),
        scaleX: 1,
        scaleY: 1,
      });
      this.frameToForm();
    });
    this.frameRect.on('dragmove', () => this.frameToForm());
  }

  /** Turn the frame on or off from the form's own answer. */
  private syncFrameVisibility(): void {
    const on = this.outpaintEnabled() && this.mode() === 'inpainting';
    this.frameOn.set(on);
    this.frameRect?.visible(on);
    this.frameTransformer?.visible(on);
    this.frameTransformer?.nodes(on && this.frameRect ? [this.frameRect] : []);
    for (const rect of this.dimRects) {
      rect.visible(on);
    }
    if (on) {
      this.frameFromForm();
      // The frame is dragged and resized with the same tool that moves a shape,
      // so turning it on hands the pointer over to that tool.
      this.setTool('select');
      this.fit();
    } else {
      this.syncFrame();
    }
  }

  public toggleFrame(): void {
    this.form().controls.outpaintEnabled.setValue(!this.outpaintEnabled());
  }

  /** Place the frame from the size the request is asking for. */
  private frameFromForm(): void {
    const rect = this.frameRect;
    if (!rect || this.writingSize) {
      return;
    }
    const placed = frameForTarget(
      this.docRect,
      this.formWidth(),
      this.formHeight(),
      this.handOffset,
      this.form().controls.outpaintAnchor.value,
    );
    rect.setAttrs({
      x: this.docRect.x + placed.x,
      y: this.docRect.y + placed.y,
      width: placed.width,
      height: placed.height,
    });
    this.syncFrame();
  }

  /** Where the picture was last put by hand inside the canvas being grown. */
  private handOffset: { x: number; y: number } | null = null;

  /** Write a dragged or resized frame back into the size being asked for. */
  private frameToForm(): void {
    const rect = this.frameRect;
    if (!rect) {
      return;
    }
    const relative: EditorRect = {
      x: rect.x() - this.docRect.x,
      y: rect.y() - this.docRect.y,
      width: rect.width(),
      height: rect.height(),
    };
    const target = targetForFrame(
      relative,
      DIMENSION_STEP,
      MIN_DIMENSION,
      MAX_DIMENSION,
    );
    this.handOffset = offsetForFrame(relative);
    this.writeSize(target.width, target.height);
    this.form().controls.outpaintAnchor.setValue(
      anchorForOffset(
        this.handOffset,
        target.width - this.docRect.width,
        target.height - this.docRect.height,
      ),
    );
    this.syncFrame();
  }

  /**
   * Set the size the request is asking for without the resulting notification
   * coming back round and moving the frame out from under the hand dragging it.
   */
  private writeSize(width: number, height: number): void {
    const controls = this.form().controls;
    this.writingSize = true;
    try {
      if (controls.width.value !== width) {
        controls.width.setValue(width);
      }
      if (controls.height.value !== height) {
        controls.height.setValue(height);
      }
    } finally {
      this.writingSize = false;
    }
    this.formWidth.set(width);
    this.formHeight.set(height);
  }

  /** Redraw the dimmed border and the live pixel readout from the frame. */
  private syncFrame(): void {
    const rect = this.frameRect;
    if (!rect) {
      return;
    }
    const fx = rect.x();
    const fy = rect.y();
    const fw = rect.width();
    const fh = rect.height();
    const docRight = this.docRect.x + this.docRect.width;
    const docBottom = this.docRect.y + this.docRect.height;
    const top = Math.max(0, Math.min(fh, this.docRect.y - fy));
    const bottom = Math.max(0, Math.min(fh - top, fy + fh - docBottom));
    const middleY = fy + top;
    const middleH = Math.max(0, fh - top - bottom);
    const left = Math.max(0, Math.min(fw, this.docRect.x - fx));
    const right = Math.max(0, Math.min(fw - left, fx + fw - docRight));
    const bands = [
      { x: fx, y: fy, width: fw, height: top },
      { x: fx, y: fy + fh - bottom, width: fw, height: bottom },
      { x: fx, y: middleY, width: left, height: middleH },
      { x: fx + fw - right, y: middleY, width: right, height: middleH },
    ];
    this.dimRects.forEach((dim, index) => dim.setAttrs(bands[index]));
    this.frameSize.set({ width: Math.round(fw), height: Math.round(fh) });
  }

  // -- committing ----------------------------------------------------------

  /**
   * Flatten what the session staged and hand it to the source card. The picture
   * is re-encoded only where pixel work actually changed it, so a session that
   * only painted a mask returns the bytes it was given rather than a fresh
   * generation of lossy encoding.
   */
  public async onApply(): Promise<void> {
    if (this.busy() || !this.isBrowser) {
      return;
    }
    const token = ++this.exportToken;
    this.busy.set(true);
    try {
      const image = await this.exportPicture();
      const mask = await this.exportMask();
      if (token !== this.exportToken || !image) {
        return;
      }
      this.applied.emit({
        image,
        mask,
        offset: this.frameOn() ? this.handOffset : null,
      });
      this.baseImage = image;
      this.touched.set(NOTHING_TOUCHED);
      this.appliedStep.set(this.historyStep());
      this.offHistoryEdit.set(false);
    } finally {
      if (token === this.exportToken) {
        this.busy.set(false);
      }
    }
  }

  private async exportPicture(): Promise<SourceImage | null> {
    const original = this.baseImage;
    const unchanged =
      !needsPictureExport(this.touched(), this.fromBlank()) &&
      this.docRect.x === 0 &&
      this.docRect.y === 0 &&
      original !== null &&
      this.docRect.width === original.width &&
      this.docRect.height === original.height;
    if (unchanged) {
      return original;
    }
    const canvas = this.renderLayers([this.imageLayer, this.colorLayer]);
    if (!canvas) {
      return original;
    }
    const blob = await canvasToBlob(canvas, 'image/webp', 0.95);
    return blob ? await blobToSourceImage(blob) : original;
  }

  private async exportMask(): Promise<Blob | null> {
    const canvas = this.renderLayers([this.maskLayer]);
    if (!canvas) {
      return null;
    }
    const result = await exportMaskFromPaintLayer(canvas);
    return result.painted ? result.blob : null;
  }

  /**
   * Read the given layers at the picture's own resolution. The view's zoom and
   * pan are put back to one-to-one for the read and restored afterwards, so an
   * export is the same whatever the reader happened to be looking at, and the
   * handles and the frame are hidden so none of the editor's own furniture ends
   * up in the request.
   */
  private renderLayers(layers: (Layer | null)[]): HTMLCanvasElement | null {
    const stage = this.stage;
    const { x, y, width, height } = this.docRect;
    if (!stage || width < 1 || height < 1) {
      return null;
    }
    const scale = stage.scaleX();
    const position = stage.position();
    const transformerNodes = this.transformer?.nodes() ?? [];
    const ringVisible = this.brushRing?.visible() ?? false;
    this.transformer?.nodes([]);
    this.brushRing?.visible(false);
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    try {
      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const context = out.getContext('2d');
      if (!context) {
        return null;
      }
      for (const layer of layers) {
        if (!layer) {
          continue;
        }
        context.drawImage(
          layer.toCanvas({ x, y, width, height, pixelRatio: 1 }),
          0,
          0,
        );
      }
      return out;
    } finally {
      stage.scale({ x: scale, y: scale });
      stage.position(position);
      this.transformer?.nodes(transformerNodes);
      this.brushRing?.visible(ringVisible);
    }
  }

  // -- keyboard and cursor -------------------------------------------------

  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.shiftHeld = true;
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.onClose();
      return;
    }
    if (event.key === ' ' && !this.isTypingTarget(event.target)) {
      event.preventDefault();
      this.spaceHeld = true;
      this.setCursor('grab');
      return;
    }
    if (event.key === 'Delete') {
      this.deleteSelection();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }
    if (key !== 'z') {
      return;
    }
    event.preventDefault();
    if (event.shiftKey) {
      this.redo();
    } else {
      this.undo();
    }
  }

  public onKeyup(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.shiftHeld = false;
    }
    if (event.key === ' ') {
      this.spaceHeld = false;
      this.applyCursor();
    }
  }

  /** Space belongs to a text box or a button when one has the focus. */
  private isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    const tag = element?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON';
  }

  private applyCursor(): void {
    const tool = this.tool();
    if (tool === 'pan') {
      this.setCursor('grab');
    } else if (tool === 'select') {
      this.setCursor('default');
    } else {
      this.setCursor('crosshair');
    }
  }

  private setCursor(cursor: string): void {
    const host = this.stageHost()?.nativeElement;
    if (host) {
      host.style.cursor = cursor;
    }
  }

  private clampPointerOffset(value: string | number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return MIN_POINTER_OFFSET_PX;
    }
    return Math.min(
      MAX_POINTER_OFFSET_PX,
      Math.max(MIN_POINTER_OFFSET_PX, Math.round(parsed)),
    );
  }

  private isPointerOffsetDirection(
    value: string,
  ): value is PointerOffsetDirection {
    return this.pointerOffsetDirections.includes(
      value as PointerOffsetDirection,
    );
  }

  private loadPointerPrefs(): void {
    const stored = this.db.get<Partial<SourceEditorPointerPrefs>>(
      POINTER_PREFS_KEY,
      {},
    );
    if (typeof stored !== 'object' || stored === null) {
      return;
    }
    if (typeof stored.enabled === 'boolean') {
      this.pointerOffsetOn.set(stored.enabled);
    }
    if (
      typeof stored.direction === 'string' &&
      this.isPointerOffsetDirection(stored.direction)
    ) {
      this.pointerOffsetDirection.set(stored.direction);
    }
    if (typeof stored.x === 'number' || typeof stored.x === 'string') {
      this.pointerOffsetX.set(this.clampPointerOffset(stored.x));
    }
    if (typeof stored.y === 'number' || typeof stored.y === 'string') {
      this.pointerOffsetY.set(this.clampPointerOffset(stored.y));
    }
  }

  private persistPointerPrefs(): void {
    this.db.store(POINTER_PREFS_KEY, {
      enabled: this.pointerOffsetOn(),
      direction: this.pointerOffsetDirection(),
      x: this.pointerOffsetX(),
      y: this.pointerOffsetY(),
    } satisfies SourceEditorPointerPrefs);
  }

  private directionVector(direction: PointerOffsetDirection): {
    x: -1 | 0 | 1;
    y: -1 | 0 | 1;
  } {
    switch (direction) {
      case 'up':
        return { x: 0, y: -1 };
      case 'up-right':
        return { x: 1, y: -1 };
      case 'right':
        return { x: 1, y: 0 };
      case 'down-right':
        return { x: 1, y: 1 };
      case 'down':
        return { x: 0, y: 1 };
      case 'down-left':
        return { x: -1, y: 1 };
      case 'left':
        return { x: -1, y: 0 };
      case 'up-left':
        return { x: -1, y: -1 };
    }
  }

  /** Shift touch draw placement away from the finger for visibility. */
  private offsetDrawPoint(
    point: { x: number; y: number },
    pointerType: string | undefined,
  ): { x: number; y: number } {
    if (!this.pointerOffsetOn() || pointerType !== 'touch') {
      return point;
    }
    const scale = this.stage?.scaleX() ?? 1;
    const direction = this.directionVector(this.pointerOffsetDirection());
    return {
      x: point.x + (direction.x * this.pointerOffsetX()) / scale,
      y: point.y + (direction.y * this.pointerOffsetY()) / scale,
    };
  }

  /**
   * Touch can begin as a one-finger mark before a second finger lands to pinch.
   * If that happens quickly and the mark is still tiny, roll it back.
   */
  private cancelRecentTouchDrawCandidateForPinch(force = false): void {
    const candidate = this.touchDrawCandidate;
    if (!candidate) {
      return;
    }
    if (!force && Date.now() - candidate.startedAt > PINCH_CANCEL_WINDOW_MS) {
      this.touchDrawCandidate = null;
      return;
    }
    if (force) {
      candidate.node.destroy();
      const op = this.undoStack[candidate.undoDepth];
      if (op?.kind === 'add' && op.node === candidate.node) {
        this.undoStack.splice(candidate.undoDepth, 1);
        this.syncHistory();
      }
      this.touched.set(candidate.touchedBefore);
      this.touchDrawCandidate = null;
      return;
    }
    const scale = this.stage?.scaleX() ?? 1;
    if (candidate.kind === 'stroke') {
      const stroke = candidate.node as Line;
      const points = stroke.points();
      const count = points.length;
      if (count >= 4) {
        const startX = points[0] ?? 0;
        const startY = points[1] ?? 0;
        const endX = points[count - 2] ?? startX;
        const endY = points[count - 1] ?? startY;
        const travelPx = Math.hypot(endX - startX, endY - startY) * scale;
        if (travelPx > PINCH_CANCEL_MAX_TRAVEL_PX) {
          this.touchDrawCandidate = null;
          return;
        }
      }
    } else {
      const widthPx = candidate.node.width() * scale;
      const heightPx = candidate.node.height() * scale;
      if (Math.max(widthPx, heightPx) > PINCH_CANCEL_MAX_TRAVEL_PX) {
        this.touchDrawCandidate = null;
        return;
      }
    }
    candidate.node.destroy();
    const op = this.undoStack[candidate.undoDepth];
    if (op?.kind === 'add' && op.node === candidate.node) {
      this.undoStack.splice(candidate.undoDepth, 1);
      this.syncHistory();
    }
    this.touched.set(candidate.touchedBefore);
    this.touchDrawCandidate = null;
  }

  private inkOfShape(node: Node): SourceEditorInk {
    return node.getAttr(SHAPE_INK_ATTR) === 'mask' ? 'mask' : 'color';
  }

  private isEditableShape(node: Node): node is Shape {
    return node.getAttr(SHAPE_EDITABLE_ATTR) === true;
  }

  private editableShapes(): Shape[] {
    const candidates = [
      ...(this.colorLayer?.getChildren() ?? []),
      ...(this.maskLayer?.getChildren() ?? []),
      ...(this.shapeLayer?.getChildren() ?? []),
    ];
    return candidates.filter((node): node is Shape =>
      this.isEditableShape(node),
    );
  }

  /** Layer visibility toggles are display-only helpers and do not affect export. */
  private syncLayerVisibility(): void {
    const imageCanvas = this.imageLayer?.getNativeCanvasElement();
    if (imageCanvas) {
      imageCanvas.style.opacity = this.showImageLayer() ? '1' : '0';
    }
    const maskCanvas = this.maskLayer?.getNativeCanvasElement();
    if (maskCanvas) {
      maskCanvas.style.opacity = this.showMaskLayer()
        ? `${MASK_LAYER_OPACITY}`
        : '0';
    }
  }
}
