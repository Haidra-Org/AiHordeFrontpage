import { RenderMode, ServerRoute } from '@angular/ssr';

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

  // Public static pages - prerender at build time for best performance
  {
    path: '',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'faq',
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
