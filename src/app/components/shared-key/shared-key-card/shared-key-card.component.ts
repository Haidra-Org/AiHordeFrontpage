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
import {
  SharedKeyDetails,
  SharedKeyUsageSummary,
} from '../../../types/shared-key';
import {
  JsonInspectorComponent,
  JsonInspectorSection,
} from '../../json-inspector/json-inspector.component';
import { JsonInspectorTriggerComponent } from '../../json-inspector-trigger/json-inspector-trigger.component';
import { IconComponent } from '../../icon/icon.component';
import { copyToClipboard } from '../../../helper/copy-to-clipboard';

export type SharedKeyStatus = 'active' | 'expired' | 'exhausted';

/** A translation key and its parameters, resolved in the template. */
export interface SharedKeyUsageText {
  key: string;
  params: Record<string, number>;
}

/** One kind of work on the key that has something queued or running. */
export interface SharedKeyUsageKind {
  labelKey: string;
  summary: SharedKeyUsageSummary;
  oldestWait: SharedKeyUsageText | null;
}

/**
 * What the card shows about work running on the key. Null when the horde sent
 * no counts, which happens for anyone but the owner and on older hordes.
 */
export interface SharedKeyUsageView {
  kinds: SharedKeyUsageKind[];
}

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

  public readonly usage = computed<SharedKeyUsageView | null>(() => {
    const activeUsage = this.sharedKey().active_usage;
    if (!activeUsage) {
      return null;
    }
    const kinds: SharedKeyUsageKind[] = [];
    if (this.hasWork(activeUsage.image)) {
      kinds.push(
        this.usageKind('profile.shared_keys.usage.image', activeUsage.image),
      );
    }
    if (this.hasWork(activeUsage.text)) {
      kinds.push(
        this.usageKind('profile.shared_keys.usage.text', activeUsage.text),
      );
    }
    return { kinds };
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

  private hasWork(summary: SharedKeyUsageSummary | undefined): boolean {
    return (
      !!summary &&
      (summary.requests > 0 || summary.queued > 0 || summary.processing > 0)
    );
  }

  private usageKind(
    labelKey: string,
    summary: SharedKeyUsageSummary,
  ): SharedKeyUsageKind {
    return {
      labelKey,
      summary,
      oldestWait:
        summary.oldest_queued_age > 0
          ? this.waitText(summary.oldest_queued_age)
          : null,
    };
  }

  /** Whole seconds under a minute, then rounded minutes, then rounded hours. */
  private waitText(seconds: number): SharedKeyUsageText {
    if (seconds < 60) {
      const count = Math.max(1, Math.round(seconds));
      return {
        key:
          count === 1
            ? 'profile.shared_keys.usage.wait_seconds_one'
            : 'profile.shared_keys.usage.wait_seconds_other',
        params: { count },
      };
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return {
        key:
          minutes === 1
            ? 'profile.shared_keys.usage.wait_minutes_one'
            : 'profile.shared_keys.usage.wait_minutes_other',
        params: { count: minutes },
      };
    }
    const hours = Math.round(seconds / 3600);
    return {
      key:
        hours === 1
          ? 'profile.shared_keys.usage.wait_hours_one'
          : 'profile.shared_keys.usage.wait_hours_other',
      params: { count: hours },
    };
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
