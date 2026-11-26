// EA version logic (pure). ea-update.js (main process) does the file copy + compile around it.

/** Subset of the EA hello we need. Hello without `build` = EA older than 1.03. */
export interface HelloInfo { v?: number; build?: number | string | null }

/** `#property version   "1.03"` → 103 (null if missing) */
export function bundledBuild(src: string | Buffer): number | null {
  const m = String(src).match(/#property\s+version\s+"(\d+)\.(\d+)"/);
  return m ? +(m[1] as string) * 100 + +(m[2] as string) : null;
}

/** The running EA's build from its hello. */
export const helloBuild = (info: HelloInfo | null | undefined): number => (info && info.build ? +info.build : info && (info.v ?? 0) >= 2 ? 102 : 101);

export type UpdateDecision =
  | { ok: true; have: number }
  | { ok: false; why: 'disabled' | 'running' | 'no-info' }
  | { ok: false; why: 'current' | 'already-tried'; have: number };

/** Should we update now? `attempted`: { [accountKey]: bundled build already attempted } */
export function shouldUpdate({ info, bundled, enabled = true, attempted = {}, account, running = false }: {
  info: HelloInfo | null | undefined; bundled: number | null; enabled?: boolean; attempted?: Record<string, number>; account?: string; running?: boolean;
}): UpdateDecision {
  if (!enabled || running || !bundled || !info) return { ok: false, why: !enabled ? 'disabled' : running ? 'running' : 'no-info' };
  const have = helloBuild(info);
  if (have >= bundled) return { ok: false, why: 'current', have };
  if (attempted[String(account)] === bundled) return { ok: false, why: 'already-tried', have };
  return { ok: true, have };
}

/** MetaEditor log text → counts ("Result: 0 errors, 1 warnings"); null when the summary line is missing. */
export function parseCompileLog(text: string): { errors: number; warnings: number } | null {
  const m = text.match(/(\d+)\s+errors?,\s*(\d+)\s+warnings?/i);
  return m ? { errors: +(m[1] as string), warnings: +(m[2] as string) } : null;
}
