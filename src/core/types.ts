// Shared market-data types for the computation modules.

/** A candle. `time` is the chart time (UTC seconds, possibly shifted for display). Only CLOSED candles go into analysis. */
export interface Candle { time: number; open: number; high: number; low: number; close: number; volume?: number }

/** +1 = up/buy, -1 = down/sell */
export type Dir = 1 | -1;
