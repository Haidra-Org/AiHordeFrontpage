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
import { SharedKeyDetails, SharedKeyInput } from '../../../types/shared-key';
import {
  FINITE_FALLBACKS,
  SharedKeyFormValue,
  SHARED_KEY_DEFAULTS,
} from '../../../types/shared-key-form';
import { SharedKeyFormComponent } from '../shared-key-form/shared-key-form.component';

export type SharedKeyStatus = 'active' | 'expired' | 'exhausted';

@Component({
  selector: 'app-shared-key-card',
  imports: [TranslocoPipe, FormatNumberPipe, SharedKeyFormComponent],
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

  /** Emits when the user requests to update the shared key. */
  public readonly update = output<SharedKeyInput>();

  /** Emits when the user requests to delete the shared key. */
  public readonly delete = output<void>();

  /** Local editing state. */
  public readonly isEditing = signal(false);

  /** Computed status of the key. */
  public readonly status = computed<SharedKeyStatus>(() => {
    const key = this.sharedKey();
    return this.computeStatus(key);
  });

  /** Computed form values for the edit form. */
  public readonly editFormValues = computed<SharedKeyFormValue>(() => {
    const key = this.sharedKey();
    return this.mapToFormValue(key);
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

  public startEdit(): void {
    this.isEditing.set(true);
  }

  public cancelEdit(): void {
    this.isEditing.set(false);
  }

  public onFormSubmit(payload: SharedKeyInput): void {
    this.update.emit(payload);
  }

  public onDelete(): void {
    this.delete.emit();
  }

  /**
   * Called by parent when save succeeds to close the edit form.
   */
  public closeEdit(): void {
    this.isEditing.set(false);
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

  private mapToFormValue(key: SharedKeyDetails): SharedKeyFormValue {
    const kudos = key.kudos ?? SHARED_KEY_DEFAULTS.kudos;
    const expiry = this.deriveExpiryDays(key.expiry);
    const maxImagePixels =
      key.max_image_pixels ?? SHARED_KEY_DEFAULTS.max_image_pixels;
    const maxImageSteps =
      key.max_image_steps ?? SHARED_KEY_DEFAULTS.max_image_steps;
    const maxTextTokens =
      key.max_text_tokens ?? SHARED_KEY_DEFAULTS.max_text_tokens;

    return {
      name: key.name ?? '',
      kudos,
      kudos_unlimited: kudos === -1,
      expiry,
      expiry_unlimited: expiry === -1,
      max_image_pixels: maxImagePixels,
      max_image_pixels_unlimited: maxImagePixels === -1,
      max_image_steps: maxImageSteps,
      max_image_steps_unlimited: maxImageSteps === -1,
      max_text_tokens: maxTextTokens,
      max_text_tokens_unlimited: maxTextTokens === -1,
    };
  }

  private deriveExpiryDays(expiry?: string): number {
    if (!expiry) return -1;
    const expiryMs = Date.parse(expiry);
    if (Number.isNaN(expiryMs)) return -1;
    const diffDays = Math.ceil((expiryMs - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? -1 : Math.max(diffDays, 1);
  }
}
