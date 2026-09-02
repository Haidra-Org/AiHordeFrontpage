export const environment = {
  /* Where the site is published. Canonical and Open Graph URLs are absolute and
     are built at prerender time, when the document's own origin is the build
     server's rather than the site's. */
  siteUrl: 'https://aihorde.net',
  apiBaseUrl: 'https://aihorde.net/api/v2',
  ratingsApiBaseUrl: 'https://ratings.aihorde.net/api/v1',
  statusApiBaseUrl: 'https://alerts.haidra.net/api/v1',
  /* See environment.ts: one base URL for every published asset. */
  evidenceBaseUrl: 'https://assets.aihorde.net/param-sweeps',
  promoBaseUrl: 'https://assets.aihorde.net/promo',
  features: {
    ratingsPage: false,
  },
};
