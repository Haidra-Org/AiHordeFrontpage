import { Routes } from '@angular/router';
import { authGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/homepage/homepage.component').then(
        (c) => c.HomepageComponent,
      ),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./pages/profile/profile.component').then(
        (c) => c.ProfileComponent,
      ),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/admin/admin.component').then((c) => c.AdminComponent),
    loadChildren: () =>
      import('./pages/admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: 'details',
    loadComponent: () =>
      import('./pages/details/details.component').then(
        (c) => c.DetailsComponent,
      ),
    loadChildren: () =>
      import('./pages/details/details.routes').then((m) => m.detailsRoutes),
  },
  {
    path: 'faq',
    loadComponent: () =>
      import('./pages/faq/faq.component').then((c) => c.FaqComponent),
  },
  {
    path: 'guis',
    loadComponent: () =>
      import('./pages/guis-and-tools/guis-and-tools.component').then(
        (c) => c.GuisAndToolsComponent,
      ),
  },
  {
    path: 'guis-and-tools',
    redirectTo: 'guis',
    pathMatch: 'full',
  },
  {
    path: 'news',
    loadComponent: () =>
      import('./pages/news/news.component').then((c) => c.NewsComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./pages/register/register.component').then(
        (c) => c.RegisterComponent,
      ),
  },
  {
    path: 'sponsors',
    loadComponent: () =>
      import('./pages/sponsors/sponsors.component').then(
        (c) => c.SponsorsComponent,
      ),
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./pages/privacy/privacy.component').then(
        (c) => c.PrivacyComponent,
      ),
  },
  {
    path: 'terms',
    loadComponent: () =>
      import('./pages/terms/terms.component').then((c) => c.TermsComponent),
  },
  {
    path: 'contribute',
    loadComponent: () =>
      import('./pages/contribute/contribute.component').then(
        (c) => c.ContributeComponent,
      ),
    loadChildren: () =>
      import('./pages/contribute/contribute.routes').then(
        (m) => m.contributeRoutes,
      ),
  },
  {
    path: 'joining',
    redirectTo: 'contribute/joining',
    pathMatch: 'full',
  },
  {
    path: 'v2-transfer',
    loadComponent: () =>
      import('./pages/transfer/transfer.component').then(
        (c) => c.TransferComponent,
      ),
  },
];
