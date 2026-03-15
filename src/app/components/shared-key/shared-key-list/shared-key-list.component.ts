import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { SharedKeyService } from '../../../services/shared-key.service';
import { AuthService } from '../../../services/auth.service';
import {
  SharedKeyApiError,
  SharedKeyDetails,
  SharedKeyInput,
} from '../../../types/shared-key';
import {
  SHARED_KEY_DEFAULTS,
  SharedKeyFormValue,
} from '../../../types/shared-key-form';
import { SharedKeyCardComponent } from '../shared-key-card/shared-key-card.component';
import { SharedKeyFormComponent } from '../shared-key-form/shared-key-form.component';

@Component({
  selector: 'app-shared-key-list',
  imports: [TranslocoPipe, SharedKeyCardComponent, SharedKeyFormComponent],
  templateUrl: './shared-key-list.component.html',
  styleUrl: './shared-key-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedKeyListComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly sharedKeyService = inject(SharedKeyService);
  private readonly auth = inject(AuthService);

  @ViewChild('statusRegion')
  private statusRegion?: ElementRef<HTMLDivElement>;

  @ViewChild('createFormRegion')
  private createFormRegion?: ElementRef<HTMLDivElement>;

  @ViewChild('editFormRegion')
  private editFormRegion?: ElementRef<HTMLDivElement>;

  // ─────────────────────────────────────────────────────────────────────────
  // INPUTS: Allow external data injection for admin reuse
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * External shared keys data. When provided, skips internal fetch.
   * Pass undefined or empty to trigger internal fetch from AuthService.
   */
  public readonly externalSharedKeys = input<SharedKeyDetails[] | undefined>(
    undefined,
  );

  /**
   * External loading state. Only used when externalSharedKeys is provided.
   */
  public readonly externalLoading = input<boolean>(false);

  /**
   * Read-only mode disables create/edit/delete actions.
   * Useful for admin viewing another user's shared keys.
   */
  public readonly readonly = input<boolean>(false);

  /**
   * Whether to show the header with title and refresh button.
   * Set to false when embedding in admin context with its own header.
   */
  public readonly showHeader = input<boolean>(true);

  // ─────────────────────────────────────────────────────────────────────────
  // OUTPUTS: Notify parent of data changes
  // ─────────────────────────────────────────────────────────────────────────

  /** Emits when shared keys data changes (create/update/delete). */
  public readonly sharedKeysChange = output<SharedKeyDetails[]>();

  // ─────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────

  /** Internal list of shared keys (used when not externally provided). */
  private readonly internalSharedKeys = signal<SharedKeyDetails[]>([]);

  /** Computed: use external data if provided, otherwise internal. */
  public readonly sharedKeys = computed(() => {
    const external = this.externalSharedKeys();
    return external !== undefined ? external : this.internalSharedKeys();
  });

  /** Whether we're using externally provided data. */
  public readonly isExternalData = computed(
    () => this.externalSharedKeys() !== undefined,
  );

  /** Internal loading state. */
  private readonly internalLoading = signal<boolean>(false);

  /** Computed: use external loading if external data, otherwise internal. */
  public readonly loading = computed(() =>
    this.isExternalData() ? this.externalLoading() : this.internalLoading(),
  );

  /** Error message, if any. */
  public readonly error = signal<string | null>(null);

  /** Success message, if any. */
  public readonly success = signal<string | null>(null);

  /** Whether a new key is being created. */
  public readonly creating = signal<boolean>(false);

  /** ID of the key currently being saved (update). */
  public readonly savingKeyId = signal<string | null>(null);

  /** ID of the key currently being deleted. */
  public readonly deletingKeyId = signal<string | null>(null);

  /** Default form values for the create form. */
  public readonly createFormDefaults: SharedKeyFormValue = SHARED_KEY_DEFAULTS;

  /** Whether the create form is collapsed. */
  public readonly createFormCollapsed = signal<boolean>(true);

  /** ID of the key currently being edited, or null. */
  public readonly editingKeyId = signal<string | null>(null);

  /** The key object currently being edited. */
  public readonly editingKey = computed(() => {
    const id = this.editingKeyId();
    if (!id) return null;
    return this.sharedKeys().find((k) => k.id === id) ?? null;
  });

  /** Form values for the key being edited. */
  public readonly editFormValues = computed<SharedKeyFormValue>(() => {
    const key = this.editingKey();
    if (!key) return SHARED_KEY_DEFAULTS;
    return this.mapToFormValue(key);
  });

  ngOnInit(): void {
    // Only auto-load if not using external data
    if (!this.isExternalData()) {
      this.loadSharedKeys();
    }
  }

  public loadSharedKeys(): void {
    // Don't fetch if using external data
    if (this.isExternalData()) {
      return;
    }

    const sharedKeyIds = this.auth.currentUser()?.sharedkey_ids ?? [];
    this.internalLoading.set(true);
    this.error.set(null);

    if (sharedKeyIds.length === 0) {
      this.internalSharedKeys.set([]);
      this.internalLoading.set(false);
      return;
    }

    this.sharedKeyService
      .getSharedKeysByIds(sharedKeyIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (keys) => {
          this.internalSharedKeys.set(keys);
        },
        error: (err) => {
          const message = this.extractError(err);
          this.error.set(message);
          this.internalLoading.set(false);
        },
        complete: () => {
          this.internalLoading.set(false);
        },
      });
  }

  public onCreateSubmit(payload: SharedKeyInput): void {
    // Readonly mode prevents mutations
    if (this.readonly()) {
      return;
    }

    this.creating.set(true);
    this.error.set(null);
    this.success.set(null);

    this.sharedKeyService
      .createSharedKey(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          const updated = [...this.sharedKeys(), created];
          this.internalSharedKeys.set(updated);
          this.sharedKeysChange.emit(updated);
          this.createFormCollapsed.set(true);
          this.success.set(
            `Shared key "${created.name}" created. Changes can take up to 5 minutes to propagate due to caching.`,
          );
          this.scrollToStatus();
        },
        error: (err) => {
          this.error.set(this.extractError(err));
          this.creating.set(false);
        },
        complete: () => {
          this.creating.set(false);
        },
      });
  }

  public onUpdate(sharedKeyId: string, payload: SharedKeyInput): void {
    // Readonly mode prevents mutations
    if (this.readonly()) {
      return;
    }

    this.savingKeyId.set(sharedKeyId);
    this.error.set(null);
    this.success.set(null);

    this.sharedKeyService
      .updateSharedKey(sharedKeyId, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedKey) => {
          const updated = this.sharedKeys().map((key) =>
            key.id === updatedKey.id ? updatedKey : key,
          );
          this.internalSharedKeys.set(updated);
          this.sharedKeysChange.emit(updated);
          this.success.set(
            'Shared key updated. Changes can take up to 5 minutes to propagate due to caching.',
          );
          this.editingKeyId.set(null);
          this.scrollToStatus();
        },
        error: (err) => {
          this.error.set(this.extractError(err));
          this.savingKeyId.set(null);
        },
        complete: () => {
          this.savingKeyId.set(null);
        },
      });
  }

  public onDelete(sharedKeyId: string): void {
    // Readonly mode prevents mutations
    if (this.readonly()) {
      return;
    }

    this.deletingKeyId.set(sharedKeyId);
    this.error.set(null);
    this.success.set(null);

    this.sharedKeyService
      .deleteSharedKey(sharedKeyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const updated = this.sharedKeys().filter(
            (key) => key.id !== sharedKeyId,
          );
          this.internalSharedKeys.set(updated);
          this.sharedKeysChange.emit(updated);
          this.success.set(
            'Shared key deleted. Changes can take up to 5 minutes to propagate due to caching.',
          );
        },
        error: (err) => {
          this.error.set(this.extractError(err));
          this.deletingKeyId.set(null);
        },
        complete: () => {
          this.deletingKeyId.set(null);
        },
      });
  }

  public isSaving(keyId: string): boolean {
    return this.savingKeyId() === keyId;
  }

  public isDeleting(keyId: string): boolean {
    return this.deletingKeyId() === keyId;
  }

  public toggleCreateForm(): void {
    const willExpand = this.createFormCollapsed();
    this.createFormCollapsed.update((collapsed) => !collapsed);
    // Close any in-progress edit when opening create
    if (willExpand) {
      this.editingKeyId.set(null);
      this.scrollToCreateForm();
    }
  }

  public onEdit(sharedKeyId: string): void {
    this.editingKeyId.set(sharedKeyId);
    this.createFormCollapsed.set(true);
    this.scrollToEditForm();
  }

  public cancelEdit(): void {
    this.editingKeyId.set(null);
  }

  public onEditSubmit(payload: SharedKeyInput): void {
    const id = this.editingKeyId();
    if (id) {
      this.onUpdate(id, payload);
    }
  }

  private scrollToCreateForm(): void {
    queueMicrotask(() => {
      this.createFormRegion?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  private scrollToEditForm(): void {
    queueMicrotask(() => {
      this.editFormRegion?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  private scrollToStatus(): void {
    queueMicrotask(() => {
      this.statusRegion?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  private extractError(error: unknown): string {
    if (error && typeof error === 'object') {
      const apiError = error as Partial<SharedKeyApiError>;
      const rcSuffix = apiError.rc ? ` (code: ${apiError.rc})` : '';
      const statusSuffix = apiError.status ? ` [${apiError.status}]` : '';
      if (apiError.message) {
        return `${apiError.message}${statusSuffix}${rcSuffix}`;
      }
    }
    return 'Something went wrong while communicating with the API.';
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
