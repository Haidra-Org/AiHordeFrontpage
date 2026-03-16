import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { EntityLookupComponent } from '../../../components/entity-lookup/entity-lookup.component';
import { PageIntroComponent } from '../../../components/page-intro/page-intro.component';
import { TranslatorService } from '../../../services/translator.service';
import { setPageTitle } from '../../../helper/page-title';
import { extractUserId } from '../../../helper/user-parser';

@Component({
  selector: 'app-users-list',
  imports: [
    TranslocoPipe,
    EntityLookupComponent,
    RouterLink,
    PageIntroComponent,
  ],
  template: `
    <app-page-intro pageKey="users" />

    <div class="card card-bg-primary card-full">
      <h2 class="heading-card">
        {{ 'details.users.lookup.label' | transloco }}
      </h2>
      <app-entity-lookup
        label="details.users.lookup.label"
        placeholder="details.users.lookup.placeholder"
        hintText="details.users.lookup.hint"
        (searchSubmitted)="onUserSearch($event)"
      />
      <p class="text-body text-content-secondary mb-4">
        {{ 'details.users.browse_info' | transloco }}
      </p>
      <div>
        <a routerLink="/details/leaderboard" class="entity-card-link">
          <h3 class="entity-card-title">
            {{ 'details.users.leaderboard_link' | transloco }}
          </h3>
          <p class="text-sm text-content-secondary">
            {{ 'details.users.leaderboard_desc' | transloco }}
          </p>
        </a>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersListComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  ngOnInit(): void {
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'details.users.title',
    );
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
