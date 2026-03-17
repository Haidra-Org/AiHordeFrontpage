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
import {
  ImageStyle,
  isImageStyle,
  isTextStyle,
  TextStyle,
} from '../../../types/style';
import { highlightJson, stringifyAsJson } from '../../../helper/json-formatter';
import { IconComponent } from '../../../components/icon/icon.component';

type StyleType = 'image' | 'text';

@Component({
  selector: 'app-style-detail',
  templateUrl: './style-detail.component.html',
  styleUrls: ['./style-detail.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink, IconComponent],
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

  public parameterCount = computed(() => {
    const style = this.style();
    if (!style) return 0;
    const params = style.params as Record<string, unknown> | undefined;
    if (!params) return 0;

    return Object.values(params).filter((value) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== undefined && value !== null && value !== '';
    }).length;
  });

  public tagCount = computed(() => this.style()?.tags?.length ?? 0);

  public modelCount = computed(() => this.style()?.models?.length ?? 0);

  public exampleCount = computed(() => {
    const style = this.style();
    if (style && isImageStyle(style)) {
      return style.examples?.length ?? 0;
    }
    return 0;
  });

  public styleJsonHighlighted = computed(() => highlightJson(this.styleJson()));

  public ngOnInit(): void {
    // Watch for route param changes
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
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

  public toggleJsonView(): void {
    this.showJsonView.update((v) => !v);
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
      error: (err: any) => {
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

  /**
   * Get the link to the creator's user profile.
   * Extracts the user ID from the "username#id" format.
   */
  public getCreatorLink(): string[] {
    const style = this.style();
    if (!style?.creator) return ['/details/users'];

    const creatorParts = style.creator.split('#');
    if (creatorParts.length >= 2) {
      const creatorId = creatorParts[creatorParts.length - 1];
      return ['/details/users', creatorId];
    }
    return ['/details/users'];
  }
}
