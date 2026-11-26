// The IPC contract between the window (preload → window.vcg) and the Electron main process.
// One map per direction; main.ts registers handlers through handle()/listen(), preload.ts calls through invoke()/send()
// and subscribes through on(). A channel name or payload that doesn't match is a compile error on both sides.
import type {
  AppStatus, ApiCmd, ApiCmdResult, ChartMsg, ChartRequest, ClaudeSetupResult, ClaudeStatus, EaUpdateEvent, LogEntry,
  LogLevel, NetReport, Quote, SettingsPatch, SettingsView, StepsResult,
} from './types';
import type { Account, Deal, PendingOrder, Position } from '../core/mt5-protocol';

export interface PositionsSnapshot { at: number; acct: Account; positions: Position[]; orders: PendingOrder[] }
export interface JournalStatus { state: 'idle' | 'ready' | 'old-ea' | 'backfill' | 'ok' | 'error' | 'offline'; msg: string }
export interface JournalAccount {
  key?: string; broker?: string; server?: string; hasLogin?: boolean; balanceDeals?: boolean; currency?: string; demo?: boolean; leverage?: number;
}
export interface Snapshot { time: number; balance: number; equity: number }
export interface JournalView {
  account: JournalAccount | null; deals: Deal[]; snapshots: Snapshot[]; from: number | null; syncedAt: number | null; status: JournalStatus; syncing: boolean;
}
export interface Mt5EaInfo { bundled: number | null; running: number | null; auto: boolean }
export interface Mt5LaunchOptions { symbol?: string; period?: string; force?: boolean }

/** window → main, request/response (ipcRenderer.invoke ↔ ipcMain.handle): [args, result] */
export interface InvokeMap {
  'save-ea': [[], string | null];
  'fetch-json': [[url: string], unknown];
  'fetch-text': [[url: string], string];
  'sign-out': [[], boolean];
  'claude-setup': [[opts?: { desktop?: boolean }], ClaudeSetupResult];
  'claude-status': [[], ClaudeStatus];
  'claude-disable': [[], boolean];
  'mt5-install-ea': [[], { installed: string[]; failed: string[] }];
  'mt5-ea-source': [[], string];
  'mt5-launch': [[opt?: Mt5LaunchOptions], StepsResult];
  'open-site': [[url: string], boolean | 'external'];
  'mt5-auto-now': [[], boolean];
  'mt5-update-ea': [[], StepsResult];
  'mt5-ea-info': [[], Mt5EaInfo];
  'mt5-open-editor': [[], boolean | 'folder'];
  'journal-get': [[], JournalView];
  'journal-sync': [[], { added: number } & JournalStatus];
  'journal-export': [[csv: string], string | null];
  'mt5-positions': [[on: boolean], PositionsSnapshot | null];
  'mt5-deals': [[from: number, to?: number], Deal[]];
  'notify': [[msg: { event: string; payload: unknown; text: string }], number];
  'get-settings': [[], SettingsView];
  'set-settings': [[patch: SettingsPatch], boolean];
}

/** window → main, fire-and-forget (ipcRenderer.send ↔ ipcMain.on) */
export interface SendMap {
  'set-source': [src: string];
  'chart-request': [req: ChartRequest];
  'chart-data': [d: unknown];
  'analysis': [a: unknown];
  'api-cmd-result': [r: ApiCmdResult];
  'log': [e: { level?: LogLevel; msg: string; data?: unknown; source?: string }];
  'open-log-file': [];
  'open-log-folder': [];
  'add-symbol': [s: string];
  'remove-symbol': [s: string];
  'set-tray': [s: string];
  'toggle-csv': [];
  'open-csv': [];
  'show-trader': [];
  'reload-trader': [];
  /** from the hidden WebTrader window (trader-preload.ts) */
  'chart-msg': [m: TraderMsg];
}

/** main → window pushes (webContents.send ↔ ipcRenderer.on) */
export interface PushMap {
  'quotes': Quote[];
  'status': AppStatus;
  'chart': ChartMsg;
  'net': NetReport;
  'logs': LogEntry[];
  'api-cmd': ApiCmd;
  'mt5-auto': { state: 'launching' };
  'ea-update': EaUpdateEvent;
  'journal-changed': null;
  'positions': PositionsSnapshot | null;
}

/** The hidden WebTrader window's preload → main */
export interface TraderMsg { type: string; data: unknown; slot: string }

export type InvokeChannel = keyof InvokeMap;
export type InvokeArgs<K extends InvokeChannel> = InvokeMap[K][0];
export type InvokeResult<K extends InvokeChannel> = InvokeMap[K][1];
