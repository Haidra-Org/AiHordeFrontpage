import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../services/auth.service';
import { StyleService } from '../../../services/style.service';
import { ImageStyle, isImageStyle, isTextStyle, TextStyle } from '../../../types/style';
import { UpdateImageStyleInput, UpdateTextStyleInput } from '../../../types/style-api';
import { StyleFormComponent, StyleFormSubmitEvent } from '../../../components/style/style-form/style-form.component';
import {
  highlightJson,
  stringifyAsJson,
} from '../../../helper/json-formatter';

type StyleType = 'image' | 'text';

@Component({
  selector: 'app-style-detail',
  templateUrl: './style-detail.component.html',
  styleUrls: ['./style-detail.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink, StyleFormComponent],
})
export class StyleDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly styleService = inject(StyleService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  // State
  public loading = signal(true);
  public error = signal<string | null>(null);
  public style = signal<ImageStyle | TextStyle | null>(null);
  public styleType = signal<StyleType>('image');
  public editMode = signal(false);
  public saving = signal(false);
  public deleting = signal(false);
  public showJsonView = signal(false);
  public showDeleteConfirm = signal(false);

  // Computed
  public isLoggedIn = computed(() => this.authService.isLoggedIn());
  public currentUser = computed(() => this.authService.currentUser());

  /**
   * Check if current user is the owner of this style.
   * The creator field is formatted as "username#id".
   */
  public isOwner = computed(() => {
    const style = this.style();
    const user = this.currentUser();
    if (!style || !user) return false;
    // The creator field format is "username#id" - extract id and compare
    const creatorParts = style.creator.split('#');
    if (creatorParts.length >= 2) {
      const creatorId = parseInt(creatorParts[creatorParts.length - 1], 10);
      return creatorId === user.id;
    }
    // Fallback: compare username
    return style.creator.startsWith(user.username);
  });

  public isImageStyle = computed(() => {
    const style = this.style();
    return style ? isImageStyle(style) : false;
  });

  public isTextStyle = computed(() => {
    const style = this.style();
    return style ? isTextStyle(style) : false;
  });

  public imageStyleParams = computed(() => {
    const style = this.style();
    if (style && isImageStyle(style)) {
      return style.params;
    }
    return null;
  });

  public textStyleParams = computed(() => {
    const style = this.style();
    if (style && isTextStyle(style)) {
      return style.params;
    }
    return null;
  });

  public styleJson = computed(() => {
    const style = this.style();
    return stringifyAsJson(style);
  });

  public styleJsonHighlighted = computed(() =>
    highlightJson(this.styleJson()),
  );

  public ngOnInit(): void {
    // Watch for route param changes
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const type = params['type'] as StyleType;
      const styleId = params['styleId'];
      if (type && styleId) {
        this.styleType.set(type);
        this.loadStyle(styleId, type);
      }
    });
  }

  private loadStyle(styleId: string, type: StyleType): void {
    this.loading.set(true);
    this.error.set(null);

    if (type === 'image') {
      this.styleService
        .getImageStyle(styleId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (style: ImageStyle) => {
            this.style.set(style);
            this.loading.set(false);
          },
          error: (err: Error) => {
            console.error('Error loading style:', err);
            this.error.set(err.message || 'Failed to load style');
            this.loading.set(false);
          },
        });
    } else {
      this.styleService
        .getTextStyle(styleId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (style: TextStyle) => {
            this.style.set(style);
            this.loading.set(false);
          },
          error: (err: Error) => {
            console.error('Error loading style:', err);
            this.error.set(err.message || 'Failed to load style');
            this.loading.set(false);
          },
        });
    }
  }

  public toggleEditMode(): void {
    this.editMode.update((v) => !v);
    this.showJsonView.set(false);
  }

  public toggleJsonView(): void {
    this.showJsonView.update((v) => !v);
  }

  public onFormSubmit(event: StyleFormSubmitEvent): void {
    const style = this.style();
    if (!style) return;

    this.saving.set(true);
    this.error.set(null);

    // After updating, reload the full style to get all properties
    if (this.styleType() === 'image') {
      this.styleService
        .updateImageStyle(style.id, event.payload as UpdateImageStyleInput)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            // Reload full style after update
            this.loadStyle(style.id, 'image');
            this.editMode.set(false);
            this.saving.set(false);
          },
          error: (err: Error) => {
            console.error('Error updating style:', err);
            this.error.set(err.message || 'Failed to update style');
            this.saving.set(false);
          },
        });
    } else {
      this.styleService
        .updateTextStyle(style.id, event.payload as UpdateTextStyleInput)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            // Reload full style after update
            this.loadStyle(style.id, 'text');
            this.editMode.set(false);
            this.saving.set(false);
          },
          error: (err: Error) => {
            console.error('Error updating style:', err);
            this.error.set(err.message || 'Failed to update style');
            this.saving.set(false);
          },
        });
    }
  }

  public onFormCancel(): void {
    this.editMode.set(false);
  }

  public confirmDelete(): void {
    this.showDeleteConfirm.set(true);
  }

  public cancelDelete(): void {
    this.showDeleteConfirm.set(false);
  }

  public onDelete(): void {
    const style = this.style();
    if (!style) return;

    this.deleting.set(true);
    this.error.set(null);

    const observable =
      this.styleType() === 'image'
        ? this.styleService.deleteImageStyle(style.id)
        : this.styleService.deleteTextStyle(style.id);

    observable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.deleting.set(false);
        this.showDeleteConfirm.set(false);
        // Navigate back to styles list
        this.router.navigate(['/details/styles']);
      },
      error: (err) => {
        console.error('Error deleting style:', err);
        this.error.set(err.message || 'Failed to delete style');
        this.deleting.set(false);
        this.showDeleteConfirm.set(false);
      },
    });
  }

  public goBack(): void {
    this.router.navigate(['/details/styles']);
  }

  public copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error('Failed to copy:', err);
    });
  }
}
