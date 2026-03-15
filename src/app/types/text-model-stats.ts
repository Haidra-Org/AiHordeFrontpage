export type SinglePeriodTextModelStats = Record<string, number>;

export interface TextModelStats {
  day: SinglePeriodTextModelStats;
  month: SinglePeriodTextModelStats;
  total: SinglePeriodTextModelStats;
}
