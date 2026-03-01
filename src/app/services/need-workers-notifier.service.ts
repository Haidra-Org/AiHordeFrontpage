import {
  Injectable,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  effect,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NetworkStatusService } from './network-status.service';
import { NavNotificationService } from './nav-notification.service';

const NOTIFICATION_ID = 'need_workers';

/**
 * Watches NetworkStatusService's *NeedsHelp signals and pushes / removes
 * a single "need_workers" NavNotification into NavNotificationService.
 *
 * Initialise by injecting this service in a root-level component.
 */
@Injectable({ providedIn: 'root' })
export class NeedWorkersNotifierService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(Injector);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly navNotifications = inject(NavNotificationService);

  private started = false;

  constructor() {
    afterNextRender(() => this.start());
  }

  private start(): void {
    if (this.started || !isPlatformBrowser(this.platformId)) return;
    this.started = true;

    effect(() => {
      const image = this.networkStatus.imageNeedsHelp();
      const text = this.networkStatus.textNeedsHelp();
      const alchemy = this.networkStatus.alchemyNeedsHelp();
      const any = image || text || alchemy;

      if (!any) {
        this.navNotifications.remove(NOTIFICATION_ID);
        return;
      }

      const types: string[] = [];
      if (image) types.push('image');
      if (text) types.push('text');
      if (alchemy) types.push('alchemy');

      const stateHash = types.join(',');

      this.navNotifications.add({
        id: NOTIFICATION_ID,
        type: 'network',
        message: 'notification.need_workers.message',
        messageParams: { types: this.formatTypeList(types) },
        tooltip: 'notification.need_workers.tooltip',
        tooltipParams: { types: this.formatTypeList(types) },
        navItem: 'contribute',
        navSubItem: 'become-worker',
        routerLink: '/contribute/workers',
        priority: 50,
        stateHash,
      });
    }, { injector: this.injector });
  }

  /**
   * Formats ['image', 'text', 'alchemy'] → "image, text and alchemy"
   * Used as-is in the transloco interpolation params.
   */
  private formatTypeList(types: string[]): string {
    if (types.length === 1) return types[0];
    return types.slice(0, -1).join(', ') + ' and ' + types[types.length - 1];
  }
}
