// Connect screen (shown until prices flow): decides whether to show, which stage/status to show,
// and renders Connect.svelte into #connect. app-data.ts calls renderConnect(status, ctx) on every status.
import { mount, flushSync } from 'svelte';
import { writable } from 'svelte/store';
import Connect from './Connect.svelte';

export type CnAction = 'login' | 'demo' | 'retry' | 'guide' | 'mt5guide' | 'log' | 'src:vcg' | 'src:mt5';
export interface CnModel {
  kind: 'web' | 'mt5' | 'vcg'; source: string; desktopMt5: boolean; mobile: boolean; port: number;
  stage: string; step: number; slow: boolean; netBad: boolean;
  status: { cls: 'wait' | 'bad' | 'idle'; text: string };
  diag: string;
}
export interface CnCtx { source: string; replay: boolean; mobile: boolean; desktopMt5: boolean; onAction: (a: CnAction) => void }

export const cnModel = writable<CnModel | null>(null);
let mounted = false, actionFn: (a: CnAction) => void = () => {};
const BOOT_AT = Date.now();
let connectingSince = 0;
export const isConnecting = () => !!connectingSince;
export const bootAt = () => BOOT_AT;

export function renderConnect(st: any, ctx: CnCtx): void {
  const box = document.getElementById('connect'); if (!box) return;
  actionFn = ctx.onAction;
  const m5 = st.mt5 || {};
  const waitVcg = ctx.source === 'vcg' && !st.connected, waitMt5 = ctx.source === 'mt5' && ctx.desktopMt5 && !!st.mt5 && !m5.connected;
  const show = (waitVcg || waitMt5) && !ctx.replay && (Date.now() - BOOT_AT > 2500 || st.stage === 'login');
  box.classList.toggle('hidden', !show);
  if (!show) { connectingSince = 0; return; }
  document.getElementById('loading')?.classList.add('hidden');
  const web = st.platform === 'web' || st.stage === 'web';
  const stage: string = web ? 'web' : st.stage || (st.loggedIn ? 'connecting' : 'login');
  if (stage === 'connecting') connectingSince = connectingSince || Date.now(); else connectingSince = 0;
  const slow = !!connectingSince && Date.now() - connectingSince > 45000;
  const netBad = !!(st.net && /down|offline|error|lost/i.test(st.net.level || ''));
  const step = ({ starting: 0, login: 1, connecting: 2 } as Record<string, number>)[stage] ?? 1;
  const status: CnModel['status'] = waitMt5 && !web ? { cls: 'wait', text: `รอ EA PriceTrackerBridge ใน MT5 (พอร์ต ${m5.port || 7788})` }
    : netBad ? { cls: 'bad', text: 'ไม่มีอินเทอร์เน็ต — ตรวจการเชื่อมต่อแล้วกดเชื่อมต่อใหม่' }
    : st.nativeOk === false ? { cls: 'bad', text: 'ส่วนเชื่อมต่อของแอปไม่ทำงาน — ปิดแล้วเปิดแอปใหม่' }
    : stage === 'starting' ? { cls: 'wait', text: 'กำลังเปิด VCG WebTrader…' }
    : stage === 'login' ? { cls: 'idle', text: st.overlay ? 'หน้า login เปิดอยู่ — กรอกอีเมลและรหัสผ่าน' : 'ยังไม่ได้เข้าสู่ระบบ' }
    : slow ? { cls: 'bad', text: 'login แล้วแต่ยังไม่มีราคา — ลองกดเชื่อมต่อใหม่' } : { cls: 'wait', text: 'login แล้ว กำลังรอราคา…' };
  cnModel.set({
    kind: web ? 'web' : waitMt5 ? 'mt5' : 'vcg', source: ctx.source, desktopMt5: ctx.desktopMt5, mobile: ctx.mobile, port: m5.port || 7788,
    stage, step, slow, netBad, status,
    diag: stage + (st.page ? ' · ' + st.page : '') + (st.overlay ? ' · login window เปิดอยู่' : ''),
  });
  if (!mounted || !box.firstElementChild) { box.replaceChildren(); mount(Connect, { target: box, props: { act: (a: CnAction) => actionFn(a) } }); mounted = true; }
  flushSync();
}
