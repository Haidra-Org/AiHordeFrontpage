import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';
import { IconComponent } from '../../../../components/icon/icon.component';
import { FormatNumberPipe } from '../../../../pipes/format-number.pipe';
import { UserBadgesComponent } from '../../../../components/user-badges/user-badges.component';
import { UserStatsSummaryComponent } from '../../../../components/user-stats-summary/user-stats-summary.component';
import { UserKudosCardComponent } from '../../../../components/user-kudos-card/user-kudos-card.component';
import { AdminDialogComponent } from '../../../../components/admin/admin-dialog/admin-dialog.component';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap, EMPTY, tap } from 'rxjs';
import { formatAccountAge } from '../../../../helper/account-age';
import { ProfileShellComponent } from '../../profile-shell.component';

@Component({
  selector: 'app-profile-overview',
  imports: [
    RouterLink,
    TranslocoPipe,
    FormatNumberPipe,
    IconComponent,
    UserBadgesComponent,
    UserStatsSummaryComponent,
    UserKudosCardComponent,
    AdminDialogComponent,
  ],
  templateUrl: './profile-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileOverviewComponent {
  public readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly shell = inject(ProfileShellComponent);

  // Active generation counts
  public readonly activeImageCount = computed(
    () => this.auth.currentUser()?.active_generations?.image?.length ?? 0,
  );
  public readonly activeTextCount = computed(
    () => this.auth.currentUser()?.active_generations?.text?.length ?? 0,
  );
  public readonly activeAlchemyCount = computed(
    () => this.auth.currentUser()?.active_generations?.alchemy?.length ?? 0,
  );
  public readonly hasActiveGenerations = computed(
    () =>
      this.activeImageCount() > 0 ||
      this.activeTextCount() > 0 ||
      this.activeAlchemyCount() > 0,
  );

  // Asset counts for quick-nav boxes
  public readonly workerCount = computed(
    () => this.auth.currentUser()?.worker_ids?.length ?? 0,
  );
  /** The tile and the tab badge print the same total, so the shell's count
   * is the one both read rather than each asking for the list itself. */
  public readonly teamCount = this.shell.teamCount;
  /** What the records tab has to show: every request this account has made. */
  public readonly requestsOnRecord = computed(() => {
    const user = this.auth.currentUser();
    const request = user?.records?.request;
    if (request) {
      return (
        (request.image ?? 0) +
        (request.text ?? 0) +
        (request.interrogation ?? 0)
      );
    }
    return user?.usage?.requests ?? 0;
  });
  public readonly styleCount = computed(
    () => this.auth.currentUser()?.styles?.length ?? 0,
  );
  public readonly sharedKeyCount = computed(
    () => this.auth.currentUser()?.sharedkey_ids?.length ?? 0,
  );

  // Contact nag — reads parent's state via auth signal chain
  public readonly shouldSetContactNag = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return false;
    const hasWorkers = (user.worker_ids?.length ?? 0) > 0;
    const hasContact = (user.contact?.trim().length ?? 0) > 0;
    return hasWorkers && !hasContact;
  });

  // Undelete dialog state
  public undeleteDialogOpen = signal<boolean>(false);
  public undeleteLoading = signal<boolean>(false);

  // Username dialog state
  public usernameDialogOpen = signal<boolean>(false);
  public usernameInput = signal<string>('');
  public usernameSaving = signal<boolean>(false);

  public formatAccountAge(seconds: number): string {
    return formatAccountAge(this.transloco, seconds);
  }

  public logout(): void {
    this.auth.logout();
  }

  // Username dialog
  public openUsernameDialog(): void {
    const user = this.auth.currentUser();
    if (!user) return;
    const name = user.username.includes('#')
      ? user.username.substring(0, user.username.lastIndexOf('#'))
      : user.username;
    this.usernameInput.set(name);
    this.usernameDialogOpen.set(true);
  }

  public closeUsernameDialog(): void {
    this.usernameDialogOpen.set(false);
  }

  public onUsernameInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.usernameInput.set(target.value);
  }

  public confirmUsernameChange(): void {
    const name = this.usernameInput().trim();
    if (!name) return;
    this.usernameSaving.set(true);
    this.auth
      .updateProfile({ username: name })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.usernameSaving.set(false);
        if (result.success) {
          this.usernameDialogOpen.set(false);
          this.toast.success('profile.change_username_success', {
            transloco: true,
          });
        } else {
          this.toast.error(result.error ?? 'Failed to update username');
        }
      });
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
}
