/* global S, store, $, esc, vcg, toast, NEWS, tf, ICON */
// Market news ("ข่าว" tab): headlines from a fixed list of established publishers and official sources (RSS),
// merged, de-duplicated, tagged by relevance to the open symbol. Only the headline, source and time are shown;
// tapping opens the publisher's own page in the browser.
const HEADLINES = (() => {
  const FEEDS = [
    { id: 'fxs', name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news', kind: 'market' },
    { id: 'inv-fx', name: 'Investing.com · Forex', url: 'https://www.investing.com/rss/news_1.rss', kind: 'market' },
    { id: 'inv-cmd', name: 'Investing.com · Commodities', url: 'https://www.investing.com/rss/news_11.rss', kind: 'market' },
    { id: 'fed', name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml', kind: 'official' },
    { id: 'ecb', name: 'ECB', url: 'https://www.ecb.europa.eu/rss/press.html', kind: 'official' },
    { id: 'bls', name: 'US BLS (ตัวเลขเศรษฐกิจ)', url: 'https://www.bls.gov/feed/bls_latest.rss', kind: 'official' },
  ];
  // words that make a headline relevant to a symbol (by currency / asset)
  const KW = {
    XAU: ['gold', 'xau', 'bullion', 'precious', 'safe haven', 'safe-haven'],
    XAG: ['silver', 'xag', 'precious'],
    USD: ['fed', 'fomc', 'powell', 'dollar', 'usd', 'treasury', 'yields', 'cpi', 'inflation', 'payroll', 'nfp', 'jobless', 'pce', 'gdp', 'tariff', 'unemployment', 'employment situation', 'consumer price'],
    EUR: ['ecb', 'euro', 'eur', 'lagarde', 'eurozone', 'euro area'], GBP: ['boe', 'bank of england', 'pound', 'sterling', 'gbp'],
    JPY: ['boj', 'bank of japan', 'yen', 'jpy'], AUD: ['rba', 'aussie', 'aud'], NZD: ['rbnz', 'kiwi', 'nzd'], CAD: ['boc', 'loonie', 'cad', 'oil'],
    CHF: ['snb', 'franc', 'chf'], BTC: ['bitcoin', 'btc', 'crypto'], ETH: ['ethereum', 'eth', 'crypto'], OIL: ['oil', 'crude', 'opec', 'brent', 'wti'],
  };
  const fetchText = (url) => (vcg.fetchText ? vcg.fetchText(url) : fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }));
  let items = store.get('headlines.cache', { at: 0, list: [] });
  let errors = {}, loading = false, filter = store.get('headlines.filter', 'rel'), timer = null;
  let seenAt = store.get('headlines.seenAt', 0);

  const parseDate = (s) => {
    if (!s) return 0;
    // Investing.com: "YYYY-MM-DD HH:MM:SS" in UTC — Chromium would read that as local time, so handle it first
    if (/^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d)?$/.test(s.trim())) return Date.parse(s.trim().replace(' ', 'T') + 'Z') || 0;
    const t = Date.parse(s);
    return isFinite(t) ? t : 0;
  };
  function parse(xml, feed) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const nodes = [...doc.querySelectorAll('item'), ...doc.querySelectorAll('entry')];
    const txt = (n, sel) => { const e = n.querySelector(sel); return e ? e.textContent.trim() : ''; };
    return nodes.slice(0, 40).map((n) => {
      const linkEl = n.querySelector('link');
      const link = (linkEl && (linkEl.getAttribute('href') || linkEl.textContent.trim())) || txt(n, 'guid');
      return { title: txt(n, 'title').replace(/\s+/g, ' '), link, t: parseDate(txt(n, 'pubDate') || txt(n, 'published') || txt(n, 'updated') || txt(n, 'date')), src: feed.name, feed: feed.id, kind: feed.kind };
    }).filter((x) => x.title && /^https?:\/\//.test(x.link));
  }
  function symbolWords(sym) {
    const s = String(sym || '').toUpperCase(), out = new Set();
    for (const [k, ws] of Object.entries(KW)) if (s.includes(k) || (k === 'OIL' && /OIL|WTI|BRENT/.test(s))) ws.forEach((w) => out.add(w));
    if (/^[A-Z]{6}/.test(s)) [s.slice(0, 3), s.slice(3, 6)].forEach((c) => (KW[c] || []).forEach((w) => out.add(w)));
    return [...out];
  }
  const relevantTo = (it, words) => { const t = ' ' + it.title.toLowerCase() + ' '; return words.some((w) => (w.length <= 3 ? new RegExp(`[^a-z]${w}[^a-z]`).test(t) : t.includes(w))); };

  async function refresh(force) {
    if (loading) return;
    if (!force && Date.now() - items.at < 5 * 60e3 && items.list.length) return render();
    loading = true; render();
    const res = await Promise.allSettled(FEEDS.map((f) => fetchText(f.url).then((x) => parse(x, f))));
    errors = {};
    const all = [];
    res.forEach((r, i) => { if (r.status === 'fulfilled') all.push(...r.value); else errors[FEEDS[i].id] = (r.reason && r.reason.message) || 'error'; });
    const byKey = new Map();
    for (const it of all) { const k = it.title.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, ' ').trim().slice(0, 80); if (!byKey.has(k) || byKey.get(k).t < it.t) byKey.set(k, it); }
    const list = [...byKey.values()].filter((x) => x.t > Date.now() - 7 * 86400e3 && x.t < Date.now() + 3600e3).sort((a, b) => b.t - a.t).slice(0, 200);
    if (list.length) { items = { at: Date.now(), list }; store.set('headlines.cache', items); }
    const failed = Object.keys(errors).length;
    vcg.log(failed === FEEDS.length ? 'warn' : 'info', `โหลดข่าว ${list.length} หัวข้อ จาก ${FEEDS.length - failed}/${FEEDS.length} แหล่ง${failed ? ' (โหลดไม่ได้: ' + Object.keys(errors).join(', ') + ')' : ''}`, null, 'news');
    loading = false; render(); notifyNew();
  }
  function notifyNew() {
    const words = symbolWords(S.symbol), last = store.get('headlines.notified', 0);
    const fresh = items.list.filter((x) => x.t > last && x.t > Date.now() - 30 * 60e3 && (x.kind === 'official' || relevantTo(x, words)));
    if (fresh.length && last) toast(`${fresh[0].src}: ${fresh[0].title}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ''}`, 'info', 10000);
    store.set('headlines.notified', Math.max(last, ...items.list.map((x) => x.t), 0));
  }
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'เมื่อสักครู่' : m < 60 ? m + ' นาที' : m < 1440 ? Math.round(m / 60) + ' ชม.' : Math.round(m / 1440) + ' วัน'; };

  function render() {
    const box = $('newsfeed'); if (!box) return;
    const words = symbolWords(S.symbol);
    const list = items.list.filter((x) => filter === 'all' || (filter === 'official' ? x.kind === 'official' : filter === 'rel' ? relevantTo(x, words) || x.kind === 'official' : x.feed === filter));
    const unseen = items.list.filter((x) => x.t > seenAt).length;
    const badge = $('news-badge'); if (badge) badge.textContent = unseen && !box.offsetParent ? unseen > 99 ? '99+' : unseen : '';
    const chips = [['rel', `เกี่ยวกับ ${S.symbol}`], ['all', 'ทั้งหมด'], ['official', 'ทางการ (Fed/ECB/BLS)'], ...FEEDS.filter((f) => f.kind === 'market').map((f) => [f.id, f.name.split(' ·')[0] === 'Investing.com' ? f.name.replace('Investing.com · ', 'Investing ') : f.name])];
    const cal = !box.closest('#news-page') && typeof NEWS !== 'undefined' && NEWS.upcoming ? NEWS.upcoming(4) : [];   // the news page shows the full calendar itself
    box.innerHTML = `
      <div class="panel nw-head"><div class="panel-h"><span>${ICON.html('newspaper', 16)}ข่าวตลาด</span><button id="nw-refresh" class="ib" title="โหลดใหม่" aria-label="โหลดใหม่">${ICON.svg(loading ? 'loader-circle' : 'refresh-cw', 16)}</button></div>
        <div class="nw-chips">${chips.map(([k, n]) => `<button data-nf="${k}" class="${filter === k ? 'on' : ''}">${esc(n)}</button>`).join('')}</div>
        ${cal.length ? `<div class="nw-cal">${cal.map((e) => `<div><i class="imp ${e.impact === 'High' ? 'hi' : 'md'}"></i><b>${esc(e.when)}</b> ${esc(e.ccy)} ${esc(e.title)}</div>`).join('')}<small class="muted">ปฏิทินเศรษฐกิจ (Forex Factory)</small></div>` : ''}
      </div>
      <div class="nw-list">${list.length ? list.slice(0, 80).map((x) => `<a class="nw-item ${x.t > seenAt ? 'new' : ''} ${x.kind}" href="${esc(x.link)}" target="_blank" rel="noopener noreferrer">
          <span class="nw-t">${esc(x.title)}</span><span class="nw-m">${esc(x.src)} · ${ago(x.t)}${x.kind === 'official' ? ' · <b>ทางการ</b>' : ''}</span></a>`).join('')
        : `<p class="muted">${loading ? 'กำลังโหลดข่าว…' : items.list.length ? 'ไม่มีข่าวในหมวดนี้' : 'ยังโหลดข่าวไม่ได้ — ตรวจอินเทอร์เน็ตแล้วกดปุ่มโหลดใหม่'}</p>`}</div>
      <p class="muted nw-foot">แหล่ง: ${FEEDS.map((f) => esc(f.name) + (errors[f.id] ? ' ' + ICON.html('triangle-alert', 12, 'warn') : '')).join(' · ')} · แตะหัวข้อเพื่ออ่านที่เว็บต้นทาง · อัปเดตทุก 5 นาที${items.at ? ' · ล่าสุด ' + ago(items.at) : ''}</p>`;
    box.querySelectorAll('[data-nf]').forEach((b) => (b.onclick = () => { filter = b.dataset.nf; store.set('headlines.filter', filter); render(); }));
    $('nw-refresh').onclick = () => refresh(true);
  }
  function markSeen() { seenAt = Date.now(); store.set('headlines.seenAt', seenAt); const b = $('news-badge'); if (b) b.textContent = ''; }
  // the news page (news-page.js) calls show() when it opens
  function show() { render(); setTimeout(markSeen, 4000); refresh(false); }
  setTimeout(() => refresh(false), 4000);
  timer = setInterval(() => refresh(true), 5 * 60e3);
  void timer;
  return {
    refresh, render, show, markSeen, FEEDS, unseen: () => items.list.filter((x) => x.t > seenAt).length,
    latest: (n = 3) => { const words = symbolWords(S.symbol); return items.list.filter((x) => relevantTo(x, words) || x.kind === 'official').slice(0, n).map((x) => ({ ...x, ago: ago(x.t) })); },
    // for Claude (MCP)
    list: (opts = {}) => { const words = symbolWords(opts.symbol || S.symbol); return items.list.filter((x) => !opts.relevant || relevantTo(x, words) || x.kind === 'official').slice(0, Math.min(100, opts.limit || 30)).map((x) => ({ title: x.title, source: x.src, official: x.kind === 'official', time: new Date(x.t).toISOString(), link: x.link })); },
  };
})();
