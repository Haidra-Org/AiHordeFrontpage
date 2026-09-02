import { TranslocoService } from '@jsverse/transloco';

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const DAYS_PER_YEAR = 365;

/**
 * An account age worded in years and days. The unit words and the way the two
 * halves join are translations rather than string building, because neither
 * the plural rule nor the order of the halves holds outside English.
 */
export function formatAccountAge(
  transloco: TranslocoService,
  seconds: number | undefined,
): string {
  if (!seconds) return '';

  const totalDays = Math.floor(seconds / SECONDS_PER_DAY);
  if (totalDays <= DAYS_PER_YEAR) {
    return countedDays(transloco, totalDays);
  }

  const years = Math.floor(totalDays / DAYS_PER_YEAR);
  const countedYears: string = transloco.translate(
    years === 1
      ? 'profile.account_age_years_one'
      : 'profile.account_age_years_other',
    { count: years },
  );

  return transloco.translate('profile.account_age_years_days', {
    years: countedYears,
    days: countedDays(transloco, totalDays % DAYS_PER_YEAR),
  });
}

function countedDays(transloco: TranslocoService, days: number): string {
  return transloco.translate(
    days === 1
      ? 'profile.account_age_days_one'
      : 'profile.account_age_days_other',
    { count: days },
  );
}

/**
 * A worker's or a team's uptime in its two largest units, with the unit
 * letters translated: days and hours past a day, hours and minutes under one.
 */
export function formatUptime(
  transloco: TranslocoService,
  seconds: number,
): string {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const d: string = transloco.translate('details.teams.uptime_days_short');
  const h: string = transloco.translate('details.teams.uptime_hours_short');
  const m: string = transloco.translate('details.teams.uptime_minutes_short');
  if (days > 0) {
    return `${days}${d} ${hours}${h}`;
  }
  if (hours > 0) {
    return `${hours}${h} ${minutes}${m}`;
  }
  return `${minutes}${m}`;
}
