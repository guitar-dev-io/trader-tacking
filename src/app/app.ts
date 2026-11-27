import { def } from '../pt';
import { ui } from '../ui/registry';
import { $, S, TFS, esc, store, qsa } from './app-core';
import { buildIndicators, buildMain, refreshPriceLines } from '../chart/chart';
import { renderAnalysis } from './app-analysis';
import { loadChart, renderAlerts, updateHeader } from './app-data';
import * as logTab from '../ui/tabs/log';

// Price Tracker renderer · tabs, lessons, logs, toolbar and start-up (loaded last of the app-*.js files)
// ---------------------------------------------------------------- tabs, lessons, logs
qsa('#tabs button[data-tab]').forEach((b) => (b.onclick = () => {
  qsa('#tabs button[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
  qsa('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'log') logTab.opened();
}));
// lesson book: category chips + search over the original lessons (lessons.ts) and the guide (lessons-guide.ts)
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
