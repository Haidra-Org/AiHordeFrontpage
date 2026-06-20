import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../icon/icon.component';
import {
  isLikelyImageFileLink,
  toRenderableImageSource,
} from '../../../helper/generation-image';
import {
  EncodedImage,
  base64ByteLength,
  fileToResizedBase64,
} from '../../../helper/image-encoding';

type InputMode = 'url' | 'upload';

/**
 * Reusable source-image picker for alchemy. Supports a public image URL or a
 * local file (downscaled + re-encoded to a base64 webp client-side). Emits the
 * normalized `source_image` string the Horde expects, or null when empty or
 * invalid.
 */
@Component({
  selector: 'app-alchemy-image-input',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './alchemy-image-input.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlchemyImageInputComponent {
  private readonly platformId = inject(PLATFORM_ID);

  /** Soft cap (decoded bytes) for an encoded upload before we warn the user. */
  private static readonly MAX_ENCODED_BYTES = 4 * 1024 * 1024;

  public readonly disabled = input(false);

  /** Emits the resolved source image (URL or bare base64), or null. */
  public readonly sourceImage = output<string | null>();

  public readonly mode = signal<InputMode>('url');
  public readonly urlValue = signal('');
  public readonly previewSrc = signal<string | null>(null);
  public readonly encoding = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly encodedInfo = signal<EncodedImage | null>(null);
  public readonly dragActive = signal(false);

  public setMode(mode: InputMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.reset();
  }

  public onUrlInput(value: string): void {
    this.urlValue.set(value);
    this.error.set(null);
    const trimmed = value.trim();

    if (!trimmed) {
      this.previewSrc.set(null);
      this.sourceImage.emit(null);
      return;
    }

    if (!isLikelyImageFileLink(trimmed)) {
      this.previewSrc.set(null);
      this.error.set('alchemy.image_input.invalid_url');
      this.sourceImage.emit(null);
      return;
    }

    this.previewSrc.set(toRenderableImageSource(trimmed));
    this.sourceImage.emit(trimmed);
  }

  public onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void this.encodeFile(file);
    }
  }

  public onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    if (this.disabled()) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.encodeFile(file);
    }
  }

  public onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.disabled()) return;
    this.dragActive.set(true);
  }

  public onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
  }

  public clear(): void {
    this.reset();
    this.urlValue.set('');
  }

  private reset(): void {
    this.previewSrc.set(null);
    this.error.set(null);
    this.encodedInfo.set(null);
    this.encoding.set(false);
    this.sourceImage.emit(null);
  }

  private async encodeFile(file: File): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.error.set(null);
    this.encoding.set(true);
    this.encodedInfo.set(null);
    this.previewSrc.set(null);
    this.sourceImage.emit(null);

    try {
      const encoded = await fileToResizedBase64(file);

      if (
        base64ByteLength(encoded.base64) >
        AlchemyImageInputComponent.MAX_ENCODED_BYTES
      ) {
        this.error.set('alchemy.image_input.too_large');
        this.encoding.set(false);
        return;
      }

      this.encodedInfo.set(encoded);
      this.previewSrc.set(`data:${encoded.mimeType};base64,${encoded.base64}`);
      this.sourceImage.emit(encoded.base64);
    } catch {
      this.error.set('alchemy.image_input.encode_failed');
    } finally {
      this.encoding.set(false);
    }
  }
}
