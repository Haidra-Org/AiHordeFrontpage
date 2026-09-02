import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  StudioLinkPayload,
  studioLinkFromText,
  studioPayloadFromImage,
} from '../studio-link';

/**
 * The box that takes settings from somewhere else: an address copied out of the
 * studio, a request written as JSON, or a picture the studio downloaded, which
 * carries the settings that made it. It reads what it is given and hands the
 * parent what it found; what happens to the form is the parent's business, and
 * goes the same way a followed link does.
 */
@Component({
  selector: 'app-studio-paste-modal',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './studio-paste-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioPasteModalComponent {
  public readonly closed = output<void>();
  public readonly applied = output<StudioLinkPayload>();

  private readonly imageInput =
    viewChild<ElementRef<HTMLInputElement>>('imageInput');

  public readonly text = signal('');
  /** What the text was refused for, as a translation key, or null. */
  public readonly error = signal<string | null>(null);
  /** Whether a file is over the box, so the picture target says it is a target. */
  public readonly dragActive = signal(false);

  public onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
    this.error.set(null);
  }

  public close(): void {
    this.closed.emit();
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  public apply(): void {
    const payload = studioLinkFromText(this.text());
    if (payload === null) {
      this.error.set('generate.link.paste_error');
      return;
    }
    this.applied.emit(payload);
  }

  public chooseImage(): void {
    this.imageInput()?.nativeElement.click();
  }

  public onImagePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so the same picture chosen twice in a row still counts as a change.
    input.value = '';
    if (file) {
      void this.readImage(file);
    }
  }

  public onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  public onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
  }

  public onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.readImage(file);
    }
  }

  /**
   * Take the settings off a picture. A picture that carries none is said so in
   * the box, because from the outside it looks the same as one that does.
   */
  private async readImage(file: File): Promise<void> {
    this.error.set(null);
    const payload = await studioPayloadFromImage(file);
    if (payload === null) {
      this.error.set('generate.link.paste_image_none');
      return;
    }
    this.applied.emit(payload);
  }
}
