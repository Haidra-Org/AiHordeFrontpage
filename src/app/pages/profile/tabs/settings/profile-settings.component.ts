import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { concatMap, EMPTY, tap } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';
import { PageGuideService } from '../../../../services/page-guide.service';
import { InfoTooltipComponent } from '../../../../components/info-tooltip/info-tooltip.component';
import { AdminDialogComponent } from '../../../../components/admin/admin-dialog/admin-dialog.component';
import { DeleteAccountDialogComponent } from '../../../../components/delete-account-dialog/delete-account-dialog.component';

const CONTACT_NAG_DISMISSED_STORAGE_KEY = 'profile_contact_nag_dismissed';

@Component({
  selector: 'app-profile-settings',
  imports: [
    TranslocoPipe,
    InfoTooltipComponent,
    AdminDialogComponent,
    DeleteAccountDialogComponent,
  ],
  templateUrl: './profile-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSettingsComponent {
  private readonly platformId = inject(PLATFORM_ID);
  public readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  public readonly guideService = inject(PageGuideService);

  // Contact nag
  public readonly contactNagDismissed = signal<boolean>(
    this.loadContactNagDismissed(),
  );
  public readonly shouldSetContactNag = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return false;
    const hasWorkers = (user.worker_ids?.length ?? 0) > 0;
    const hasContact = (user.contact?.trim().length ?? 0) > 0;
    return hasWorkers && !hasContact;
  });
  public readonly showContactNagNotifications = computed(
    () => this.shouldSetContactNag() && !this.contactNagDismissed(),
  );

  // Contact dialog
  public contactDialogOpen = signal<boolean>(false);
  public contactInput = signal<string>('');
  public contactSaving = signal<boolean>(false);
  public contactDialogError = signal<string | null>(null);

  // Public workers dialog
  public publicWorkersDialogOpen = signal<boolean>(false);
  public publicWorkersNewValue = signal<boolean>(false);
  public publicWorkersSaving = signal<boolean>(false);

  // Delete account
  public deleteDialogOpen = signal<boolean>(false);
  public deleteLoading = signal<boolean>(false);

  // Undelete account
  public undeleteDialogOpen = signal<boolean>(false);
  public undeleteLoading = signal<boolean>(false);

  public readonly usernameWithDiscriminator = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return '';
    return user.username;
  });

  // Contact dialog methods
  public openContactDialog(): void {
    const user = this.auth.currentUser();
    this.contactInput.set(user?.contact ?? '');
    this.contactDialogError.set(null);
    this.contactDialogOpen.set(true);
  }

  public closeContactDialog(): void {
    this.contactDialogError.set(null);
    this.contactDialogOpen.set(false);
  }

  public onContactInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.contactInput.set(target.value);
    this.contactDialogError.set(null);
  }

  public confirmContactChange(): void {
    const contact = this.contactInput().trim();
    if (contact.length < 5 || contact.length > 500) {
      this.contactDialogError.set(
        'Contact must be between 5 and 500 characters.',
      );
      return;
    }

    const previousDismissedState = this.contactNagDismissed();
    if (contact.length > 0) {
      this.contactNagDismissed.set(true);
      this.storeContactNagDismissed(true);
    }

    this.contactSaving.set(true);
    this.contactDialogError.set(null);

    this.auth
      .updateProfile({ contact })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.contactSaving.set(false);
        if (result.success) {
          this.contactDialogOpen.set(false);
          this.toast.success('profile.edit_contact_success', {
            transloco: true,
          });
        } else {
          this.contactNagDismissed.set(previousDismissedState);
          this.storeContactNagDismissed(previousDismissedState);
          this.contactDialogError.set(
            result.error ?? 'Failed to update contact',
          );
          this.toast.error(result.error ?? 'Failed to update contact');
        }
      });
  }

  // Public workers toggle
  public onPublicWorkersToggle(newValue: boolean): void {
    this.publicWorkersNewValue.set(newValue);
    this.publicWorkersDialogOpen.set(true);
  }

  public closePublicWorkersDialog(): void {
    this.publicWorkersDialogOpen.set(false);
  }

  public confirmPublicWorkersChange(): void {
    this.publicWorkersSaving.set(true);
    this.auth
      .updateProfile({ public_workers: this.publicWorkersNewValue() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.publicWorkersSaving.set(false);
        if (result.success) {
          this.publicWorkersDialogOpen.set(false);
          this.toast.success('profile.public_workers_success', {
            transloco: true,
          });
        } else {
          this.toast.error(result.error ?? 'Failed to update setting');
        }
      });
  }

  // Contact nag
  public dismissContactNagNotifications(): void {
    this.contactNagDismissed.set(true);
    this.storeContactNagDismissed(true);
  }

  // Delete account
  public openDeleteDialog(): void {
    this.deleteDialogOpen.set(true);
  }

  public closeDeleteDialog(): void {
    this.deleteDialogOpen.set(false);
  }

  public confirmDeleteAccount(): void {
    const user = this.auth.currentUser();
    if (!user) return;
    const wasAlreadyDeleted = user.deleted ?? false;
    this.deleteLoading.set(true);
    this.auth
      .deleteUser()
      .pipe(
        tap((result) => {
          this.deleteLoading.set(false);
          if (result.success) {
            this.deleteDialogOpen.set(false);
            if (wasAlreadyDeleted) {
              this.toast.success('profile.delete_account_permanent_success', {
                transloco: true,
              });
              setTimeout(() => {
                this.auth.logout();
                void this.router.navigate(['/']);
              }, 2000);
            } else {
              this.toast.success('profile.delete_account_success', {
                transloco: true,
              });
            }
          } else {
            this.toast.error(result.error.message, { autoDismissMs: 5000 });
          }
        }),
        concatMap((result) =>
          result.success && !wasAlreadyDeleted
            ? this.auth.refreshUser()
            : EMPTY,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  // Undelete account
  public openUndeleteDialog(): void {
    this.undeleteDialogOpen.set(true);
  }

  public closeUndeleteDialog(): void {
    this.undeleteDialogOpen.set(false);
  }

  public confirmUndeleteAccount(): void {
    this.undeleteLoading.set(true);
    this.auth
      .undeleteUser()
      .pipe(
        tap((result) => {
          this.undeleteLoading.set(false);
          this.undeleteDialogOpen.set(false);
          if (result.success) {
            this.toast.success('profile.undelete_account_success', {
              transloco: true,
            });
          } else {
            this.toast.error(result.error ?? 'Failed to restore account', {
              autoDismissMs: 5000,
            });
          }
        }),
        concatMap((result) =>
          result.success ? this.auth.refreshUser() : EMPTY,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private loadContactNagDismissed(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    try {
      return localStorage.getItem(CONTACT_NAG_DISMISSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private storeContactNagDismissed(value: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      if (value) {
        localStorage.setItem(CONTACT_NAG_DISMISSED_STORAGE_KEY, '1');
      } else {
        localStorage.removeItem(CONTACT_NAG_DISMISSED_STORAGE_KEY);
      }
    } catch {
      // localStorage may be unavailable
    }
  }
}
