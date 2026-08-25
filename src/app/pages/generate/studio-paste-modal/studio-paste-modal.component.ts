import {
  ChangeDetectionStrategy,
  Component,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { StudioLinkPayload, studioLinkFromText } from '../studio-link';

/**
 * The box that takes settings from somewhere else: an address copied out of the
 * studio, or a request written as JSON. It reads the text and hands the parent
 * what it found; what happens to the form is the parent's business, and goes
 * the same way a followed link does.
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

  public readonly text = signal('');
  /** What the text was refused for, as a translation key, or null. */
  public readonly error = signal<string | null>(null);

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
}
