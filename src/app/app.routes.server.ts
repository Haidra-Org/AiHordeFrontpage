import { RenderMode, ServerRoute } from '@angular/ssr';
import { FLOWS } from './content/flows';
import { SETTINGS_INDEX } from './content/settings';

/**
 * Server route configuration for hybrid rendering.
 *
 * RenderMode options:
 * - Client: Route is rendered entirely on the client (CSR). Use for auth-protected routes.
 * - Prerender: Route is pre-rendered at build time (SSG). Use for static public pages.
 * - Server: Route is rendered on the server per-request (SSR). Use for dynamic content.
 */
export const serverRoutes: ServerRoute[] = [
  // Auth-protected routes - render on client only (no prerendering/SSR)
  // These routes have guards that require authentication which isn't available during SSR
  {
    path: 'admin',
    renderMode: RenderMode.Client,
  },
  {
    path: 'admin/**',
    renderMode: RenderMode.Client,
  },

  // Profile page requires authentication context
  {
    path: 'profile',
    renderMode: RenderMode.Client,
  },
  {
    path: 'profile/**',
    renderMode: RenderMode.Client,
  },

  // Public static pages - prerender at build time for best performance
  {
    path: '',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'alchemy',
    renderMode: RenderMode.Prerender,
  },
  // Client-only: the page is driven entirely by browser-side IndexedDB/queue
  // state, so there is nothing meaningful to server-render.
  {
    path: 'generate',
    renderMode: RenderMode.Client,
  },
  {
    path: 'generate/**',
    renderMode: RenderMode.Client,
  },

  // The documentation is the opposite case: static prose written to be linked
  // to and found, so every page of it is built at build time. The parameters
  // come from the content registries themselves, which is what keeps the
  // prerendered set and the reference in step.
  // `/docs` is a redirect onto the one area the documentation has rather than a
  // page, so there is nothing to build at build time: it is answered per request
  // and the reader arrives at the area itself.
  {
    path: 'docs',
    renderMode: RenderMode.Server,
  },
  {
    path: 'docs/image',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'docs/image/guide',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'docs/image/settings',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'docs/image/settings/:param',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: () =>
      Promise.resolve(
        SETTINGS_INDEX.flatMap((group) => group.ids).map((param) => ({
          param,
        })),
      ),
  },
  {
    path: 'docs/image/learn/:flow',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: () =>
      Promise.resolve(
        FLOWS.filter((flow) => !flow.concept).map((flow) => ({
          flow: flow.id,
        })),
      ),
  },
  {
    path: 'faq',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'status',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'guis',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'news',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'register',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'mission',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'sponsors',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'privacy',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'terms',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'v2-transfer',
    renderMode: RenderMode.Prerender,
  },

  // Details pages - prerender base routes, server-render dynamic ones
  {
    path: 'details',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'details/**',
    renderMode: RenderMode.Server,
  },

  // Contribute pages - prerender for public access
  {
    path: 'contribute',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'contribute/**',
    renderMode: RenderMode.Prerender,
  },

  // Fallback - server render any unmatched routes
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
