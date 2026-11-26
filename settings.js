/* global S, store, $, esc, vcg, ICON, ZONES, TZ:writable, zoneOffsetSec, loadChart, runAnalysis, PREF_DEFAULT, SETUP, osKeys, setSource, THEME */
// Toasts, network status, the Settings window, backup / restore / reset.

// ---------------------------------------------------------------- toasts
function toast(msg, kind = 'info', ms = 5000) {
  if (!S.prefs.toast && kind !== 'error') return;
  // one icon per kind (Lucide) instead of emoji in the text
  const t = document.createElement('div'); t.className = 'toast ' + kind;
  t.innerHTML = ICON.html({ ok: 'circle-check', error: 'circle-x', warn: 'triangle-alert' }[kind] || 'info', 16, 'toast-ic') + '<span></span>';
  t.lastChild.textContent = String(msg).replace(/^\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)+/u, '');
  $('toasts').appendChild(t);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => t.remove(), ms);
}
window.addEventListener('offline', () => toast('อินเทอร์เน็ตของเครื่องหลุด', 'error', 8000));
window.addEventListener('online', () => toast('อินเทอร์เน็ตกลับมาแล้ว', 'ok'));

// ---------------------------------------------------------------- network status
const NET_TH = { ok: 'ปกติ', slow: 'เน็ตช้า', stale: 'ราคาค้าง', down: 'หลุด', offline: 'ออฟไลน์' };
let lastNet = null, lastNetLevel = 'ok', bannerDismissed = null;
$('netbanner-x').onclick = () => { bannerDismissed = lastNet && lastNet.level; $('netbanner').classList.add('hidden'); };
vcg.onNet((n) => {
  lastNet = n;
  const el = $('net');
  el.className = n.level;
  $('net-text').textContent = n.rtt != null ? `${n.rtt} ms` : NET_TH[n.level];
  const c = n.cpu || {};
  el.title = `CPU: หน้าจอ ${c.ui ?? '—'}% · WebTrader ${c.webtrader ?? '—'}% · ตัวแอป ${c.app ?? '—'}% · GPU ${c.gpu ?? '—'}%\nสถานะ: ${NET_TH[n.level]}\nPing: ${n.rtt ?? '—'} ms\nราคาหน่วงเพิ่ม (เทียบตอนปกติ): ${n.feedDelay ?? '—'} ms\nราคาล่าสุด: ${n.lastTickAgo != null ? Math.round(n.lastTickAgo) + ' วินาทีที่แล้ว' : '—'}\nหลุดไปแล้ว: ${n.reconnects} ครั้ง`;
  const b = $('netbanner');
  if (n.level === 'ok') { b.classList.add('hidden'); bannerDismissed = null; }
  else if (bannerDismissed !== n.level) { b.className = n.level; $('netbanner-text').textContent = (n.detail || NET_TH[n.level]); b.title = n.detail || ''; }
  if (n.level !== lastNetLevel) {
    if (n.level === 'ok') toast('การเชื่อมต่อกลับมาปกติ', 'ok');
    else if (n.level === 'down' || n.level === 'offline') toast(n.detail || NET_TH[n.level], 'error', 8000); // slow/stale: the titlebar pill is enough
    lastNetLevel = n.level;
  }
  if (!$('modal-settings').classList.contains('hidden')) renderNetNow();
});
function renderNetNow() {
  const n = lastNet; if (!n) return;
  $('st-net-now').innerHTML = `สถานะ: <b>${NET_TH[n.level]}</b>${n.detail ? ' — ' + esc(n.detail) : ''}<br>
    Ping ไป VCG: <b>${n.rtt ?? '—'} ms</b> · ราคาหน่วงเพิ่ม (เทียบตอนปกติ): <b>${n.feedDelay ?? '—'} ms</b><br>
    ราคาล่าสุดเมื่อ: <b>${n.lastTickAgo != null ? Math.round(n.lastTickAgo) + ' วินาทีที่แล้ว' : '—'}</b> · หลุดไปแล้ว <b>${n.reconnects}</b> ครั้ง<br>
    CPU: หน้าจอ <b>${n.cpu?.ui ?? '—'}%</b> · WebTrader (ซ่อน) <b>${n.cpu?.webtrader ?? '—'}%</b> · ตัวแอป <b>${n.cpu?.app ?? '—'}%</b> · GPU <b>${n.cpu?.gpu ?? '—'}%</b>`;
}

