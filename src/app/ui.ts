import { PT, def } from '../pt';
import { back } from '../ui/back';
import { ui } from '../ui/registry';
import { view } from '../state';
import { ICON } from './icons';
import { $, S, store, qs, qsa, tgt, mk } from './app-core';
import { REPLAY } from './learn';
// Show/hide panels (everything closable), mobile layout, Esc closes popups.
(function () {
  const DEF = { side: true, tools: true, toolbar: true, bottom: true, zoom: true, legend: true, netbanner: true };
  const mobile = (vcg.platform as string) === 'android' || window.matchMedia('(max-width: 900px)').matches;
  if (mobile) document.body.classList.add('mobile');
  S.ui = { ...DEF, ...(mobile ? { side: false } : {}), ...store.get(mobile ? 'ui.m' : 'ui', {}) };
  function apply() {
    for (const k of Object.keys(DEF)) document.body.classList.toggle('hide-' + k, !S.ui[k]);
    $('side-btn').classList.toggle('on', !!S.ui.side);
    store.set(mobile ? 'ui.m' : 'ui', S.ui);
    setTimeout(() => { view.dirty = true; }, 50);
  }
  function setUI(k: string, v: boolean) { S.ui[k] = v; apply(); syncSettings(); }
  ui.setUI = setUI;
  function syncSettings() { qsa('[data-ui]').forEach((i) => { i.checked = !!S.ui[i.dataset.ui]; }); }
  qsa('[data-ui]').forEach((i) => (i.onchange = () => setUI(i.dataset.ui, i.checked)));
  $('settings-btn').addEventListener('click', () => setTimeout(syncSettings, 50));

  $('side-btn').innerHTML = ICON.svg('expand', 18);
  $('side-btn').onclick = () => setUI('side', !S.ui.side);
  $('side-collapse').innerHTML = ICON.svg('collapse', 16);
  $('side-collapse').onclick = () => setUI('side', false);

  // collapsed right panel → a slim rail of tab icons (desktop), like TradingView's right toolbar
  const RAIL = [['market', 'list', 'ราคา'], ['analysis', 'brain', 'วิเคราะห์'], ['practice', 'play', 'ฝึก'], ['calc', 'calc', 'คำนวณ'], ['log', 'logs', 'Log']];   // lessons + news are pages (titlebar buttons)
  $('side-rail').innerHTML = `<button data-open="" title="ขยายแถบด้านขวา">${ICON.svg('expand', 18)}</button><div class="sep"></div>` +
    RAIL.map(([t, i, n]) => `<button data-open="${t}" title="${n}">${ICON.svg(i, 18)}<span>${n}</span></button>`).join('');
  $('side-rail').querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => {
    setUI('side', true);
    if (b.dataset.open) qs(`#tabs [data-tab="${b.dataset.open}"]`).click();
  }));

  // drag the left edge of the right panel to resize it
  const MINW = 260, MAXW = 640;
  const applyW = (w: number) => { document.documentElement.style.setProperty('--side-w', Math.max(MINW, Math.min(MAXW, w)) + 'px'); };
  applyW(store.get('sideW', 330));
  $('side-resizer').addEventListener('pointerdown', (e) => {
    e.preventDefault(); const startX = e.clientX, startW = $('side').getBoundingClientRect().width;
    document.body.classList.add('resizing');
    const mv = (ev: { clientX: number; }) => { applyW(startW + (startX - ev.clientX)); view.dirty = true; };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); store.set('sideW', $('side').getBoundingClientRect().width); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  $('side-resizer').addEventListener('dblclick', () => { applyW(330); store.set('sideW', 330); });
  // opening a side tab on mobile shows the panel
  qsa('#tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => { if (!S.ui.side) setUI('side', true); }));

  // dropdown menus are positioned against their button (fixed), so the toolbar itself can scroll horizontally
  ['ind-menu', 'an-menu', 'cs-menu'].forEach((id) => {
    const m = $(id); if (!m) return;
    new MutationObserver(() => {
      if (m.classList.contains('hidden') || mobile) return;
      const btn = m.closest('.dropdown').querySelector('button'), r = btn.getBoundingClientRect();
      m.style.position = 'fixed'; m.style.top = (r.bottom + 4) + 'px';
      const w = m.offsetWidth || 280;
      m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, id === 'cs-menu' ? r.right - w : r.left)) + 'px';
      m.style.right = 'auto';
    }).observe(m, { attributes: true, attributeFilter: ['class'], childList: true });
  });

  // ✕ close buttons on popovers
  const addClose = (id: string) => {
    const p = $(id); if (!p) return;
    new MutationObserver(() => {
      if (p.querySelector(':scope > .pop-x')) return;
      const x = mk('button'); x.className = 'pop-x'; x.innerHTML = ICON.svg('x', 16); x.setAttribute('aria-label', 'ปิด'); x.title = 'ปิด (Esc)';
      x.onclick = (e) => { e.stopPropagation(); p.classList.add('hidden'); };
      p.prepend(x);
    }).observe(p, { childList: true });
  };
  ['ind-menu', 'an-menu', 'cs-menu', 'layers-pop'].forEach(addClose);

  // Esc closes every popup / menu / modal / flyout
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      qsa('.menu, .modal').forEach((m) => m.classList.add('hidden'));
      qsa('#tools .fly').forEach((f) => f.remove());
    }
    if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setUI('side', !S.ui.side); }
  });
  // Android back button: close popups → close side panel → minimise
  if (vcg.onBack) vcg.onBack(() => {
    if (back()) return;
    const open = [...qsa('.menu:not(.hidden), .modal:not(.hidden)')];
    if (open.length) open.forEach((m) => m.classList.add('hidden'));
    else if (qs('#tools .fly')) qsa('#tools .fly').forEach((f) => f.remove());
    else if (S.replay && typeof REPLAY !== 'undefined') REPLAY.exit();
    else if (S.ui.side && mobile) setUI('side', false);
    else vcg.minimize();
  });
  // phones: layout lives in mobile.ts (header, bottom nav, sheets)
  apply(); syncSettings();

  // ---------- collapsible sections in the side panel ----------
  // <details class="fold" data-fold="key">: remember open/closed
  const folds: Record<string, boolean> = store.get('folds', {});
  qsa('details.fold[data-fold]').forEach((d) => {
    const k = d.dataset.fold; if (k in folds) d.open = !!folds[k];
    d.addEventListener('toggle', () => { folds[k] = d.open; store.set('folds', folds); });
  });
  // rendered panels (analysis, practice…): click the first header to fold the panel; state kept per panel id
  const FOLDABLE = ['an-trend', 'an-bounce', 'an-signal', 'an-stats', 'quiz', 'sim', 'lesson-pack'];
  FOLDABLE.forEach((id) => { const p = $(id); if (!p) return; p.classList.add('foldable'); if (folds[id] === false) p.classList.add('folded'); });
  $('side').addEventListener('click', (e) => {
    const h = tgt(e).closest('.panel-h'); if (!h || tgt(e).closest('button, input, select, a, label')) return;
    const p = h.parentElement; if (!p || !p.classList.contains('foldable') || p.querySelector('.panel-h') !== h) return;
    const f = p.classList.toggle('folded'); folds[p.id] = !f; store.set('folds', folds);
  });
})();
