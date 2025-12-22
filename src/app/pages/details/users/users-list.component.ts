import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { EntityLookupComponent } from '../../../components/entity-lookup/entity-lookup.component';
import { TranslatorService } from '../../../services/translator.service';
import { extractUserId } from '../../../helper/user-parser';

@Component({
  selector: 'app-users-list',
  imports: [TranslocoPipe, EntityLookupComponent, RouterLink],
  template: `
    <section class="section-primary">
      <div class="container-page-header">
        <div class="place-center">
          <h1 class="heading-hero">{{ 'details.users.title' | transloco }}</h1>
          <p class="text-intro text-secondary mt-2">
            {{ 'details.users.description' | transloco }}
          </p>
        </div>
      </div>
    </section>

    <section class="section-secondary">
      <div class="container-spaced">
        <div class="container-page-content">
          <div class="card card-bg-primary card-full">
            <h2 class="heading-card">{{ 'details.users.lookup.label' | transloco }}</h2>
            <app-entity-lookup
              label="details.users.lookup.label"
              placeholder="details.users.lookup.placeholder"
              hintText="details.users.lookup.hint"
              (search)="onUserSearch($event)"
            />
          </div>

          <div class="card card-bg-primary card-full mt-6">
            <h2 class="heading-card">{{ 'details.users.browse_title' | transloco }}</h2>
            <p class="text-body text-content-secondary mb-4">
              {{ 'details.users.browse_info' | transloco }}
            </p>
            <div class="data-grid-1-2">
              <a
                routerLink="/details/leaderboard"
                class="entity-card-link"
              >
                <h3 class="entity-card-title">
                  {{ 'details.users.leaderboard_link' | transloco }}
                </h3>
                <p class="text-sm text-content-secondary">
                  {{ 'details.users.leaderboard_desc' | transloco }}
                </p>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersListComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  ngOnInit(): void {
    combineLatest([
      this.translator.get('details.users.title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([usersTitle, appTitle]) => {
        this.title.setTitle(`${usersTitle} | ${appTitle}`);
      });
  }

  public onUserSearch(value: string): void {
    const userId = extractUserId(value);
    if (userId !== null) {
      this.router.navigate(['/details/users', userId]);
    } else {
      // Try treating it as a raw ID or show an error
      const numericId = parseInt(value.trim(), 10);
      if (!isNaN(numericId)) {
        this.router.navigate(['/details/users', numericId]);
      }
    }
  }
}
