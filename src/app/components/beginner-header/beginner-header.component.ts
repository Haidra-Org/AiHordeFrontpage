import {
  Component,
  input,
  signal,
  inject,
  PLATFORM_ID,
  ChangeDetectionStrategy,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { KudosTermComponent } from '../kudos-term/kudos-term.component';

const STORAGE_KEY = 'beginner-dismissed-tools';

@Component({
  selector: 'app-beginner-header',
  imports: [RouterLink, TranslocoModule, KudosTermComponent],
  templateUrl: './beginner-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BeginnerHeaderComponent {
  private readonly platformId = inject(PLATFORM_ID);

  showButton = input(false);
  disableLinks = input(false);

  private readonly _isDismissed = signal(false);
  public readonly isDismissed = this._isDismissed.asReadonly();

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      queueMicrotask(() => {
        if (localStorage.getItem(STORAGE_KEY) === 'dismissed') {
          this._isDismissed.set(true);
        }
      });
    }
  }

  public dismiss(): void {
    this._isDismissed.set(true);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, 'dismissed');
    }
  }

  public restore(): void {
    this._isDismissed.set(false);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}
