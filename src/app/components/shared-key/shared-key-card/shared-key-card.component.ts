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

  /** Whether the key ID was just copied. */
  public readonly copied = signal(false);

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

  public async copyKeyId(): Promise<void> {
    const didCopy = await this.copyToClipboard(this.sharedKey().id);
    if (!didCopy) {
      console.error('Failed to copy shared key ID.');
      return;
    }

    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
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

  private async copyToClipboard(text: string): Promise<boolean> {
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (globalThis.isSecureContext && clipboard?.writeText) {
        await clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      console.error('Async clipboard copy failed.', error);
    }

    const body = globalThis.document?.body;
    if (!body) {
      return false;
    }

    const textArea = globalThis.document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    body.append(textArea);
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    try {
      return globalThis.document.execCommand('copy');
    } catch (error) {
      console.error('Fallback clipboard copy failed.', error);
      return false;
    } finally {
      textArea.remove();
    }
  }
}
