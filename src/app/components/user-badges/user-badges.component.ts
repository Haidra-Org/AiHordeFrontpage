import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export interface UserBadgeFlags {
  trusted?: boolean;
  moderator?: boolean;
  education?: boolean;
  service?: boolean;
  customizer?: boolean;
  special?: boolean;
  pseudonymous?: boolean;
  filtered?: boolean;
  flagged?: boolean;
}

@Component({
  selector: 'app-user-badges',
  imports: [TranslocoPipe],
  template: `
    @if (loading()) {
      <span
        class="skeleton-bar skeleton-bar-sm"
        style="width: 4.5rem; height: 1.375rem; display: inline-block; border-radius: 9999px;"
        aria-hidden="true"
      ></span>
      <span
        class="skeleton-bar skeleton-bar-sm"
        style="width: 3.5rem; height: 1.375rem; display: inline-block; border-radius: 9999px;"
        aria-hidden="true"
      ></span>
    } @else {
      @if (trusted()) {
        <span
          class="badge-base badge-success"
          [attr.title]="'admin.users.desc.trusted' | transloco"
          >{{ 'profile.badge.trusted' | transloco }}</span
        >
      }
      @if (moderator()) {
        <span
          class="badge-base badge-purple"
          [attr.title]="'admin.users.desc.moderator' | transloco"
          >{{ 'profile.badge.moderator' | transloco }}</span
        >
      }
      @if (education()) {
        <span
          class="badge-base badge-info"
          [attr.title]="'admin.users.desc.education' | transloco"
          >{{ 'profile.badge.education' | transloco }}</span
        >
      }
      @if (service()) {
        <span
          class="badge-base badge-warning"
          [attr.title]="'admin.users.desc.service' | transloco"
          >{{ 'profile.badge.service' | transloco }}</span
        >
      }
      @if (customizer()) {
        <span
          class="badge-base badge-pink"
          [attr.title]="'admin.users.desc.customizer' | transloco"
          >{{ 'profile.badge.customizer' | transloco }}</span
        >
      }
      @if (special()) {
        <span
          class="badge-base badge-secondary"
          [attr.title]="'admin.users.desc.special' | transloco"
          >{{ 'profile.badge.special' | transloco }}</span
        >
      }
      @if (pseudonymous()) {
        <span class="badge-base badge-secondary">{{
          'profile.badge.anonymous' | transloco
        }}</span>
      }
      @if (filtered()) {
        <span
          class="badge-base badge-warning"
          [attr.title]="'admin.users.desc.filtered' | transloco"
          >{{ 'profile.badge.filtered' | transloco }}</span
        >
      }
      @if (flagged()) {
        <span
          class="badge-base badge-danger"
          [attr.title]="'admin.users.desc.flagged' | transloco"
          >{{ 'profile.badge.flagged' | transloco }}</span
        >
      }
    }
  `,
  host: { class: 'badge-container' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserBadgesComponent {
  public readonly loading = input(false);
  public readonly trusted = input(false);
  public readonly moderator = input(false);
  public readonly education = input(false);
  public readonly service = input(false);
  public readonly customizer = input(false);
  public readonly special = input(false);
  public readonly pseudonymous = input(false);
  public readonly filtered = input(false);
  public readonly flagged = input(false);
}
