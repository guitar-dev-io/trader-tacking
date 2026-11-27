import { onBack } from '../../ui/back';
// "ผลการเทรด" page (Svelte). Desktop: a page tab (titlebar button, Ctrl/⌘+J). Phone: a full-screen page from the
// More page. "ดูตัวอย่าง" shows sample data.
import { mount, flushSync } from 'svelte';
import { PT, def } from '../../pt';
import { ui } from '../../ui/registry';
import { toast } from '../../ui/toast';
import { S, store, view } from '../../state';
import { pages, lazyMount, type PageApi } from '../registry';
import type { Trade } from '../../core/journal';
import { JOURNAL } from '../../legacy/core';
import { ICON } from '../../../icons.js';
import { $, TFS, drawings } from '../../../app-core.js';
import { chart } from '../../../app-chart.js';
import { switchSymbol } from '../../../app-data.js';
import { SETUP } from '../../ui/setup/index';
import { PAGES } from '../../../pages.js';
import Journal from './Journal.svelte';
import { jr, load, compute, setRange, money, tz } from './model.svelte';

export const JOURNALPAGE: PageApi = (() => {
  const mobile = document.body.classList.contains('mobile');
  const vcg = (window as any).vcg;
  const inner = (n: string) => (ICON.svg(n, 14) || '').replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const root = document.createElement('div'); root.id = 'journal-page'; root.className = 'jr' + (mobile ? ' m-full hidden' : '');
  let shown = false;
  const render = () => { ensure(); flushSync(); };
  const reload = () => load().then(render);

  async function act(a: string) {
    if (a === 'sample') { jr.sampleMode = !jr.sampleMode; store.set('jr.sample', jr.sampleMode); jr.raw = null; render(); await reload(); }
    else if (a === 'sync') {
      if (!vcg.journalSync) return;
      jr.raw = { ...jr.raw, syncing: true }; render();
      try { const r = await vcg.journalSync(); toast(r.state === 'error' ? r.msg : r.added ? `ซิงค์แล้ว +${r.added} รายการ` : 'ซิงค์แล้ว — ไม่มีรายการใหม่', r.state === 'error' ? 'warn' : 'ok'); } catch (e) { toast('ซิงค์ไม่สำเร็จ: ' + (e as Error).message, 'warn'); }
      await reload();
    } else if (a === 'csv') {
      const text = JOURNAL.csv(jr.raw ? compute().ts : []);
      if (vcg.journalExport && !jr.sampleMode) { const p = await vcg.journalExport(text); if (p) toast('บันทึกแล้ว: ' + p, 'ok'); }
      else { const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })), aEl = document.createElement('a'); aEl.href = url; aEl.download = 'trades.csv'; aEl.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
    } else if (a === 'guide') { if (typeof SETUP !== 'undefined') SETUP.open('mt5', 3); }
  }

  // open the trade on the main chart: its symbol, a timeframe that fits its duration, entry/exit arrows
  function showOnChart(t: Trade) {
    const sec = t.duration || 3600, tfi = Math.max(0, TFS.findIndex((x) => x.label === (sec < 3 * 3600 ? '5m' : sec < 2 * 86400 ? '1H' : '4H')));
    if (mobile) close(); else PAGES.activate('chart');
    const sym = jr.sampleMode ? S.symbol : t.s;
    if (sym !== S.symbol) switchSymbol(sym);
    if (S.tf !== tfi) { const b = document.querySelector<HTMLElement>(`#tfs button[data-t="${tfi}"]`); if (b) b.click(); }
    window.dispatchEvent(new CustomEvent('journal-trade', { detail: { pos: t.pos, s: sym, tf: TFS[tfi].label } }));
    const span = TFS[tfi].sec, start = Date.now();
    (function place() {
      const c: { time: number }[] = S.candles || [];
      const ready = c.length > 1 && c[c.length - 1].time - c[c.length - 2].time === span && (t.open == null || c[0].time <= t.open + tz());
      if (!ready && Date.now() - start < 4000) { setTimeout(place, 250); return; }
      const snap = (time: number) => { let best: number | null = null; for (const x of c) { if (x.time <= time) best = x.time; else break; } return best ?? (c[0] && c[0].time); };
      PT.drawings = drawings.filter((x: { by?: string }) => x.by !== 'journal');
      const color = t.side === 'buy' ? '#2962ff' : '#e91e63';
      if (t.open != null && t.openPrice != null) drawings.push({ id: 'jr-in-' + t.pos, type: t.side === 'buy' ? 'arrowUp' : 'arrowDown', pts: [{ time: snap(t.open + tz()), price: t.openPrice }], color, by: 'journal' });
      if (t.close != null && t.closePrice != null) drawings.push({ id: 'jr-out-' + t.pos, type: 'text', pts: [{ time: snap(t.close + tz()), price: t.closePrice }], text: `ปิด ${money(t.net)}`, color: t.net >= 0 ? '#26a69a' : '#ef5350', by: 'journal' });
      view.dirty = true;
      try { if (c.length && t.close) chart.timeScale().setVisibleRange({ from: (t.open ?? t.close) + tz() - span * 40, to: t.close + tz() + span * 20 }); } catch (_) { /* chart not ready */ }
    })();
  }

  const ensure = lazyMount(() => mount(Journal, { target: root, props: { mobile, onclose: () => close(), onact: (a: string) => { void act(a); }, ontrade: showOnChart } }));

  // ------------------------------------------------------------ page plumbing
  async function open() {
    ensure();
    if (mobile) {
      if (pages.learn && pages.learn.isOpen()) pages.learn.close();
      if (pages.news && pages.news.isOpen()) pages.news.close();
      if (pages.dash && document.body.classList.contains('dash-open')) pages.dash.close();
      root.classList.remove('hidden'); document.body.classList.add('jr-open');
    } else PAGES.open('journal');
    shown = true; await reload();
  }
  function close() {
    shown = false;
    if (mobile) { root.classList.add('hidden'); document.body.classList.remove('jr-open'); return; }
    if (PAGES.active() === 'journal') PAGES.activate('chart');
  }
  const visible = () => (mobile ? !root.classList.contains('hidden') : PAGES.active && PAGES.active() === 'journal');
  if (mobile) {
    document.body.appendChild(root);
    onBack(() => { if (visible()) { close(); return true; } return false; });
  } else {
    const btn = document.createElement('button');
    btn.id = 'journal-btn'; btn.className = 'ib'; btn.title = 'ผลการเทรด — สรุปกำไร/ขาดทุน รายวัน รายเดือน จาก MT5 (Ctrl/⌘ + J)';
    btn.innerHTML = ICON.html('wallet', 16);
    btn.onclick = () => (visible() ? close() : open());
    const anchor = $('dash-btn') || $('theme-btn'); if (anchor) anchor.before(btn);
    PAGES.register('journal', 'ผลการเทรด', root, inner('wallet'));
    // full width while the journal is shown: fold the side panel, restore it when back on the chart
    let sideWas: boolean | null = null;
    window.addEventListener('pagechange', (e) => {
      const k = (e as CustomEvent).detail;
      if (!ui.setUI || !S.ui) return;
      if (k === 'journal' && sideWas === null) { sideWas = !!S.ui.side; if (sideWas) ui.setUI('side', false); }
      else if (k === 'chart' && sideWas !== null) { if (sideWas) ui.setUI('side', true); sideWas = null; }
    });
    window.addEventListener('pagechange', (e) => { const k = (e as CustomEvent).detail; btn.classList.toggle('on', k === 'journal'); if (k === 'journal' && !shown) { shown = true; void reload(); } else if (k !== 'journal' && shown) shown = false; });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement).tagName)) { e.preventDefault(); btn.click(); }
    });
  }
  if (vcg.onJournal) vcg.onJournal(() => { if (visible() && !jr.sampleMode) void reload(); });
  // keep "sync" state fresh while the page is open (backfill progress)
  setInterval(() => { if (visible() && !jr.sampleMode && jr.raw && jr.raw.status && jr.raw.status.state === 'backfill') void reload(); }, 3000);

  return {
    open, close, render, isOpen: visible,
    sample: (on: boolean) => { jr.sampleMode = !!on; store.set('jr.sample', jr.sampleMode); jr.raw = null; return reload(); },
    setRange: (r: string) => { setRange(r); render(); }, data: () => (jr.raw ? compute() : null), showOnChart,
  };
})();
pages.journal = JOURNALPAGE;
def({ JOURNALPAGE: [() => JOURNALPAGE] });
