import {
  afterNextRender,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { combineLatest, map } from 'rxjs';
import { FooterColorService } from '../../services/footer-color.service';
import { NoSorterKeyValue } from '../../types/no-sorter-key-value';
import { TranslatorService } from '../../services/translator.service';
import { AiHordeService } from '../../services/ai-horde.service';

@Component({
  selector: 'app-privacy',
  standalone: true,
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.css',
})
export class PrivacyComponent implements OnInit {
  protected readonly NoSorterKeyValue = NoSorterKeyValue;
  private readonly footerColor = inject(FooterColorService);
  private readonly translator = inject(TranslatorService);
  private readonly titleService = inject(Title);
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly policy = signal('');

  constructor() {
    // Fetch privacy policy only in the browser after rendering completes.
    // This prevents stale prerendered data from appearing during static builds.
    afterNextRender(() => {
      this.aiHorde.privacyPolicy
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((policyContent) => {
          this.policy.set(policyContent);
        });
    });
  }

  ngOnInit(): void {
    this.footerColor.setDarkMode(true);

    // Set title reactively
    combineLatest([
      this.translator.get('privacy_policy'),
      this.translator.get('app_title'),
    ])
      .pipe(map(([privacy, app]) => `${privacy} | ${app}`))
      .subscribe((title) => this.titleService.setTitle(title));
  }
}
