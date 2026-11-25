// Scripts injected into the VCG WebTrader page + quote parsing. Shared by the desktop app (main.js)
// and the Android app (bridge-android.js), so both talk to VCG in exactly the same way.
(function (root) {
  const WEBTRADER_URL = 'https://vcgmarkets.com/webtrader';
  const WS_HOST = 'prod-ws-server.anttix.app';

  const SUB_JS = (symbols) => `(() => {
    const m = globalThis._wsSharedManager; if (!m) return 'none';
    const s = m.socket('/symbol'); if (!s.connected) return 'down';
    s.emit('symbol:subscribe', { symbols: ${JSON.stringify(symbols)} }); return 'ok';
  })()`;
  const CONNECTED_JS = `(() => { const m = globalThis._wsSharedManager;
    return !!(m && m.socket('/symbol').connected); })()`;

  const FEED_JS = `(() => {
    if (window.__vcgFeed) return 'exists';
    const shared = globalThis._wsSharedManager; if (!shared) return 'none';
    const s = shared.socket('/symbol');
    // NOTE: no setTimeout here — the WebTrader page is hidden and Chromium throttles timers in hidden pages
    // (>=1 s, and only once per minute after 5 min), which delayed prices by 1–3 s. A MessageChannel task is not throttled.
    let buf = {}, n = 0, queued = false;
    const post = (type, d) => window.postMessage({ __vcg: type, d }, '*');
    const flush = () => { queued = false; if (!n) return; post('quotes', Object.values(buf)); buf = {}; n = 0; };
    const mc = new MessageChannel(); mc.port1.onmessage = flush;
    s.onAny((ev, d) => {
      if (ev === 'symbol:data' && d) {
        const list = (d.quoteList && d.quoteList.quotes) || (d.quote ? [d.quote] : []);
        for (const q of list) { if (!buf[q.symbol]) n++; buf[q.symbol] = q; }
        if (!queued) { queued = true; mc.port2.postMessage(0); }   // coalesce one socket burst, deliver right after it
      } else if (ev === 'symbol:subscriptionUpdate') post('subs', (d && d.symbols) || []);
      else if (ev === 'symbol:error') post('feedError', d);
    });
    window.__vcgFeed = true;
    return 'ok';
  })()`;

  const CHART_JS = `(() => {
    if (window.__vcgChart && window.__vcgChart.v === 2) return 'exists';
    const shared = globalThis._wsSharedManager; if (!shared) return 'none';
    const post = (type, d, slot) => window.postMessage({ __vcg: type, d, slot: slot || 'main' }, '*');
    // Fresh token from the web app's own token getter (it caches and renews ~1 min before expiry).
    // The getter lives in a webpack module whose id/name change whenever VCG ships a new build, so:
    // 1) try the last known location (remembered), 2) the original one (30264.hP), 3) scan loaded modules
    // for a 0-arg export whose code mentions accessToken, and verify it really returns a token.
    function wpReq() {
      try { if (!window.__vcgReq && window.webpackChunk_N_E) window.webpackChunk_N_E.push([[Symbol('vcg')], {}, (r) => { window.__vcgReq = r; }]); } catch (_) {}
      return window.__vcgReq || null;
    }
    const looksJwt = (t) => typeof t === 'string' && t.split('.').length === 3 && t.length > 40;
    async function tryFn(fn) { try { const t = await Promise.race([fn(), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 4000))]); return t && looksJwt(t.accessToken) ? t : null; } catch (_) { return null; } }
    let getterInfo = null;
    try { getterInfo = JSON.parse(localStorage.getItem('__vcgTokenGetter') || 'null'); } catch (_) {}
    async function findGetter() {
      const req = wpReq(); if (!req) return null;
      const at = (id, key) => { try { const m = req(id); return m && typeof m[key] === 'function' ? m[key] : null; } catch (_) { return null; } };
      const tried = new Set();
      for (const c of [getterInfo, { id: 30264, key: 'hP' }]) {
        if (!c) continue; tried.add(c.id + ':' + c.key);
        const fn = at(c.id, c.key); if (fn && await tryFn(fn)) return { fn, id: c.id, key: c.key };
      }
      const cache = req.c || {}; const cands = [];
      for (const id of Object.keys(cache)) {
        const ex = cache[id] && cache[id].exports; if (!ex || typeof ex !== 'object') continue;
        for (const key of Object.keys(ex)) {
          let f; try { f = ex[key]; } catch (_) { continue; }
          if (typeof f !== 'function' || f.length !== 0 || tried.has(id + ':' + key)) continue;
          let src = ''; try { src = Function.prototype.toString.call(f); } catch (_) { continue; }
          if (src.length < 4000 && /accessToken/.test(src)) cands.push({ id, key, f, score: /refresh|expire|exp/i.test(src) ? 1 : 0 });
        }
      }
      cands.sort((a, b) => b.score - a.score);
      for (const c of cands.slice(0, 6)) if (await tryFn(c.f)) return { fn: c.f, id: isNaN(+c.id) ? c.id : +c.id, key: c.key };
      return null;
    }
    let getterP = null;
    function tokenGetter() {
      if (!getterP) getterP = findGetter().then((g) => {
        if (g) { if (!getterInfo || getterInfo.id !== g.id || getterInfo.key !== g.key) { getterInfo = { id: g.id, key: g.key }; try { localStorage.setItem('__vcgTokenGetter', JSON.stringify(getterInfo)); } catch (_) {} post('chartLog', 'พบตัวต่ออายุ token ที่ module ' + g.id + '.' + g.key); } return g.fn; }
        post('chartLog', '⚠️ หาตัวต่ออายุ token ของหน้าเว็บ VCG ไม่เจอ (เว็บอาจอัปเดต) — ใช้ token ของฟีดราคาแทน ถ้ากราฟหยุดทุก ~15 นาที ให้แจ้งผู้พัฒนา');
        getterP = null; return null;   // retry the search next time
      });
      return getterP;
    }
    async function freshAuth() {
      const base = { ...(shared.socket('/symbol').auth || {}) };
      const fn = await tokenGetter();
      if (fn) {
        try { const t = await fn(); if (t && t.accessToken) return { token: t.accessToken, account: base.account || '', country: t.country || base.country || 'TH' }; }
        catch (e) { post('chartLog', 'token getter failed: ' + e.message); getterP = null; }
      }
      return base;
    }
    function nudgePageToken() {
      try { const s = shared.socket('/symbol'); (s._anyListeners || []).forEach((f) => f('symbol:error', { message: 'PERMISSION_DENIED (renew)' })); } catch (_) {}
    }
    const M = shared.constructor;
    // one /chart-history connection per "slot" (main chart, higher-timeframe chart, …)
    function makeSlot(slot) {
      const m = new M('wss://${WS_HOST}:443', { reconnection: false, transports: ['websocket'], autoConnect: false });
      const s = m.socket('/chart-history');
      s.auth = (cb) => { freshAuth().then(cb, () => cb({ ...(shared.socket('/symbol').auth || {}) })); };
      const st = { s, last: null, denied: [] };
      s.on('chart:data', (d) => post('chart', d, slot));
      s.on('chart:error', (d) => {
        const denied = d && typeof d.message === 'string' && d.message.includes('PERMISSION_DENIED');
        post(denied ? 'chartAuthRenew' : 'chartError', d, slot);
        if (denied) {
          const now = Date.now(); st.denied = st.denied.filter((t) => now - t < 60000); st.denied.push(now);
          if (st.denied.length >= 3) { post('chartLog', 'token ถูกปฏิเสธซ้ำ — ให้หน้าเว็บต่อ token ใหม่', slot); nudgePageToken(); }
          s.disconnect();
        }
      });
      s.on('connect', () => { post('chartConnected', null, slot); if (st.last) s.emit('chart:subscribe', st.last); });
      s.on('disconnect', (r) => { post('chartDisconnected', r, slot); setTimeout(() => s.connect(), r === 'io client disconnect' ? 500 : 2000); });
      s.on('connect_error', (e) => { post('chartConnectError', e && e.message, slot); setTimeout(() => s.connect(), 5000); });
      s.connect();
      return st;
    }
    const api = { v: 2, slots: {}, auth: freshAuth, req(o) {
      const slot = o.slot || 'main'; const st = this.slots[slot] || (this.slots[slot] = makeSlot(slot));
      const { slot: _x, ...msg } = o; st.last = msg; if (st.s.connected) st.s.emit('chart:subscribe', msg);
    } };
    window.__vcgChart = api;
    api.slots.main = makeSlot('main');
    return 'ok';
  })()`;
  const CHART_REQ_JS = (o) => `window.__vcgChart && window.__vcgChart.req(${JSON.stringify(o)})`;
  // Forwards window.postMessage({__vcg}) from the page to the Android native bridge (no-op on desktop).
  const ANDROID_RELAY_JS = `(() => { if (window.__vcgRelay || !window.__vcgNative) return; window.__vcgRelay = true;
    window.addEventListener('message', (e) => { if (e.source === window && e.data && typeof e.data.__vcg === 'string') { try { window.__vcgNative.post(JSON.stringify({ type: e.data.__vcg, data: e.data.d, slot: e.data.slot })); } catch (_) {} } }); })()`;

  const dec = (v) => (v && typeof v === 'object' && 'value' in v ? v.value / 10 ** (v.scale || 0) : null);
  function parseQuote(q) {
    const bid = dec(q.bid), ask = dec(q.ask), pct = dec(q.priceChangePercent);
    const digits = (q.bid && q.bid.scale) || 2;
    return { symbol: q.symbol, time: q.time, bid, ask, digits,
      spread: bid != null && ask != null ? +(ask - bid).toFixed(digits) : null,
      change: dec(q.priceChange), changePct: pct != null ? +(pct * 100).toFixed(3) : null };
  }

  const api = { WEBTRADER_URL, WS_HOST, SUB_JS, CONNECTED_JS, FEED_JS, CHART_JS, CHART_REQ_JS, ANDROID_RELAY_JS, parseQuote };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VCGI = api;
})(typeof window !== 'undefined' ? window : globalThis);
