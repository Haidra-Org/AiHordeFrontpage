import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, map } from 'rxjs';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { TranslatorService } from '../services/translator.service';

@Component({
  selector: 'app-not-found',
  imports: [TranslocoPipe, TranslocoModule, RouterLink],
  template: `
    <section class="section-primary">
      <div class="container-content-minimal">
        <div class="text-center py-16">
          <h1 class="heading-section-lg mb-4">
            {{ 'not_found.heading' | transloco }}
          </h1>
          <p class="text-secondary text-lg mb-8">
            {{ 'not_found.message' | transloco }}
          </p>
          <div class="flex justify-center gap-4 flex-wrap">
            <a routerLink="/" class="btn btn-primary">
              {{ 'not_found.go_home' | transloco }}
            </a>
            <a routerLink="/faq" class="btn btn-secondary">
              {{ 'not_found.go_faq' | transloco }}
            </a>
          </div>
        </div>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    combineLatest([
      this.translator.get('not_found.title'),
      this.translator.get('app_title'),
    ])
      .pipe(
        map(([notFound, appTitle]) => `${notFound} | ${appTitle}`),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((title) => this.title.setTitle(title));
  }
}
