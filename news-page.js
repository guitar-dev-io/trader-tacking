import { PT, def } from './src/pt.ts';
import { $, esc, store } from './app-core.js';
import { NEWS } from './extras.js';
import { HEADLINES } from './news.js';
import { PAGES } from './pages.js';
def({ NEWSPAGE: [() => NEWSPAGE] });
// "ข่าวและปฏิทิน": market headlines (news.js renders into #newsfeed) next to the full economic calendar of the week.
// Desktop: a page tab with a titlebar button + unread badge. Phone: a full-screen page from the More page.
// The ราคา tab keeps a small "ข่าวล่าสุด" teaser.
const NEWSPAGE = (() => {
  const mobile = document.body.classList.contains('mobile');
  const ic = (n, s = 16, c) => (PT.ICON.html ? PT.ICON.html(n, s, c) : '');
  let calAll = store.get('np.calAll', false);

  // the old side tab's feed element moves into the page
  const oldTab = $('tab-news'), feed = $('newsfeed') || Object.assign(document.createElement('div'), { id: 'newsfeed' });
  const root = document.createElement('div'); root.id = 'news-page'; root.className = 'np' + (mobile ? ' m-full hidden' : '');
  root.innerHTML = `<div class="np-top">${mobile ? `<button class="np-close ib" aria-label="ปิด">${ic('arrow-left', 18)}</button>` : ''}<h1>${ic('newspaper', 20)}ข่าวและปฏิทินเศรษฐกิจ</h1>
      <div class="np-ff"><button data-ff="news">${ic('external-link', 14)}ข่าว Forex Factory</button><button data-ff="calendar">${ic('calendar-days', 14)}ปฏิทิน Forex Factory</button></div></div>
    <div class="np-cols"><section class="np-news"></section><aside class="np-cal"></aside></div>`;
  root.querySelector('.np-news').appendChild(feed);
  if (oldTab) oldTab.remove();
  const cal = root.querySelector('.np-cal');

  // Forex Factory: open its own pages (in-app window on desktop, browser on phone/web) — nothing is copied
  const FF = 'https://www.forexfactory.com/';
  const ffDay = (t) => { const d = new Date(t * 1000); return FF + 'calendar?day=' + d.toLocaleString('en-US', { month: 'short', timeZone: 'America/New_York' }).toLowerCase() + d.toLocaleString('en-US', { day: 'numeric', timeZone: 'America/New_York' }) + '.' + d.toLocaleString('en-US', { year: 'numeric', timeZone: 'America/New_York' }); };
  const openFF = (u) => { if (window.vcg && vcg.openSite) vcg.openSite(u); else window.open(u, '_blank', 'noopener'); };
  root.querySelectorAll('[data-ff]').forEach((b) => (b.onclick = () => openFF(FF + (b.dataset.ff === 'news' ? 'news' : 'calendar'))));
  const dayName = (t) => new Date(t * 1000).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });
  function renderCal() {
    if (typeof NEWS === 'undefined' || !NEWS.week) { cal.innerHTML = ''; return; }
    const now = Date.now() / 1000, list = NEWS.week(!calAll).filter((e) => e.impact !== 'Holiday' && (calAll || e.impact !== 'Low'));
    const days = new Map(); for (const e of list) { const k = new Date(e.t * 1000).toDateString(); if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
    const next = list.find((e) => e.t > now);
    cal.innerHTML = `<div class="np-cal-h"><b>${ic('calendar-days', 16)}ปฏิทินเศรษฐกิจสัปดาห์นี้</b>
        <div class="np-seg"><button data-ca="0" class="${calAll ? '' : 'on'}">${esc((NEWS.ccys ? NEWS.ccys() : []).join('/'))} สำคัญ</button><button data-ca="1" class="${calAll ? 'on' : ''}">ทั้งหมด</button></div></div>
      ${next ? `<div class="np-next ${next.impact === 'High' ? 'hi' : ''}"><small>ถัดไป</small><b>${esc(next.ccy)} ${esc(next.title)}</b><span>${esc(next.when)}${next.forecast ? ' · คาด ' + esc(next.forecast) : ''}</span></div>` : ''}
      ${list.length ? [...days.entries()].map(([, es]) => `<div class="np-day"><div class="np-dh">${esc(dayName(es[0].t))}</div>
        ${es.map((e) => `<div class="np-ev ${e.t < now ? 'past' : ''} ${e.t > now && e.t - now < 3600 ? 'soon' : ''}" data-fft="${e.t}" title="ดูรายละเอียดบน Forex Factory" role="link" tabindex="0"><i class="imp ${e.impact === 'High' ? 'hi' : e.impact === 'Medium' ? 'md' : 'lo'}"></i>
          <span class="np-time">${esc(e.when.split(' ').pop())}</span><span class="np-ccy">${esc(e.ccy)}</span><span class="np-title">${esc(e.title)}</span>
          <span class="np-fc">${e.forecast ? 'คาด ' + esc(e.forecast) : ''}${e.previous ? `<small>ก่อนหน้า ${esc(e.previous)}</small>` : ''}</span></div>`).join('')}</div>`).join('')
        : '<p class="muted">ยังไม่มีข้อมูลปฏิทิน หรือโหลดไม่ได้</p>'}
      <p class="muted np-src">ข้อมูลจาก Forex Factory (กดที่รายการเพื่อดูบนเว็บ) · <i class="imp hi"></i> สูง <i class="imp md"></i> กลาง · เวลาตาม timezone กราฟ</p>`;
    cal.querySelectorAll('[data-fft]').forEach((el) => { el.onclick = () => openFF(ffDay(+el.dataset.fft)); el.onkeydown = (ev) => { if (ev.key === 'Enter') el.click(); }; });
    cal.querySelectorAll('[data-ca]').forEach((b) => (b.onclick = () => { calAll = b.dataset.ca === '1'; store.set('np.calAll', calAll); renderCal(); }));
  }

  // ---- teaser in the ราคา tab
  function teaser() {
    let el = $('news-teaser');
    if (!el) {
      const host = $('tab-market'); if (!host) return;
      el = document.createElement('div'); el.id = 'news-teaser'; el.className = 'panel';
      const after = $('positions-panel'); if (after) after.after(el); else host.appendChild(el);
    }
    const ls = HEADLINES.latest ? HEADLINES.latest(3) : [];
    el.innerHTML = `<div class="panel-h nt-h"><span>${ic('newspaper', 15)}ข่าวล่าสุด</span><button class="nt-all">ดูทั้งหมด ${ic('chevron-right', 13)}</button></div>
      ${ls.length ? ls.map((x) => `<a class="nt-item" href="${esc(x.link)}" target="_blank" rel="noopener noreferrer"><span>${esc(x.title)}</span><small>${esc(x.src)} · ${esc(x.ago)}</small></a>`).join('') : '<p class="muted">ยังไม่มีข่าว</p>'}`;
    el.querySelector('.nt-all').onclick = () => open();
  }

  function render() { HEADLINES.render(); renderCal(); }
  const visible = () => (mobile ? !root.classList.contains('hidden') : PAGES.active() === 'news');
  function open() {
    if (mobile) { root.classList.remove('hidden'); document.body.classList.add('np-open'); }
    else PAGES.open('news');
    HEADLINES.show(); renderCal();
  }
  function close() {
    if (mobile) { root.classList.add('hidden'); document.body.classList.remove('np-open'); return; }
    if (PAGES.active() === 'news') PAGES.activate('chart');
  }
  if (mobile) {
    document.body.appendChild(root);
    root.querySelector('.np-close').onclick = close;
    const prevBack = PT.__mobileBack;
    PT.__mobileBack = () => { if (!root.classList.contains('hidden')) { close(); return true; } return prevBack ? prevBack() : false; };
  } else {
    const inner = (n) => (PT.ICON.svg(n, 14) || '').replace(/^<svg[^>]*>|<\/svg>$/g, '');
    const btn = document.createElement('button');
    btn.id = 'news-btn'; btn.className = 'ib tb-news'; btn.title = 'ข่าวและปฏิทินเศรษฐกิจ';
    btn.innerHTML = `${ic('newspaper', 16)}<span id="news-badge"></span>`;
    btn.onclick = () => (visible() ? close() : open());
    const anchor = $('learn-btn') || $('dash-btn') || $('theme-btn'); if (anchor) anchor.before(btn);
    window.addEventListener('pagechange', (e) => { if (e.detail === 'news') { HEADLINES.show(); renderCal(); } btn.classList.toggle('on', e.detail === 'news'); });
    PAGES.register('news', 'ข่าว', root, inner('newspaper'));
  }
  teaser(); setInterval(() => { teaser(); if (visible()) renderCal(); }, 30000);
  setTimeout(teaser, 6000);
  return { open, close, render, isOpen: visible };
})();
