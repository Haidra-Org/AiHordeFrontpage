export const environment = {
  /* Where the site is published. Canonical and Open Graph URLs are absolute and
     are built at prerender time, when the document's own origin is the build
     server's rather than the site's. */
  siteUrl: 'https://aihorde.net',
  /* Local builds must exercise the API branch under development. Keeping this
     separate from the default environment prevents an apparently successful
     frontend test from reading production contracts or submitting live work. */
  apiBaseUrl: 'http://localhost:7001/api/v2',
  ratingsApiBaseUrl: 'https://ratings.aihorde.net/api/v1',
  statusApiBaseUrl: '/status-api/api/v1',
  evidenceBaseUrl: '/assets/param-sweeps',
  /* Link previews are only ever read from the published site. */
  promoBaseUrl: 'https://assets.aihorde.net/promo',
  features: {
    ratingsPage: false,
  },
};