// ---------------------------------------------------------------- settings window
$('settings-btn').innerHTML = ICON.svg('gear', 18);
let mainCfg = null;
const v = (id) => $(id).value, chk = (id) => $(id).checked;
async function openSettings(section) {
  mainCfg = await vcg.getSettings();
  const P = S.prefs;
  $('st-tz').innerHTML = ZONES.map(([z, n]) => `<option value="${z}">${n}</option>`).join(''); $('st-tz').value = store.get('tz', 'local');
  $('st-autoupd').checked = store.get('autoUpdateCheck', true);
  $('st-bars').value = P.historyBars; $('st-login').checked = !!mainCfg.openAtLogin;
  const n = mainCfg.net;
  if ($('st-mt5-port')) { $('st-mt5-port').value = (mainCfg.mt5 && mainCfg.mt5.port) || 7788; $('st-save-ea').disabled = !vcg.saveEA; renderMt5Info(); }
  $('st-slow').value = n.slowMs; $('st-delay').value = n.delayMs; $('st-stale').value = n.staleSec; $('st-stuck').value = n.stuckSec; $('st-netnotify').checked = n.notify;
  $('st-sound').checked = P.sound; $('st-desktop').checked = P.desktop; $('st-toast').checked = P.toast;
  $('st-signotify').checked = S.an.notify; $('st-learnonly').checked = S.an.learnOnly;
  $('st-swing').value = S.an.swingLen; $('st-rr1').value = P.rr1; $('st-rr2').value = P.rr2; $('st-slbuf').value = P.slBuf; $('st-minsamp').value = P.minSamples; $('st-maxbars').value = P.maxBars;
  const a = mainCfg.api, w = mainCfg.webhook, t = mainCfg.telegram;
  $('st-api-on').checked = a.enabled; $('st-api-port').value = a.port; $('st-api-token').value = a.token; $('st-api-lan').checked = a.lan;
  $('st-api-url').innerHTML = `เปิดในเบราว์เซอร์: <b>http://127.0.0.1:${a.port}</b> (มีหน้า dashboard + รายการ endpoint)`;
  $('st-wh-url').value = w.url; $('st-wh-sig').checked = w.onSignal; $('st-wh-alert').checked = w.onAlert;
  $('st-tg-token').value = t.botToken; $('st-tg-chat').value = t.chatId; $('st-tg-sig').checked = t.onSignal; $('st-tg-alert').checked = t.onAlert;
  $('st-csv').checked = $('csv').checked;
  $('st-ver').textContent = `Price Tracker v${mainCfg.version} · ข้อมูลแอป: ${mainCfg.userData}`;
  if ($('st-about-ver')) $('st-about-ver').textContent = `เวอร์ชัน ${mainCfg.version || window.APP_VERSION || ''}`;
  $('st-msg').textContent = ''; $('st-reset-msg').textContent = ''; resetArmed = false; $('st-reset').textContent = 'ล้างข้อมูลในแอปทั้งหมด';
  sessDraft = JSON.parse(JSON.stringify(SESSIONS_ALL)); renderSessRows();
  renderNetNow();
  showSection(section || 'general');
  $('modal-settings').classList.remove('hidden');
}
function showSection(k) {
  document.querySelectorAll('.st-nav button').forEach((b) => b.classList.toggle('active', b.dataset.st === k));
  document.querySelectorAll('.st-body section').forEach((s) => s.classList.toggle('hidden', s.dataset.sec !== k));
  if (k === 'source') renderMt5Info();
}
document.querySelectorAll('.st-nav button').forEach((b) => (b.onclick = () => showSection(b.dataset.st)));
$('settings-btn').onclick = () => openSettings();
$('open-settings').onclick = () => openSettings();
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); openSettings(); } });

