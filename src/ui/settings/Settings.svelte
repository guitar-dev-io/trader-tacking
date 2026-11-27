<script lang="ts">
  // Settings window (Phase 4). Same ids/classes as the old markup (CSS + tests rely on them), state is local and
  // the main-process settings are read on open / written on save with the same set-settings payload as before.
  import { flushSync } from 'svelte';
  import Icon from '../Icon.svelte';
  import About from '../about/About.svelte';
  import { S, store, THEME, setMainCfg } from '../../state';
  import { toast } from '../toast';
  import { ui } from '../registry';
  import { ICON } from '../../app/icons';
  import { $ as byId, zoneOffsetSec, setTZ } from '../../app/app-core';
  import { runAnalysis } from '../../app/app-analysis';
  import { loadChart } from '../../app/app-data';
  import { DEFAULT_SESSIONS, SESSIONS_ALL, ZONES, _sessionWindow, setSessions } from '../../chart/draw';
  import { netState, NET_TH } from '../net';
  import { osKeys } from '../os';

  const vcg = (window as any).vcg;
  type Sess = { name: string; zone: string; open: string; close: string; color: string; on: boolean };

  // ------------------------------------------------------------ state
  let section = $state('general');
  let msg = $state(''), resetMsg = $state(''), resetArmed = $state(false), signOutArmed = $state(false);
  let themePref = $state(THEME.pref());
  let status: any = $state({});
  let eaVer = $state(''), eaOut = $state(''), claudeState = $state(''), claudeOut = $state('');
  let claude: any = $state(null);
  let sess: Sess[] = $state([]);
  const f = $state({
    tz: 'local', bars: 1500, login: false, autoupd: true,
    mt5port: 7788, eaAuto: true, autoLaunch: true, closeQuit: true,
    slow: 800, delay: 3000, stale: 45, stuck: 60, netnotify: false,
    sound: true, desktop: false, toast: true, signotify: false, learnonly: false,
    swing: 5, rr1: 1, rr2: 2, slbuf: 0.2, minsamp: 5, maxbars: 100,
    apiOn: false, apiPort: 8787, apiToken: '', apiLan: false,
    whUrl: '', whSig: true, whAlert: true, tgToken: '', tgChat: '', tgSig: true, tgAlert: true,
    csv: false,
  });
  const ver = $state({ app: '', data: '', apiPort: 8787 });
  const caps = { vcg: !!vcg.capabilities?.vcg, mt5: !!vcg.capabilities?.mt5 };
  const hasEA = !!vcg.mt5UpdateEA, hasInstall = !!vcg.mt5InstallEA, hasClaude = !!vcg.claudeStatus;

  THEME.onChange(() => { themePref = THEME.pref(); });
  vcg.onStatus((st: any) => { status = st; });

  const NAV: [string, string][] = [['general', 'ทั่วไป'], ['source', 'แหล่งราคา / บัญชี'], ['conn', 'เน็ต / ความเสถียร'], ['notif', 'แจ้งเตือน'], ['sess', 'ช่วงเวลาตลาด'], ['an', 'การวิเคราะห์'], ['claude', 'Claude'], ['api', 'API / Webhook'], ['data', 'ข้อมูล'], ['about', 'เกี่ยวกับ']];
  const UI_TOGGLES: [string, string][] = [['side', 'แถบด้านขวา (ราคา/วิเคราะห์/ฝึก…)'], ['tools', 'แถบเครื่องมือวาด'], ['toolbar', 'แถบเครื่องมือด้านบนกราฟ'], ['bottom', 'แถบล่าง (ช่วงเวลา/session/นาฬิกา)'], ['zoom', 'ปุ่มซูมใต้กราฟ'], ['legend', 'ข้อความ OHLC และอินดิเคเตอร์มุมซ้ายบน'], ['netbanner', 'แถบเตือนเน็ตช้าด้านบน']];

  // ------------------------------------------------------------ open / save
  export async function open(sec?: string) {
    const c = await vcg.getSettings(); setMainCfg(c);
    const P = S.prefs, m = c.mt5 || {}, n = c.net, a = c.api, w = c.webhook, t = c.telegram;
    Object.assign(f, {
      tz: store.get('tz', 'local'), autoupd: store.get('autoUpdateCheck', true), bars: P.historyBars, login: !!c.openAtLogin,
      eaAuto: m.autoUpdateEA !== false, autoLaunch: m.autoLaunch !== false, closeQuit: m.closeOnQuit !== false, mt5port: m.port || 7788,
      slow: n.slowMs, delay: n.delayMs, stale: n.staleSec, stuck: n.stuckSec, netnotify: n.notify,
      sound: P.sound, desktop: P.desktop, toast: P.toast, signotify: S.an.notify, learnonly: S.an.learnOnly,
      swing: S.an.swingLen, rr1: P.rr1, rr2: P.rr2, slbuf: P.slBuf, minsamp: P.minSamples, maxbars: P.maxBars,
      apiOn: a.enabled, apiPort: a.port, apiToken: a.token, apiLan: a.lan,
      whUrl: w.url, whSig: w.onSignal, whAlert: w.onAlert, tgToken: t.botToken, tgChat: t.chatId, tgSig: t.onSignal, tgAlert: t.onAlert,
      csv: !!byId('csv')?.checked,
    });
    ver.app = c.version || (window as any).APP_VERSION || ''; ver.data = c.userData || ''; ver.apiPort = a.port;
    msg = ''; resetMsg = ''; resetArmed = false;
    sess = JSON.parse(JSON.stringify(SESSIONS_ALL));
    eaInfo();
    show(sec || 'general');
    byId('modal-settings')!.classList.remove('hidden');
  }
  export function show(k: string) { section = k; flushSync(); if (k === 'claude') renderClaude(); }
  export function close() { byId('modal-settings')!.classList.add('hidden'); }

  const clampNum = (x: unknown, lo: number, hi: number, d: number) => { const v = parseFloat(String(x)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  export async function save() {
    const P = S.prefs;
    const before = JSON.stringify([P, S.an]);
    Object.assign(P, {
      historyBars: clampNum(f.bars, 200, 5000, 1500), sound: f.sound, desktop: f.desktop, toast: f.toast,
      rr1: clampNum(f.rr1, 0.25, 20, 1), rr2: clampNum(f.rr2, 0.25, 20, 2), slBuf: clampNum(f.slbuf, 0, 5, 0.2),
      minSamples: clampNum(f.minsamp, 1, 100, 5), maxBars: clampNum(f.maxbars, 5, 2000, 100),
    });
    S.an.notify = f.signotify; S.an.learnOnly = f.learnonly; S.an.swingLen = clampNum(f.swing, 2, 30, 5);
    store.set('prefs', P); store.set('an', S.an); store.set('autoUpdateCheck', f.autoupd);
    setSessions(sess.filter((x) => x.name && /^\d{1,2}:\d{2}$/.test(x.open) && /^\d{1,2}:\d{2}$/.test(x.close)).map((x) => ({ ...x })));
    await vcg.setSettings({
      api: { enabled: f.apiOn, port: +f.apiPort || 8787, token: String(f.apiToken).trim(), lan: f.apiLan },
      webhook: { url: String(f.whUrl).trim(), onSignal: f.whSig, onAlert: f.whAlert },
      telegram: { botToken: String(f.tgToken).trim(), chatId: String(f.tgChat).trim(), onSignal: f.tgSig, onAlert: f.tgAlert },
      net: { slowMs: clampNum(f.slow, 100, 10000, 800), delayMs: clampNum(f.delay, 500, 60000, 3000), staleSec: clampNum(f.stale, 10, 3600, 45),
        stuckSec: clampNum(f.stuck, 20, 3600, 60), notify: f.netnotify },
      openAtLogin: f.login,
      mt5: { port: clampNum(f.mt5port, 1024, 65535, 7788), autoUpdateEA: f.eaAuto, autoLaunch: f.autoLaunch, closeOnQuit: f.closeQuit },
    });
    const csvEl = byId('csv');
    if (csvEl && f.csv !== csvEl.checked) vcg.toggleCsv();
    if (f.tz !== store.get('tz', 'local')) { store.set('tz', f.tz); byId('tz-sel').value = f.tz; setTZ(zoneOffsetSec(f.tz)); loadChart(); }
    else if (before !== JSON.stringify([P, S.an])) runAnalysis();
    vcg.log('info', 'บันทึกการตั้งค่า', null, 'settings');
    msg = 'บันทึกแล้ว ✓';
  }

  // ------------------------------------------------------------ source cards
  const m = $derived(status.mt5 || {});
  const vcgPill = $derived(!caps.vcg ? ['', 'ใช้ไม่ได้ในเบราว์เซอร์'] : status.connected && S.source === 'vcg' ? ['ok', 'เชื่อมต่อแล้ว'] : status.loggedIn ? ['wait', 'login แล้ว'] : ['bad', 'ยังไม่ได้ login']);
  const mt5Pill = $derived(!caps.mt5 ? ['', 'เฉพาะบนคอม'] : m.connected ? ['ok', 'EA เชื่อมต่อแล้ว'] : S.source === 'mt5' ? ['wait', 'รอ EA'] : ['', 'ไม่ได้ใช้']);
  let src = $state(S.source);
  $effect(() => { void status; src = S.source; });
  function useSrc(k: string) {
    ui.setSource?.(k); src = S.source;
    if (k === 'mt5' && !(status.mt5 && status.mt5.connected)) { close(); ui.setup?.open('mt5', 0); }
  }
  const SRC_NAME: Record<string, string> = { vcg: 'VCG', mt5: 'MT5', demo: 'Demo' };

  // ------------------------------------------------------------ claude
  async function renderClaude() {
    if (!hasClaude) { claudeState = 'ใช้ได้เฉพาะแอป Mac'; return; }
    claude = await vcg.claudeStatus();
    const st = claude;
    claudeState = `การเข้าถึงของ Claude: ${st.claude ? '<span class="up">เปิด</span>' : 'ปิด'} · ช่องเชื่อมต่อในเครื่อง: ${st.listening ? '<span class="up">พร้อม (127.0.0.1:' + st.port + ')</span>' : '<span class="down">ไม่ทำงาน</span>'} · Claude Desktop: ${st.desktop ? '<span class="up">เพิ่มแล้ว</span>' : 'ยังไม่ได้เพิ่ม'}`;
  }
  async function claudeDesktop() {
    const r = await vcg.claudeSetup({ desktop: true });
    claudeOut = r.ok ? `เพิ่มแล้วใน ${r.desktopConfig}\n(สำรองไฟล์เดิมไว้ข้างกัน)\n\nปิดแล้วเปิด Claude Desktop ใหม่ จะเห็นเครื่องมือ "price-tracker"` : 'ไม่สำเร็จ: ' + r.error;
    toast(r.ok ? 'เพิ่ม Price Tracker ใน Claude Desktop แล้ว — เปิด Claude ใหม่' : 'เพิ่มไม่สำเร็จ', r.ok ? 'ok' : 'error', 6000);
    renderClaude();
  }
  async function claudeCode() {
    const r = await vcg.claudeSetup({});
    claudeOut = 'วางคำสั่งนี้ใน Terminal (ครั้งเดียว):\n\n' + r.codeCmd;
    try { await navigator.clipboard.writeText(r.codeCmd); toast('คัดลอกคำสั่งแล้ว', 'ok'); } catch (_) { /* clipboard blocked */ }
    renderClaude();
  }
  async function claudeOff(e: Event) { e.preventDefault(); await vcg.claudeDisable(); renderClaude(); }

  // ------------------------------------------------------------ misc actions
  const genToken = () => { f.apiToken = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); };
  async function test() {
    await save();
    msg = 'กำลังส่ง…';
    const n = await vcg.notify('signal', { test: true, symbol: S.symbol }, `🧪 ทดสอบจาก Price Tracker (${S.symbol})`);
    msg = n ? `ส่งแล้ว ${n} ช่องทาง — ดูผลในแท็บ Log` : 'ยังไม่ได้ตั้ง webhook/Telegram';
  }
  const reconnect = () => { vcg.reloadTrader(); toast('กำลังเชื่อมต่อใหม่…'); setTimeout(loadChart, 8000); };
  async function signOut() {
    if (!signOutArmed) { signOutArmed = true; setTimeout(() => { signOutArmed = false; }, 4000); return; }
    await vcg.signOut(); close(); toast('ออกจากระบบแล้ว — login ใหม่ในหน้าต่าง WebTrader', 'warn');
  }
  async function installEA() {
    const r = await vcg.mt5InstallEA();
    eaOut = r.installed.length
      ? `ติดตั้งแล้ว ${r.installed.length} ที่:\n${r.installed.join('\n')}\n\nต่อไปใน MT5: Navigator → คลิกขวา Expert Advisors → Refresh → ดับเบิลคลิก PriceTrackerBridge เพื่อเปิดใน MetaEditor แล้วกด Compile (F7) → Tools → Options → Expert Advisors เพิ่ม 127.0.0.1 → ลาก EA ไปวางบนกราฟ`
      : 'ไม่พบโฟลเดอร์ MT5 ในเครื่องนี้ (ต้องเปิด MT5 อย่างน้อย 1 ครั้งก่อน) — ใช้ปุ่ม "คัดลอกโค้ด EA" แล้วไปที่ MetaEditor → New → Expert Advisor ตั้งชื่อ PriceTrackerBridge ลบโค้ดเดิมแล้ววาง กด Compile';
    if (r.failed.length) eaOut += '\n\nเขียนไม่ได้: ' + r.failed.join('\n');
    toast(r.installed.length ? 'ติดตั้ง EA ลง MT5 แล้ว' : 'ไม่พบ MT5 ในเครื่อง', r.installed.length ? 'ok' : 'warn', 6000);
  }
  async function copyEA() {
    const code = await vcg.mt5EASource();
    try { await navigator.clipboard.writeText(code); toast('คัดลอกโค้ด EA แล้ว — ไปวางใน MetaEditor', 'ok', 5000); } catch (e: any) { toast('คัดลอกไม่ได้: ' + e.message, 'error'); }
    eaOut = osKeys('คัดลอกแล้ว: MetaEditor → File → New → Expert Advisor (template) → ชื่อ PriceTrackerBridge → Finish → กด ⌘A ลบโค้ดเดิม → ⌘V วาง → Compile (F7)');
  }
  async function saveEA() { const file = vcg.saveEA && (await vcg.saveEA()); if (file) toast('บันทึก EA แล้ว: ' + file, 'ok'); }
  export async function eaInfo() {
    if (!vcg.mt5EAInfo) return;
    try { const i = await vcg.mt5EAInfo(); const fm = (b: number) => (b / 100).toFixed(2);
      eaVer = i.running ? `EA ใน MT5: ${fm(i.running)} · ในแอป: ${fm(i.bundled)}${i.running < i.bundled ? ' — มีรุ่นใหม่' : ' — ล่าสุดแล้ว'}` : `EA ในแอป: ${fm(i.bundled)}`; } catch (_) { /* EA info unavailable */ }
  }
  let eaBusy = $state(false);
  async function updateEA() { eaBusy = true; try { await vcg.mt5UpdateEA(); } finally { eaBusy = false; eaInfo(); } }
  async function openEditor() { const r = await vcg.mt5OpenEditor(); toast(r === true ? 'กำลังเปิด MetaEditor — กด Compile (F7)' : r === 'folder' ? 'เปิดโฟลเดอร์ EA แล้ว — ดับเบิลคลิกไฟล์เพื่อเปิดใน MetaEditor' : 'ไม่พบ MT5 ในเครื่อง', r ? 'info' : 'warn', 7000); }
  const guide = (p?: string, step?: number) => { close(); if (p) ui.setup?.open(p, step); else ui.setup?.open(); };

  // ------------------------------------------------------------ sessions editor
  const SESS_ZONES: [string, string][] = [['Australia/Sydney', 'Sydney'], ['Asia/Tokyo', 'Tokyo'], ['Asia/Hong_Kong', 'Hong Kong'], ['Asia/Singapore', 'Singapore'], ['Asia/Bangkok', 'Bangkok (เวลาไทยตายตัว)'],
    ['Europe/Frankfurt', 'Frankfurt'], ['Europe/London', 'London'], ['America/New_York', 'New York'], ['America/Chicago', 'Chicago'], ['UTC', 'UTC']];
  const SESS_PRESETS: Record<string, Sess[]> = {
    fx: DEFAULT_SESSIONS,
    fx7: DEFAULT_SESSIONS.map((x: Sess) => (x.name === 'London' ? { ...x, open: '07:00', close: '16:00' } : x)),
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
  const bkkHM = (sec: number) => { const d = new Date((sec + 7 * 3600) * 1000); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  function sessPreview(x: Sess) {
    const n = new Date();
    try { const [a, b] = _sessionWindow(x, n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); return `${bkkHM(a)}–${bkkHM(b)}`; } catch (_) { return '—'; }
  }
  const hmOk = (s: string) => /^([01]?\d|2[0-4]):[0-5]\d$/.test(s);
  let preset = $state('');
  function applyPreset() { const p = SESS_PRESETS[preset]; if (p) sess = JSON.parse(JSON.stringify(p)); preset = ''; }

  // ------------------------------------------------------------ backup / restore / reset
  const SCHEMA = 3;
  if (store.get('schema', null) == null) store.set('schema', SCHEMA);
  async function backup() {
    const data: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; data[k] = localStorage.getItem(k); }
    const cfg = await vcg.getSettings();
    const b = { app: 'Price Tracker', schema: SCHEMA, created: new Date().toISOString(), local: data, main: { api: cfg.api, webhook: cfg.webhook, telegram: cfg.telegram, net: cfg.net, openAtLogin: cfg.openAtLogin } };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }));
    a.download = `price-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    vcg.log('info', 'สำรองข้อมูลแล้ว', null, 'data');
  }
  let fileEl: HTMLInputElement | undefined = $state();
  async function restore() {
    const file = fileEl?.files?.[0]; if (!file) return;
    try {
      const b = JSON.parse(await file.text());
      if (b.app !== 'Price Tracker' || !b.local) throw new Error('ไม่ใช่ไฟล์สำรองของ Price Tracker');
      localStorage.clear();
      for (const [k, val] of Object.entries(b.local)) localStorage.setItem(k, val as string);
      if (b.main) await vcg.setSettings(b.main);
      vcg.log('info', `กู้คืนข้อมูลจาก ${file.name}`, null, 'data');
      location.reload();
    } catch (e: any) { resetMsg = 'ผิดพลาด: ' + e.message; vcg.log('error', 'กู้คืนไม่สำเร็จ: ' + e.message, null, 'data'); }
  }
  function reset() {
    if (!resetArmed) { resetArmed = true; resetMsg = 'แนะนำให้สำรองก่อน'; return; }
    localStorage.clear(); vcg.log('warn', 'ผู้ใช้ล้างข้อมูลในแอป', null, 'data'); location.reload();
  }
  const n = $derived($netState);
</script>

<div class="modal-box wide settings">
  <div class="modal-h">การตั้งค่า <button class="x" aria-label="ปิด" onclick={close}><Icon name="x" /></button></div>
  <div class="st-wrap">
    <div class="st-nav">
      {#each NAV as [k, label] (k)}<button data-st={k} class:active={section === k} onclick={() => show(k)}>{label}</button>{/each}
    </div>
    <div class="st-body">
      <section data-sec="general" class:hidden={section !== 'general'}>
        <h4>ธีม</h4>
        <div class="theme-pick" id="st-theme" role="radiogroup" aria-label="ธีม">
          {#each [['auto', 'ตามระบบ'], ['dark', 'มืด'], ['light', 'สว่าง'], ['contrast', 'คอนทราสต์สูง']] as [t, label] (t)}
            <button data-theme-v={t} role="radio" class:on={themePref === t} aria-checked={themePref === t} onclick={() => THEME.set(t as any)}><i class="tp-sw tp-{t}"></i>{label}</button>
          {/each}
        </div>
        <h4>กราฟ</h4>
        <div class="row"><label for="st-tz">Timezone</label><select id="st-tz" bind:value={f.tz}>{#each ZONES as [z, nm] (z)}<option value={z}>{nm}</option>{/each}</select></div>
        <div class="row"><label for="st-bars">โหลดย้อนหลัง</label><input id="st-bars" type="number" min="200" max="5000" step="100" bind:value={f.bars}><span class="muted">แท่ง (มาก = วิเคราะห์แม่นขึ้น แต่โหลดช้าลง)</span></div>
        <h4>การแสดงผล (ปิดส่วนที่ไม่ใช้ได้)</h4>
        <div class="ui-toggles">
          {#each UI_TOGGLES as [k, label] (k)}<label class="chk"><input type="checkbox" data-ui={k}> {label}</label>{/each}
        </div>
        <h4>โปรแกรม</h4>
        <label class="chk"><input type="checkbox" id="st-login" bind:checked={f.login}> เปิด Price Tracker อัตโนมัติเมื่อเปิดเครื่อง</label>
        <label class="chk"><input type="checkbox" id="st-autoupd" bind:checked={f.autoupd}> ตรวจหาเวอร์ชันใหม่อัตโนมัติ</label>
        <div class="row"><button id="st-checkupd" onclick={() => ui.update?.check(true)}>ตรวจหาเวอร์ชันใหม่ตอนนี้</button></div>
      </section>

      <section data-sec="source" class:hidden={section !== 'source'}>
        <div class="src-cards">
          <div class="src-card" id="st-src-vcg" class:on={src === 'vcg'}>
            <div class="src-card-h"><b><Icon name="globe" />VCG Markets</b><span id="st-vcg-pill" class="src-pill {vcgPill[0]}">{vcgPill[1]}</span></div>
            <p>login ด้วยอีเมล + รหัสผ่านของ VCG ในหน้าเว็บของ VCG เอง · แอปไม่เห็นและไม่เก็บรหัสผ่าน · ใช้ได้ทั้ง Mac / Windows / Android</p>
            <div class="btns">
              <button id="st-use-vcg" class:primary={src !== 'vcg'} disabled={src === 'vcg' || !caps.vcg} onclick={() => useSrc('vcg')}>{src === 'vcg' ? '✓ ใช้อยู่' : 'ใช้ VCG'}</button>
              <button id="st-trader" onclick={() => vcg.showTrader()}>เปิด WebTrader / Login</button>
              <button id="st-reconnect" onclick={reconnect}><Icon name="refresh-cw" />เชื่อมต่อใหม่</button>
              <button id="st-signout" class="danger" onclick={signOut}>{signOutArmed ? 'กดอีกครั้งเพื่อยืนยันออกจากระบบ' : 'ออกจากระบบ VCG'}</button>
            </div>
          </div>
          <div class="src-card" id="st-src-mt5" class:on={src === 'mt5'}>
            <div class="src-card-h"><b><Icon name="monitor" />MT5 — โบรกเกอร์ของฉัน</b><span id="st-mt5-pill" class="src-pill {mt5Pill[0]}">{mt5Pill[1]}</span></div>
            <div id="st-mt5-info" class="net-now">
              {#if !caps.mt5}ใช้ได้เฉพาะแอปบนคอม (Mac / Windows)
              {:else if m.connected}{@html ICON.html('circle-check', 15, 'up')}<b>{m.broker || ''}</b> ({m.server || ''}) · {(m.symbols || []).length} symbol ใน Market Watch{#if (m.unknown || []).length}<br>{@html ICON.html('triangle-alert', 15, 'warn')}ไม่พบใน MT5: {m.unknown.join(', ')}{/if}
              {:else if src === 'mt5'}{@html ICON.html('hourglass', 15)}รอ EA เชื่อมต่อที่ 127.0.0.1:{m.port || 7788} — เปิด MT5 แล้วติด EA บนกราฟ
              {:else}ยังไม่ได้เลือก MT5 เป็นแหล่งราคา{/if}
            </div>
            <p>ใช้ได้ทุกโบรกเกอร์ที่มี MetaTrader 5 (Exness, XM, Brex ฯลฯ) · <b>EA อ่านอย่างเดียว ส่งออเดอร์ไม่ได้ — ดูออเดอร์/โพซิชันของตัวเองได้</b> · รหัสผ่านกรอกใน MT5 เท่านั้น</p>
            <div class="btns">
              <button id="st-use-mt5" class:primary={src !== 'mt5'} disabled={src === 'mt5' || !caps.mt5} onclick={() => useSrc('mt5')}>{src === 'mt5' ? '✓ ใช้อยู่' : 'ใช้ MT5'}</button>
              <button id="st-mt5-guide" onclick={() => guide('mt5', 0)}><Icon name="book-open" />ตัวช่วยเชื่อมต่อ MT5</button>
            </div>
            <div class="ea-auto">
              <label class="chk" title="เปิด MT5 แบบย่อหน้าต่างให้เองเมื่อเปิดแอป และเปิดใหม่ถ้า MT5 ปิดไป — ไม่ต้องเปิด MT5 ค้างไว้เอง"><input type="checkbox" id="st-mt5-autolaunch" bind:checked={f.autoLaunch} disabled={!hasEA}> เปิด MT5 ให้อัตโนมัติ (ย่อหน้าต่าง)</label>
              <label class="chk"><input type="checkbox" id="st-mt5-closequit" bind:checked={f.closeQuit} disabled={!hasEA}> ปิด MT5 ตอนปิดแอป (เฉพาะที่แอปเปิดให้)</label>
            </div>
            <div class="ea-auto"><label class="chk"><input type="checkbox" id="st-ea-auto" bind:checked={f.eaAuto} disabled={!hasEA}> อัปเดต EA อัตโนมัติ</label><span id="st-ea-ver" class="muted">{eaVer}</span>
              <span class="btns"><button id="st-ea-update" disabled={!hasEA || eaBusy} onclick={updateEA}><Icon name="refresh-cw" />อัปเดต EA ตอนนี้</button><button id="st-ea-editor" disabled={!hasEA} onclick={openEditor}><Icon name="file-text" />เปิด MetaEditor</button></span></div>
            <p class="muted ea-auto-note">เมื่อแอปมี EA รุ่นใหม่ แอปจะคัดลอกและ compile ให้เอง โดยไม่ต้องเปิด MetaEditor — EA บนกราฟโหลดรุ่นใหม่เอง</p>
            <details><summary>ขั้นสูง: ติดตั้ง EA เอง / เปลี่ยนพอร์ต</summary>
              <div class="row"><label for="st-mt5-port">พอร์ต MT5</label><input id="st-mt5-port" type="number" min="1024" max="65535" bind:value={f.mt5port}><button id="st-save-ea" disabled={!vcg.saveEA} onclick={saveEA}><Icon name="download" />บันทึกไฟล์ EA</button></div>
              <div class="btns" style="margin:6px 0"><button id="st-install-ea" disabled={!hasInstall} onclick={installEA}>ติดตั้ง EA ลง MT5</button><button id="st-copy-ea" disabled={!hasInstall} onclick={copyEA}>คัดลอกโค้ด EA</button></div>
              <pre id="st-ea-out" class:hidden={!eaOut} style="white-space:pre-wrap;word-break:break-all;font-size:11.5px">{eaOut}</pre>
              <ol class="mt5-steps">
                <li>กด "บันทึกไฟล์ EA" แล้วใน MT5 เปิด <b>File › Open Data Folder › MQL5 › Experts</b> วางไฟล์ <code>PriceTrackerBridge.mq5</code></li>
                <li>ใน MT5: <b>Tools › Options › Expert Advisors</b> ติ๊ก <i>Allow WebRequest for listed URL</i> แล้วเพิ่ม <code>http://127.0.0.1</code></li>
                <li>Navigator › Expert Advisors › คลิกขวา Refresh › ลาก <b>PriceTrackerBridge</b> ลงกราฟใดก็ได้ (พอร์ตต้องตรงกับช่องด้านบน)</li>
              </ol>
            </details>
          </div>
          <div class="src-card" id="st-src-demo" class:on={src === 'demo'}>
            <div class="src-card-h"><b><Icon name="graduation-cap" />Demo</b><span class="src-pill ok">ไม่ต้อง login</span></div>
            <p>ราคาจาก Binance สำหรับฝึก · XAUUSD ใช้ PAXG แทนทองคำ ราคาใกล้เคียงแต่ไม่เท่ากับโบรกเกอร์</p>
            <div class="btns"><button id="st-use-demo" disabled={src === 'demo'} onclick={() => useSrc('demo')}>{src === 'demo' ? '✓ ใช้อยู่' : 'ใช้ Demo'}</button><button id="st-open-guide" onclick={() => guide()}><Icon name="book-open" />คู่มือเริ่มต้น</button></div>
          </div>
        </div>
      </section>

      <section data-sec="conn" class:hidden={section !== 'conn'}>
        <div id="st-net-now" class="net-now">
          {#if n}สถานะ: <b>{NET_TH[n.level]}</b>{n.detail ? ' — ' + n.detail : ''}<br>
            Ping ไป VCG: <b>{n.rtt ?? '—'} ms</b> · ราคาหน่วงเพิ่ม (เทียบตอนปกติ): <b>{n.feedDelay ?? '—'} ms</b><br>
            ราคาล่าสุดเมื่อ: <b>{n.lastTickAgo != null ? Math.round(n.lastTickAgo) + ' วินาทีที่แล้ว' : '—'}</b> · หลุดไปแล้ว <b>{n.reconnects}</b> ครั้ง<br>
            CPU: หน้าจอ <b>{n.cpu?.ui ?? '—'}%</b> · WebTrader (ซ่อน) <b>{n.cpu?.webtrader ?? '—'}%</b> · ตัวแอป <b>{n.cpu?.app ?? '—'}%</b> · GPU <b>{n.cpu?.gpu ?? '—'}%</b>{/if}
        </div>
        <h4>เกณฑ์แจ้งเตือนเน็ตช้า</h4>
        <div class="row"><label for="st-slow">Ping ช้าเกิน</label><input id="st-slow" type="number" min="100" step="100" bind:value={f.slow}><span class="muted">ms</span></div>
        <div class="row"><label for="st-delay">ราคาหน่วงเกิน</label><input id="st-delay" type="number" min="500" step="500" bind:value={f.delay}><span class="muted">ms (เทียบเวลาราคากับนาฬิกาเครื่อง)</span></div>
        <div class="row"><label for="st-stale">ไม่มีราคาเกิน</label><input id="st-stale" type="number" min="10" step="5" bind:value={f.stale}><span class="muted">วินาที → เตือน "ราคาค้าง"</span></div>
        <div class="row"><label for="st-stuck">หลุดนานเกิน</label><input id="st-stuck" type="number" min="20" step="10" bind:value={f.stuck}><span class="muted">วินาที → โหลด WebTrader ใหม่อัตโนมัติ</span></div>
        <label class="chk"><input type="checkbox" id="st-netnotify" bind:checked={f.netnotify}> แจ้งเตือนบน macOS เมื่อการเชื่อมต่อแย่ลง</label>
      </section>

      <section data-sec="notif" class:hidden={section !== 'notif'}>
        <label class="chk"><input type="checkbox" id="st-sound" bind:checked={f.sound}> เสียงแจ้งเตือน</label>
        <label class="chk"><input type="checkbox" id="st-desktop" bind:checked={f.desktop}> แจ้งเตือนบน macOS (Notification Center)</label>
        <label class="chk"><input type="checkbox" id="st-toast" bind:checked={f.toast}> ป้ายแจ้งเตือนในแอป</label>
        <label class="chk"><input type="checkbox" id="st-signotify" bind:checked={f.signotify}> แจ้งเตือนเมื่อมีสัญญาณใหม่</label>
        <label class="chk"><input type="checkbox" id="st-learnonly" bind:checked={f.learnonly}> เฉพาะสัญญาณที่ผ่านโหมดเรียนรู้</label>
        <p class="muted">ส่งต่อไป Telegram / Webhook ตั้งได้ที่แท็บ "API / Webhook"</p>
      </section>

      <section data-sec="sess" class:hidden={section !== 'sess'}>
        <p class="muted">ตั้งเวลาเปิด–ปิดตาม "เขตเวลา" ที่เลือก · ถ้าเลือกเขตเวลาของตลาดนั้น (เช่น London) เวลาฤดูร้อน (DST) จะปรับให้อัตโนมัติ · ถ้าอยากล็อกเป็นเวลาไทยตายตัว เลือก Bangkok</p>
        <div class="row"><label for="sess-preset">ชุดสำเร็จรูป</label><select id="sess-preset" bind:value={preset} onchange={applyPreset}><option value="">— เลือก —</option><option value="fx">Forex มาตรฐาน</option><option value="fx7">Forex (London 07:00 GMT)</option><option value="stock">เวลาตลาดหุ้น</option><option value="ict">ICT Killzones</option></select></div>
        <table class="sess-tbl"><thead><tr><th></th><th>ชื่อ</th><th>สี</th><th>เปิด</th><th>ปิด</th><th>เขตเวลา</th><th>= เวลาไทยวันนี้</th><th></th></tr></thead>
          <tbody id="sess-rows">
            {#each sess as x, i (i)}
              <tr data-i={i}>
                <td><input type="checkbox" data-f="on" bind:checked={x.on}></td>
                <td><input type="text" data-f="name" bind:value={x.name}></td>
                <td><input type="color" data-f="color" bind:value={x.color}></td>
                <td><input type="text" class="hm" data-f="open" bind:value={x.open} placeholder="HH:MM" maxlength="5" style:border-color={hmOk(x.open) ? '' : '#ef5350'}></td>
                <td><input type="text" class="hm" data-f="close" bind:value={x.close} placeholder="HH:MM" maxlength="5" style:border-color={hmOk(x.close) ? '' : '#ef5350'}></td>
                <td><select data-f="zone" bind:value={x.zone}>{#each SESS_ZONES as [z, nm] (z)}<option value={z}>{nm}</option>{/each}</select></td>
                <td class="pv">{sessPreview(x)}</td>
                <td><button data-del={i} title="ลบ" aria-label="ลบ" onclick={() => sess.splice(i, 1)}><Icon name="x" size={14} bare /></button></td>
              </tr>
            {/each}
          </tbody></table>
        <div class="row"><button id="sess-add" onclick={() => sess.push({ name: 'Session', zone: 'Asia/Bangkok', open: '09:00', close: '12:00', color: '#00bcd4', on: true })}>+ เพิ่มช่วงเวลา</button></div>
      </section>

      <section data-sec="an" class:hidden={section !== 'an'}>
        <div class="row"><label for="st-swing">Swing length</label><input id="st-swing" type="number" min="2" max="30" bind:value={f.swing}><span class="muted">แท่งซ้าย/ขวา สำหรับหาสวิง</span></div>
        <div class="row"><label for="st-rr1">TP1 (R)</label><input id="st-rr1" type="number" min="0.5" step="0.5" bind:value={f.rr1}></div>
        <div class="row"><label for="st-rr2">TP2 (R)</label><input id="st-rr2" type="number" min="0.5" step="0.5" bind:value={f.rr2}></div>
        <div class="row"><label for="st-slbuf">SL เผื่อ</label><input id="st-slbuf" type="number" min="0" step="0.05" bind:value={f.slbuf}><span class="muted">× ATR เลยไส้/สวิง</span></div>
        <div class="row"><label for="st-minsamp">ตัวอย่างขั้นต่ำ</label><input id="st-minsamp" type="number" min="1" bind:value={f.minsamp}><span class="muted">ไม้ ก่อนโหมดเรียนรู้จะตัดสิน</span></div>
        <div class="row"><label for="st-maxbars">ถือไม่เกิน</label><input id="st-maxbars" type="number" min="10" step="10" bind:value={f.maxbars}><span class="muted">แท่ง (ทดสอบย้อนหลัง)</span></div>
      </section>

      <section data-sec="claude" class:hidden={section !== 'claude'}>
        <h4>ให้ Claude เข้าถึงแอปนี้ (MCP)</h4>
        <p class="muted">Claude Desktop / Claude Code บน Mac เครื่องนี้จะ: อ่านราคา แท่งเทียน ผลวิเคราะห์ จุดเด้ง และ SL เม่า · เปิดกราฟ symbol/TF ที่ต้องการ · ดูภาพกราฟที่คุณเห็น · วาดโซน/เส้น/Fibo อธิบายบนกราฟ · ใช้เครื่องคำนวณ lot — <b>ส่งคำสั่งซื้อขายจริงไม่ได้</b> (แอปไม่มีระบบเทรด)</p>
        <div id="st-claude-state" class="muted">{@html claudeState}{#if claude && claude.claude} · <a href="#top" id="st-claude-off" onclick={claudeOff}>ปิดการเข้าถึง</a>{/if}</div>
        <div class="btns" style="margin-top:8px"><button id="st-claude-desktop" class="primary" disabled={!hasClaude || (claude && !claude.mac)} onclick={claudeDesktop}>เพิ่มใน Claude Desktop</button><button id="st-claude-code" disabled={!hasClaude} onclick={claudeCode}>คำสั่งสำหรับ Claude Code</button></div>
        <pre id="st-claude-out" class:hidden={!claudeOut} style="white-space:pre-wrap;word-break:break-all;font-size:11.5px;margin-top:8px">{claudeOut}</pre>
        <p class="muted" style="margin-top:8px">ขั้นตอน: ① กด "เพิ่มใน Claude Desktop" ② ปิดแล้วเปิด Claude Desktop ใหม่ ③ ลองพิมพ์ใน Claude: <i>"ดูกราฟ XAUUSD H1 ใน Price Tracker แล้ววิเคราะห์จุดเด้ง วาดโซนให้ด้วย"</i> · ใช้ได้ขณะแอปนี้เปิดอยู่ · แอปจะเปิด Local API เฉพาะเครื่องนี้ (127.0.0.1) พร้อม token ให้อัตโนมัติ · ถ้าย้ายแอปไปโฟลเดอร์อื่น ให้กดเพิ่มใหม่</p>
      </section>

      <section data-sec="api" class:hidden={section !== 'api'}>
        <h4>Local API (ให้โปรแกรมอื่น / เว็บ / มือถือ ดึงข้อมูล)</h4>
        <label class="chk"><input type="checkbox" id="st-api-on" bind:checked={f.apiOn}> เปิด API</label>
        <div class="row"><label for="st-api-port">Port</label><input id="st-api-port" type="number" min="1024" max="65535" bind:value={f.apiPort}></div>
        <div class="row"><label for="st-api-token">Token</label><input id="st-api-token" placeholder="ว่าง = ไม่ใช้ token" bind:value={f.apiToken}><button id="st-gen" onclick={genToken}>สุ่ม</button></div>
        <label class="chk"><input type="checkbox" id="st-api-lan" bind:checked={f.apiLan}> ให้เครื่องอื่นในวง Wi-Fi เดียวกันเข้าได้ (ควรตั้ง token)</label>
        <p class="muted" id="st-api-url">เปิดในเบราว์เซอร์: <b>http://127.0.0.1:{ver.apiPort}</b> (มีหน้า dashboard + รายการ endpoint)</p>
        <h4>Webhook (Discord / Slack / n8n / Make / Zapier / เซิร์ฟเวอร์ของคุณ)</h4>
        <div class="row"><label for="st-wh-url">URL</label><input id="st-wh-url" placeholder="https://…" bind:value={f.whUrl}></div>
        <label class="chk"><input type="checkbox" id="st-wh-sig" bind:checked={f.whSig}> ส่งเมื่อมีสัญญาณใหม่</label>
        <label class="chk"><input type="checkbox" id="st-wh-alert" bind:checked={f.whAlert}> ส่งเมื่อราคาถึง Alert</label>
        <h4>Telegram</h4>
        <div class="row"><label for="st-tg-token">Bot token</label><input id="st-tg-token" placeholder="123456:ABC… จาก @BotFather" bind:value={f.tgToken}></div>
        <div class="row"><label for="st-tg-chat">Chat ID</label><input id="st-tg-chat" placeholder="เช่น 123456789" bind:value={f.tgChat}></div>
        <label class="chk"><input type="checkbox" id="st-tg-sig" bind:checked={f.tgSig}> ส่งเมื่อมีสัญญาณใหม่</label>
        <label class="chk"><input type="checkbox" id="st-tg-alert" bind:checked={f.tgAlert}> ส่งเมื่อราคาถึง Alert</label>
        <div class="row end"><button id="st-test" onclick={test}>ส่งข้อความทดสอบ</button></div>
      </section>

      <section data-sec="data" class:hidden={section !== 'data'}>
        <label class="chk"><input type="checkbox" id="st-csv" bind:checked={f.csv}> บันทึกทุก tick ลง CSV (โฟลเดอร์ Documents/Price Tracker)</label>
        <div class="row"><button id="st-open-csv" onclick={() => vcg.openCsv()}>เปิดโฟลเดอร์ CSV</button><button id="st-open-log" onclick={() => vcg.openLogFolder()}>เปิดโฟลเดอร์ Log</button></div>
        <h4>สำรอง / กู้คืน</h4>
        <p class="muted">รวม watchlist, รูปวาด, indicator, สคริปต์, alert, การตั้งค่าทั้งหมด (ไม่รวมรหัสผ่าน VCG)</p>
        <div class="row"><button id="st-backup" onclick={backup}><Icon name="save" />สำรองเป็นไฟล์</button><button id="st-restore" onclick={() => fileEl?.click()}><Icon name="folder-open" />กู้คืนจากไฟล์</button><input type="file" id="st-file" accept=".json" class="hidden" bind:this={fileEl} onchange={restore}></div>
        <h4>รีเซ็ต</h4>
        <div class="row"><button id="st-reset" class="danger" onclick={reset}>{resetArmed ? 'กดอีกครั้งเพื่อยืนยัน (ลบรูปวาด/indicator/สคริปต์/alert)' : 'ล้างข้อมูลในแอปทั้งหมด'}</button><span class="muted" id="st-reset-msg">{resetMsg}</span></div>
        <p class="muted" id="st-ver">{ver.app ? `Price Tracker v${ver.app} · ข้อมูลแอป: ${ver.data}` : ''}</p>
      </section>

      <section data-sec="about" class:hidden={section !== 'about'}>
        <h4>Price Tracker</h4>
        <div class="ro-box">
          <b><Icon name="shield-check" />อ่านราคาอย่างเดียว — ไม่ส่งคำสั่งซื้อขาย</b>
          <ul>
            <li>แอปนี้ดึงราคาและแท่งเทียนมาแสดง วิเคราะห์ และใช้ฝึกเท่านั้น ไม่มีปุ่มหรือคำสั่งใดที่ส่งออเดอร์ไปที่โบรกเกอร์</li>
            <li>MT5: EA PriceTrackerBridge อ่านอย่างเดียว ส่งออเดอร์ไม่ได้ — ดูออเดอร์/โพซิชันของตัวเองได้</li>
            <li>VCG: รหัสผ่านกรอกในหน้าเว็บของ VCG เอง แอปไม่เห็นและไม่เก็บรหัสผ่าน</li>
            <li>บัญชีฝึกเทรดในแอปใช้เงินสมมติทั้งหมด</li>
          </ul>
          <p class="muted">ผลวิเคราะห์ สัญญาณ และบทเรียนมีไว้เพื่อการเรียนรู้ ไม่ใช่คำแนะนำการลงทุน — การเทรดมีความเสี่ยง ตัดสินใจด้วยตัวเองเสมอ</p>
        </div>
        <About />
        <p class="muted" id="st-about-ver">{ver.app ? `เวอร์ชัน ${ver.app}` : ''}</p>
      </section>
    </div>
  </div>
  <div class="row end"><span id="st-msg" class="muted">{msg}</span><div class="grow"></div><button onclick={close}>ปิด</button><button id="st-save" class="primary" onclick={save}>บันทึก</button></div>
</div>
