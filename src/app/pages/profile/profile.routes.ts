import { Routes } from '@angular/router';

export const profileRoutes: Routes = [
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  {
    path: 'overview',
    data: { tabKey: 'profile' },
    loadComponent: () =>
      import('./tabs/overview/profile-overview.component').then(
        (c) => c.ProfileOverviewComponent,
      ),
  },
  {
    path: 'generations',
    data: { tabKey: 'generations' },
    loadComponent: () =>
      import('./tabs/generations/profile-generations.component').then(
        (c) => c.ProfileGenerationsComponent,
      ),
  },
  {
    path: 'records',
    data: { tabKey: 'records' },
    loadComponent: () =>
      import('./tabs/records/profile-records.component').then(
        (c) => c.ProfileRecordsComponent,
      ),
  },
  {
    path: 'workers',
    data: { tabKey: 'workers' },
    loadComponent: () =>
      import('./tabs/workers/profile-workers.component').then(
        (c) => c.ProfileWorkersComponent,
      ),
  },
  {
    path: 'teams',
    data: { tabKey: 'teams' },
    loadComponent: () =>
      import('./tabs/teams/profile-teams.component').then(
        (c) => c.ProfileTeamsComponent,
      ),
  },
  {
    path: 'styles',
    data: { tabKey: 'styles' },
    loadComponent: () =>
      import('./tabs/styles/profile-styles.component').then(
        (c) => c.ProfileStylesComponent,
      ),
  },
  {
    path: 'shared-keys',
    data: { tabKey: 'shared-keys' },
    loadComponent: () =>
      import('./tabs/shared-keys/profile-shared-keys.component').then(
        (c) => c.ProfileSharedKeysComponent,
      ),
  },
  {
    path: 'settings',
    data: { tabKey: 'settings' },
    loadComponent: () =>
      import('./tabs/settings/profile-settings.component').then(
        (c) => c.ProfileSettingsComponent,
      ),
  },
];
