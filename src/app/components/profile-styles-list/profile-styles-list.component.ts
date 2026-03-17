import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, Observable, of, finalize, catchError, map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { extractApiError } from '../../helper/extract-api-error';
import { ScrollFadeComponent } from '../../helper/scroll-fade.component';
import { StyleService } from '../../services/style.service';
import { AuthService } from '../../services/auth.service';
import {
  ImageStyle,
  TextStyle,
  Style,
  StyleType,
  isImageStyle,
} from '../../types/style';
import { UserStyleReference } from '../../types/horde-user';
import { StyleCardComponent } from '../style/style-card/style-card.component';
import {
  StyleFormComponent,
  StyleFormSubmitEvent,
} from '../style/style-form/style-form.component';
import { AdminDialogComponent } from '../admin/admin-dialog/admin-dialog.component';
import { IconComponent } from '../icon/icon.component';

type StylesTab = 'image' | 'text';

export interface LoadedStyle {
  id: string;
  style: Style | null;
  type: StyleType | null;
  loading: boolean;
  error: boolean;
}

@Component({
  selector: 'app-profile-styles-list',
  imports: [
    TranslocoPipe,
    StyleCardComponent,
    StyleFormComponent,
    AdminDialogComponent,
    RouterLink,
    ScrollFadeComponent,
    IconComponent,
  ],
  templateUrl: './profile-styles-list.component.html',
  styleUrl: './profile-styles-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileStylesListComponent implements OnInit {
  private readonly styleService = inject(StyleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly styleFormRef = viewChild(StyleFormComponent);

  /** Deferred edit target from URL query string, resolved once styles are loaded. */
  private readonly pendingEditStyleId = signal<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // INPUTS: Allow external data injection for admin reuse
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * External styles data. When provided, skips internal fetch.
   * Pass undefined to trigger internal fetch from AuthService.
   */
  public readonly externalStyles = input<LoadedStyle[] | undefined>(undefined);

  /**
   * External loading state. Only used when externalStyles is provided.
   */
  public readonly externalLoading = input<boolean>(false);

  /**
   * Read-only mode disables create/edit/delete actions.
   * Useful for admin viewing another user's styles.
   */
  public readonly readonly = input<boolean>(false);

  /**
   * Compact mode for admin context (hides browse link, etc).
   */
  public readonly compact = input<boolean>(false);

  // ─────────────────────────────────────────────────────────────────────────
  // OUTPUTS: Notify parent of data changes
  // ─────────────────────────────────────────────────────────────────────────

  /** Emits when styles data changes (create/delete). */
  public readonly stylesChange = output<LoadedStyle[]>();

  // ─────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────

  /** Current active tab. */
  public readonly activeTab = signal<StylesTab>('image');

  /** Internal loading state. */
  private readonly internalLoading = signal(false);

  /** Computed: use external loading if external data, otherwise internal. */
  public readonly loading = computed(() =>
    this.isExternalData() ? this.externalLoading() : this.internalLoading(),
  );

  /** Error message. */
  public readonly error = signal<string | null>(null);

  /** Internal loaded user styles. */
  private readonly internalUserStyles = signal<LoadedStyle[]>([]);

  /** Computed: use external data if provided, otherwise internal. */
  public readonly userStyles = computed(() => {
    const external = this.externalStyles();
    return external !== undefined ? external : this.internalUserStyles();
  });

  /** Whether we're using externally provided data. */
  public readonly isExternalData = computed(
    () => this.externalStyles() !== undefined,
  );

  /** Whether to show create form. */
  public readonly showCreateForm = signal(false);

  /** Unsaved-changes confirmation dialog state. */
  public readonly unsavedCloseDialogOpen = signal(false);

  /** Pending tab switch requested while the form has unsaved changes. */
  private readonly pendingTabAfterDiscard = signal<StylesTab | null>(null);

  /** Creating state. */
  public readonly creating = signal(false);

  /** Editing state (style selected for inline edit mode). */
  public readonly editingStyle = signal<Style | null>(null);

  /** True when form is currently in edit mode. */
  public readonly isEditing = computed(() => this.editingStyle() !== null);

  /** Current user. */
  public readonly currentUser = computed(() => this.auth.currentUser());

  /** User's style references from their profile (includes type). */
  private readonly userStyleRefs = computed((): UserStyleReference[] => {
    const user = this.currentUser();
    return user?.styles ?? [];
  });

  /** Image styles (filtered by type). */
  public readonly imageStyles = computed(() => {
    return this.userStyles()
      .filter((s) => s.type === 'image' && s.style)
      .map((s) => s.style as ImageStyle);
  });

  /** Text styles (filtered by type). */
  public readonly textStyles = computed(() => {
    return this.userStyles()
      .filter((s) => s.type === 'text' && s.style)
      .map((s) => s.style as TextStyle);
  });

  /** Filtered styles based on active tab. */
  public readonly filteredStyles = computed(() => {
    const tab = this.activeTab();
    return tab === 'image' ? this.imageStyles() : this.textStyles();
  });

  /** Count of styles by type. */
  public readonly imageCount = computed(() => {
    return this.userStyles().filter((s) => s.type === 'image').length;
  });

  public readonly textCount = computed(() => {
    return this.userStyles().filter((s) => s.type === 'text').length;
  });

  /** Get current style type for the form. */
  public readonly currentStyleType = computed((): StyleType => {
    return this.activeTab() === 'text' ? 'text' : 'image';
  });

  constructor() {
    effect(() => {
      const pendingId = this.pendingEditStyleId();
      if (!pendingId || this.readonly()) {
        return;
      }

      const match = this.userStyles().find(
        (candidate) => candidate.id === pendingId && candidate.style,
      );

      if (!match?.style) {
        return;
      }

      this.activeTab.set(match.type === 'text' ? 'text' : 'image');
      this.editingStyle.set(match.style);
      this.showCreateForm.set(true);
      this.pendingEditStyleId.set(null);
    });
  }

  ngOnInit(): void {
    // Only auto-load if not using external data
    if (!this.isExternalData()) {
      this.loadUserStyles();
    }

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        const type = query.get('type');
        const create = query.get('create');
        const editId = query.get('editId');

        if (type === 'text') {
          this.activeTab.set('text');
        } else if (type === 'image') {
          this.activeTab.set('image');
        }

        if (create === 'true' && !this.readonly()) {
          this.editingStyle.set(null);
          this.showCreateForm.set(true);
        }

        if (editId && !this.readonly()) {
          this.pendingEditStyleId.set(editId);
        }
      });
  }

  public setActiveTab(tab: StylesTab): void {
    if (this.activeTab() === tab) {
      if (this.showCreateForm()) {
        this.requestCloseForm();
      }
      return;
    }

    if (this.showCreateForm() && !this.canDismissForm()) {
      this.pendingTabAfterDiscard.set(tab);
      this.unsavedCloseDialogOpen.set(true);
      return;
    }

    this.activeTab.set(tab);
    this.showCreateForm.set(false);
    this.editingStyle.set(null);
  }

  private canDismissForm(): boolean {
    const styleForm = this.styleFormRef();
    return !styleForm?.hasUnsavedMeaningfulChanges();
  }

  public requestCloseForm(): void {
    if (!this.showCreateForm()) return;
    if (!this.canDismissForm()) {
      this.pendingTabAfterDiscard.set(null);
      this.unsavedCloseDialogOpen.set(true);
      return;
    }
    this.closeCreateForm();
  }

  public onDiscardUnsavedChanges(): void {
    const pendingTab = this.pendingTabAfterDiscard();
    this.unsavedCloseDialogOpen.set(false);
    this.pendingTabAfterDiscard.set(null);

    this.closeCreateForm();
    if (pendingTab) {
      this.activeTab.set(pendingTab);
    }
  }

  public onCancelDiscardUnsavedChanges(): void {
    this.unsavedCloseDialogOpen.set(false);
    this.pendingTabAfterDiscard.set(null);
  }

  public loadUserStyles(): void {
    // Don't fetch if using external data
    if (this.isExternalData()) {
      return;
    }

    const styleRefs = this.userStyleRefs();

    if (styleRefs.length === 0) {
      this.internalUserStyles.set([]);
      return;
    }

    this.internalLoading.set(true);
    this.error.set(null);

    // Initialize loading state for all styles
    this.internalUserStyles.set(
      styleRefs.map((ref) => ({
        id: ref.id,
        style: null,
        type: ref.type as StyleType,
        loading: true,
        error: false,
      })),
    );

    // Use the known type from the user profile to call the correct endpoint
    const requests = styleRefs.map((ref) => {
      const fetch$: Observable<ImageStyle | TextStyle> =
        ref.type === 'image'
          ? this.styleService.getImageStyle(ref.id)
          : this.styleService.getTextStyle(ref.id);

      return fetch$.pipe(
        map((style) => ({ style, type: ref.type as StyleType })),
        catchError(() => of(null)),
      );
    });

    forkJoin(requests)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.internalLoading.set(false)),
      )
      .subscribe({
        next: (results) => {
          this.internalUserStyles.set(
            styleRefs.map((ref, index) => {
              const result = results[index];
              if (result) {
                return {
                  id: ref.id,
                  style: result.style,
                  type: result.type,
                  loading: false,
                  error: false,
                };
              }
              return {
                id: ref.id,
                style: null,
                type: ref.type as StyleType,
                loading: false,
                error: true,
              };
            }),
          );
        },
        error: () => {
          this.error.set('Failed to load styles');
          this.internalUserStyles.update((items) =>
            items.map((item) => ({ ...item, loading: false, error: true })),
          );
        },
      });
  }

  public navigateToStyle(style: Style): void {
    const type = isImageStyle(style) ? 'image' : 'text';
    this.router.navigate(['/details/styles', type, style.id]);
  }

  public openCreateForm(): void {
    if (this.readonly()) return;
    this.editingStyle.set(null);
    this.showCreateForm.set(true);
  }

  public closeCreateForm(): void {
    this.showCreateForm.set(false);
    this.editingStyle.set(null);
  }

  public onCreateStyle(event: StyleFormSubmitEvent): void {
    if (this.readonly()) return;

    this.creating.set(true);

    if (this.isEditing()) {
      const current = this.editingStyle();
      if (!current) {
        this.creating.set(false);
        return;
      }

      const update$ =
        event.type === 'image'
          ? this.styleService.updateImageStyle(
              current.id,
              event.payload as Parameters<
                typeof this.styleService.updateImageStyle
              >[1],
            )
          : this.styleService.updateTextStyle(
              current.id,
              event.payload as Parameters<
                typeof this.styleService.updateTextStyle
              >[1],
            );

      update$
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.creating.set(false)),
        )
        .subscribe({
          next: () => {
            this.editingStyle.set(null);
            this.showCreateForm.set(false);
            this.auth
              .refreshUser()
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe(() => this.loadUserStyles());
          },
          error: (err: unknown) => {
            this.error.set(extractApiError(err, 'Failed to update style'));
          },
        });
      return;
    }

    const observable =
      event.type === 'image'
        ? this.styleService.createImageStyle(
            event.payload as Parameters<
              typeof this.styleService.createImageStyle
            >[0],
          )
        : this.styleService.createTextStyle(
            event.payload as Parameters<
              typeof this.styleService.createTextStyle
            >[0],
          );

    observable
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.creating.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.editingStyle.set(null);
          this.showCreateForm.set(false);
          // Refresh user to get updated style list
          this.auth
            .refreshUser()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
              // Navigate to the new style
              this.router.navigate([
                '/details/styles',
                event.type,
                response.id,
              ]);
            });
        },
        error: (err: unknown) => {
          this.error.set(extractApiError(err, 'Failed to create style'));
        },
      });
  }

  public onEditStyle(style: Style): void {
    if (this.readonly()) return;

    this.activeTab.set(isImageStyle(style) ? 'image' : 'text');
    this.editingStyle.set(style);
    this.showCreateForm.set(true);
  }

  public onDeleteStyle(style: Style): void {
    if (this.readonly()) return;

    if (!confirm('Are you sure you want to delete this style?')) {
      return;
    }

    const type = isImageStyle(style) ? 'image' : 'text';
    const deleteFn =
      type === 'image'
        ? this.styleService.deleteImageStyle(style.id)
        : this.styleService.deleteTextStyle(style.id);

    deleteFn.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        // Remove from local state
        const updated = this.userStyles().filter(
          (item) => item.id !== style.id,
        );
        this.internalUserStyles.set(updated);
        this.stylesChange.emit(updated);
        // Trigger a user refresh to update the user's style references
        this.auth
          .refreshUser()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();
      },
      error: (err: unknown) => {
        this.error.set(extractApiError(err, 'Failed to delete style'));
      },
    });
  }
}
