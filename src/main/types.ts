// Shapes shared by the Electron main process, the preload bridge and (as types only) the renderer.

/** A live quote (bid/ask) for one symbol, as the window and the API see it. */
export interface Quote {
  symbol: string;
  time: string;              // ISO
  bid: number;
  ask: number;
  digits: number;
  spread: number;
  change: number | null;
  changePct: number | null;
}

export type Source = 'vcg' | 'mt5';

export interface ApiSettings { enabled: boolean; port: number; token: string; lan: boolean }
export interface ClaudeSettings { enabled: boolean; token: string }
export interface WebhookSettings { url: string; onSignal: boolean; onAlert: boolean }
export interface TelegramSettings { botToken: string; chatId: string; onSignal: boolean; onAlert: boolean }
export interface NetSettings { slowMs: number; delayMs: number; staleSec: number; stuckSec: number; notify: boolean }
export interface Mt5Settings {
  port: number;
  autoUpdateEA: boolean;
  /** account key → bundled EA build already attempted */
  eaAttempted: Record<string, number>;
  autoLaunch: boolean;
  closeOnQuit: boolean;
  eaSeen: boolean;
}
export interface WindowBounds { x?: number; y?: number; width: number; height: number }

/** settings.json */
export interface Settings {
  symbols: string[];
  traySymbol: string;
  csv: boolean;
  api: ApiSettings;
  claude: ClaudeSettings;
  webhook: WebhookSettings;
  telegram: TelegramSettings;
  net: NetSettings;
  openAtLogin: boolean;
  source: Source;
  mt5: Mt5Settings;
  siteBounds?: WindowBounds;
}

/** What the settings dialog reads (`get-settings`). */
export interface SettingsView {
  mt5: Mt5Settings; source: Source; api: ApiSettings; webhook: WebhookSettings; telegram: TelegramSettings; net: NetSettings;
  openAtLogin: boolean; version: string; logFile: string | null; userData: string;
}
/** What the settings dialog writes (`set-settings`). */
export interface SettingsPatch {
  api: Partial<ApiSettings> & { port?: number | string };
  webhook?: Partial<WebhookSettings>;
  telegram?: Partial<TelegramSettings>;
  net?: Partial<NetSettings>;
  mt5?: Partial<Pick<Mt5Settings, 'autoUpdateEA' | 'autoLaunch' | 'closeOnQuit'>> & { port?: number | string };
  openAtLogin?: boolean;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export interface LogEntry { t: string; level: LogLevel; source: string; msg: string; data?: string }

export interface Mt5Status {
  listening: boolean; connected: boolean; broker: string | null; server: string | null; symbols: string[];
  eaVersion: number | null; eaBuild: number | null; unknown: string[]; port: number; lastTick: number;
}
export interface NetStatusLine { level: NetLevel; detail: string; pingMs: number | null }
export type NetLevel = 'ok' | 'slow' | 'stale' | 'down' | 'offline';

/** `status` push + GET /api/status */
export interface AppStatus {
  version: string; stage: 'connected' | 'connecting' | 'login'; connected: boolean; loggedIn: boolean; csv: boolean;
  symbols: string[]; traySymbol: string; lastTick: number; ticks: number; api: ApiSettings; invalid: string[];
  net: NetStatusLine; arch: string; rosetta: boolean; bootSec: number | null; source: Source; mt5: Mt5Status;
}

/** `net` push (every 2 s) */
export interface NetReport {
  cpu: { app: number | null; ui: number | null; webtrader: number | null; gpu: number | null } | null;
  level: NetLevel; detail: string; rtt: number | null; feedDelay: number | null; lastTickAgo: number | null; reconnects: number; connected: boolean;
}

/** One candle as both sources hand it to the window (VCG and MT5 use the same shape). */
export interface WireCandle { timeSeconds: number; open: number; high: number; low: number; close: number }
/** `chart` push: candles / updates / errors for a chart slot ('main', 'mtf', 'w1'…) */
export interface ChartMsg { type: string; slot?: string; data?: unknown }
/** `chart-request` from the window */
export interface ChartRequest { symbol: string; candleType: number; limit?: number; to: string; inclusive?: boolean; slot?: string }

/** `api-cmd` (main → window) and its result */
export interface ApiCmd { id: number; name: string; args: Record<string, unknown> }
export interface ApiCmdResult { id: number; data?: unknown; error?: string }

/** One step of a multi-step action shown in the UI (EA install, MT5 launch) */
export interface Step { ok: boolean; t: string }
export interface StepsResult { ok: boolean; steps: Step[]; manual?: boolean; running?: boolean; reattach?: boolean; log?: string }

export interface EaUpdateEvent { state: 'start' | 'ok' | 'fail'; msg: string; steps?: Step[]; manual?: boolean }
export interface ClaudeSetupResult {
  ok: boolean; entry: McpEntry; codeCmd: string; desktopConfig: string; wroteDesktop: boolean; error?: string;
}
export interface McpEntry { command: string; args: string[]; env: Record<string, string> }
export interface ClaudeStatus { api: boolean; claude: boolean; port: number; desktop: boolean; mac: boolean; listening: boolean }
