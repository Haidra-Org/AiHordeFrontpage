export type SinglePeriodImageModelStats = Record<string, number>;

export interface ImageModelStats {
  day: SinglePeriodImageModelStats;
  month: SinglePeriodImageModelStats;
  total: SinglePeriodImageModelStats;
}
