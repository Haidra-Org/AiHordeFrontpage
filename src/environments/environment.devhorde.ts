/**
 * The development configuration pointed at the staging horde.
 *
 * `development` reads production, which only serves the API the public site
 * already has. A horde change under review is deployed to the staging host
 * first, so this configuration is how a surface that depends on it is driven
 * against a real deployment before that change reaches production. Every
 * other address matches `development`.
 */
export const environment = {
  siteUrl: 'https://aihorde.net',
  apiBaseUrl: 'https://dev.aihorde.net/api/v2',
  ratingsApiBaseUrl: 'https://ratings.aihorde.net/api/v1',
  statusApiBaseUrl: 'https://alerts.haidra.net/api/v1',
  evidenceBaseUrl: 'https://assets.aihorde.net/param-sweeps',
  promoBaseUrl: 'https://assets.aihorde.net/promo',
  features: {
    ratingsPage: false,
  },
};
