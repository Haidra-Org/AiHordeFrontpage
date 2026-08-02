export const environment = {
  /* Where the site is published. Canonical and Open Graph URLs are absolute and
     are built at prerender time, when the document's own origin is the build
     server's rather than the site's. */
  siteUrl: 'https://aihorde.net',
  /* The local configuration exists for the on-disk sweep library mapping, not
     for a local horde stack, so the API points at the real horde: with it on
     localhost the model list (and every submission) needs an AI Horde dev
     server on 7001 that is usually not running. Point both back at
     http://localhost:7001 to develop against a local horde. */
  apiBaseUrl: 'https://aihorde.net/api/v2',
  ratingsApiBaseUrl: 'https://ratings.aihorde.net/api/v1',
  statusApiBaseUrl: '/status-api/api/v1',
  evidenceBaseUrl: '/assets/param-sweeps',
  features: {
    ratingsPage: false,
  },
};
