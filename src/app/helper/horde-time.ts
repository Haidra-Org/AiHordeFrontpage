/** An ISO 8601 date and time with no `Z` and no offset after it. */
const NAIVE_ISO_DATE_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/;

/**
 * A horde timestamp as a `Date`, or null when there is none or it does not
 * parse. The horde stores UTC and serialises many of its times without a zone
 * (`2026-09-27T01:55:37.171139`), which `Date` and Angular's `DatePipe` would
 * otherwise read as local time. Times that carry a zone, in ISO or RFC 1123
 * form, keep it.
 */
export function parseHordeTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(NAIVE_ISO_DATE_TIME.test(value) ? `${value}Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}