const clampNum = (x, lo, hi, d) => { x = parseFloat(x); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
async function saveSettingsUI() {
  const P = S.prefs;
  const before = JSON.stringify([P, S.an]);
  Object.assign(P, {
    historyBars: clampNum(v('st-bars'), 200, 5000, 1500), sound: chk('st-sound'), desktop: chk('st-desktop'), toast: chk('st-toast'),
    rr1: clampNum(v('st-rr1'), 0.25, 20, 1), rr2: clampNum(v('st-rr2'), 0.25, 20, 2), slBuf: clampNum(v('st-slbuf'), 0, 5, 0.2),
    minSamples: clampNum(v('st-minsamp'), 1, 100, 5), maxBars: clampNum(v('st-maxbars'), 5, 2000, 100),
  });
  S.an.notify = chk('st-signotify'); S.an.learnOnly = chk('st-learnonly'); S.an.swingLen = clampNum(v('st-swing'), 2, 30, 5);
  store.set('prefs', P); store.set('an', S.an); store.set('autoUpdateCheck', chk('st-autoupd'));
  setSessions(sessDraft.filter((x) => x.name && /^\d{1,2}:\d{2}$/.test(x.open) && /^\d{1,2}:\d{2}$/.test(x.close)).map((x) => ({ ...x })));
  await vcg.setSettings({
    api: { enabled: chk('st-api-on'), port: +v('st-api-port') || 8787, token: v('st-api-token').trim(), lan: chk('st-api-lan') },
    webhook: { url: v('st-wh-url').trim(), onSignal: chk('st-wh-sig'), onAlert: chk('st-wh-alert') },
    telegram: { botToken: v('st-tg-token').trim(), chatId: v('st-tg-chat').trim(), onSignal: chk('st-tg-sig'), onAlert: chk('st-tg-alert') },
    net: { slowMs: clampNum(v('st-slow'), 100, 10000, 800), delayMs: clampNum(v('st-delay'), 500, 60000, 3000), staleSec: clampNum(v('st-stale'), 10, 3600, 45),
      stuckSec: clampNum(v('st-stuck'), 20, 3600, 60), notify: chk('st-netnotify') },
    openAtLogin: chk('st-login'),
    mt5: { port: clampNum(v('st-mt5-port'), 1024, 65535, 7788) },
  });
  if (chk('st-csv') !== $('csv').checked) vcg.toggleCsv();
  const tz = v('st-tz');
  if (tz !== store.get('tz', 'local')) { store.set('tz', tz); $('tz-sel').value = tz; TZ = zoneOffsetSec(tz); loadChart(); }
  else if (before !== JSON.stringify([P, S.an])) runAnalysis();
  vcg.log('info', 'บันทึกการตั้งค่า', null, 'settings');
  $('st-msg').textContent = 'บันทึกแล้ว ✓';
}
$('st-save').onclick = saveSettingsUI;
// Claude (MCP)
async function renderClaude() {
  const box = $('st-claude-state'); if (!box) return;
  if (!vcg.claudeStatus) { box.textContent = 'ใช้ได้เฉพาะแอป Mac'; $('st-claude-desktop').disabled = $('st-claude-code').disabled = true; return; }
  const st = await vcg.claudeStatus();
  box.innerHTML = `การเข้าถึงของ Claude: ${st.claude ? '<span class="up">เปิด</span>' : 'ปิด'} · ช่องเชื่อมต่อในเครื่อง: ${st.listening ? '<span class="up">พร้อม (127.0.0.1:' + st.port + ')</span>' : '<span class="down">ไม่ทำงาน</span>'} · Claude Desktop: ${st.desktop ? '<span class="up">เพิ่มแล้ว</span>' : 'ยังไม่ได้เพิ่ม'}`
    + (st.claude ? ' · <a href="#" id="st-claude-off">ปิดการเข้าถึง</a>' : '');
  const off = $('st-claude-off'); if (off) off.onclick = async (e) => { e.preventDefault(); await vcg.claudeDisable(); renderClaude(); };
  if (!st.mac) $('st-claude-desktop').disabled = true;
}
if ($('st-claude-desktop')) {
  $('st-claude-desktop').onclick = async () => {
    const r = await vcg.claudeSetup({ desktop: true });
    const out = $('st-claude-out'); out.classList.remove('hidden');
    out.textContent = r.ok ? `เพิ่มแล้วใน ${r.desktopConfig}\n(สำรองไฟล์เดิมไว้ข้างกัน)\n\nปิดแล้วเปิด Claude Desktop ใหม่ จะเห็นเครื่องมือ "price-tracker"` : 'ไม่สำเร็จ: ' + r.error;
    toast(r.ok ? 'เพิ่ม Price Tracker ใน Claude Desktop แล้ว — เปิด Claude ใหม่' : 'เพิ่มไม่สำเร็จ', r.ok ? 'ok' : 'error', 6000);
    renderClaude();
  };
  $('st-claude-code').onclick = async () => {
    const r = await vcg.claudeSetup({});
    const out = $('st-claude-out'); out.classList.remove('hidden');
    out.textContent = 'วางคำสั่งนี้ใน Terminal (ครั้งเดียว):\n\n' + r.codeCmd;
    try { await navigator.clipboard.writeText(r.codeCmd); toast('คัดลอกคำสั่งแล้ว', 'ok'); } catch (_) {}
    renderClaude();
  };
  document.querySelector('.st-nav [data-st="claude"]').addEventListener('click', renderClaude);
}
$('st-gen').onclick = () => { $('st-api-token').value = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); };
$('st-test').onclick = async () => {
  await saveSettingsUI();
  $('st-msg').textContent = 'กำลังส่ง…';
  const n = await vcg.notify('signal', { test: true, symbol: S.symbol }, `🧪 ทดสอบจาก Price Tracker (${S.symbol})`);
  $('st-msg').textContent = n ? `ส่งแล้ว ${n} ช่องทาง — ดูผลในแท็บ Log` : 'ยังไม่ได้ตั้ง webhook/Telegram';
};
$('st-reconnect').onclick = () => { vcg.reloadTrader(); toast('กำลังเชื่อมต่อใหม่…'); setTimeout(loadChart, 8000); };
$('st-trader').onclick = () => vcg.showTrader();
let signOutArmed = false;
$('st-signout').onclick = async () => {
  if (!signOutArmed) { signOutArmed = true; $('st-signout').textContent = 'กดอีกครั้งเพื่อยืนยันออกจากระบบ'; setTimeout(() => { signOutArmed = false; $('st-signout').textContent = 'ออกจากระบบ VCG'; }, 4000); return; }
  await vcg.signOut(); $('modal-settings').classList.add('hidden'); toast('ออกจากระบบแล้ว — login ใหม่ในหน้าต่าง WebTrader', 'warn');
};
$('st-checkupd').onclick = () => UPDATE.check(true);
$('st-open-csv').onclick = () => vcg.openCsv();
$('st-open-log').onclick = () => vcg.openLogFolder();

