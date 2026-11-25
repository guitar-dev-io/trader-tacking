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

  $('side-btn').innerHTML = ICON.svg('layers', 18).replace('<svg', '<svg style="transform:rotate(90deg)"');
  $('side-btn').onclick = () => window.setUI('side', !S.ui.side);
  // opening a side tab on mobile shows the panel
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { if (!S.ui.side) window.setUI('side', true); }));

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
  apply(); syncSettings();
})();
