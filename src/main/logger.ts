// Simple logger: ring buffer in memory + rotating file in <userData>/logs/app.log
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LogEntry, LogLevel } from './types';

const MAX_MEM = 3000;
const MAX_FILE = 5 * 1024 * 1024;
const buf: LogEntry[] = [];
const listeners = new Set<(e: LogEntry) => void>();
let file: string | null = null;

export function init(dir: string): void {
  try { fs.mkdirSync(dir, { recursive: true }); file = path.join(dir, 'app.log'); } catch (_) { /* no log file */ }
}

export function write(level: LogLevel, source: string, msg: unknown, data?: unknown): LogEntry {
  const e: LogEntry = { t: new Date().toISOString(), level, source, msg: String(msg) };
  if (data !== undefined) {
    try { e.data = typeof data === 'string' ? data : JSON.stringify(data).slice(0, 2000); } catch (_) { e.data = String(data); }
  }
  buf.push(e); if (buf.length > MAX_MEM) buf.splice(0, buf.length - MAX_MEM);
  if (file) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > MAX_FILE) fs.renameSync(file, file + '.1');
      fs.appendFileSync(file, `${e.t} [${level.toUpperCase()}] ${source}: ${e.msg}${e.data ? ' ' + e.data : ''}\n`);
    } catch (_) { /* disk full / read-only: keep the in-memory log */ }
  }
  listeners.forEach((fn) => { try { fn(e); } catch (_) { /* listener errors never break logging */ } });
  return e;
}

export const fileOf = (): string | null => file;
export const info = (src: string, msg: unknown, data?: unknown): LogEntry => write('info', src, msg, data);
export const warn = (src: string, msg: unknown, data?: unknown): LogEntry => write('warn', src, msg, data);
export const error = (src: string, msg: unknown, data?: unknown): LogEntry => write('error', src, msg, data);
export const debug = (src: string, msg: unknown, data?: unknown): LogEntry => write('debug', src, msg, data);
export const recent = (n = 500, level?: LogLevel): LogEntry[] => (level ? buf.filter((e) => e.level === level) : buf).slice(-n);
export const onLog = (fn: (e: LogEntry) => void): (() => boolean) => { listeners.add(fn); return () => listeners.delete(fn); };

/** The shape the other main modules take as a dependency (tests pass a stub). */
export interface Logger {
  info(src: string, msg: unknown, data?: unknown): unknown;
  warn(src: string, msg: unknown, data?: unknown): unknown;
  error?(src: string, msg: unknown, data?: unknown): unknown;
}

const log = { init, file: fileOf, info, warn, error, debug, write, recent, onLog };
export default log;
