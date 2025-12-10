import {
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { TranslatorService } from '../../../services/translator.service';
import { AuthService } from '../../../services/auth.service';
import { FormatNumberPipe } from '../../../pipes/format-number.pipe';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    TranslocoPipe,
    TranslocoModule,
    RouterLink,
    FormatNumberPipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly auth = inject(AuthService);

  ngOnInit(): void {
    this.translator
      .get('admin.dashboard.title')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((dashboardTitle) => {
        this.translator.get('app_title').subscribe((appTitle) => {
          this.title.setTitle(`${dashboardTitle} | ${appTitle}`);
        });
      });
  }

  public formatAccountAge(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    if (days > 365) {
      const years = Math.floor(days / 365);
      const remainingDays = days % 365;
      return `${years} year${years !== 1 ? 's' : ''}, ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
    }
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
}
