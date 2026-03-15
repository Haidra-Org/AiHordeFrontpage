import { Injectable, signal } from '@angular/core';
import { serializeErrorDetails } from '../helper/extract-api-error';

export interface AdminToast {
  id: string;
  type: 'success' | 'error' | 'warning';
  message: string;
  details?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminToastService {
  public readonly toasts = signal<AdminToast[]>([]);

  public showToast(
    type: AdminToast['type'],
    message: string,
    autoDismiss = type === 'success',
    rawError?: unknown,
  ): void {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const details = rawError ? serializeErrorDetails(rawError) : undefined;
    this.toasts.update((current) => [
      ...current,
      { id, type, message, ...(details ? { details } : {}) },
    ]);

    if (autoDismiss) {
      setTimeout(() => this.dismissToast(id), 3000);
    }
  }

  public dismissToast(id: string): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }

  public clearToasts(): void {
    this.toasts.set([]);
  }
}
