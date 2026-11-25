/* global S, store, $, esc, vcg, ICON, ZONES, TZ:writable, zoneOffsetSec, loadChart, runAnalysis, PREF_DEFAULT */
// Toasts, network status, the Settings window, backup / restore / reset.

// ---------------------------------------------------------------- toasts
function toast(msg, kind = 'info', ms = 5000) {
  if (!S.prefs.toast && kind !== 'error') return;
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('toasts').appendChild(t);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => t.remove(), ms);
}
window.addEventListener('offline', () => toast('อินเทอร์เน็ตของเครื่องหลุด', 'error', 8000));
window.addEventListener('online', () => toast('อินเทอร์เน็ตกลับมาแล้ว', 'ok'));

// ---------------------------------------------------------------- network status
const NET_TH = { ok: 'ปกติ', slow: 'เน็ตช้า', stale: 'ราคาค้าง', down: 'หลุด', offline: 'ออฟไลน์' };
let lastNet = null, lastNetLevel = 'ok';
vcg.onNet((n) => {
  lastNet = n;
  const el = $('net');
  el.className = n.level;
  $('net-text').textContent = n.rtt != null ? `${n.rtt} ms` : NET_TH[n.level];
  el.title = `สถานะ: ${NET_TH[n.level]}\nPing: ${n.rtt ?? '—'} ms\nราคาหน่วง (median): ${n.feedDelay ?? '—'} ms\nราคาล่าสุด: ${n.lastTickAgo != null ? Math.round(n.lastTickAgo) + ' วินาทีที่แล้ว' : '—'}\nหลุดไปแล้ว: ${n.reconnects} ครั้ง`;
  const b = $('netbanner');
  if (n.level === 'ok') b.classList.add('hidden');
  else { b.className = n.level; b.textContent = '⚠️ ' + (n.detail || NET_TH[n.level]); }
  if (n.level !== lastNetLevel) {
    if (n.level === 'ok') toast('การเชื่อมต่อกลับมาปกติ', 'ok');
    else toast(n.detail || NET_TH[n.level], n.level === 'slow' || n.level === 'stale' ? 'warn' : 'error', 8000);
    lastNetLevel = n.level;
  }
  if (!$('modal-settings').classList.contains('hidden')) renderNetNow();
});
function renderNetNow() {
  const n = lastNet; if (!n) return;
  $('st-net-now').innerHTML = `สถานะ: <b>${NET_TH[n.level]}</b>${n.detail ? ' — ' + esc(n.detail) : ''}<br>
    Ping ไป VCG: <b>${n.rtt ?? '—'} ms</b> · ราคาหน่วง (median): <b>${n.feedDelay ?? '—'} ms</b><br>
    ราคาล่าสุดเมื่อ: <b>${n.lastTickAgo != null ? Math.round(n.lastTickAgo) + ' วินาทีที่แล้ว' : '—'}</b> · หลุดไปแล้ว <b>${n.reconnects}</b> ครั้ง`;
}

// ---------------------------------------------------------------- settings window
$('settings-btn').innerHTML = ICON.svg('gear', 18);
let mainCfg = null;
const v = (id) => $(id).value, chk = (id) => $(id).checked;
async function openSettings(section) {
  mainCfg = await vcg.getSettings();
  const P = S.prefs;
  $('st-tz').innerHTML = ZONES.map(([z, n]) => `<option value="${z}">${n}</option>`).join(''); $('st-tz').value = store.get('tz', 'local');
  $('st-bars').value = P.historyBars; $('st-login').checked = !!mainCfg.openAtLogin;
  const n = mainCfg.net;
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
  $('st-msg').textContent = ''; $('st-reset-msg').textContent = ''; resetArmed = false; $('st-reset').textContent = 'ล้างข้อมูลในแอปทั้งหมด';
  renderNetNow();
  showSection(section || 'general');
  $('modal-settings').classList.remove('hidden');
}
function showSection(k) {
  document.querySelectorAll('.st-nav button').forEach((b) => b.classList.toggle('active', b.dataset.st === k));
  document.querySelectorAll('.st-body section').forEach((s) => s.classList.toggle('hidden', s.dataset.sec !== k));
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
  store.set('prefs', P); store.set('an', S.an);
  await vcg.setSettings({
    api: { enabled: chk('st-api-on'), port: +v('st-api-port') || 8787, token: v('st-api-token').trim(), lan: chk('st-api-lan') },
    webhook: { url: v('st-wh-url').trim(), onSignal: chk('st-wh-sig'), onAlert: chk('st-wh-alert') },
    telegram: { botToken: v('st-tg-token').trim(), chatId: v('st-tg-chat').trim(), onSignal: chk('st-tg-sig'), onAlert: chk('st-tg-alert') },
    net: { slowMs: clampNum(v('st-slow'), 100, 10000, 800), delayMs: clampNum(v('st-delay'), 500, 60000, 3000), staleSec: clampNum(v('st-stale'), 10, 3600, 45),
      stuckSec: clampNum(v('st-stuck'), 20, 3600, 60), notify: chk('st-netnotify') },
    openAtLogin: chk('st-login'),
  });
  if (chk('st-csv') !== $('csv').checked) vcg.toggleCsv();
  const tz = v('st-tz');
  if (tz !== store.get('tz', 'local')) { store.set('tz', tz); $('tz-sel').value = tz; TZ = zoneOffsetSec(tz); loadChart(); }
  else if (before !== JSON.stringify([P, S.an])) runAnalysis();
  vcg.log('info', 'บันทึกการตั้งค่า', null, 'settings');
  $('st-msg').textContent = 'บันทึกแล้ว ✓';
}
$('st-save').onclick = saveSettingsUI;
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
$('st-open-csv').onclick = () => vcg.openCsv();
$('st-open-log').onclick = () => vcg.openLogFolder();

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
  } catch (e) { $('st-reset-msg').textContent = '❌ ' + e.message; vcg.log('error', 'กู้คืนไม่สำเร็จ: ' + e.message, null, 'data'); }
};
let resetArmed = false;
$('st-reset').onclick = () => {
  if (!resetArmed) { resetArmed = true; $('st-reset').textContent = 'กดอีกครั้งเพื่อยืนยัน (ลบรูปวาด/indicator/สคริปต์/alert)'; $('st-reset-msg').textContent = 'แนะนำให้สำรองก่อน'; return; }
  localStorage.clear(); vcg.log('warn', 'ผู้ใช้ล้างข้อมูลในแอป', null, 'data'); location.reload();
};
