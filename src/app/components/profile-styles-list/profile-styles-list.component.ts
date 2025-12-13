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
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of, finalize, catchError, map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { StyleService } from '../../services/style.service';
import { AuthService } from '../../services/auth.service';
import {
  ImageStyle,
  TextStyle,
  Style,
  StyleType,
  isImageStyle,
} from '../../types/style';
import { StyleCardComponent } from '../style/style-card/style-card.component';
import {
  StyleFormComponent,
  StyleFormSubmitEvent,
} from '../style/style-form/style-form.component';

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
  imports: [TranslocoPipe, StyleCardComponent, StyleFormComponent, RouterLink],
  templateUrl: './profile-styles-list.component.html',
  styleUrl: './profile-styles-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileStylesListComponent implements OnInit {
  private readonly styleService = inject(StyleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // ─────────────────────────────────────────────────────────────────────────
  // INPUTS: Allow external data injection for admin reuse
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * External styles data. When provided, skips internal fetch.
   * Pass undefined to trigger internal fetch from AuthService.
   */
  public readonly externalStyles = input<LoadedStyle[] | undefined>(undefined, {
    alias: 'styles',
  });

  /**
   * External loading state. Only used when externalStyles is provided.
   */
  public readonly externalLoading = input<boolean>(false, {
    alias: 'loadingExternal',
  });

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

  /** Creating state. */
  public readonly creating = signal(false);

  /** Current user. */
  public readonly currentUser = computed(() => this.auth.currentUser());

  /** User's style IDs from their profile. */
  private readonly userStyleIds = computed(() => {
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

  ngOnInit(): void {
    // Only auto-load if not using external data
    if (!this.isExternalData()) {
      this.loadUserStyles();
    }
  }

  public setActiveTab(tab: StylesTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.showCreateForm.set(false);
  }

  public loadUserStyles(): void {
    // Don't fetch if using external data
    if (this.isExternalData()) {
      return;
    }

    const styleIds = this.userStyleIds();

    if (!styleIds || styleIds.length === 0) {
      this.internalUserStyles.set([]);
      return;
    }

    this.internalLoading.set(true);
    this.error.set(null);

    // Initialize loading state for all styles
    this.internalUserStyles.set(
      styleIds.map((id) => ({
        id,
        style: null,
        type: null,
        loading: true,
        error: false,
      })),
    );

    // Since we don't know if it's image or text style, try image first then text
    const requests = styleIds.map((id) =>
      this.styleService.getImageStyle(id).pipe(
        map((style) => ({ style, type: 'image' as StyleType })),
        catchError(() =>
          this.styleService.getTextStyle(id).pipe(
            map((style) => ({ style, type: 'text' as StyleType })),
            catchError(() => of(null)),
          ),
        ),
      ),
    );

    forkJoin(requests)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.internalLoading.set(false)),
      )
      .subscribe({
        next: (results) => {
          this.internalUserStyles.set(
            styleIds.map((id, index) => {
              const result = results[index];
              if (result) {
                return {
                  id,
                  style: result.style,
                  type: result.type,
                  loading: false,
                  error: false,
                };
              }
              return {
                id,
                style: null,
                type: null,
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
    this.showCreateForm.set(true);
  }

  public closeCreateForm(): void {
    this.showCreateForm.set(false);
  }

  public onCreateStyle(event: StyleFormSubmitEvent): void {
    if (this.readonly()) return;

    this.creating.set(true);

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
          this.showCreateForm.set(false);
          // Refresh user to get updated style list
          this.auth.refreshUser().subscribe(() => {
            // Navigate to the new style
            this.router.navigate(['/details/styles', event.type, response.id]);
          });
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to create style');
        },
      });
  }

  public onEditStyle(style: Style): void {
    if (this.readonly()) return;

    const type = isImageStyle(style) ? 'image' : 'text';
    this.router.navigate(['/details/styles', type, style.id], {
      queryParams: { edit: 'true' },
    });
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
        this.auth.refreshUser().subscribe();
      },
      error: (err) => {
        this.error.set(err.message || 'Failed to delete style');
      },
    });
  }
}
