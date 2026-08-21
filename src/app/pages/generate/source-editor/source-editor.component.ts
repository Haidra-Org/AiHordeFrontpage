import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { useScrollLock } from '../../../helper/scroll-lock';
import type { SourceImage } from '../../../helper/source-image';
import type { Stage } from 'konva/lib/Stage';
import type { Layer } from 'konva/lib/Layer';
import type { KonvaEventObject, Node } from 'konva/lib/Node';
import type { Shape } from 'konva/lib/Shape';
import type { Line } from 'konva/lib/shapes/Line';
import type { Rect } from 'konva/lib/shapes/Rect';
import type { Transformer } from 'konva/lib/shapes/Transformer';

/** The Konva namespace as it arrives from the dynamic import. */
type KonvaNamespace = (typeof import('konva'))['default'];

/**
 * What the editor opens on: an attached picture, or a blank sheet at the size
 * the form is currently asking for.
 */
export interface SourceEditorDoc {
  image: SourceImage | null;
  width: number;
  height: number;
}

export type SourceEditorTool =
  | 'brush'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'select'
  | 'pan';

/** Which of the two inks a brush stroke is laid down in. */
export type SourceEditorInk = 'mask' | 'color';

/** The placement an undoable move or resize records, either side of a gesture. */
interface NodePlacement {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

type EditorOp =
  | { kind: 'add'; node: Shape; parent: Layer }
  | { kind: 'remove'; node: Shape; parent: Layer }
  | {
      kind: 'place';
      node: Shape;
      before: NodePlacement;
      after: NodePlacement;
    };

const MIN_BRUSH = 5;
const MAX_BRUSH = 200;
const MIN_SCALE = 0.02;
const MAX_SCALE = 24;
const ZOOM_STEP = 1.08;
/**
 * Mask strokes are laid down opaque and the whole layer is dimmed instead, so
 * that overlapping strokes read as one even coverage rather than stacking into
 * darker patches where the hand doubled back.
 */
const MASK_LAYER_OPACITY = 0.5;
const MASK_INK = '#38bdf8';
const FRAME_INK = '#f59e0b';
/** The ground the request will invent, tinted so it reads as absent rather than
 *  as a surface, over a dark checker as well as a light one. */
const FRAME_TINT = 'rgba(245, 158, 11, 0.22)';
/**
 * How far the pointer has to travel, in document pixels, before a stroke takes
 * another point. Points closer than this make `tension` smoothing knot up.
 */
const MIN_POINT_SPACING = 2;

function placementOf(node: Node): NodePlacement {
  return {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  };
}

/**
 * A fullscreen editor for the source image, built on Konva as a feel spike: the
 * point is how a stroke, a zoom and a drag behave, so nothing here is wired back
 * into the request. Closing discards.
 *
 * The document sits at native pixel coordinates and the stage is what scales, so
 * a brush size is a size in image pixels whatever the zoom is. Konva itself is
 * fetched on open and never at module load, because the page renders on the
 * server and the editor stays out of the initial bundle.
 */
@Component({
  selector: 'app-source-editor',
  imports: [A11yModule],
  templateUrl: './source-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceEditorComponent implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly scrollLock = useScrollLock();

  public readonly doc = input.required<SourceEditorDoc>();
  public readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly stageHost =
    viewChild<ElementRef<HTMLDivElement>>('stageHost');

  public readonly tool = signal<SourceEditorTool>('brush');
  public readonly ink = signal<SourceEditorInk>('mask');
  public readonly brushSize = signal(40);
  public readonly color = signal('#f43f5e');
  public readonly zoomPercent = signal(100);
  public readonly frameOn = signal(false);
  public readonly frameSize = signal({ width: 0, height: 0 });
  public readonly canUndo = signal(false);
  public readonly canRedo = signal(false);
  public readonly ready = signal(false);

  public readonly minBrush = MIN_BRUSH;
  public readonly maxBrush = MAX_BRUSH;
  public readonly tools: readonly SourceEditorTool[] = [
    'brush',
    'eraser',
    'rect',
    'ellipse',
    'select',
    'pan',
  ];

  public readonly labels: Record<SourceEditorTool, string> = {
    brush: 'Brush',
    eraser: 'Eraser',
    rect: 'Rect',
    ellipse: 'Ellipse',
    select: 'Select',
    pan: 'Pan',
  };

  private konva: KonvaNamespace | null = null;
  private stage: Stage | null = null;
  private imageLayer: Layer | null = null;
  private colorLayer: Layer | null = null;
  private maskLayer: Layer | null = null;
  private shapeLayer: Layer | null = null;
  private uiLayer: Layer | null = null;
  private transformer: Transformer | null = null;
  private frameRect: Rect | null = null;
  private frameTransformer: Transformer | null = null;
  private dimRects: Rect[] = [];
  private resizeObserver: ResizeObserver | null = null;

  private readonly undoStack: EditorOp[] = [];
  private readonly redoStack: EditorOp[] = [];

  /** The stroke or the shape the pointer is currently laying down. */
  private stroke: Line | null = null;
  private draft: Shape | null = null;
  private draftKind: 'rect' | 'ellipse' = 'rect';
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

  private readonly onWindowPointerMove = (event: PointerEvent): void =>
    this.movePan(event);
  private readonly onWindowPointerUp = (): void => this.endGesture();

  constructor() {
    afterNextRender(() => void this.setup());
    if (this.isBrowser) {
      this.scrollLock.enable();
    }
  }

  public ngOnDestroy(): void {
    if (this.isBrowser) {
      window.removeEventListener('pointermove', this.onWindowPointerMove);
      window.removeEventListener('pointerup', this.onWindowPointerUp);
    }
    this.resizeObserver?.disconnect();
    this.stage?.destroy();
  }

  public onClose(): void {
    this.closed.emit();
  }

  /** Close only when the backdrop itself is clicked, not the panel within it. */
  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  public setTool(tool: SourceEditorTool): void {
    this.tool.set(tool);
    if (tool !== 'select') {
      this.select(null);
    }
    // Only the select tool moves things about: otherwise a stroke that starts on
    // a shape or on the frame would drag it instead of painting.
    for (const child of this.shapeLayer?.getChildren() ?? []) {
      if (child !== this.transformer) {
        child.draggable(tool === 'select');
      }
    }
    this.uiLayer?.listening(tool === 'select');
    this.applyCursor();
  }

  public setInk(ink: SourceEditorInk): void {
    this.ink.set(ink);
  }

  public setBrushSize(value: string): void {
    this.brushSize.set(Number(value));
  }

  public setColor(value: string): void {
    this.color.set(value);
  }

  // -- stage ---------------------------------------------------------------

  private async setup(): Promise<void> {
    const host = this.stageHost()?.nativeElement;
    if (!this.isBrowser || !host) {
      return;
    }
    const konva = (await import('konva')).default;
    this.konva = konva;
    const bounds = host.getBoundingClientRect();
    const stage = new konva.Stage({
      container: host,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    });
    this.stage = stage;

    this.imageLayer = new konva.Layer({ listening: false });
    this.colorLayer = new konva.Layer({ listening: false });
    this.maskLayer = new konva.Layer({ listening: false });
    this.shapeLayer = new konva.Layer();
    this.uiLayer = new konva.Layer({ listening: false });
    stage.add(
      this.imageLayer,
      this.colorLayer,
      this.maskLayer,
      this.shapeLayer,
      this.uiLayer,
    );
    this.maskLayer.getNativeCanvasElement().style.opacity = `${MASK_LAYER_OPACITY}`;

    this.transformer = new konva.Transformer({
      ignoreStroke: true,
      borderStroke: MASK_INK,
      anchorStroke: MASK_INK,
    });
    this.shapeLayer.add(this.transformer);

    const doc = this.doc();
    this.imageLayer.add(
      new konva.Image({
        image: await this.documentCanvas(),
        x: 0,
        y: 0,
        width: doc.width,
        height: doc.height,
      }),
    );

    this.buildFrame();
    this.bindStage();
    this.observeResize(host);
    this.fit();
    this.applyCursor();
    this.ready.set(true);
    this.panel()?.nativeElement.focus();
  }

  /**
   * The document as one canvas: the attached picture drawn into it, or white
   * where the editor was opened on a blank sheet.
   */
  private async documentCanvas(): Promise<HTMLCanvasElement> {
    const doc = this.doc();
    const canvas = document.createElement('canvas');
    canvas.width = doc.width;
    canvas.height = doc.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return canvas;
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, doc.width, doc.height);
    if (doc.image) {
      const bitmap = await createImageBitmap(doc.image.blob);
      context.drawImage(bitmap, 0, 0, doc.width, doc.height);
      bitmap.close();
    }
    return canvas;
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

  /** Frame the whole document with a margin, and centre it. */
  public fit(): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    const doc = this.doc();
    const frame = this.frameOn() ? this.frameRect : null;
    // Whatever the request will cover has to be on screen, so a frame that
    // reaches past the picture is what the view is fitted to.
    const left = Math.min(0, frame?.x() ?? 0);
    const top = Math.min(0, frame?.y() ?? 0);
    const right = Math.max(
      doc.width,
      (frame?.x() ?? 0) + (frame?.width() ?? 0),
    );
    const bottom = Math.max(
      doc.height,
      (frame?.y() ?? 0) + (frame?.height() ?? 0),
    );
    const width = right - left;
    const height = bottom - top;
    const scale =
      Math.min(stage.width() / width, stage.height() / height) * 0.9;
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (stage.width() - width * scale) / 2 - left * scale,
      y: (stage.height() - height * scale) / 2 - top * scale,
    });
    this.zoomPercent.set(Math.round(scale * 100));
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

