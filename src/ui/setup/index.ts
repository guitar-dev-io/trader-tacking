// Setup guide (Svelte) + the source pill in the watchlist header (was setup.js). Opened from the connect screen,
// the pill menu, settings and the mobile More page; first run opens it once when nothing is connected.
import { mount } from 'svelte';
import { def } from '../../pt';
import { S, store } from '../../state';
import { connStatus } from '../../../app-data.js';
import { toast } from '../toast';
import { ui, type SetupApi } from '../registry';
import { setSource } from '../../../extras.js';
import { pages } from '../../pages/registry';
import Setup from './Setup.svelte';
import './source-pill';

declare const vcg: any;
type View = { go: (p: string, s?: number) => void; setRun: (busy: boolean, lastRun?: any) => void; refresh: () => void };
let box: HTMLDivElement | null = null, view: View | null = null, timer: ReturnType<typeof setInterval> | undefined;

async function act(a: string) {
  const st = connStatus || {};
  if (a === 'demo') { setSource('demo'); close(true); toast('ใช้ข้อมูล Demo แล้ว', 'ok'); }
  else if (a === 'learn') { if (S.source !== 'demo' && !st.connected) setSource('demo'); close(true); if (pages.learn) pages.learn.open(); }
  else if (a === 'vcg-login') { if (S.source !== 'vcg') setSource('vcg'); const ok = vcg.showTrader(); vcg.log('info', 'คู่มือ: เปิดหน้า login VCG', null, 'auth'); if (ok === false) toast('เปิดหน้า login ไม่ได้ — ดูแท็บ Log', 'error'); }
  else if (a === 'vcg-retry') { vcg.reloadTrader(); toast('กำลังเชื่อมต่อใหม่…', 'info'); }
  else if (a === 'mt5-install') {
    if (!vcg.mt5InstallEA) { toast('ใช้ได้เฉพาะแอปบนคอม', 'warn'); return; }
    const r = await vcg.mt5InstallEA();
    toast(r.installed.length ? 'คัดลอก EA ลง MT5 แล้ว' : 'ไม่พบ MT5 ในเครื่อง — เปิด MT5 1 ครั้งก่อน', r.installed.length ? 'ok' : 'warn', 6000);
  } else if (a === 'mt5-launch') {
    if (!vcg.mt5Launch) { toast('ต้องอัปเดตแอปบนคอมเป็นเวอร์ชันล่าสุด', 'warn'); return; }
    if (S.source !== 'mt5') setSource('mt5');
    view!.setRun(true);
    let lastRun: any;
    try { lastRun = await vcg.mt5Launch({}); } catch (e: any) { lastRun = { ok: false, steps: [{ ok: false, t: String(e.message || e) }] }; }
    view!.setRun(false, lastRun);
    toast(lastRun.ok ? 'กำลังเปิด MT5 พร้อม EA' : 'ยังไม่สำเร็จ — ดูรายการในคู่มือ', lastRun.ok ? 'ok' : 'warn', 6000);
  }
}
function open(p = 'start', s = 0) {
  if (!box) {
    box = document.createElement('div'); box.id = 'setup';
    document.body.appendChild(box);
    view = mount(Setup, { target: box, props: { onact: act, onclose: (d: boolean) => close(d) } }) as unknown as View;
    box.addEventListener('click', (e) => { if (e.target === box) close(true); });
  }
  view!.go(p, s);
  box.classList.remove('hidden');
  clearInterval(timer); timer = setInterval(() => view!.refresh(), 1000);
  if (vcg.log) vcg.log('info', 'เปิดคู่มือเริ่มต้น: ' + p, null, 'ui');
}
function close(done?: boolean) {
  if (!box) return;
  box.classList.add('hidden'); clearInterval(timer);
  if (done) store.set('setupDone', 1);
}
const isOpen = () => !!box && !box.classList.contains('hidden');

export const SETUP: SetupApi = { open, close, isOpen };
ui.setup = SETUP;

// First run: show the guide once if nothing is connected yet.
setTimeout(() => { const st = connStatus || {}; if (!store.get('setupDone', 0) && !st.overlay && !st.connected && !(st.mt5 || {}).connected && !S.replay) open(); }, 3500);

def({ SETUP: [() => SETUP] });   // tests drive the guide through PT.SETUP
