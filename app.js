// Price Tracker renderer · tabs, lessons, logs, toolbar and start-up (loaded last of the app-*.js files)
/* global LightweightCharts, IND, AN, BOUNCE, CUSTOM, LESSONS, ICON, vcg */
// ---------------------------------------------------------------- tabs, lessons, logs
document.querySelectorAll('#tabs button[data-tab]').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('#tabs button[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'log') { errCount = 0; $('log-badge').textContent = ''; renderLogs(); }
}));
// lesson book: category chips + search over the original lessons (lessons.js) and the guide (lessons-guide.js)
function renderLessons() {
  const box = $('lessons'), cats = window.LESSON_CATS || [{ id: 'all', name: 'บทเรียน', icon: 'book-open' }];
  const all = [...LESSONS.map((l, i) => ({ ...l, c: (window.LESSON_CAT_OF || {})[i] || cats[0].id })), ...(window.LESSONS_EXTRA || [])];
  const strip = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').toLowerCase();
  all.forEach((l) => { l._q = (l.t + ' ' + strip(l.b)).toLowerCase(); });
  let cur = store.get('lessonCat', 'all');
  box.innerHTML = `<input class="lesson-search" type="search" placeholder="ค้นหาบทเรียน เช่น hammer, demand, fibo, lot…">
    <div class="lesson-cats"><button data-lc="all">ทั้งหมด <span class="n">${all.length}</span></button>${cats.map((c) => `<button data-lc="${c.id}">${c.icon ? ICON.html(c.icon, 14) : ''}${esc(c.name)} <span class="n">${all.filter((l) => l.c === c.id).length}</span></button>`).join('')}</div>
    <div class="lesson-list">${cats.map((c) => `<div class="lesson-cat" data-cat="${c.id}"><div class="lesson-cat-h">${c.icon ? ICON.html(c.icon, 16) : ''}${esc(c.name)}</div>${all.map((l, i) => (l.c === c.id ? `<details data-i="${i}"><summary>${l.t}</summary>${l.b}</details>` : '')).join('')}</div>`).join('')}</div>`;
  const q = box.querySelector('.lesson-search');
  const apply = () => {
    const term = q.value.trim().toLowerCase();
    box.querySelectorAll('.lesson-cats button').forEach((b) => b.classList.toggle('on', b.dataset.lc === cur));
    box.querySelectorAll('.lesson-cat').forEach((g) => {
      let any = 0;
      g.querySelectorAll('details').forEach((d) => { const l = all[+d.dataset.i]; const show = (cur === 'all' || l.c === cur) && (!term || l._q.includes(term)); d.hidden = !show; if (show) any++; if (term && show) d.open = true; });
      g.hidden = !any;
    });
  };
  box.querySelectorAll('.lesson-cats button').forEach((b) => (b.onclick = () => { cur = b.dataset.lc; store.set('lessonCat', cur); apply(); }));
  q.oninput = apply;
  apply();
}
renderLessons();

const logs = []; let errCount = 0, logRenderTimer = null;
vcg.onLogs((list) => {
  logs.push(...list); if (logs.length > 3000) logs.splice(0, logs.length - 3000);
  const logTabOpen = !$('tab-log').classList.contains('hidden');
  if (!logTabOpen) { errCount += list.filter((e) => e.level === 'error').length; $('log-badge').textContent = errCount || ''; }
  else if (!logRenderTimer) logRenderTimer = setTimeout(() => { logRenderTimer = null; renderLogs(); }, 1000);
});
const LV = { debug: 0, info: 1, warn: 2, error: 3 };
function renderLogs() {
  const lv = $('log-level').value, q = $('log-search').value.toLowerCase();
  const min = lv === 'error' ? 3 : lv === 'warn' ? 2 : lv === 'info' ? 1 : 0;
  const rows = logs.filter((e) => LV[e.level] >= min && (!q || (e.msg + ' ' + (e.data || '') + ' ' + e.source).toLowerCase().includes(q))).slice(-250).reverse();
  $('log-list').innerHTML = rows.map((e) => `<div class="le ${e.level}"><span class="t">${new Date(e.t).toLocaleTimeString()}</span> <span class="s">${esc(e.source)}</span> ${esc(e.msg)}${e.data ? ' <span class="t">' + esc(e.data) + '</span>' : ''}</div>`).join('') || '<p class="muted" style="padding:8px">ไม่มี log</p>';
}
$('log-level').onchange = renderLogs; $('log-search').oninput = renderLogs;
$('log-file').onclick = () => vcg.openLogFile();
$('log-folder').onclick = () => vcg.openLogFolder();
$('log-copy').onclick = () => navigator.clipboard.writeText(logs.map((e) => `${e.t} [${e.level}] ${e.source}: ${e.msg}${e.data ? ' ' + e.data : ''}`).join('\n'));

// ---------------------------------------------------------------- toolbar
function renderTfs() {
  $('tfs').innerHTML = TFS.map((t) => `<button data-t="${t.type}" class="${t.type === S.tf ? 'active' : ''}">${t.label}</button>`).join('');
  $('tfs').querySelectorAll('button').forEach((b) => (b.onclick = () => { if (S.replay && typeof REPLAY !== 'undefined') REPLAY.exit(); S.tf = +b.dataset.t; store.set('tf', S.tf); renderTfs(); loadChart(); }));
}
$('ctype').value = S.ctype;
$('ctype').onchange = () => { S.ctype = $('ctype').value; store.set('ctype', S.ctype); buildMain(); buildIndicators(); };
$('show-ask').checked = S.showAsk;
$('show-ask').onchange = () => { S.showAsk = $('show-ask').checked; store.set('showAsk', S.showAsk); refreshPriceLines(); };
$('magnet').checked = S.magnet;
$('magnet').onchange = () => { S.magnet = $('magnet').checked; store.set('magnet', S.magnet); };

// ---------------------------------------------------------------- init
renderTfs();
buildMain();
buildIndicators();
renderAlerts();
updateHeader();
renderAnalysis();
loadChart();