// ---------------------------------------------------------------- MT5 status
let lastStatus = null;
vcg.onStatus((st) => { lastStatus = st; if (!$('modal-settings').classList.contains('hidden')) renderMt5Info(); });
function renderMt5Info() {
  const box = $('st-mt5-info'); if (!box) return;
  const st = lastStatus || {}, m = st.mt5 || {}, pill = (id, cls, t) => { const e = $(id); if (e) { e.className = 'src-pill ' + cls; e.textContent = t; } };
  ['vcg', 'mt5', 'demo'].forEach((k) => $('st-src-' + k) && $('st-src-' + k).classList.toggle('on', S.source === k));
  ['vcg', 'mt5', 'demo'].forEach((k) => { const b = $('st-use-' + k); if (b) { b.disabled = S.source === k; b.textContent = S.source === k ? '✓ ใช้อยู่' : 'ใช้ ' + { vcg: 'VCG', mt5: 'MT5', demo: 'Demo' }[k]; b.classList.toggle('primary', S.source !== k && k !== 'demo'); } });
  if (!vcg.capabilities?.vcg) { pill('st-vcg-pill', '', 'ใช้ไม่ได้ในเบราว์เซอร์'); $('st-use-vcg') && ($('st-use-vcg').disabled = true); }
  else pill('st-vcg-pill', st.connected && S.source === 'vcg' ? 'ok' : st.loggedIn ? 'wait' : 'bad', st.connected && S.source === 'vcg' ? 'เชื่อมต่อแล้ว' : st.loggedIn ? 'login แล้ว' : 'ยังไม่ได้ login');
  if (!vcg.capabilities?.mt5) { box.textContent = 'ใช้ได้เฉพาะแอปบนคอม (Mac / Windows)'; pill('st-mt5-pill', '', 'เฉพาะบนคอม'); $('st-use-mt5') && ($('st-use-mt5').disabled = true); return; }
  pill('st-mt5-pill', m.connected ? 'ok' : S.source === 'mt5' ? 'wait' : '', m.connected ? 'EA เชื่อมต่อแล้ว' : S.source === 'mt5' ? 'รอ EA' : 'ไม่ได้ใช้');
  box.innerHTML = m.connected ? `${ICON.html('circle-check', 15, 'up')}<b>${esc(m.broker || '')}</b> (${esc(m.server || '')}) · ${(m.symbols || []).length} symbol ใน Market Watch${(m.unknown || []).length ? `<br>${ICON.html('triangle-alert', 15, 'warn')}ไม่พบใน MT5: ${esc(m.unknown.join(', '))}` : ''}`
    : S.source === 'mt5' ? `${ICON.html('hourglass', 15)}รอ EA เชื่อมต่อที่ 127.0.0.1:${m.port || 7788} — เปิด MT5 แล้วติด EA บนกราฟ` : 'ยังไม่ได้เลือก MT5 เป็นแหล่งราคา';
}
['vcg', 'mt5', 'demo'].forEach((k) => { const b = $('st-use-' + k); if (b) b.onclick = () => { setSource(k); renderMt5Info(); if (k === 'mt5' && !(lastStatus && lastStatus.mt5 && lastStatus.mt5.connected)) { $('modal-settings').classList.add('hidden'); SETUP.open('mt5', 0); } }; });
if ($('st-open-guide')) $('st-open-guide').onclick = () => { $('modal-settings').classList.add('hidden'); SETUP.open(); };
if ($('st-install-ea')) {
  if ($('st-mt5-guide')) $('st-mt5-guide').onclick = () => { $('modal-settings').classList.add('hidden'); SETUP.open('mt5', 0); };
  if (!vcg.mt5InstallEA) { $('st-install-ea').disabled = $('st-copy-ea').disabled = true; }
  $('st-install-ea').onclick = async () => {
    const r = await vcg.mt5InstallEA(), out = $('st-ea-out'); out.classList.remove('hidden');
    out.textContent = r.installed.length
      ? `ติดตั้งแล้ว ${r.installed.length} ที่:\n${r.installed.join('\n')}\n\nต่อไปใน MT5: Navigator → คลิกขวา Expert Advisors → Refresh → ดับเบิลคลิก PriceTrackerBridge เพื่อเปิดใน MetaEditor แล้วกด Compile (F7) → Tools → Options → Expert Advisors เพิ่ม 127.0.0.1 → ลาก EA ไปวางบนกราฟ`
      : 'ไม่พบโฟลเดอร์ MT5 ในเครื่องนี้ (ต้องเปิด MT5 อย่างน้อย 1 ครั้งก่อน) — ใช้ปุ่ม "คัดลอกโค้ด EA" แล้วไปที่ MetaEditor → New → Expert Advisor ตั้งชื่อ PriceTrackerBridge ลบโค้ดเดิมแล้ววาง กด Compile';
    if (r.failed.length) out.textContent += '\n\nเขียนไม่ได้: ' + r.failed.join('\n');
    toast(r.installed.length ? 'ติดตั้ง EA ลง MT5 แล้ว' : 'ไม่พบ MT5 ในเครื่อง', r.installed.length ? 'ok' : 'warn', 6000);
  };
  $('st-copy-ea').onclick = async () => {
    const code = await vcg.mt5EASource();
    try { await navigator.clipboard.writeText(code); toast('คัดลอกโค้ด EA แล้ว — ไปวางใน MetaEditor', 'ok', 5000); } catch (e) { toast('คัดลอกไม่ได้: ' + e.message, 'error'); }
    const out = $('st-ea-out'); out.classList.remove('hidden');
    out.textContent = osKeys('คัดลอกแล้ว: MetaEditor → File → New → Expert Advisor (template) → ชื่อ PriceTrackerBridge → Finish → กด ⌘A ลบโค้ดเดิม → ⌘V วาง → Compile (F7)');
  };
}
if ($('st-save-ea')) $('st-save-ea').onclick = async () => { const f = vcg.saveEA && (await vcg.saveEA()); if (f) toast('บันทึก EA แล้ว: ' + f, 'ok'); };

