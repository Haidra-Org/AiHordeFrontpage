import { Routes } from '@angular/router';

export const detailsRoutes: Routes = [
  {
    path: '',
    redirectTo: 'workers',
    pathMatch: 'full',
  },
  // Workers routes - more specific routes first
  {
    path: 'workers',
    data: { headingKey: 'details.heading.workers' },
    loadComponent: () =>
      import('./workers/public-workers.component').then(
        (c) => c.PublicWorkersComponent,
      ),
  },
  // Workers filtered by owner (must come before :workerType)
  {
    path: 'workers/owner/:ownerId',
    data: { headingKey: 'details.heading.workers' },
    loadComponent: () =>
      import('./workers/public-workers.component').then(
        (c) => c.PublicWorkersComponent,
      ),
  },
  // Worker by ID only (type determined dynamically by looking up worker)
  {
    path: 'workers/id/:workerId',
    data: { headingKey: 'details.heading.workers' },
    loadComponent: () =>
      import('./workers/worker-lookup.component').then(
        (c) => c.WorkerLookupComponent,
      ),
  },
  // Worker by name
  {
    path: 'workers/name/:workerName',
    data: { headingKey: 'details.heading.workers' },
    loadComponent: () =>
      import('./workers/worker-lookup.component').then(
        (c) => c.WorkerLookupComponent,
      ),
  },
  // Specific worker by ID (type determined dynamically)
  {
    path: 'workers/:workerType/:workerId',
    data: { headingKey: 'details.heading.workers' },
    loadComponent: () =>
      import('./workers/public-workers.component').then(
        (c) => c.PublicWorkersComponent,
      ),
  },
  // Workers filtered by type (image, text, interrogation)
  {
    path: 'workers/:workerType',
    data: { headingKey: 'details.heading.workers' },
    loadComponent: () =>
      import('./workers/public-workers.component').then(
        (c) => c.PublicWorkersComponent,
      ),
  },
  // Users routes
  {
    path: 'users',
    data: { headingKey: 'details.heading.users' },
    loadComponent: () =>
      import('./users/users-list.component').then((c) => c.UsersListComponent),
  },
  {
    path: 'users/:userId',
    data: { headingKey: 'details.heading.users' },
    loadComponent: () =>
      import('./users/user-profile.component').then(
        (c) => c.UserProfileComponent,
      ),
  },
  // Models routes
  {
    path: 'models',
    data: { headingKey: 'details.heading.models' },
    loadComponent: () =>
      import('./models/models-list.component').then(
        (c) => c.ModelsListComponent,
      ),
  },
  // Model by name only (type determined dynamically)
  {
    path: 'models/name/:modelName',
    data: { headingKey: 'details.heading.models' },
    loadComponent: () =>
      import('./models/models-list.component').then(
        (c) => c.ModelsListComponent,
      ),
  },
  // Specific model by name (must come before :modelType)
  {
    path: 'models/:modelType/:modelName',
    data: { headingKey: 'details.heading.models' },
    loadComponent: () =>
      import('./models/models-list.component').then(
        (c) => c.ModelsListComponent,
      ),
  },
  // Models filtered by type (image, text)
  {
    path: 'models/:modelType',
    data: { headingKey: 'details.heading.models' },
    loadComponent: () =>
      import('./models/models-list.component').then(
        (c) => c.ModelsListComponent,
      ),
  },
  {
    path: 'usage',
    data: { headingKey: 'details.heading.usage' },
    loadComponent: () =>
      import('./usage-stats/usage-stats.component').then(
        (c) => c.UsageStatsComponent,
      ),
  },
  {
    path: 'styles',
    data: { headingKey: 'details.heading.styles' },
    loadComponent: () =>
      import('./styles/styles-list.component').then(
        (c) => c.StylesListComponent,
      ),
  },
  // Styles with highlight (must come before :type/:styleId)
  {
    path: 'styles/:type/highlight/:highlightStyleId',
    data: { headingKey: 'details.heading.styles' },
    loadComponent: () =>
      import('./styles/styles-list.component').then(
        (c) => c.StylesListComponent,
      ),
  },
  {
    path: 'styles/:type/:styleId',
    data: { headingKey: 'details.heading.styles' },
    loadComponent: () =>
      import('./styles/style-detail.component').then(
        (c) => c.StyleDetailComponent,
      ),
  },
  // Teams routes - more specific routes first
  {
    path: 'teams',
    data: { headingKey: 'details.heading.teams' },
    loadComponent: () =>
      import('./teams/teams-list.component').then((c) => c.TeamsListComponent),
  },
  // Teams filtered by owner (must come before :teamId)
  {
    path: 'teams/owner/:ownerId',
    data: { headingKey: 'details.heading.teams' },
    loadComponent: () =>
      import('./teams/teams-list.component').then((c) => c.TeamsListComponent),
  },
  // Teams with highlight (must come before :teamId)
  {
    path: 'teams/highlight/:highlightTeamId',
    data: { headingKey: 'details.heading.teams' },
    loadComponent: () =>
      import('./teams/teams-list.component').then((c) => c.TeamsListComponent),
  },
  {
    path: 'teams/:teamId',
    data: { headingKey: 'details.heading.teams' },
    loadComponent: () =>
      import('./teams/team-detail.component').then(
        (c) => c.TeamDetailComponent,
      ),
  },
  {
    path: 'leaderboard',
    data: { headingKey: 'details.heading.leaderboard' },
    loadComponent: () =>
      import('./kudos-leaderboard/kudos-leaderboard.component').then(
        (c) => c.KudosLeaderboardComponent,
      ),
  },
];