  /** Rescale the stage, keeping the document point under `pointer` still. */
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
    this.zoomPercent.set(Math.round(scale * 100));
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
    stage.on('pointermove', () => this.onPointerMove());
    window.addEventListener('pointerup', this.onWindowPointerUp);
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
    const point = stage.getRelativePointerPosition();
    if (!point) {
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      this.startStroke(point, tool);
    } else {
      this.startShape(point, tool);
    }
  }

  private startStroke(
    point: { x: number; y: number },
    tool: 'brush' | 'eraser',
  ): void {
    const konva = this.konva;
    const target = this.inkLayer();
    if (!konva || !target) {
      return;
    }
    const stroke = new konva.Line({
      points: [point.x, point.y, point.x, point.y],
      stroke: this.ink() === 'mask' ? MASK_INK : this.color(),
      strokeWidth: this.brushSize(),
      lineCap: 'round',
      lineJoin: 'round',
      tension: 0.5,
      listening: false,
      globalCompositeOperation:
        tool === 'eraser' ? 'destination-out' : 'source-over',
    });
    target.add(stroke);
    this.stroke = stroke;
    this.lastPoint = point;
    this.push({ kind: 'add', node: stroke, parent: target });
  }

  /** The paint layer the current ink lives on, which is what an eraser eats. */
  private inkLayer(): Layer | null {
    return this.ink() === 'mask' ? this.maskLayer : this.colorLayer;
  }

  private startShape(
    point: { x: number; y: number },
    tool: 'rect' | 'ellipse',
  ): void {
    const konva = this.konva;
    const layer = this.shapeLayer;
    if (!konva || !layer) {
      return;
    }
    const shape: Shape =
      tool === 'rect'
        ? new konva.Rect({
            x: point.x,
            y: point.y,
            width: 0,
            height: 0,
            fill: this.color(),
          })
        : new konva.Ellipse({
            x: point.x,
            y: point.y,
            radiusX: 0,
            radiusY: 0,
            fill: this.color(),
          });
    layer.add(shape);
    this.bindShape(shape);
    this.draft = shape;
    this.draftKind = tool;
    this.draftOrigin = point;
    this.push({ kind: 'add', node: shape, parent: layer });
  }

  private onPointerMove(): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    const point = stage.getRelativePointerPosition();
    if (!point) {
      return;
    }
    if (this.stroke) {
      const dx = point.x - this.lastPoint.x;
      const dy = point.y - this.lastPoint.y;
      if (dx * dx + dy * dy < MIN_POINT_SPACING * MIN_POINT_SPACING) {
        return;
      }
      this.lastPoint = point;
      this.stroke.points([...this.stroke.points(), point.x, point.y]);
      return;
    }
    if (!this.draft) {
      return;
    }
    const width = point.x - this.draftOrigin.x;
    const height = point.y - this.draftOrigin.y;
    if (this.draftKind === 'rect') {
      this.draft.setAttrs({
        x: Math.min(this.draftOrigin.x, point.x),
        y: Math.min(this.draftOrigin.y, point.y),
        width: Math.abs(width),
        height: Math.abs(height),
      });
    } else {
      this.draft.setAttrs({
        x: this.draftOrigin.x + width / 2,
        y: this.draftOrigin.y + height / 2,
        radiusX: Math.abs(width) / 2,
        radiusY: Math.abs(height) / 2,
      });
    }
  }

  private endGesture(): void {
    this.stroke = null;
    const drawn = this.draft;
    this.draft = null;
    if (drawn && (drawn.width() < 1 || drawn.height() < 1)) {
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
    this.select(hit?.getLayer() === this.shapeLayer ? hit : null);
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
      }
    });
  }

  public deleteSelection(): void {
    const layer = this.shapeLayer;
    const nodes = this.transformer?.nodes() ?? [];
    if (!layer || !nodes.length) {
      return;
    }
    this.select(null);
    for (const node of nodes) {
      node.remove();
      this.push({ kind: 'remove', node: node as Shape, parent: layer });
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
    const attach = op.kind === 'add' ? !backwards : backwards;
    if (op.kind === 'place') {
      op.node.setAttrs(backwards ? op.before : op.after);
      return;
    }
    if (attach) {
      op.parent.add(op.node);
    } else {
      this.select(null);
      op.node.remove();
    }
  }

  // -- outpaint frame ------------------------------------------------------

  private buildFrame(): void {
    const konva = this.konva;
    const layer = this.uiLayer;
    if (!konva || !layer) {
      return;
    }
    const doc = this.doc();
    const margin = Math.round(Math.min(doc.width, doc.height) * 0.25);
    this.dimRects = [0, 1, 2, 3].map(
      () =>
        new konva.Rect({
          fill: FRAME_TINT,
          listening: false,
          visible: false,
        }),
    );
    this.frameRect = new konva.Rect({
      x: -margin,
      y: -margin,
      width: doc.width + margin * 2,
      height: doc.height + margin * 2,
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
      this.syncFrame();
    });
    this.frameRect.on('dragmove', () => this.syncFrame());
    this.syncFrame();
  }

  public toggleFrame(): void {
    const on = !this.frameOn();
    this.frameOn.set(on);
    this.frameRect?.visible(on);
    this.frameTransformer?.visible(on);
    this.frameTransformer?.nodes(on && this.frameRect ? [this.frameRect] : []);
    for (const rect of this.dimRects) {
      rect.visible(on);
    }
    this.syncFrame();
    if (on) {
      // The frame is dragged and resized with the same tool that moves a shape,
      // so turning it on hands the pointer over to that tool.
      this.setTool('select');
      this.fit();
    }
  }

  /** Redraw the dimmed border and the live pixel readout from the frame. */
  private syncFrame(): void {
    const rect = this.frameRect;
    if (!rect) {
      return;
    }
    const doc = this.doc();
    const fx = rect.x();
    const fy = rect.y();
    const fw = rect.width();
    const fh = rect.height();
    const top = Math.max(0, Math.min(fh, -fy));
    const bottom = Math.max(0, Math.min(fh - top, fy + fh - doc.height));
    const middleY = fy + top;
    const middleH = Math.max(0, fh - top - bottom);
    const left = Math.max(0, Math.min(fw, -fx));
    const right = Math.max(0, Math.min(fw - left, fx + fw - doc.width));
    const bands = [
      { x: fx, y: fy, width: fw, height: top },
      { x: fx, y: fy + fh - bottom, width: fw, height: bottom },
      { x: fx, y: middleY, width: left, height: middleH },
      { x: fx + fw - right, y: middleY, width: right, height: middleH },
    ];
    this.dimRects.forEach((dim, index) => dim.setAttrs(bands[index]));
    this.frameSize.set({ width: Math.round(fw), height: Math.round(fh) });
  }

  // -- keyboard and cursor -------------------------------------------------

  public onKeydown(event: KeyboardEvent): void {
    if (event.key === ' ') {
      event.preventDefault();
      this.spaceHeld = true;
      this.setCursor('grab');
      return;
    }
    if (event.key === 'Delete') {
      this.deleteSelection();
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') {
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
    if (event.key === ' ') {
      this.spaceHeld = false;
      this.applyCursor();
    }
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
}
