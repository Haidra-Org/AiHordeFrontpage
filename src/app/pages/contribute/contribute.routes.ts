import { Routes } from '@angular/router';

export const contributeRoutes: Routes = [
  {
    path: '',
    redirectTo: 'joining',
    pathMatch: 'full',
  },
  {
    path: 'joining',
    loadComponent: () =>
      import('./joining/joining.component').then((c) => c.JoiningComponent),
  },
  {
    path: 'donate',
    loadComponent: () =>
      import('./donate/donate.component').then((c) => c.DonateComponent),
  },
];
