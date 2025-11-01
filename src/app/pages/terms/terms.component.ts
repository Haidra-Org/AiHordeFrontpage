import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AiHordeService } from '../../services/ai-horde.service';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.scss',
})
export class TermsComponent {
  private readonly aiHorde = inject(AiHordeService);

  // Automatically unsubscribes when component is destroyed
  public readonly terms = toSignal(this.aiHorde.terms, { initialValue: '' });
}
