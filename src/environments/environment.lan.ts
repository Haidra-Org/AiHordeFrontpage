/**
 * The local configuration, reachable from other devices on the network.
 *
 * `local` points the browser at `http://localhost:7001`, which on a phone or a
 * second machine is that device rather than the one running the API, so every
 * contract-driven control stays hidden there. This configuration reads the API
 * origin off the page's own hostname instead, so `ng serve -c lan --host <ip>`
 * serves a studio whose requests reach the API on the same machine the page
 * came from. Prerendering has no page, and falls back to localhost.
 */
export const environment = {
  siteUrl: 'https://aihorde.net',
  get apiBaseUrl(): string {
    const host =
      typeof location === 'undefined' ? 'localhost' : location.hostname;
    return `http://${host}:7001/api/v2`;
  },
  ratingsApiBaseUrl: 'https://ratings.aihorde.net/api/v1',
  statusApiBaseUrl: '/status-api/api/v1',
  evidenceBaseUrl: '/assets/param-sweeps',
  /* Link previews are only ever read from the published site. */
  promoBaseUrl: 'https://assets.aihorde.net/promo',
  features: {
    ratingsPage: false,
  },
};
