// Dashboard page (Svelte): several live charts (any symbol / timeframe), quotes, my MT5 orders, news, calendar,
// session clock, bounce zones, alerts and notes. Widgets are added from a catalog, dragged to reorder, resized,
// and saved as named layouts. Desktop: a page tab (titlebar button, Ctrl/⌘+D). Phone: a full-screen page.
import { mount, flushSync } from 'svelte';
import { PT, def } from '../../pt';
import { ui } from '../../ui/registry';
import { toast } from '../../ui/toast';
import { S } from '../../state';
import { pages, lazyMount, type PageApi } from '../registry';
import { $ } from '../../../app-core.js';
import { switchSymbol } from '../../../app-data.js';
import { PAGES } from '../../../pages.js';
import Dashboard from './Dashboard.svelte';
import { IC, svg } from './icons';
import { feeds, onMsg, tickFeeds } from './feeds';
import { dash, mobile, TYPES, PRESETS, layout, save, mk, uid, quote, quoteSyms, sparks } from './model.svelte';

export const DASH: PageApi = (() => {
  const root = document.createElement('div'); root.id = 'dashboard'; root.className = 'dash' + (mobile ? ' m-full hidden' : '');

  function add(type: string, opts?: Record<string, any>) {
    ensure(); const w = mk(type, undefined, undefined, opts); layout().push(w); save(); flushSync();
    const el = root.querySelector<HTMLElement>(`.wd[data-id="${w.id}"]`);
    if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); }
    toast(`เพิ่ม ${TYPES[type].name} แล้ว`, 'ok', 1800);
    return w;
  }
  function remove(id: string) {
    const L = layout(), i = L.findIndex((x) => x.id === id); if (i < 0) return;
    ensure(); const [w] = L.splice(i, 1); try { localStorage.removeItem('dash.note.' + id); } catch (_) { /* private mode */ }
    save(); flushSync(); return w;
  }
  function duplicate(id: string) { const L = layout(), i = L.findIndex((x) => x.id === id); if (i < 0) return; L.splice(i + 1, 0, { ...L[i], id: uid(), opts: { ...L[i].opts } }); save(); flushSync(); }
  function move(id: string, dir: number) {          // mobile up/down
    const L = layout(), i = L.findIndex((x) => x.id === id), j = i + dir; if (i < 0 || j < 0 || j >= L.length) return;
    [L[i], L[j]] = [L[j], L[i]]; save(); flushSync();
  }
  function openMain(sym: string, tf?: number) {
    if (sym && sym !== S.symbol) switchSymbol(sym);
    if (tf != null) { const b = document.querySelector<HTMLElement>(`#tfs button[data-t="${tf}"]`); if (b && !b.classList.contains('active')) b.click(); }
    if (mobile) close(); else PAGES.activate('chart');
  }
  function setEdit(on: boolean) { ensure(); dash.editing = on; if (!on) dash.catOpen = false; flushSync(); }

  const ensure = lazyMount(() => mount(Dashboard, { target: root, props: { rootEl: root, onclose: () => close(), onsym: openMain, onadd: (t: string) => { add(t); }, onrm: (id: string) => { remove(id); }, ondup: duplicate, onmove: move } }));

  // live refresh: feeds + list widgets, only while the dashboard is visible
  setInterval(() => {
    for (const s of new Set(layout().filter((w) => w.type === 'quotes').flatMap((w) => quoteSyms(w.opts)))) {
      const q = quote(s); if (!q) continue; const a = sparks.get(s) || []; if (a[a.length - 1] !== q.bid || a.length < 2) { a.push(q.bid); if (a.length > 90) a.shift(); sparks.set(s, a); }
    }
    if (!dash.active) return;
    tickFeeds();
    dash.tick++;
  }, 1000);

  // ------------------------------------------------------------ open / close (desktop page tab, mobile overlay)
  let sideWas: boolean | null = null;
  function setActive(on: boolean) {
    if (on === dash.active) return; if (on) ensure(); dash.active = on;
    // give the widgets the whole width: fold the side panel while the dashboard is open, restore it after
    if (!mobile && ui.setUI && S.ui) {
      if (on) { sideWas = !!S.ui.side; if (sideWas) ui.setUI('side', false); }
      else if (sideWas) { ui.setUI('side', true); sideWas = null; }
    }
  }
  function open() {
    if (mobile) { root.classList.remove('hidden'); document.body.classList.add('dash-open'); setActive(true); return; }
    PAGES.open('dashboard');
  }
  function close() {
    if (mobile) { root.classList.add('hidden'); document.body.classList.remove('dash-open'); setActive(false); return; }
    PAGES.activate('chart');
  }
  if (mobile) document.body.appendChild(root);
  else {
    PAGES.register('dashboard', 'แดชบอร์ด', root, IC.grid);
    window.addEventListener('pagechange', (e) => setActive((e as CustomEvent).detail === 'dashboard'));
    setActive(PAGES.active() === 'dashboard');
    // titlebar button
    const tb = $('theme-btn'), btn = document.createElement('button');
    btn.id = 'dash-btn'; btn.className = 'ib'; btn.title = 'แดชบอร์ด — หลายกราฟ + widget (Ctrl/⌘ + D)'; btn.innerHTML = svg(IC.grid, 16);
    btn.onclick = () => (PAGES.active() === 'dashboard' ? close() : open());
    if (tb) tb.before(btn);
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement).tagName)) { e.preventDefault(); btn.click(); }
    });
  }
  return {
    open, close, onMsg, add, remove, layout, isOpen: () => dash.active,
    feeds: () => [...feeds.values()].map((f) => ({ sym: f.sym, tf: f.tf, slot: f.slot, n: f.candles.length, err: f.err })),
    setEdit, isActive: () => dash.active, cfg: () => dash.cfg, PRESETS: Object.keys(PRESETS), TYPES: Object.keys(TYPES),
  };
})();
pages.dash = DASH;
def({ DASH: [() => DASH] });
