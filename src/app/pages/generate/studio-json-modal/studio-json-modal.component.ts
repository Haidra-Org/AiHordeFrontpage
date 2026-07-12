import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';

/** A labelled, tone-coloured highlight row shown above the raw JSON. */
export interface JsonModalHighlight {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'warn' | 'danger';
}

/**
 * A studio-native modal that renders a labelled summary plus a pretty-printed,
 * copyable (and optionally downloadable) JSON body. Shared by the results grid's
 * per-image metadata view and the generate form's pre-submit request preview so
 * both surfaces use the same "inspect the JSON" machinery. The parent gates
 * visibility with `@if`; this component only renders its chrome.
 */
@Component({
  selector: 'app-studio-json-modal',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './studio-json-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioJsonModalComponent {
  public readonly title = input('');
  public readonly data = input<unknown>(null);
  public readonly highlights = input<JsonModalHighlight[]>([]);
  /** When set, a "Download JSON" action writes the body to this filename. */
  public readonly downloadName = input<string | null>(null);

  public readonly closed = output<void>();

  public readonly json = computed(() => {
    try {
      return JSON.stringify(this.data(), null, 2);
    } catch {
      return '{}';
    }
  });

  public close(): void {
    this.closed.emit();
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  public async copy(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(this.json());
      } catch {
        // Clipboard can be denied; the on-screen JSON is still selectable.
      }
    }
  }

  public download(): void {
    const name = this.downloadName();
    if (!name || typeof document === 'undefined') {
      return;
    }
    const blob = new Blob([this.json()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
