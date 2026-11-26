// EA auto-update (main process): when the EA in MT5 is older than the one bundled with the app, copy the new
// PriceTrackerBridge.mq5 into MT5's Experts folder(s) and compile it with MetaEditor's command line. MT5 reloads a
// running EA when its .ex5 changes, so the EA reconnects by itself and its hello shows the new build.
// Nothing here can trade: it only writes the read-only EA source and runs the compiler.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { bundledBuild, helloBuild, shouldUpdate, parseCompileLog } from '../core/ea-version';
import type { LaunchPlan } from './mt5';
import type { Logger } from './logger';
import type { StepsResult } from './types';

export { bundledBuild, helloBuild, shouldUpdate };

export interface CompileLog { text: string; errors: number | null; warnings: number | null }
/** MetaEditor writes <name>.log next to the source (UTF-16): "Result: 0 errors, 1 warnings" */
export function readCompileLog(dir: string): CompileLog {
  for (const enc of ['utf16le', 'utf8'] as const) {
    try {
      const t = fs.readFileSync(path.join(dir, 'PriceTrackerBridge.log'), enc).replace(/^﻿/, '');
      const m = parseCompileLog(t);
      if (m) return { text: t, errors: m.errors, warnings: m.warnings };
      if (enc === 'utf8') return { text: t, errors: null, warnings: null };
    } catch (_) { return { text: '', errors: null, warnings: null }; }
  }
  return { text: '', errors: null, warnings: null };
}

export type Spawn = (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess;
export interface InstallDeps { spawn: Spawn; log?: Logger; timeoutMs?: number }

/** Copy + compile. Returns { ok, steps: [{ok, t}], log? } */
export async function install({ dirs, source, plan, deps }: { dirs: string[]; source: string | Buffer; plan: LaunchPlan | null; deps: InstallDeps }): Promise<StepsResult> {
  const { spawn, log = { info() { /* no log */ }, warn() { /* no log */ } }, timeoutMs = 120000 } = deps;
  const steps: StepsResult['steps'] = [];
  const ok = (t: string): void => { steps.push({ ok: true, t }); log.info('mt5', 'อัปเดต EA: ' + t); };
  const bad = (t: string, data?: unknown): void => { steps.push({ ok: false, t }); log.warn('mt5', 'อัปเดต EA: ' + t, data); };
  const first = dirs[0];
  if (!first) { bad('ไม่พบโฟลเดอร์ MQL5/Experts ของ MT5'); return { ok: false, steps }; }
  for (const d of dirs) {
    try { fs.writeFileSync(path.join(d, 'PriceTrackerBridge.mq5'), source); try { fs.unlinkSync(path.join(d, 'PriceTrackerBridge.log')); } catch (_) { /* no old log */ } ok('คัดลอก EA → ' + d); }
    catch (e) { bad('คัดลอกไม่ได้: ' + (e as Error).message); return { ok: false, steps }; }
  }
  if (!plan || plan.missing || !plan.compile) {
    bad('หา ' + ((plan && plan.missing) || 'MetaEditor') + ' ไม่เจอ — compile เองใน MetaEditor (F7)', plan && { wine: plan.wine, missing: plan.missing });
    return { ok: false, steps, manual: true };
  }
  const compile = plan.compile;
  log.info('mt5', 'อัปเดต EA: compile ด้วย ' + compile.cmd, { args: compile.args, env: plan.env });
  const t0 = Date.now();
  const code = await new Promise<{ code?: number | null; err?: string }>((res) => {
    let p: ChildProcess; try { p = spawn(compile.cmd, compile.args, { env: { ...process.env, ...(plan.env || {}) }, stdio: 'ignore' }); } catch (e) { return res({ err: (e as Error).message }); }
    const t = setTimeout(() => { try { p.kill(); } catch (_) { /* gone */ } res({ err: 'timeout' }); }, timeoutMs);
    p.on('error', (e) => { clearTimeout(t); res({ err: e.message }); });
    p.on('exit', (c) => { clearTimeout(t); res({ code: c }); });
  });
  if (code.err) { bad('เรียก MetaEditor ไม่สำเร็จ: ' + code.err); return { ok: false, steps, manual: true }; }
  const lg = readCompileLog(first);
  let ex5 = false; try { ex5 = fs.statSync(path.join(first, 'PriceTrackerBridge.ex5')).mtimeMs >= t0 - 2000; } catch (_) { /* not built */ }   // freshly built
  if (lg.errors != null && lg.errors > 0) { bad(`compile ไม่ผ่าน (${lg.errors} errors)`, lg.text.slice(-3000)); return { ok: false, steps, log: lg.text.slice(-3000), manual: true }; }
  if (lg.errors === 0 || ex5) {
    ok('compile ผ่าน' + (lg.errors === 0 ? ` (0 errors, ${lg.warnings} warnings)` : ''));
    for (const d of dirs.slice(1)) { try { fs.copyFileSync(path.join(first, 'PriceTrackerBridge.ex5'), path.join(d, 'PriceTrackerBridge.ex5')); } catch (_) { /* best effort */ } }
    return { ok: true, steps };
  }
  bad('ไม่แน่ใจว่า compile ผ่าน (ไม่พบ log/.ex5)', { exit: code.code });
  return { ok: false, steps, manual: true };
}
