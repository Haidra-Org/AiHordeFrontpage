import {
  afterNextRender,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AiHordeService } from '../../services/ai-horde.service';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.css',
})
export class TermsComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly terms = signal('');

  constructor() {
    // Fetch terms only in the browser after rendering completes.
    // This prevents stale prerendered data from appearing during static builds.
    afterNextRender(() => {
      this.aiHorde.terms
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((termsContent) => {
          this.terms.set(termsContent);
        });
    });
  }
}
