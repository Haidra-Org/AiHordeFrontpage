export interface SinglePeriodImageModelStats {
  [modelName: string]: number;
}

export interface ImageModelStats {
  day: SinglePeriodImageModelStats;
  month: SinglePeriodImageModelStats;
  total: SinglePeriodImageModelStats;
}