// ---------------------------------------------------------------- sessions editor
const SESS_ZONES = [['Australia/Sydney', 'Sydney'], ['Asia/Tokyo', 'Tokyo'], ['Asia/Hong_Kong', 'Hong Kong'], ['Asia/Singapore', 'Singapore'], ['Asia/Bangkok', 'Bangkok (เวลาไทยตายตัว)'],
  ['Europe/Frankfurt', 'Frankfurt'], ['Europe/London', 'London'], ['America/New_York', 'New York'], ['America/Chicago', 'Chicago'], ['UTC', 'UTC']];
const SESS_PRESETS = {
  fx: DEFAULT_SESSIONS,
  fx7: DEFAULT_SESSIONS.map((x) => (x.name === 'London' ? { ...x, open: '07:00', close: '16:00' } : x)),
  stock: [
    { name: 'Tokyo', zone: 'Asia/Tokyo', open: '09:00', close: '15:00', color: '#ef5350', on: true },
    { name: 'London', zone: 'Europe/London', open: '08:00', close: '16:30', color: '#2962ff', on: true },
    { name: 'New York', zone: 'America/New_York', open: '09:30', close: '16:00', color: '#ff9800', on: true },
  ],
  ict: [
    { name: 'Asia KZ', zone: 'America/New_York', open: '20:00', close: '00:00', color: '#ab47bc', on: true },
    { name: 'London KZ', zone: 'America/New_York', open: '02:00', close: '05:00', color: '#2962ff', on: true },
    { name: 'NY AM KZ', zone: 'America/New_York', open: '07:00', close: '10:00', color: '#ff9800', on: true },
    { name: 'NY PM KZ', zone: 'America/New_York', open: '13:30', close: '16:00', color: '#26a69a', on: true },
  ],
};
let sessDraft = [];
function bkkHM(sec) { const d = new Date((sec + 7 * 3600) * 1000); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); }
function sessPreview(x) {
  const n = new Date();
  try { const [a, b] = _sessionWindow(x, n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); return `${bkkHM(a)}–${bkkHM(b)}`; } catch (_) { return '—'; }
}
function renderSessRows() {
  $('sess-rows').innerHTML = sessDraft.map((x, i) => `<tr data-i="${i}">
    <td><input type="checkbox" data-f="on" ${x.on ? 'checked' : ''}></td>
    <td><input type="text" data-f="name" value="${esc(x.name)}"></td>
    <td><input type="color" data-f="color" value="${x.color}"></td>
    <td><input type="text" class="hm" data-f="open" value="${x.open}" placeholder="HH:MM" maxlength="5"></td>
    <td><input type="text" class="hm" data-f="close" value="${x.close}" placeholder="HH:MM" maxlength="5"></td>
    <td><select data-f="zone">${SESS_ZONES.map(([z, n]) => `<option value="${z}" ${z === x.zone ? 'selected' : ''}>${n}</option>`).join('')}</select></td>
    <td class="pv">${sessPreview(x)}</td>
    <td><button data-del="${i}" title="ลบ" aria-label="ลบ">${ICON.svg('x', 14)}</button></td></tr>`).join('');
  $('sess-rows').querySelectorAll('[data-f]').forEach((inp) => (inp.oninput = inp.onchange = () => {
    const i = +inp.closest('tr').dataset.i, f = inp.dataset.f;
    sessDraft[i][f] = f === 'on' ? inp.checked : inp.value;
    if (inp.classList.contains('hm')) inp.style.borderColor = /^([01]?\d|2[0-4]):[0-5]\d$/.test(inp.value) ? '' : '#ef5350';
    inp.closest('tr').querySelector('.pv').textContent = sessPreview(sessDraft[i]);
  }));
  $('sess-rows').querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { sessDraft.splice(+b.dataset.del, 1); renderSessRows(); }));
}
$('sess-add').onclick = () => { sessDraft.push({ name: 'Session', zone: 'Asia/Bangkok', open: '09:00', close: '12:00', color: '#00bcd4', on: true }); renderSessRows(); };
$('sess-preset').onchange = () => { const p = SESS_PRESETS[$('sess-preset').value]; if (p) { sessDraft = JSON.parse(JSON.stringify(p)); renderSessRows(); } $('sess-preset').value = ''; };

