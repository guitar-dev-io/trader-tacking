/* global S, store, $, ICON, vcg, chart, dirty:writable */
// Show/hide panels (everything closable), mobile layout, Esc closes popups.
(function () {
  const DEF = { side: true, tools: true, toolbar: true, bottom: true, zoom: true, legend: true, netbanner: true };
  const mobile = vcg.platform === 'android' || window.matchMedia('(max-width: 900px)').matches;
  if (mobile) document.body.classList.add('mobile');
  S.ui = { ...DEF, ...(mobile ? { side: false } : {}), ...store.get(mobile ? 'ui.m' : 'ui', {}) };
  function apply() {
    for (const k of Object.keys(DEF)) document.body.classList.toggle('hide-' + k, !S.ui[k]);
    $('side-btn').classList.toggle('on', !!S.ui.side);
    store.set(mobile ? 'ui.m' : 'ui', S.ui);
    setTimeout(() => { dirty = true; }, 50);
  }
  window.setUI = (k, v) => { S.ui[k] = v; apply(); syncSettings(); };
  function syncSettings() { document.querySelectorAll('[data-ui]').forEach((i) => { i.checked = !!S.ui[i.dataset.ui]; }); }
  document.querySelectorAll('[data-ui]').forEach((i) => (i.onchange = () => window.setUI(i.dataset.ui, i.checked)));
  $('settings-btn').addEventListener('click', () => setTimeout(syncSettings, 50));

  $('side-btn').innerHTML = ICON.svg('expand', 18);
  $('side-btn').onclick = () => window.setUI('side', !S.ui.side);
  $('side-collapse').innerHTML = ICON.svg('collapse', 16);
  $('side-collapse').onclick = () => window.setUI('side', false);

  // collapsed right panel → a slim rail of tab icons (desktop), like TradingView's right toolbar
  const RAIL = [['market', 'list', 'ราคา'], ['analysis', 'brain', 'วิเคราะห์'], ['practice', 'play', 'ฝึก'], ['calc', 'calc', 'คำนวณ'], ['learn', 'book', 'บทเรียน'], ['log', 'logs', 'Log']];
  $('side-rail').innerHTML = `<button data-open="" title="ขยายแถบด้านขวา">${ICON.svg('expand', 18)}</button><div class="sep"></div>` +
    RAIL.map(([t, i, n]) => `<button data-open="${t}" title="${n}">${ICON.svg(i, 18)}<span>${n}</span></button>`).join('');
  $('side-rail').querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => {
    window.setUI('side', true);
    if (b.dataset.open) document.querySelector(`#tabs [data-tab="${b.dataset.open}"]`).click();
  }));

  // drag the left edge of the right panel to resize it
  const MINW = 260, MAXW = 640;
  const applyW = (w) => { document.documentElement.style.setProperty('--side-w', Math.max(MINW, Math.min(MAXW, w)) + 'px'); };
  applyW(store.get('sideW', 330));
  $('side-resizer').addEventListener('pointerdown', (e) => {
    e.preventDefault(); const startX = e.clientX, startW = $('side').getBoundingClientRect().width;
    document.body.classList.add('resizing');
    const mv = (ev) => { applyW(startW + (startX - ev.clientX)); dirty = true; };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); store.set('sideW', $('side').getBoundingClientRect().width); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  $('side-resizer').addEventListener('dblclick', () => { applyW(330); store.set('sideW', 330); });
  // opening a side tab on mobile shows the panel
  document.querySelectorAll('#tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => { if (!S.ui.side) window.setUI('side', true); }));

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
  const addClose = (id) => {
    const p = $(id); if (!p) return;
    new MutationObserver(() => {
      if (p.querySelector(':scope > .pop-x')) return;
      const x = document.createElement('button'); x.className = 'pop-x'; x.textContent = '✕'; x.title = 'ปิด (Esc)';
      x.onclick = (e) => { e.stopPropagation(); p.classList.add('hidden'); };
      p.prepend(x);
    }).observe(p, { childList: true });
  };
  ['ind-menu', 'an-menu', 'cs-menu', 'layers-pop'].forEach(addClose);

  // Esc closes every popup / menu / modal / flyout
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.menu, .modal').forEach((m) => m.classList.add('hidden'));
      document.querySelectorAll('#tools .fly').forEach((f) => f.remove());
    }
    if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); window.setUI('side', !S.ui.side); }
  });
  // Android back button: close popups → close side panel → minimise
  if (vcg.onBack) vcg.onBack(() => {
    const open = [...document.querySelectorAll('.menu:not(.hidden), .modal:not(.hidden)')];
    if (open.length) open.forEach((m) => m.classList.add('hidden'));
    else if (document.querySelector('#tools .fly')) document.querySelectorAll('#tools .fly').forEach((f) => f.remove());
    else if (S.replay && typeof REPLAY !== 'undefined') REPLAY.exit();
    else if (S.ui.side && mobile) window.setUI('side', false);
    else vcg.minimize();
  });
  // phones: tabs become a bottom navigation bar (กราฟ | ราคา | วิเคราะห์ | ฝึก | คำนวณ | บทเรียน | Log)
  if (mobile) {
    const tabs = $('tabs'); document.body.appendChild(tabs); tabs.classList.add('mnav');
    const IC = { market: 'list', analysis: 'brain', practice: 'play', calc: 'calc', learn: 'book', log: 'logs' };
    tabs.querySelectorAll('button[data-tab]').forEach((b) => {
      const name = b.dataset.tab === 'log' ? 'Log' : b.textContent.trim();
      b.innerHTML = ICON.svg(IC[b.dataset.tab], 20) + `<span>${name}</span>` + (b.dataset.tab === 'log' ? '<span id="log-badge"></span>' : '');
    });
    tabs.insertAdjacentHTML('afterbegin', `<button data-mtab="chart">${ICON.svg('candles', 20)}<span>กราฟ</span></button>`);
    const chartBtn = tabs.querySelector('[data-mtab="chart"]');
    const sync = () => { chartBtn.classList.toggle('active', !S.ui.side); tabs.querySelectorAll('button[data-tab]').forEach((b) => b.classList.toggle('on', S.ui.side && b.classList.contains('active'))); };
    chartBtn.onclick = () => { window.setUI('side', false); sync(); };
    tabs.querySelectorAll('button[data-tab]').forEach((b) => b.addEventListener('click', () => setTimeout(sync, 0)));
    const _set = window.setUI; window.setUI = (k, v) => { _set(k, v); sync(); };
    sync();
  }
  apply(); syncSettings();
})();
