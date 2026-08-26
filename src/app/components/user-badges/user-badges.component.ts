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
        class="hd-skeleton-bar user-badge-skeleton"
        aria-hidden="true"
      ></span>
      <span
        class="hd-skeleton-bar user-badge-skeleton user-badge-skeleton--narrow"
        aria-hidden="true"
      ></span>
    } @else {
      @if (trusted()) {
        <span
          class="hd-badge user-badge user-badge--vouched"
          [attr.title]="'admin.users.desc.trusted' | transloco"
          >{{ 'profile.badge.trusted' | transloco }}</span
        >
      }
      @if (moderator()) {
        <span
          class="hd-badge user-badge user-badge--staff"
          [attr.title]="'admin.users.desc.moderator' | transloco"
          >{{ 'profile.badge.moderator' | transloco }}</span
        >
      }
      @if (education()) {
        <span
          class="hd-badge user-badge user-badge--programme"
          [attr.title]="'admin.users.desc.education' | transloco"
          >{{ 'profile.badge.education' | transloco }}</span
        >
      }
      @if (service()) {
        <span
          class="hd-badge user-badge"
          [attr.title]="'admin.users.desc.service' | transloco"
          >{{ 'profile.badge.service' | transloco }}</span
        >
      }
      @if (customizer()) {
        <span
          class="hd-badge user-badge"
          [attr.title]="'admin.users.desc.customizer' | transloco"
          >{{ 'profile.badge.customizer' | transloco }}</span
        >
      }
      @if (special()) {
        <span
          class="hd-badge user-badge"
          [attr.title]="'admin.users.desc.special' | transloco"
          >{{ 'profile.badge.special' | transloco }}</span
        >
      }
      @if (pseudonymous()) {
        <span class="hd-badge user-badge">{{
          'profile.badge.anonymous' | transloco
        }}</span>
      }
      @if (filtered()) {
        <span
          class="hd-badge user-badge user-badge--caution"
          [attr.title]="'admin.users.desc.filtered' | transloco"
          >{{ 'profile.badge.filtered' | transloco }}</span
        >
      }
      @if (flagged()) {
        <span
          class="hd-badge user-badge user-badge--flagged"
          [attr.title]="'admin.users.desc.flagged' | transloco"
          >{{ 'profile.badge.flagged' | transloco }}</span
        >
      }
    }
  `,
  host: { class: 'user-badges' },
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
