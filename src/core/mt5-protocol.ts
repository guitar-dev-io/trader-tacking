// Messages between the read-only MT5 EA (mt5/PriceTrackerBridge.mq5) and the app (mt5.js), one JSON object per line.
// Times are UTC unix seconds unless the name says ms. Nothing in this protocol can place, change or close an order.

export type DealSide = 'buy' | 'sell' | 'balance';
export type DealEntry = 'in' | 'out' | 'inout' | 'outby';

/** One MT5 history deal (DEALS reply). `side: 'balance'` = deposit/withdrawal/credit (profit holds the amount). */
export interface Deal {
  ticket: number;
  /** position id (0 for balance operations) */
  pos: number;
  s: string;
  side: DealSide;
  entry: DealEntry;
  vol: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  time: number;
}

export interface Account {
  currency: string;
  balance: number;
  equity: number;
  margin?: number;
  free?: number;
  leverage?: number;
  demo?: boolean;
}

export interface Position {
  ticket: number; s: string; side: 'buy' | 'sell'; vol: number; open: number; sl: number; tp: number;
  price: number; profit: number; swap: number; time: number; magic?: number; comment?: string;
}

export interface PendingOrder {
  ticket: number; s: string; type: string; vol: number; price: number; sl: number; tp: number; time: number;
}

export interface Bar { t: number; o: number; h: number; l: number; c: number; v?: number }

/** EA → app */
export type EAMessage =
  | { t: 'hello'; v: number; build?: number; caps?: string[]; broker: string; server: string; offset: number; symbols: string[]; login?: string }
  | { t: 'tick'; s: string; bid: number; ask: number; ms: number; open?: number; digits?: number }
  | { t: 'bars'; id: number | string; s: string; tf: string; bars: Bar[]; digits?: number }
  | { t: 'bar'; slot?: string; s: string; bar: Bar }
  | { t: 'pos'; acct: Account; positions: Position[]; orders: PendingOrder[] }
  | { t: 'deals'; id: number | string; deals: Deal[] }
  | { t: 'err'; id?: number | string; msg: string }
  | { t: 'pong' };

/** app → EA: the only commands the EA understands (all read-only). */
export type EACommand = 'WATCH' | 'HIST' | 'SUB' | 'POS' | 'DEALS' | 'PING';
export const EA_COMMANDS: readonly EACommand[] = ['WATCH', 'HIST', 'SUB', 'POS', 'DEALS', 'PING'];

/** Parse one line from the EA; null when it is not a known message. */
export function parseEAMessage(line: string): EAMessage | null {
  let m: unknown;
  try { m = JSON.parse(line); } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  const t = (m as { t?: unknown }).t;
  return typeof t === 'string' && ['hello', 'tick', 'bars', 'bar', 'pos', 'deals', 'err', 'pong'].includes(t) ? (m as EAMessage) : null;
}

/** True when a command line sent to the EA is one of the read-only commands. */
export const isReadOnlyCommand = (line: string): boolean => EA_COMMANDS.includes(line.split('|')[0] as EACommand);
