export interface SinglePeriodTextModelStats {
  [modelName: string]: number;
}

export interface TextModelStats {
  day: SinglePeriodTextModelStats;
  month: SinglePeriodTextModelStats;
  total: SinglePeriodTextModelStats;
}
