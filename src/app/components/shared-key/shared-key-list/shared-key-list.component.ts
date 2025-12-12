import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  ViewChildren,
  QueryList,
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

  @ViewChildren(SharedKeyCardComponent)
  private cardComponents!: QueryList<SharedKeyCardComponent>;

  // ─────────────────────────────────────────────────────────────────────────
  // INPUTS: Allow external data injection for admin reuse
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * External shared keys data. When provided, skips internal fetch.
   * Pass undefined or empty to trigger internal fetch from AuthService.
   */
  public readonly externalSharedKeys = input<SharedKeyDetails[] | undefined>(
    undefined,
    { alias: 'sharedKeys' },
  );

  /**
   * External loading state. Only used when externalSharedKeys is provided.
   */
  public readonly externalLoading = input<boolean>(false, {
    alias: 'loadingExternal',
  });

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
          this.success.set(
            'Shared key created. Changes can take up to 5 minutes to propagate due to caching.',
          );
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
          // Close the edit form on the card
          this.closeCardEdit(sharedKeyId);
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
    this.createFormCollapsed.update((collapsed) => !collapsed);
  }

  private closeCardEdit(sharedKeyId: string): void {
    const card = this.cardComponents?.find(
      (c) => c.sharedKey().id === sharedKeyId,
    );
    card?.closeEdit();
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
}
