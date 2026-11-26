import { PT, def } from './src/pt.ts';
import { $, S, TFS, esc, store } from './app-core.js';
import { buildIndicators, buildMain, refreshPriceLines } from './app-chart.js';
import { renderAnalysis } from './app-analysis.js';
import { loadChart, renderAlerts, updateHeader } from './app-data.js';
def({ logs: [() => logs], errCount: [() => errCount, (v) => { errCount = v; }], logRenderTimer: [() => logRenderTimer, (v) => { logRenderTimer = v; }], LV: [() => LV], renderLogs: [() => renderLogs, (v) => { renderLogs = v; }], renderTfs: [() => renderTfs, (v) => { renderTfs = v; }] });
// Price Tracker renderer · tabs, lessons, logs, toolbar and start-up (loaded last of the app-*.js files)
// ---------------------------------------------------------------- tabs, lessons, logs
document.querySelectorAll('#tabs button[data-tab]').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('#tabs button[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'log') { errCount = 0; $('log-badge').textContent = ''; renderLogs(); }
}));
// lesson book: category chips + search over the original lessons (lessons.js) and the guide (lessons-guide.js)
// the lesson book is the learning center page (src/pages/learn)

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
  $('tfs').querySelectorAll('button').forEach((b) => (b.onclick = () => { if (S.replay && typeof PT.REPLAY !== 'undefined') PT.REPLAY.exit(); S.tf = +b.dataset.t; store.set('tf', S.tf); renderTfs(); loadChart(); }));
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
export { renderTfs };
