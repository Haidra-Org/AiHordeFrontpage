import {
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { debounceTime } from 'rxjs';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { ToggleCheckboxComponent } from '../../components/toggle-checkbox/toggle-checkbox.component';
import { AuthService } from '../../services/auth.service';
import { AdminWorkerService } from '../../services/admin-worker.service';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';
import { WorkerCardComponent } from '../admin/workers/worker-card.component';
import { HordeWorker } from '../../types/horde-worker';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    TranslocoPipe,
    TranslocoModule,
    ToggleCheckboxComponent,
    ReactiveFormsModule,
    FormatNumberPipe,
    RouterLink,
    WorkerCardComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workerService = inject(AdminWorkerService);
  public readonly auth = inject(AuthService);

  public loginError = signal<boolean>(false);

  // Workers state
  public userWorkers = signal<HordeWorker[]>([]);
  public loadingWorkers = signal<boolean>(false);
  public workersExpanded = signal<boolean>(false);

  // Records expanded state
  public recordsExpanded = signal<boolean>(false);

  public form = new FormGroup({
    apiKey: new FormControl<string>('', [Validators.required]),
    remember: new FormControl<boolean>(false),
  });

  ngOnInit(): void {
    // Set title
    this.translator
      .get('profile.title')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((profileTitle) => {
        this.translator.get('app_title').subscribe((appTitle) => {
          this.title.setTitle(`${profileTitle} | ${appTitle}`);
        });
      });

    this.footerColor.setDarkMode(true);

    // Reset error when typing
    this.form.controls.apiKey.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loginError.set(false);
      });
  }

  public login(): void {
    if (!this.form.valid) {
      return;
    }

    this.loginError.set(false);

    this.auth
      .login(this.form.value.apiKey!, this.form.value.remember ?? false)
      .subscribe((user) => {
        if (!user) {
          this.loginError.set(true);
        } else {
          this.form.reset();
        }
      });
  }

  public logout(): void {
    this.auth.logout();
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

  public toggleWorkersSection(): void {
    const expanded = !this.workersExpanded();
    this.workersExpanded.set(expanded);

    if (expanded && this.userWorkers().length === 0) {
      this.loadUserWorkers();
    }
  }

  public toggleRecordsSection(): void {
    this.recordsExpanded.set(!this.recordsExpanded());
  }

  private loadUserWorkers(): void {
    const user = this.auth.currentUser();
    if (!user || !user.worker_ids || user.worker_ids.length === 0) return;

    this.loadingWorkers.set(true);

    this.workerService
      .getWorkersByIds(user.worker_ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((workers) => {
        this.userWorkers.set(workers);
        this.loadingWorkers.set(false);
      });
  }

  public onWorkerUpdated(): void {
    this.loadUserWorkers();
  }
}
