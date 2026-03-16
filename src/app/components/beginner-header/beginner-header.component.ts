import {
  Component,
  input,
  computed,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { KudosTermComponent } from '../kudos-term/kudos-term.component';
import { PageGuideService } from '../../services/page-guide.service';
import { IconComponent } from '../icon/icon.component';

const STORAGE_KEY = 'beginner-dismissed-tools';

@Component({
  selector: 'app-beginner-header',
  imports: [RouterLink, TranslocoModule, KudosTermComponent, IconComponent],
  templateUrl: './beginner-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BeginnerHeaderComponent {
  private readonly guideService = inject(PageGuideService);

  showButton = input(false);
  disableLinks = input(false);
  dismissable = input(true);

  public readonly isDismissed = computed(() =>
    this.guideService.isDismissed(STORAGE_KEY)(),
  );

  public dismiss(): void {
    this.guideService.dismiss(STORAGE_KEY);
  }

  public restore(): void {
    this.guideService.restore(STORAGE_KEY);
  }
}
