export const environment = {
  /* Where the site is published. Canonical and Open Graph URLs are absolute and
     are built at prerender time, when the document's own origin is the build
     server's rather than the site's. */
  siteUrl: 'https://aihorde.net',
  apiBaseUrl: 'https://aihorde.net/api/v2',
  ratingsApiBaseUrl: 'https://ratings.aihorde.net/api/v1',
  statusApiBaseUrl: 'https://alerts.haidra.net/api/v1',
  sweepLibraryBaseUrl:
    'https://raw.githubusercontent.com/Haidra-Org/haidra-assets/main/assets/param-sweeps',
  features: {
    ratingsPage: false,
  },
};
