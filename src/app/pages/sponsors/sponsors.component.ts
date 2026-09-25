import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../components/icon/icon.component';
import { AiHordeService } from '../../services/ai-horde.service';
import { setPageMeta } from '../../helper/page-meta';
import {
  parseSponsorsDocument,
  SponsorsDocument,
} from '../../helper/sponsors-document';

/** Who pays for the AI Horde, read from the horde's own sponsors document. */
@Component({
  selector: 'app-sponsors',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './sponsors.component.html',
  styleUrl: './sponsors.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorsComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly document = signal<SponsorsDocument | null>(null);
  public readonly failed = signal(false);

  /** Where the page sends a reader who wants to help pay for it. */
  public readonly donateUrl = 'https://haidra.net/donate/';

  constructor() {
    setPageMeta({
      titleKey: 'sponsors',
      descriptionKey: 'sponsors.meta_description',
    });

    // Read the document in the browser: the list changes on the horde's side,
    // and a build-time copy would age into the served page.
    afterNextRender(() => {
      this.aiHorde.sponsorsDocument
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (markdown) =>
            this.document.set(parseSponsorsDocument(markdown)),
          error: () => this.failed.set(true),
        });
    });
  }
}
