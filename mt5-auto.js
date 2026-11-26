// MT5 auto-launch: the app starts MT5 itself (minimized) when MT5 is the price source and the EA isn't
// connected, restarts it if it dies, and closes it on quit — but only the copy the app started.
// Decision logic is pure (tested); spawning is done by the caller-provided functions.

// What to do on each check.  s = { source, enabled, connected, running, launchedByApp, launching,
//   tries: [timestamps], now, sinceStart, eaSeen }
function decide(s) {
  if (s.source !== 'mt5' || !s.enabled) return { act: 'none', why: 'off' };
  if (s.connected || s.launching) return { act: 'none', why: s.connected ? 'connected' : 'launching' };
  if (s.running) return { act: 'none', why: 'running' };                    // the user's own MT5, or still starting
  if (s.sinceStart < 4000) return { act: 'none', why: 'wait' };              // let an already-running EA reconnect first
  const recent = (s.tries || []).filter((t) => s.now - t < 3600e3);
  if (recent.length >= 3) return { act: 'none', why: 'gave-up' };            // crashed 3× in an hour: stop trying
  if (recent.length && s.now - recent[recent.length - 1] < 45e3) return { act: 'none', why: 'cooldown' };
  // first time ever (EA never seen) → open with the startup config that puts the EA on a chart;
  // afterwards MT5 restores its own charts (EA included), so a plain start avoids a second EA.
  return { act: 'launch', withEA: !s.eaSeen };
}

// Turn planLaunch()'s command into a minimized start.
//  win: cmd /c start "" /min terminal64.exe …   ·   macOS (wine): wine start /min C:\…\terminal64.exe …
function minimized(plan, platform, withEA) {
  const args = plan.launch.args.filter((a) => withEA || !/^\/config:/i.test(a));
  if (platform === 'win32') {
    // one verbatim command line: cmd's `start` needs the empty title "" and quoted paths with spaces
    const q = (x) => (/\s/.test(x) ? (x.includes(':') && x.startsWith('/') ? x.replace(/^(\/\w+:)(.*)$/, '$1"$2"') : `"${x}"`) : x);
    return { cmd: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"start "" /min ${[plan.launch.cmd, ...args].map(q).join(' ')}"`], env: plan.env, verbatim: true };
  }
  return { cmd: plan.launch.cmd, args: ['start', '/min', ...args], env: plan.env };
}
// Graceful close of the terminal the app started (WM_CLOSE, no force).
function closeCmd(plan, platform) {
  if (platform === 'win32') return { cmd: 'taskkill', args: ['/IM', 'terminal64.exe'], env: {} };
  return { cmd: plan.launch.cmd, args: ['taskkill', '/IM', 'terminal64.exe'], env: plan.env };
}

module.exports = { decide, minimized, closeCmd };
