import { PT, def } from '../pt';
import { $, S, store, qs, qsa, tgt, mk } from './app-core';
def({ PAGES: [() => PAGES] });
// Page tabs (desktop): open a side-panel tab (บทเรียน, ข่าว, คำนวณ, ฝึก, วิเคราะห์, Log, ราคา) as a full page next to
// the chart, browser-style. The tab's own DOM node is moved, so everything inside keeps working; closing the page
// puts it back into the side panel.
const PAGES = (() => {
  if (document.body.classList.contains('mobile')) return { open(_k: string) {}, close(_k: string) {}, activate(_k: string) {}, register(_k: string, _n: string, _e: HTMLElement, _i?: string) {}, isOpen: (_k: string) => false, list: (): string[] => [], active: () => 'chart' };
  const NAMES: Record<string, any> = { market: 'ราคา', analysis: 'วิเคราะห์', practice: 'ฝึกเทรด', calc: 'คำนวณ', log: 'Log' };   // learn + news are pages of their own (src/pages/learn, src/pages/news)
  // Lucide icons (ISC license): maximize-2, x, chart-candlestick
  const svg = (d: string, s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    pop: '<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    chart: '<path d="M9 5v4"/><rect width="4" height="6" x="7" y="9" rx="1"/><path d="M9 15v2"/><path d="M17 3v2"/><rect width="4" height="8" x="15" y="5" rx="1"/><path d="M17 13v3"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/>',
  };
  const ICONS: Record<string, any> = {};
  const center = $('center'), side = $('side');
  const bar = mk('div'); bar.id = 'pagebar';
  const host = mk('div'); host.id = 'pages'; host.className = 'hidden';
  center.prepend(bar); center.appendChild(host);
  let busy = false;
  // pages without a side tab (e.g. the dashboard) — PAGES.register(key, name, element)
  const CUSTOM: Record<string, any> = {};
  const saved: string[] = store.get('pageTabs', []);
  let open: string[] = saved.filter((k) => NAMES[k]), active: string = store.get('pageActive', 'chart'), lastSide = 'market';
  const tabEl = (k: string) => CUSTOM[k] || $('tab-' + k), btn = (k: string) => qs(`#tabs button[data-tab="${k}"]`);

  function save() { store.set('pageTabs', open); store.set('pageActive', active); }
  function dock(k: string) {                          // page → side panel
    if (CUSTOM[k]) { const w = host.querySelector(`[data-page="${k}"]`); if (w) w.remove(); return; }
    const el = tabEl(k); if (!el) return;
    el.classList.remove('page-body'); el.classList.add('tab', 'hidden');
    const anchor = [...side.querySelectorAll(':scope > .tab')].pop();
    if (anchor) anchor.insertAdjacentElement('afterend', el); else side.appendChild(el);
    const b = btn(k); if (b) b.classList.remove('popped');
  }
  function undock(k: string) {                        // side panel → page
    const el = tabEl(k); if (!el) return;
    if (!CUSTOM[k]) { el.classList.remove('tab', 'hidden'); el.classList.add('page-body'); } else el.classList.remove('hidden');
    let wrap = host.querySelector(`[data-page="${k}"]`);
    if (!wrap) { wrap = mk('div'); wrap.className = 'page'; wrap.dataset.page = k; host.appendChild(wrap); }
    wrap.appendChild(el);
    const b = btn(k); if (b) b.classList.add('popped');
    if (b && b.classList.contains('active')) showSide(open.includes(lastSide) || lastSide === k ? firstDocked() : lastSide);
  }
  const firstDocked = () => Object.keys(NAMES).find((k) => !open.includes(k) && !CUSTOM[k]) || 'market';
  function showSide(k: string) { const b = btn(k); if (b) b.click(); }

  function render() {
    bar.classList.toggle('hidden', !open.length);
    bar.innerHTML = `<button class="pg ${active === 'chart' ? 'active' : ''}" data-pg="chart">${svg(IC.chart)}<span>กราฟ ${(S && S.symbol) || ''}</span></button>`
      + open.map((k) => `<button class="pg ${active === k ? 'active' : ''}" data-pg="${k}" title="${NAMES[k]} (คลิกกลางเพื่อปิด)">${ICONS[k] ? svg(ICONS[k]) : ''}<span>${NAMES[k]}</span><i class="pg-x" data-x="${k}" title="${CUSTOM[k] ? 'ปิด' : 'ปิด — กลับไปไว้ที่แถบด้านขวา'}">${svg(IC.x, 12)}</i></button>`).join('');
    const page = active !== 'chart' && open.includes(active);
    host.classList.toggle('hidden', !page);
    center.classList.toggle('paged', page);
    host.querySelectorAll('.page').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== active));
    window.dispatchEvent(new CustomEvent('pagechange', { detail: active }));
    if (!page) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));   // chart re-measures
  }
  function activate(k: string) {
    active = open.includes(k) ? k : 'chart'; save(); render();
    if (active !== 'chart') {
      const b = btn(active);
      // let the tab's own "on show" logic run (renderPlanner, lessons, news badge…); the click handler below
      // puts the side panel back on its own tab
      if (b && !busy) { busy = true; b.click(); busy = false; }
      const el = tabEl(active); if (el) el.scrollTop = 0;
    }
  }
  function openPage(k: string) {
    if (!NAMES[k]) return;
    if (!open.includes(k)) { open.push(k); undock(k); }
    activate(k);
  }
  function register(k: string, name: string, el: HTMLElement, icon?: string) {
    NAMES[k] = name; CUSTOM[k] = el; if (icon) ICONS[k] = icon;
    if (saved.includes(k) && !open.includes(k)) { open.splice(Math.min(saved.indexOf(k), open.length), 0, k); undock(k); }
    if (store.get('pageActive', 'chart') === k && open.includes(k)) activate(k); else render();
  }
  function closePage(k: string) {
    if (!open.includes(k)) return;
    open = open.filter((x) => x !== k); dock(k);
    if (active === k) active = open.length ? open[open.length - 1] : 'chart';
    save(); render();
  }

  // pop-out button in the side tab bar (opens the visible side tab as a page)
  const pop = mk('button'); pop.id = 'side-pop'; pop.className = 'ib'; pop.innerHTML = svg(IC.pop, 15);
  pop.title = 'เปิดแท็บนี้เป็นหน้าเต็ม (ดับเบิลคลิกชื่อแท็บก็ได้)';
  const coll = $('side-collapse'); (coll ? coll.parentElement.insertBefore(pop, coll) : $('tabs').appendChild(pop));
  pop.onclick = () => { const b = qs('#tabs button[data-tab].active'); if (b) openPage(b.dataset.tab); };
  qsa('#tabs button[data-tab]').forEach((b) => {
    b.addEventListener('dblclick', () => openPage(b.dataset.tab));
    b.addEventListener('click', () => {
      const k = b.dataset.tab;
      if (open.includes(k)) {        // tab lives on a page: show the page, keep the side panel on its last tab
        if (!busy) { busy = true; activate(k); busy = false; }
        setTimeout(() => { if (b.classList.contains('active')) showSide(open.includes(lastSide) ? firstDocked() : lastSide); }, 0);
      } else lastSide = k;
    });
  });
  bar.addEventListener('click', (e) => {
    const x = tgt(e).closest('[data-x]'); if (x) { e.stopPropagation(); return closePage(x.dataset.x); }
    const p = tgt(e).closest('[data-pg]'); if (p) activate(p.dataset.pg);
  });
  bar.addEventListener('auxclick', (e) => { const p = tgt(e).closest('[data-pg]'); if (e.button === 1 && p && p.dataset.pg !== 'chart') closePage(p.dataset.pg); });
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey && e.key === 'Tab') || !open.length) return;
    e.preventDefault(); const all = ['chart', ...open], i = all.indexOf(active);
    activate(all[(i + (e.shiftKey ? all.length - 1 : 1)) % all.length]);
  });
  // symbol shown on the chart tab
  setInterval(() => { const t = bar.querySelector('[data-pg=chart] span'); if (t && S && t.textContent !== 'กราฟ ' + S.symbol) t.textContent = 'กราฟ ' + S.symbol; }, 1000);

  open.forEach(undock); render();
  if (open.length && !open.includes(active)) active = 'chart';
  return { open: openPage, close: closePage, activate, register, isOpen: (k: string) => open.includes(k), list: () => open.slice(), active: () => active };
})();
export { PAGES };
