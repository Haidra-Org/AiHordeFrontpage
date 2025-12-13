import { Routes } from '@angular/router';

export const detailsRoutes: Routes = [
  {
    path: '',
    redirectTo: 'workers',
    pathMatch: 'full',
  },
  {
    path: 'workers',
    loadComponent: () =>
      import('./workers/public-workers.component').then(
        (c) => c.PublicWorkersComponent,
      ),
  },
  {
    path: 'models',
    loadComponent: () =>
      import('./models/models-list.component').then(
        (c) => c.ModelsListComponent,
      ),
  },
  {
    path: 'usage',
    loadComponent: () =>
      import('./usage-stats/usage-stats.component').then(
        (c) => c.UsageStatsComponent,
      ),
  },
  {
    path: 'styles',
    loadComponent: () =>
      import('./styles/styles-list.component').then(
        (c) => c.StylesListComponent,
      ),
  },
  {
    path: 'styles/:type/:styleId',
    loadComponent: () =>
      import('./styles/style-detail.component').then(
        (c) => c.StyleDetailComponent,
      ),
  },
  {
    path: 'leaderboard',
    loadComponent: () =>
      import('./kudos-leaderboard/kudos-leaderboard.component').then(
        (c) => c.KudosLeaderboardComponent,
      ),
  },
];
