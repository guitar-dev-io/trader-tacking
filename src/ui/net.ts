// Network status (titlebar pill, the "slow network" banner, toasts) — was the top of settings.js.
// The settings window reads the last value through the netState store.
import { writable } from 'svelte/store';
import type { NetReport } from '../main/types';
import { toast } from './toast';
import { $ } from '../app/app-core';

export type NetInfo = NetReport;
export const NET_TH: Record<string, string> = { ok: 'ปกติ', slow: 'เน็ตช้า', stale: 'ราคาค้าง', down: 'หลุด', offline: 'ออฟไลน์' };
export const netState = writable<NetInfo | null>(null);

window.addEventListener('offline', () => toast('อินเทอร์เน็ตของเครื่องหลุด', 'error', 8000));
window.addEventListener('online', () => toast('อินเทอร์เน็ตกลับมาแล้ว', 'ok'));

let last: NetInfo | null = null, lastLevel = 'ok', bannerDismissed: string | null = null;
$('netbanner-x')!.onclick = () => { bannerDismissed = last && last.level; $('netbanner')!.classList.add('hidden'); };
vcg.onNet((n: NetInfo) => {
  last = n; netState.set(n);
  const el = $('net')!;
  el.className = n.level;
  $('net-text')!.textContent = n.rtt != null ? `${n.rtt} ms` : NET_TH[n.level]!;
  const c: Partial<NonNullable<NetReport['cpu']>> = n.cpu || {};
  el.title = `CPU: หน้าจอ ${c.ui ?? '—'}% · WebTrader ${c.webtrader ?? '—'}% · ตัวแอป ${c.app ?? '—'}% · GPU ${c.gpu ?? '—'}%\nสถานะ: ${NET_TH[n.level]}\nPing: ${n.rtt ?? '—'} ms\nราคาหน่วงเพิ่ม (เทียบตอนปกติ): ${n.feedDelay ?? '—'} ms\nราคาล่าสุด: ${n.lastTickAgo != null ? Math.round(n.lastTickAgo) + ' วินาทีที่แล้ว' : '—'}\nหลุดไปแล้ว: ${n.reconnects} ครั้ง`;
  const b = $('netbanner')!;
  if (n.level === 'ok') { b.classList.add('hidden'); bannerDismissed = null; }
  else if (bannerDismissed !== n.level) { b.className = n.level; $('netbanner-text')!.textContent = (n.detail || NET_TH[n.level]!); b.title = n.detail || ''; }
  if (n.level !== lastLevel) {
    if (n.level === 'ok') toast('การเชื่อมต่อกลับมาปกติ', 'ok');
    else if (n.level === 'down' || n.level === 'offline') toast(n.detail || NET_TH[n.level]!, 'error', 8000);   // slow/stale: the titlebar pill is enough
    lastLevel = n.level;
  }
});
