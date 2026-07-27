import { Routes } from '@angular/router';
import { authGuard } from './guards/admin.guard';
import { environment } from '../environments/environment';

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
      import('./pages/profile/profile-shell.component').then(
        (c) => c.ProfileShellComponent,
      ),
    loadChildren: () =>
      import('./pages/profile/profile.routes').then((m) => m.profileRoutes),
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
    // Image generation and Alchemy are subtabs of one full-height /generate
    // workspace: /generate/image and /generate/alchemy share the shell's tab bar.
    path: 'generate',
    loadComponent: () =>
      import('./pages/generate/generate-shell.component').then(
        (c) => c.GenerateShellComponent,
      ),
    children: [
      {
        path: 'image',
        loadComponent: () =>
          import('./pages/generate/generate.component').then(
            (c) => c.GenerateComponent,
          ),
      },
      {
        path: 'alchemy',
        loadComponent: () =>
          import('./pages/alchemy/alchemy.component').then(
            (c) => c.AlchemyComponent,
          ),
      },
      // The learning area is its own little site under the studio shell: a
      // landing page, the worked examples and the written guide, all sharing a
      // subnav the shell knows nothing about.
      {
        path: 'learn',
        loadComponent: () =>
          import('./pages/generate/generate-learn-shell/generate-learn-shell.component').then(
            (c) => c.GenerateLearnShellComponent,
          ),
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./pages/generate/generate-learn-home/generate-learn-home.component').then(
                (c) => c.GenerateLearnHomeComponent,
              ),
          },
          // One route per example; the landing page is what a bare
          // `tutorials` would otherwise have to invent an index for.
          {
            path: 'tutorials/:flow',
            loadComponent: () =>
              import('./pages/generate/generate-tutorials/generate-tutorials.component').then(
                (c) => c.GenerateTutorialsComponent,
              ),
          },
          { path: 'tutorials', redirectTo: '', pathMatch: 'full' },
          {
            path: 'guide',
            loadComponent: () =>
              import('./pages/generate/generate-guide/generate-guide.component').then(
                (c) => c.GenerateGuideComponent,
              ),
          },
        ],
      },
      // The old flat tutorial URLs, which are in the wild. A plain string
      // `redirectTo` would drop `:flow`, so the deep link is rebuilt by hand.
      {
        path: 'tutorials/:flow',
        redirectTo: ({ params }) =>
          `/generate/learn/tutorials/${params['flow']}`,
      },
      { path: 'tutorials', redirectTo: 'learn', pathMatch: 'full' },
      { path: '', redirectTo: 'image', pathMatch: 'full' },
    ],
  },
  {
    // Preserve the old top-level /alchemy entry point.
    path: 'alchemy',
    redirectTo: 'generate/alchemy',
    pathMatch: 'full',
  },
  {
    path: 'faq',
    loadComponent: () =>
      import('./pages/faq/faq.component').then((c) => c.FaqComponent),
  },
  {
    path: 'status',
    loadComponent: () =>
      import('./pages/status/status.component').then((c) => c.StatusComponent),
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
    path: 'mission',
    loadComponent: () =>
      import('./pages/mission/mission.component').then(
        (c) => c.MissionComponent,
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
    redirectTo: 'contribute/workers',
    pathMatch: 'full',
  },
  {
    path: 'rate',
    canMatch: [() => environment.features.ratingsPage],
    loadComponent: () =>
      import('./pages/rate/rate.component').then((c) => c.RateComponent),
  },
  {
    path: 'v2-transfer',
    loadComponent: () =>
      import('./pages/transfer/transfer.component').then(
        (c) => c.TransferComponent,
      ),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./not-found/not-found.component').then(
        (c) => c.NotFoundComponent,
      ),
  },
];
