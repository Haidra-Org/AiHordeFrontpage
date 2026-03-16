import { Injectable, signal } from '@angular/core';
import { serializeErrorDetails } from '../helper/extract-api-error';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning';
  message: string;
  messageParams?: Record<string, unknown>;
  details?: string;
  transloco?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  public readonly toasts = signal<Toast[]>([]);

  public show(
    type: Toast['type'],
    message: string,
    options?: {
      autoDismissMs?: number;
      transloco?: boolean;
      messageParams?: Record<string, unknown>;
      details?: string;
    },
  ): string {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const autoDismiss =
      options?.autoDismissMs ?? (type === 'success' ? 5000 : 0);

    this.toasts.update((current) => [
      ...current,
      {
        id,
        type,
        message,
        transloco: options?.transloco ?? false,
        messageParams: options?.messageParams,
        details: options?.details,
      },
    ]);

    if (autoDismiss > 0) {
      setTimeout(() => this.dismiss(id), autoDismiss);
    }

    return id;
  }

  public success(
    message: string,
    options?: {
      transloco?: boolean;
      messageParams?: Record<string, unknown>;
    },
  ): string {
    return this.show('success', message, { ...options, autoDismissMs: 5000 });
  }

  public error(
    message: string,
    options?: {
      transloco?: boolean;
      messageParams?: Record<string, unknown>;
      details?: string;
      autoDismissMs?: number;
      rawError?: unknown;
    },
  ): string {
    const details =
      options?.details ??
      (options?.rawError
        ? (serializeErrorDetails(options.rawError) ?? undefined)
        : undefined);
    return this.show('error', message, {
      autoDismissMs: options?.autoDismissMs ?? 0,
      transloco: options?.transloco,
      messageParams: options?.messageParams,
      details,
    });
  }

  public warning(
    message: string,
    options?: {
      transloco?: boolean;
      messageParams?: Record<string, unknown>;
      autoDismissMs?: number;
    },
  ): string {
    return this.show('warning', message, {
      autoDismissMs: options?.autoDismissMs ?? 5000,
      ...options,
    });
  }

  public dismiss(id: string): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }

  public clear(): void {
    this.toasts.set([]);
  }
}
