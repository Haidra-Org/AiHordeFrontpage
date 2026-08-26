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
    // Where an installed copy of the site opens: the manifest's start_url. An
    // installed window has no address bar and no memory of how the reader got
    // in, so this is a page of doors rather than the front page.
    path: 'app',
    loadComponent: () =>
      import('./pages/app-landing/app-landing.component').then(
        (c) => c.AppLandingComponent,
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
      {
        // What both studios have stored, and the only place anything is
        // removed in bulk. Under the studio shell rather than the profile
        // because this data is local and works without an account.
        path: 'storage',
        loadComponent: () =>
          import('./pages/generate/studio-storage/studio-storage.component').then(
            (c) => c.StudioStorageComponent,
          ),
      },
      { path: '', redirectTo: 'image', pathMatch: 'full' },
    ],
  },
  {
    // The documentation: its own area of the site rather than a pane of the
    // studio, because these pages are written to be linked to from outside and
    // read on their own. The studio still owns the doing; this owns the reading,
    // and the two render the same components from the same content registry.
    path: 'docs',
    loadComponent: () =>
      import('./pages/docs/docs-shell/docs-shell.component').then(
        (c) => c.DocsShellComponent,
      ),
    // A page of this area keeps the phone's tool bar unless it declares
    // `data: { toolTabs: false }`, which is for a page that needs the foot of
    // the screen for controls of its own.
    children: [
      // /docs has no page of its own and lands on the image area, which is the
      // larger of the two and the one a reader arriving without an area in mind
      // is looking for. A front door listing both areas is a page nobody has
      // written yet rather than a page that was decided against.
      { path: '', redirectTo: 'image', pathMatch: 'full' },
      {
        path: 'image',
        loadComponent: () =>
          import('./pages/docs/image-home/image-home.component').then(
            (c) => c.DocsImageHomeComponent,
          ),
      },
      // One route per worked example; the area's landing page is what a bare
      // `learn` would otherwise have to invent an index for.
      {
        path: 'image/learn/:flow',
        loadComponent: () =>
          import('./pages/docs/image-example/image-example.component').then(
            (c) => c.DocsImageExampleComponent,
          ),
      },
      { path: 'image/learn', redirectTo: 'image', pathMatch: 'full' },
      // Every way a render can be held to a source picture, read as one page:
      // the choice is between the seven kinds of guidance before it is between
      // thirty-three names, and that is a comparison rather than a page each.
      {
        path: 'image/control-types',
        loadComponent: () =>
          import('./pages/docs/control-types/control-types.component').then(
            (c) => c.DocsControlTypesComponent,
          ),
      },
      // The walkthrough said again what the reference already says setting by
      // setting, so the reference is where its readers are sent.
      { path: 'image/guide', redirectTo: 'image/settings', pathMatch: 'full' },
      // The settings reference: an index of every setting the panel explains,
      // and a page per setting. A `:param` naming no setting is sent back to the
      // index by the page itself, which is the only place that knows what the
      // reference has.
      {
        path: 'image/settings',
        loadComponent: () =>
          import('./pages/docs/settings-index/settings-index.component').then(
            (c) => c.DocsSettingsIndexComponent,
          ),
      },
      {
        path: 'image/settings/:param',
        loadComponent: () =>
          import('./pages/docs/settings-entry/settings-entry.component').then(
            (c) => c.DocsSettingsEntryComponent,
          ),
      },
      // The alchemy area: the four things the studio is used for, and a page
      // per one. A `:useCase` naming none is sent back to the list by the page
      // itself, which is the only place that knows what the area has.
      {
        path: 'alchemy',
        loadComponent: () =>
          import('./pages/docs/alchemy-home/alchemy-home.component').then(
            (c) => c.DocsAlchemyHomeComponent,
          ),
      },
      {
        path: 'alchemy/:useCase',
        loadComponent: () =>
          import('./pages/docs/alchemy-usecase/alchemy-usecase.component').then(
            (c) => c.DocsAlchemyUseCaseComponent,
          ),
      },
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
