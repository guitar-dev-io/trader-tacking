/* global S, store, $, ICON, vcg, chart, dirty:writable, TOOLS, GROUPS, setTool, undo, switchSymbol, fmt, esc, toast, setSource, REPLAY, openIndicatorMenu, openAnalysisMenu, SETUP */
// Phone layout (Android app / narrow windows). The desktop UI is a TradingView-style workstation; on a phone we
// re-arrange the same parts into a mobile shell instead of shrinking the desktop:
//   header: symbol (tap → symbol sheet) · price · change · status dot
//   TF row: timeframe chips + indicator (ƒx), analysis (🎯) and "more chart options" (⋯) buttons
//   chart: full height, pinch/drag; a ✏️ button opens the drawing tools sheet, an active tool shows a pill with ✕ / undo
//   bottom nav: กราฟ · ราคา · วิเคราะห์ · ฝึก · เพิ่มเติม (คำนวณ, บทเรียน, Log, ตั้งค่า, แหล่งข้อมูล, login)
// Pages (ราคา, วิเคราะห์ …) open full screen with a title bar; menus open as bottom sheets.
(function () {
  if (!document.body.classList.contains('mobile')) return;
  document.body.classList.add('m2');
  const on = (el, ev, f) => el && el.addEventListener(ev, f);

  // ------------------------------------------------------------ bottom sheet
  const sheet = document.createElement('div');
  sheet.id = 'msheet'; sheet.className = 'hidden';
  sheet.innerHTML = '<div class="ms-back"></div><div class="ms-panel"><div class="ms-grab"></div><div class="ms-head"><b class="ms-title"></b><button class="ms-x" aria-label="ปิด">✕</button></div><div class="ms-body"></div></div>';
  document.body.appendChild(sheet);
  let borrowed = null, borrowedHome = null, watch = null, onCloseCb = null;
  function closeSheet() {
    if (sheet.classList.contains('hidden')) return;
    sheet.classList.add('hidden');
    if (watch) { watch.disconnect(); watch = null; }
    if (borrowed) { borrowed.classList.add('hidden'); borrowed.classList.remove('in-sheet'); borrowedHome.appendChild(borrowed); borrowed = null; }
    const cb = onCloseCb; onCloseCb = null; if (cb) cb();
  }
  // content: an HTML string, or an existing element (e.g. #ind-menu) that is borrowed and put back on close
  function openSheet(title, content, { onClose } = {}) {
    closeSheet();
    sheet.querySelector('.ms-title').textContent = title;
    const body = sheet.querySelector('.ms-body'); body.innerHTML = '';
    if (typeof content === 'string') body.innerHTML = content;
    else {
      borrowed = content; borrowedHome = content.parentNode;
      content.classList.remove('hidden'); content.classList.add('in-sheet'); content.style.cssText = '';
      body.appendChild(content);
      // the menu's own code hides it (✕ / outside click) → close the sheet too
      watch = new MutationObserver(() => { if (content.classList.contains('hidden')) closeSheet(); });
      watch.observe(content, { attributes: true, attributeFilter: ['class'] });
    }
    onCloseCb = onClose || null;
    sheet.classList.remove('hidden');
    return body;
  }
  on(sheet.querySelector('.ms-back'), 'click', closeSheet);
  on(sheet.querySelector('.ms-x'), 'click', closeSheet);
  // swipe the grab bar down to close
  (() => { let y0 = null; const g = sheet.querySelector('.ms-head');
    on(g, 'touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    on(g, 'touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 60) closeSheet(); y0 = null; }); })();
  window.MSHEET = { open: openSheet, close: closeSheet, isOpen: () => !sheet.classList.contains('hidden') };

  // ------------------------------------------------------------ header + timeframe row
  const tb = $('titlebar');
  $('sym-title').insertAdjacentHTML('afterbegin', '');
  $('cur-sym').insertAdjacentHTML('afterend', '<span class="m-caret">▾</span>');
  on($('sym-title'), 'click', () => openSymbols());
  const row = document.createElement('div'); row.id = 'mtfrow';
  row.innerHTML = `<div class="m-tfs"></div><div class="m-acts">
    <button data-m="ind" aria-label="อินดิเคเตอร์">${ICON.svg('fx', 20)}</button>
    <button data-m="an" aria-label="วิเคราะห์บนกราฟ">${ICON.svg('brain', 20)}</button>
    <button data-m="opts" aria-label="ตัวเลือกกราฟ"><span class="m-dots">⋯</span></button></div>`;
  tb.after(row);
  // network warning: a thin strip under the timeframe row instead of squeezing the price header
  if ($('netbanner')) document.body.appendChild($('netbanner'));
  row.querySelector('.m-tfs').appendChild($('tfs'));
  on(row.querySelector('[data-m=ind]'), 'click', (e) => { e.stopPropagation(); openIndicatorMenu(); openSheet('อินดิเคเตอร์', $('ind-menu')); });
  on(row.querySelector('[data-m=an]'), 'click', (e) => { e.stopPropagation(); openAnalysisMenu(); openSheet('แสดงบนกราฟ', $('an-menu')); });
  on(row.querySelector('[data-m=opts]'), 'click', (e) => { e.stopPropagation(); openOptions(); });
  // keep the selected timeframe chip in view
  const centerTf = () => { const a = $('tfs').querySelector('.active'); if (a) a.scrollIntoView({ inline: 'center', block: 'nearest' }); };
  setTimeout(centerTf, 300); on($('tfs'), 'click', () => setTimeout(centerTf, 50));

  // ------------------------------------------------------------ chart: draw button + active-tool pill
  const wrap = $('chart-wrap');
  wrap.insertAdjacentHTML('beforeend', `<button id="m-draw" aria-label="เครื่องมือวาด">${ICON.svg('trend', 22)}</button>
    <div id="m-pill" class="hidden"><span class="mp-ic"></span><span class="mp-t"></span><button class="mp-undo" aria-label="ย้อนกลับ">↶</button><button class="mp-x" aria-label="เลิกวาด">✕</button></div>`);
  on($('m-draw'), 'click', openTools);
  on(wrap.querySelector('.mp-x'), 'click', () => setTool('cursor'));
  on(wrap.querySelector('.mp-undo'), 'click', () => { undo(); dirty = true; });
  const HINT = { trend: 'แตะ 2 จุด', ray: 'แตะ 2 จุด', hline: 'แตะที่ราคา', vline: 'แตะที่เวลา', channel: 'แตะ 3 จุด', fib: 'แตะจุดเริ่ม แล้วจุดจบ', fibext: 'แตะ 3 จุด', rect: 'แตะ 2 มุม', brush: 'ลากเพื่อวาด',
    long: 'แตะ Entry แล้ว SL', short: 'แตะ Entry แล้ว SL', text: 'แตะตำแหน่งข้อความ', arrowUp: 'แตะเพื่อวาง', arrowDown: 'แตะเพื่อวาง', measure: 'แตะ 2 จุด', alert: 'แตะที่ราคา' };
  function syncPill() {
    const t = S.tool, p = $('m-pill'), drawing = t && t !== 'cursor';
    p.classList.toggle('hidden', !drawing); $('m-draw').classList.toggle('on', drawing);
    if (drawing) { p.querySelector('.mp-ic').innerHTML = ICON.svg(TOOLS[t].icon, 16); p.querySelector('.mp-t').textContent = `${TOOLS[t].name.split(' (')[0].split(' ·')[0]} · ${HINT[t] || ''}`; }
  }
  const _setTool = window.setTool;
  window.setTool = function (t) { _setTool(t); syncPill(); };
  // draw.js calls setTool internally (e.g. back to cursor after a drawing) through its own binding → poll cheaply
  let lastTool = S.tool; setInterval(() => { if (S.tool !== lastTool) { lastTool = S.tool; syncPill(); } }, 250);

  function openTools() {
    const body = openSheet('เครื่องมือวาด', `<div class="m-tools">${GROUPS.flat().filter((k) => TOOLS[k]).map((k) =>
      `<button data-t="${k}" class="${S.tool === k ? 'on' : ''}">${ICON.svg(TOOLS[k].icon, 22)}<span>${esc(TOOLS[k].name.split(' (')[0].split(' ·')[0])}</span></button>`).join('')}</div>
      <div class="m-row2"><label class="m-switch"><input type="checkbox" id="m-magnet" ${S.magnet ? 'checked' : ''}> Magnet (ดูดเข้าราคา)</label>
      <button id="m-layers">รูปวาดทั้งหมด</button><button id="m-undo">↶ ย้อน</button></div>`);
    body.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { setTool(b.dataset.t); closeSheet(); }));
    body.querySelector('#m-magnet').onchange = (e) => { S.magnet = e.target.checked; store.set('magnet', S.magnet); const m = $('magnet'); if (m) m.checked = S.magnet; };
    body.querySelector('#m-undo').onclick = () => { undo(); dirty = true; };
    body.querySelector('#m-layers').onclick = () => { closeSheet(); const b = $('t-layers'); if (b) b.click(); };
  }

  // ------------------------------------------------------------ chart options sheet (⋯)
  function openOptions() {
    const ct = $('ctype').value;
    const body = openSheet('ตัวเลือกกราฟ', `
      <div class="m-sec">รูปแบบกราฟ</div>
      <div class="m-seg">${[['candles', 'แท่งเทียน'], ['ha', 'Heikin Ashi'], ['bars', 'Bars'], ['line', 'เส้น'], ['area', 'Area']].map(([v, n]) => `<button data-ct="${v}" class="${ct === v ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="m-sec">ช่วงเวลา</div><div class="m-seg m-ranges"></div>
      <div class="m-sec">สเกลราคา</div>
      <div class="m-seg">${[['auto', 'อัตโนมัติ'], ['log', 'Log'], ['pct', '%']].map(([v, n]) => `<button data-sc="${v}">${n}</button>`).join('')}</div>
      <div class="m-list">
        <label class="m-switch"><input type="checkbox" data-chk="show-ask" ${$('show-ask').checked ? 'checked' : ''}> แสดงราคา Ask</label>
        <button data-a="replay">⏪ Bar Replay (ย้อนดูทีละแท่ง)</button>
        <button data-a="settings">⚙️ ตั้งค่ากราฟ (สี, เส้นตาราง, Session, Fibo)</button>
        <button data-a="shot">📷 บันทึกภาพกราฟ</button>
        <button data-a="reset">↺ รีเซ็ตมุมมองกราฟ</button>
      </div>`);
    // ranges: reuse the desktop buttons' click handlers
    const rs = body.querySelector('.m-ranges');
    document.querySelectorAll('#ranges button').forEach((b) => { const c = document.createElement('button'); c.textContent = b.textContent; c.onclick = () => { b.click(); closeSheet(); }; rs.appendChild(c); });
    document.querySelectorAll('#bottombar [data-scale]').forEach((b) => { const m = body.querySelector(`[data-sc="${b.dataset.scale}"]`); if (m) { m.classList.toggle('on', b.classList.contains('active')); m.onclick = () => { b.click(); body.querySelectorAll('[data-sc]').forEach((x) => x.classList.toggle('on', x === m)); }; } });
    body.querySelectorAll('[data-ct]').forEach((b) => (b.onclick = () => { $('ctype').value = b.dataset.ct; $('ctype').dispatchEvent(new Event('change')); body.querySelectorAll('[data-ct]').forEach((x) => x.classList.toggle('on', x === b)); }));
    body.querySelector('[data-chk=show-ask]').onchange = (e) => { $('show-ask').checked = e.target.checked; $('show-ask').dispatchEvent(new Event('change')); };
    body.querySelector('[data-a=replay]').onclick = (e) => { e.stopPropagation(); closeSheet(); goChart(); const b = document.querySelector('[data-sim="replay"], #rp-btn, [data-r="pick"]'); if (b) b.click(); else if (typeof REPLAY !== 'undefined') REPLAY.pick(); };
    body.querySelector('[data-a=settings]').onclick = (e) => { e.stopPropagation(); closeSheet(); $('cs-btn').click(); openSheet('ตั้งค่ากราฟ', $('cs-menu')); };
    body.querySelector('[data-a=shot]').onclick = () => { closeSheet(); $('shot').click(); };
    body.querySelector('[data-a=reset]').onclick = () => { closeSheet(); const b = document.querySelector('#zoombar [data-z=reset]'); if (b) b.click(); };
  }

  // ------------------------------------------------------------ symbol sheet
  function openSymbols() {
    const syms = [...new Set([S.symbol, ...(S.symbols || []), ...Object.keys(S.quotes)])].filter(Boolean);
    const row = (s) => { const q = S.quotes[s]; const ch = q && isFinite(q.changePct) ? q.changePct : null;
      return `<button data-s="${esc(s)}" class="${s === S.symbol ? 'on' : ''}"><b>${esc(s)}</b><span class="ms-px">${q ? fmt(q.bid, q.digits) : '—'}</span><span class="${ch > 0 ? 'up' : ch < 0 ? 'down' : 'muted'}">${ch == null ? '' : (ch > 0 ? '+' : '') + ch.toFixed(2) + '%'}</span></button>`; };
    const body = openSheet('เลือก Symbol', `<form class="m-add"><input placeholder="เพิ่ม symbol เช่น GBPUSD, BTCUSD" autocomplete="off" autocapitalize="characters"><button>เพิ่ม</button></form>
      <div class="m-syms">${syms.map(row).join('')}</div><p class="muted m-note">แตะเพื่อเปิดกราฟ · จัดการรายการ/แจ้งเตือนราคาได้ที่แท็บ "ราคา"</p>`);
    body.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { switchSymbol(b.dataset.s); closeSheet(); goChart(); }));
    body.querySelector('.m-add').onsubmit = (e) => { e.preventDefault(); const v = e.target.querySelector('input').value.trim().toUpperCase(); if (!v) return; vcg.addSymbol(v); switchSymbol(v); closeSheet(); goChart(); };
  }

  // ------------------------------------------------------------ pages + bottom nav
  const side = $('side');
  side.insertAdjacentHTML('afterbegin', '<div id="m-page-h"><button class="mph-back" aria-label="กลับ">‹</button><b class="mph-t"></b></div>');
  side.insertAdjacentHTML('beforeend', `<div class="tab hidden" id="tab-more"><div class="m-more">
    <button data-go="calc">${ICON.svg('calc', 22)}<span><b>คำนวณ lot / จุดเติม</b><small>ขนาดไม้จาก % ความเสี่ยง, SL เป็นจุด</small></span></button>
    <button data-go="news">📰<span><b>ข่าวตลาด</b><small>FXStreet, Investing, Fed, ECB, BLS + ปฏิทินเศรษฐกิจ</small></span></button>
    <button data-go="learn">${ICON.svg('book', 22)}<span><b>บทเรียน</b><small>แท่งเทียน, Demand & Supply, บริหารเงิน</small></span></button>
    <button data-go="log">${ICON.svg('logs', 22)}<span><b>Log</b><small>สถานะการเชื่อมต่อ · ส่งให้ผู้พัฒนาเมื่อมีปัญหา</small></span><i id="m-logb"></i></button>
    <button data-do="settings">${ICON.svg('gear', 22)}<span><b>การตั้งค่า</b><small>เวลา, แจ้งเตือน, Session, ข้อมูล</small></span></button>
    <div class="m-sec">การเชื่อมต่อ</div>
    <button data-do="guide">📘<span><b>คู่มือเริ่มต้น</b><small>ติดตั้งแอป · วิธี login · เลือกแหล่งราคา</small></span></button>
    <div class="m-src"></div>
    <button data-do="login">🔐<span><b>เข้าสู่ระบบ VCG</b><small>เปิดหน้า login ของ VCG WebTrader</small></span></button>
    <button data-do="reconnect">↻<span><b>เชื่อมต่อใหม่</b><small>โหลดหน้า VCG ใหม่</small></span></button>
    <p class="muted m-ver"></p></div></div>`);
  const PAGES = { market: 'ราคา', analysis: 'วิเคราะห์', practice: 'ฝึกเทรด', calc: 'คำนวณ', news: 'ข่าว', learn: 'บทเรียน', log: 'Log', more: 'เพิ่มเติม' };
  const SUB = { calc: 1, news: 1, learn: 1, log: 1 };
  let page = null;
  function showPage(t) {
    page = t;
    if (t !== 'more') { const b = document.querySelector(`#tabs [data-tab="${t}"]`); if (b) b.click(); }
    else document.querySelectorAll('#side .tab').forEach((x) => x.classList.toggle('hidden', x.id !== 'tab-more'));
    side.querySelector('.mph-t').textContent = PAGES[t] || '';
    side.querySelector('.mph-back').classList.toggle('hidden', !SUB[t]);
    if (!S.ui.side) window.setUI('side', true);
    side.scrollTop = 0; document.querySelectorAll('#side .tab').forEach((x) => { x.scrollTop = 0; });
    syncNav();
  }
  function goChart() { page = null; if (S.ui.side) window.setUI('side', false); syncNav(); dirty = true; }
  on(side.querySelector('.mph-back'), 'click', () => showPage('more'));
  side.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => showPage(b.dataset.go)));
  on(side.querySelector('[data-do=settings]'), 'click', () => $('open-settings').click());
  on(side.querySelector('[data-do=guide]'), 'click', () => SETUP.open());
  on(side.querySelector('[data-do=login]'), 'click', () => { vcg.showTrader(); });
  on(side.querySelector('[data-do=reconnect]'), 'click', () => { vcg.reloadTrader(); toast('กำลังเชื่อมต่อใหม่…', 'info'); });
  side.querySelector('.m-ver').textContent = 'Price Tracker ' + (window.APP_VERSION || '');
  // data source selector lives in the "more" page on phones
  const srcRow = $('src-sel') && $('src-sel').closest('.row'); if (srcRow) side.querySelector('.m-src').appendChild(srcRow);

  const nav = document.createElement('nav'); nav.id = 'mnav2';
  const NAV = [['chart', 'candles', 'กราฟ'], ['market', 'list', 'ราคา'], ['analysis', 'brain', 'วิเคราะห์'], ['practice', 'play', 'ฝึก'], ['more', 'menu', 'เพิ่มเติม']];
  nav.innerHTML = NAV.map(([k, i, n]) => `<button data-nav="${k}">${ICON.svg(i, 22) || ''}<span>${n}</span>${k === 'more' ? '<i class="nb"></i>' : ''}</button>`).join('');
  document.body.appendChild(nav);
  nav.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => { closeSheet(); b.dataset.nav === 'chart' ? goChart() : showPage(b.dataset.nav); }));
  function syncNav() {
    const cur = !S.ui.side ? 'chart' : SUB[page] ? 'more' : page;
    nav.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === cur));
    const n = ($('log-badge') && $('log-badge').textContent) || '';
    nav.querySelector('.nb').textContent = n; const lb = $('m-logb'); if (lb) lb.textContent = n;
  }
  setInterval(syncNav, 1500);
  // other code (bounce card → calculator, SIM.prefill …) switches tabs by clicking #tabs buttons: follow along
  document.querySelectorAll('#tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => {
    if (page !== b.dataset.tab) { page = b.dataset.tab; side.querySelector('.mph-t').textContent = PAGES[page] || ''; side.querySelector('.mph-back').classList.toggle('hidden', !SUB[page]); if (!S.ui.side) window.setUI('side', true); syncNav(); }
  }));
  // start on the chart
  goChart();

  // Android back: sheet → tool → sub page → page → minimise (registered before ui.js's handler via capture flag)
  window.__mobileBack = () => {
    if (window.MSHEET.isOpen()) { closeSheet(); return true; }
    if (S.tool && S.tool !== 'cursor') { setTool('cursor'); return true; }
    if (S.ui.side && SUB[page]) { showPage('more'); return true; }
    if (S.ui.side) { goChart(); return true; }
    return false;
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
})();
