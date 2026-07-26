import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  StudioImageDropDirective,
  imageFromTransfer,
  studioOverlayOpen,
  transferHasFiles,
} from './studio-image-drop.directive';

const imageFile = (name = 'shot.png'): File =>
  new File(['x'], name, { type: 'image/png' });
const textFile = (): File =>
  new File(['x'], 'notes.txt', { type: 'text/plain' });

/**
 * jsdom has no DataTransfer, so transfers are faked structurally: the helpers
 * only read `files`, `items`, and `types`.
 */
const transfer = (init: {
  files?: File[];
  items?: { kind: string; file: File | null }[];
  types?: string[];
}): DataTransfer =>
  ({
    files: init.files ?? [],
    items: (init.items ?? []).map((item) => ({
      kind: item.kind,
      getAsFile: () => item.file,
    })),
    types: init.types ?? (init.files?.length ? ['Files'] : []),
  }) as unknown as DataTransfer;

const dispatch = (
  target: EventTarget,
  type: string,
  data: DataTransfer | null,
  property: 'dataTransfer' | 'clipboardData',
): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, property, { value: data });
  target.dispatchEvent(event);
  return event;
};

@Component({
  imports: [StudioImageDropDirective],
  template: `<div
    appStudioImageDrop
    #drop="studioImageDrop"
    (imageFile)="received.push($event)"
    (rejected)="rejections = rejections + 1"
  >
    <textarea></textarea>
    <span>{{ drop.dragActive() }}</span>
  </div>`,
})
class HostComponent {
  public received: File[] = [];
  public rejections = 0;
}

describe('imageFromTransfer', () => {
  it('takes the first image among the dropped files', () => {
    const image = imageFile();
    const result = imageFromTransfer(transfer({ files: [textFile(), image] }));
    expect(result.file).toBe(image);
    expect(result.rejected).toBe(false);
  });

  it('falls back to the items list when files is empty', () => {
    const image = imageFile();
    const result = imageFromTransfer(
      transfer({ items: [{ kind: 'file', file: image }], types: ['Files'] }),
    );
    expect(result.file).toBe(image);
  });

  it('reports a rejection when files were present but none was an image', () => {
    const result = imageFromTransfer(transfer({ files: [textFile()] }));
    expect(result.file).toBeNull();
    expect(result.rejected).toBe(true);
  });

  it('reports nothing at all for a transfer carrying only text', () => {
    const result = imageFromTransfer(
      transfer({
        items: [{ kind: 'string', file: null }],
        types: ['text/plain'],
      }),
    );
    expect(result.file).toBeNull();
    expect(result.rejected).toBe(false);
  });

  it('reports nothing for a missing transfer', () => {
    expect(imageFromTransfer(null)).toEqual({ file: null, rejected: false });
  });
});

describe('transferHasFiles', () => {
  it('is true only when the drag advertises files', () => {
    expect(transferHasFiles(transfer({ types: ['Files'] }))).toBe(true);
    expect(transferHasFiles(transfer({ types: ['text/plain'] }))).toBe(false);
    expect(transferHasFiles(null)).toBe(false);
  });
});

describe('studioOverlayOpen', () => {
  it('detects any element marked as a modal', () => {
    expect(studioOverlayOpen(document)).toBe(false);
    const overlay = document.createElement('div');
    overlay.setAttribute('aria-modal', 'true');
    document.body.appendChild(overlay);
    try {
      expect(studioOverlayOpen(document)).toBe(true);
    } finally {
      overlay.remove();
    }
  });
});

describe('StudioImageDropDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let root: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    root = fixture.nativeElement.querySelector('div') as HTMLElement;
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('emits the dropped image and marks the drag inactive again', () => {
    const image = imageFile();
    dispatch(root, 'dragover', transfer({ types: ['Files'] }), 'dataTransfer');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('true');

    dispatch(root, 'drop', transfer({ files: [image] }), 'dataTransfer');
    fixture.detectChanges();

    expect(host.received).toEqual([image]);
    expect(fixture.nativeElement.textContent).toContain('false');
  });

  it('rejects a dropped non-image file instead of attaching it', () => {
    dispatch(root, 'drop', transfer({ files: [textFile()] }), 'dataTransfer');
    expect(host.received).toEqual([]);
    expect(host.rejections).toBe(1);
  });

  it('attaches an image pasted anywhere on the page', () => {
    const image = imageFile();
    const event = dispatch(
      document,
      'paste',
      transfer({ files: [image] }),
      'clipboardData',
    );
    expect(host.received).toEqual([image]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('attaches an image pasted from inside a focused text field', () => {
    const image = imageFile();
    const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
    textarea.focus();
    dispatch(textarea, 'paste', transfer({ files: [image] }), 'clipboardData');
    expect(host.received).toEqual([image]);
  });

  it('leaves a plain-text paste entirely alone', () => {
    const event = dispatch(
      document,
      'paste',
      transfer({
        items: [{ kind: 'string', file: null }],
        types: ['text/plain'],
      }),
      'clipboardData',
    );
    expect(host.received).toEqual([]);
    expect(host.rejections).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('stands down while an overlay (modal or viewer) is open', () => {
    const overlay = document.createElement('div');
    overlay.setAttribute('aria-modal', 'true');
    document.body.appendChild(overlay);
    try {
      dispatch(
        document,
        'paste',
        transfer({ files: [imageFile()] }),
        'clipboardData',
      );
      dispatch(
        root,
        'drop',
        transfer({ files: [imageFile()] }),
        'dataTransfer',
      );
      expect(host.received).toEqual([]);
      expect(host.rejections).toBe(0);
    } finally {
      overlay.remove();
    }
  });

  it('stops listening for pastes once destroyed', () => {
    fixture.destroy();
    dispatch(
      document,
      'paste',
      transfer({ files: [imageFile()] }),
      'clipboardData',
    );
    expect(host.received).toEqual([]);
  });
});
