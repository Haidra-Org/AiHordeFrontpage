import { Routes } from '@angular/router';

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
    loadComponent: () =>
      import('./pages/admin/admin.component').then((c) => c.AdminComponent),
    loadChildren: () =>
      import('./pages/admin/admin.routes').then((m) => m.adminRoutes),
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
    path: 'v2-transfer',
    loadComponent: () =>
      import('./pages/transfer/transfer.component').then(
        (c) => c.TransferComponent,
      ),
  },
];
