import { TranslocoService } from '@jsverse/transloco';

const SECONDS_PER_DAY = 86400;
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
