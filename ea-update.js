// EA auto-update (main process): when the EA in MT5 is older than the one bundled with the app, copy the new
// PriceTrackerBridge.mq5 into MT5's Experts folder(s) and compile it with MetaEditor's command line. MT5 reloads a
// running EA when its .ex5 changes, so the EA reconnects by itself and its hello shows the new build.
// Nothing here can trade: it only writes the read-only EA source and runs the compiler.
const fs = require('fs'), path = require('path');

// "#property version   "1.03"" → 103
function bundledBuild(src) {
  const m = String(src).match(/#property\s+version\s+"(\d+)\.(\d+)"/);
  return m ? +m[1] * 100 + +m[2] : null;
}
// hello without "build" = EA older than 1.03
const helloBuild = (info) => (info && info.build ? +info.build : info && info.v >= 2 ? 102 : 101);

// Should we update now?  state: { [accountKey]: bundled build already attempted }
function shouldUpdate({ info, bundled, enabled = true, attempted = {}, account, running = false }) {
  if (!enabled || running || !bundled || !info) return { ok: false, why: !enabled ? 'disabled' : running ? 'running' : 'no-info' };
  const have = helloBuild(info);
  if (have >= bundled) return { ok: false, why: 'current', have };
  if (attempted[account] === bundled) return { ok: false, why: 'already-tried', have };
  return { ok: true, have };
}

// MetaEditor writes <name>.log next to the source (UTF-16): "Result: 0 errors, 1 warnings"
function readCompileLog(dir) {
  for (const enc of ['utf16le', 'utf8']) {
    try {
      const t = fs.readFileSync(path.join(dir, 'PriceTrackerBridge.log'), enc).replace(/^﻿/, '');
      const m = t.match(/(\d+)\s+errors?,\s*(\d+)\s+warnings?/i);
      if (m) return { text: t, errors: +m[1], warnings: +m[2] };
      if (enc === 'utf8') return { text: t, errors: null, warnings: null };
    } catch (_) { return { text: '', errors: null, warnings: null }; }
  }
  return { text: '', errors: null, warnings: null };
}

// Copy + compile. deps: { spawn, log, timeoutMs }. Returns { ok, steps: [{ok, t}], log? }
async function install({ dirs, source, plan, deps }) {
  const { spawn, log = { info() {}, warn() {} }, timeoutMs = 120000 } = deps;
  const steps = [], ok = (t) => { steps.push({ ok: true, t }); log.info('mt5', 'อัปเดต EA: ' + t); }, bad = (t, data) => { steps.push({ ok: false, t }); log.warn('mt5', 'อัปเดต EA: ' + t, data); };
  if (!dirs.length) { bad('ไม่พบโฟลเดอร์ MQL5/Experts ของ MT5'); return { ok: false, steps }; }
  for (const d of dirs) {
    try { fs.writeFileSync(path.join(d, 'PriceTrackerBridge.mq5'), source); try { fs.unlinkSync(path.join(d, 'PriceTrackerBridge.log')); } catch (_) {} ok('คัดลอก EA → ' + d); }
    catch (e) { bad('คัดลอกไม่ได้: ' + e.message); return { ok: false, steps }; }
  }
  if (!plan || plan.missing || !plan.compile) {
    bad('หา ' + ((plan && plan.missing) || 'MetaEditor') + ' ไม่เจอ — compile เองใน MetaEditor (F7)', plan && { wine: plan.wine, missing: plan.missing });
    return { ok: false, steps, manual: true };
  }
  log.info('mt5', 'อัปเดต EA: compile ด้วย ' + plan.compile.cmd, { args: plan.compile.args, env: plan.env });
  const t0 = Date.now();
  const code = await new Promise((res) => {
    let p; try { p = spawn(plan.compile.cmd, plan.compile.args, { env: { ...process.env, ...(plan.env || {}) }, stdio: 'ignore' }); } catch (e) { return res({ err: e.message }); }
    const t = setTimeout(() => { try { p.kill(); } catch (_) {} res({ err: 'timeout' }); }, timeoutMs);
    p.on('error', (e) => { clearTimeout(t); res({ err: e.message }); });
    p.on('exit', (c) => { clearTimeout(t); res({ code: c }); });
  });
  if (code.err) { bad('เรียก MetaEditor ไม่สำเร็จ: ' + code.err); return { ok: false, steps, manual: true }; }
  const lg = readCompileLog(dirs[0]);
  let ex5 = false; try { ex5 = fs.statSync(path.join(dirs[0], 'PriceTrackerBridge.ex5')).mtimeMs >= t0 - 2000; } catch (_) {}   // freshly built
  if (lg.errors > 0) { bad(`compile ไม่ผ่าน (${lg.errors} errors)`, lg.text.slice(-3000)); return { ok: false, steps, log: lg.text.slice(-3000), manual: true }; }
  if (lg.errors === 0 || ex5) { ok('compile ผ่าน' + (lg.errors === 0 ? ` (0 errors, ${lg.warnings} warnings)` : '')); for (const d of dirs.slice(1)) { try { fs.copyFileSync(path.join(dirs[0], 'PriceTrackerBridge.ex5'), path.join(d, 'PriceTrackerBridge.ex5')); } catch (_) {} } return { ok: true, steps }; }
  bad('ไม่แน่ใจว่า compile ผ่าน (ไม่พบ log/.ex5)', { exit: code.code });
  return { ok: false, steps, manual: true };
}

module.exports = { bundledBuild, helloBuild, shouldUpdate, install, readCompileLog };
