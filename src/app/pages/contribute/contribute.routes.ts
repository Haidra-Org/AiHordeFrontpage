import { Routes } from '@angular/router';

export const contributeRoutes: Routes = [
  {
    path: '',
    redirectTo: 'workers',
    pathMatch: 'full',
  },
  {
    path: 'workers',
    loadComponent: () =>
      import('./workers/workers.component').then((c) => c.WorkersComponent),
  },
  {
    path: 'joining',
    redirectTo: 'workers',
    pathMatch: 'full',
  },
  {
    path: 'donate',
    loadComponent: () =>
      import('./donate/donate.component').then((c) => c.DonateComponent),
  },
];
