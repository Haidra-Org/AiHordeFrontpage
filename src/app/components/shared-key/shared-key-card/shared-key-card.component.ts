import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormatNumberPipe } from '../../../pipes/format-number.pipe';
import { TouchTooltipDirective } from '../../../helper/touch-tooltip.directive';
import { SharedKeyDetails } from '../../../types/shared-key';
import {
  JsonInspectorComponent,
  JsonInspectorSection,
} from '../../json-inspector/json-inspector.component';
import { JsonInspectorTriggerComponent } from '../../json-inspector-trigger/json-inspector-trigger.component';
import { IconComponent } from '../../icon/icon.component';
import { copyToClipboard } from '../../../helper/copy-to-clipboard';

export type SharedKeyStatus = 'active' | 'expired' | 'exhausted';

@Component({
  selector: 'app-shared-key-card',
  imports: [
    TranslocoPipe,
    FormatNumberPipe,
    TouchTooltipDirective,
    JsonInspectorComponent,
    JsonInspectorTriggerComponent,
    IconComponent,
  ],
  templateUrl: './shared-key-card.component.html',
  styleUrl: './shared-key-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedKeyCardComponent {
  /** The shared key to display. */
  public readonly sharedKey = input.required<SharedKeyDetails>();

  /** Whether the key is currently being saved/updated. */
  public readonly saving = input<boolean>(false);

  /** Whether the key is currently being deleted. */
  public readonly deleting = input<boolean>(false);

  /** Read-only mode hides edit/delete actions. */
  public readonly readonly = input<boolean>(false);

  /** Emits when the user clicks Edit. */
  public readonly edit = output<void>();

  /** Emits when the user requests to delete the shared key. */
  public readonly delete = output<void>();

  /** Whether the key ID was just copied. */
  public readonly copied = signal(false);
  public readonly rawJsonOpen = signal(false);

  public readonly rawJsonSections = computed<readonly JsonInspectorSection[]>(
    () => [
      {
        id: 'shared-key',
        label: 'Shared Key',
        value: this.sharedKey(),
      },
    ],
  );

  /** Computed status of the key. */
  public readonly status = computed<SharedKeyStatus>(() => {
    const key = this.sharedKey();
    return this.computeStatus(key);
  });

  /**
   * Computes the square dimension string from a pixel count.
   */
  public squareDimensionFromPixels(
    pixels: number | null | undefined,
  ): string | null {
    if (pixels === null || pixels === undefined || pixels <= 0) {
      return null;
    }
    const side = Math.round(Math.sqrt(pixels));
    return `${side} x ${side}`;
  }

  /**
   * Formats an expiry ISO string into a human-readable format.
   */
  public formatExpiry(expiry?: string): string {
    if (!expiry) return 'Never';
    const parsed = new Date(expiry);
    if (Number.isNaN(parsed.getTime())) {
      return 'Never';
    }
    return parsed.toLocaleString();
  }

  public requestEdit(): void {
    this.edit.emit();
  }

  public async copyKeyId(): Promise<void> {
    const didCopy = await copyToClipboard(this.sharedKey().id);
    if (!didCopy) {
      console.error('Failed to copy shared key ID.');
      return;
    }

    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  public onDelete(): void {
    this.delete.emit();
  }

  public openRawJson(): void {
    this.rawJsonOpen.set(true);
  }

  public closeRawJson(): void {
    this.rawJsonOpen.set(false);
  }

  private computeStatus(key: SharedKeyDetails): SharedKeyStatus {
    if (key.expiry) {
      const expiryMs = Date.parse(key.expiry);
      if (!Number.isNaN(expiryMs) && expiryMs < Date.now()) {
        return 'expired';
      }
    }

    if (
      key.kudos !== undefined &&
      key.kudos !== -1 &&
      key.utilized !== undefined
    ) {
      if (key.utilized >= key.kudos) {
        return 'exhausted';
      }
    }

    return 'active';
  }
}
