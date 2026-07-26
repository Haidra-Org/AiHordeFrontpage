/**
 * Shared "bring an image into the studio" plumbing for /generate and /alchemy:
 * a directive that turns a page-wide paste or a file drag onto the workspace
 * into one `File`, plus the pure predicates it is built from.
 *
 * The directive only reports what arrived; each studio decides what attaching
 * means (source image, alchemy upload) and which message a rejection shows.
 */
import {
  DestroyRef,
  Directive,
  PLATFORM_ID,
  inject,
  output,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { injectHostElement } from './inject-host-element';

/**
 * What a paste or drop carried. `file` is the first image found; `rejected` is
 * true when files were present but none of them was an image, which is the only
 * case worth telling the user about (a plain-text paste carries no files and is
 * simply not ours).
 */
export interface DroppedImage {
  file: File | null;
  rejected: boolean;
}

const NOTHING: DroppedImage = { file: null, rejected: false };

function isImage(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * First image among a transfer's files, falling back to its items (browsers put
 * a pasted screenshot in `items` even where `files` stays empty).
 */
export function imageFromTransfer(
  data: DataTransfer | null | undefined,
): DroppedImage {
  if (!data) {
    return NOTHING;
  }
  const files = data.files ? Array.from(data.files) : [];
  const image = files.find(isImage);
  if (image) {
    return { file: image, rejected: false };
  }
  const items = data.items ? Array.from(data.items) : [];
  const fromItems = items
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  const itemImage = fromItems.find(isImage);
  if (itemImage) {
    return { file: itemImage, rejected: false };
  }
  return { file: null, rejected: files.length + fromItems.length > 0 };
}

/** True when a drag is carrying files (rather than selected text or a link). */
export function transferHasFiles(
  data: DataTransfer | null | undefined,
): boolean {
  if (!data) {
    return false;
  }
  const types = data.types ? Array.from(data.types) : [];
  return types.includes('Files');
}

/**
 * True when any modal, viewer, or sheet is open. Every studio overlay marks
 * itself `aria-modal`, so one query covers them all without each of them having
 * to publish its open state to the page.
 */
export function studioOverlayOpen(doc: Document): boolean {
  return doc.querySelector('[aria-modal="true"]') !== null;
}

/**
 * Accepts an image pasted anywhere on the page or dragged onto the host, and
 * exposes `dragActive` so the host can render its own drop overlay.
 *
 * A paste is honoured even from a focused text field: a clipboard carrying an
 * image file is never what a textarea wanted, and pastes without files are left
 * to bubble untouched. Both affordances stand down while an overlay is open, so
 * they cannot act behind a modal or the image viewer.
 */
@Directive({
  selector: '[appStudioImageDrop]',
  exportAs: 'studioImageDrop',
  host: {
    '(dragenter)': 'onDragOver($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class StudioImageDropDirective {
  private readonly host = injectHostElement();
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** An image arrived and should be attached. */
  public readonly imageFile = output<File>();
  /** Files arrived but none was an image. */
  public readonly rejected = output<void>();

  /** Whether a file drag is currently over the host. */
  public readonly dragActive = signal(false);

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    const onPaste = (event: Event): void => this.onPaste(event);
    document.addEventListener('paste', onPaste);
    this.destroyRef.onDestroy(() =>
      document.removeEventListener('paste', onPaste),
    );
  }

  public onDragOver(event: DragEvent): void {
    if (!transferHasFiles(event.dataTransfer) || this.blocked()) {
      return;
    }
    // Without this the browser navigates to the dropped file instead.
    event.preventDefault();
    this.dragActive.set(true);
  }

  public onDragLeave(event: DragEvent): void {
    // Moving between descendants fires leave/enter pairs; only a leave whose
    // destination is outside the host actually ends the drag.
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.contains(next)) {
      return;
    }
    this.dragActive.set(false);
  }

  public onDrop(event: DragEvent): void {
    this.dragActive.set(false);
    if (this.blocked()) {
      return;
    }
    const dropped = imageFromTransfer(event.dataTransfer);
    if (dropped.file === null && !dropped.rejected) {
      return;
    }
    event.preventDefault();
    this.report(dropped);
  }

  private onPaste(event: Event): void {
    if (this.blocked()) {
      return;
    }
    const data = (event as ClipboardEvent).clipboardData;
    const pasted = imageFromTransfer(data);
    if (pasted.file === null && !pasted.rejected) {
      // A text paste: leave it entirely to whatever has focus.
      return;
    }
    event.preventDefault();
    this.report(pasted);
  }

  private report(payload: DroppedImage): void {
    if (payload.file) {
      this.imageFile.emit(payload.file);
    } else if (payload.rejected) {
      this.rejected.emit();
    }
  }

  private blocked(): boolean {
    return studioOverlayOpen(document);
  }
}
