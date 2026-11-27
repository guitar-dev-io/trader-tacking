import { PT, def } from './src/pt.ts';
import { ui } from './src/ui/registry.ts';
import { $, S, TFS, esc, store } from './app-core.js';
import { buildIndicators, buildMain, refreshPriceLines } from './src/chart/chart.ts';
import { renderAnalysis } from './app-analysis.js';
import { loadChart, renderAlerts, updateHeader } from './app-data.js';
import * as logTab from './src/ui/tabs/log.ts';
def({ renderTfs: [() => renderTfs, (v) => { renderTfs = v; }] });
// Price Tracker renderer · tabs, lessons, logs, toolbar and start-up (loaded last of the app-*.js files)
// ---------------------------------------------------------------- tabs, lessons, logs
document.querySelectorAll('#tabs button[data-tab]').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('#tabs button[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'log') logTab.opened();
}));
// lesson book: category chips + search over the original lessons (lessons.js) and the guide (lessons-guide.js)
// the lesson book is the learning center page (src/pages/learn)

logTab.init();

// ---------------------------------------------------------------- toolbar
function renderTfs() {
  $('tfs').innerHTML = TFS.map((t) => `<button data-t="${t.type}" class="${t.type === S.tf ? 'active' : ''}">${t.label}</button>`).join('');
  $('tfs').querySelectorAll('button').forEach((b) => (b.onclick = () => { if (S.replay && ui.replay) ui.replay.exit(); S.tf = +b.dataset.t; store.set('tf', S.tf); renderTfs(); loadChart(); }));
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