// ---------------------------------------------------------------- backup / restore / reset
const SCHEMA = 3;
if (store.get('schema', null) == null) store.set('schema', SCHEMA);
$('st-backup').onclick = async () => {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); data[k] = localStorage.getItem(k); }
  const cfg = await vcg.getSettings();
  const backup = { app: 'Price Tracker', schema: SCHEMA, created: new Date().toISOString(), local: data, main: { api: cfg.api, webhook: cfg.webhook, telegram: cfg.telegram, net: cfg.net, openAtLogin: cfg.openAtLogin } };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  a.download = `price-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  vcg.log('info', 'สำรองข้อมูลแล้ว', null, 'data');
};
$('st-restore').onclick = () => $('st-file').click();
$('st-file').onchange = async () => {
  const f = $('st-file').files[0]; if (!f) return;
  try {
    const b = JSON.parse(await f.text());
    if (b.app !== 'Price Tracker' || !b.local) throw new Error('ไม่ใช่ไฟล์สำรองของ Price Tracker');
    localStorage.clear();
    for (const [k, val] of Object.entries(b.local)) localStorage.setItem(k, val);
    if (b.main) await vcg.setSettings(b.main);
    vcg.log('info', `กู้คืนข้อมูลจาก ${f.name}`, null, 'data');
    location.reload();
  } catch (e) { $('st-reset-msg').textContent = 'ผิดพลาด: ' + e.message; vcg.log('error', 'กู้คืนไม่สำเร็จ: ' + e.message, null, 'data'); }
};
let resetArmed = false;
$('st-reset').onclick = () => {
  if (!resetArmed) { resetArmed = true; $('st-reset').textContent = 'กดอีกครั้งเพื่อยืนยัน (ลบรูปวาด/indicator/สคริปต์/alert)'; $('st-reset-msg').textContent = 'แนะนำให้สำรองก่อน'; return; }
  localStorage.clear(); vcg.log('warn', 'ผู้ใช้ล้างข้อมูลในแอป', null, 'data'); location.reload();
};

// ---------------------------------------------------------------- theme (settings picker + titlebar toggle)
function syncThemeUI() {
  const pref = THEME.pref();
  document.querySelectorAll('#st-theme [data-theme-v]').forEach((b) => { const on = b.dataset.themeV === pref; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const tb = $('theme-btn');
  if (tb) { const t = THEME.get();
    tb.innerHTML = t === 'light' ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'
      : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>';
    tb.title = `ธีม: ${THEME.NAMES[t]} — กดเพื่อเปลี่ยน (มืด → สว่าง → คอนทราสต์สูง)`; }
}
document.querySelectorAll('#st-theme [data-theme-v]').forEach((b) => (b.onclick = () => THEME.set(b.dataset.themeV)));
if ($('theme-btn')) $('theme-btn').onclick = () => { THEME.next(); toast('ธีม: ' + THEME.NAMES[THEME.get()], 'info', 1800); };
THEME.onChange(syncThemeUI);
syncThemeUI();
