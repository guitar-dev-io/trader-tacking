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
    let buf = {}, n = 0, last = 0, timer = null;
    const post = (type, d) => window.postMessage({ __vcg: type, d }, '*');
    const flush = () => { timer = null; if (!n) return; post('quotes', Object.values(buf)); buf = {}; n = 0; last = Date.now(); };
    s.onAny((ev, d) => {
      if (ev === 'symbol:data' && d) {
        const list = (d.quoteList && d.quoteList.quotes) || (d.quote ? [d.quote] : []);
        for (const q of list) { if (!buf[q.symbol]) n++; buf[q.symbol] = q; }
        if (Date.now() - last >= 100) flush(); else if (!timer) timer = setTimeout(flush, 100);
      } else if (ev === 'symbol:subscriptionUpdate') post('subs', (d && d.symbols) || []);
      else if (ev === 'symbol:error') post('feedError', d);
    });
    window.__vcgFeed = true;
    return 'ok';
  })()`;

  const CHART_JS = `(() => {
    if (window.__vcgChart) return 'exists';
    const shared = globalThis._wsSharedManager; if (!shared) return 'none';
    const post = (type, d) => window.postMessage({ __vcg: type, d }, '*');
    // Fresh token from the web app's own token getter (it caches and renews ~1 min before expiry).
    function tokenGetter() {
      try {
        if (!window.__vcgReq && window.webpackChunk_N_E) window.webpackChunk_N_E.push([[Symbol('vcg')], {}, (r) => { window.__vcgReq = r; }]);
        const m = window.__vcgReq && window.__vcgReq(30264);
        return m && typeof m.hP === 'function' ? m.hP : null;
      } catch (e) { return null; }
    }
    async function freshAuth() {
      const base = { ...(shared.socket('/symbol').auth || {}) };
      const fn = tokenGetter();
      if (fn) {
        try { const t = await fn(); if (t && t.accessToken) return { token: t.accessToken, account: base.account || '', country: t.country || base.country || 'TH' }; }
        catch (e) { post('chartLog', 'token getter failed: ' + e.message); }
      } else post('chartLog', 'token getter not found — using feed token');
      return base;
    }
    // Last resort: make the page renew its own feed token (same path as its PERMISSION_DENIED handler).
    function nudgePageToken() {
      try { const s = shared.socket('/symbol'); (s._anyListeners || []).forEach((f) => f('symbol:error', { message: 'PERMISSION_DENIED (renew)' })); } catch (_) {}
    }
    const M = shared.constructor;
    const m = new M('wss://${WS_HOST}:443', { reconnection: false, transports: ['websocket'], autoConnect: false });
    const s = m.socket('/chart-history');
    s.auth = (cb) => { freshAuth().then(cb, () => cb({ ...(shared.socket('/symbol').auth || {}) })); };
    const api = { s, last: null, denied: [], req(o) { this.last = o; if (s.connected) s.emit('chart:subscribe', o); } };
    s.on('chart:data', (d) => post('chart', d));
    s.on('chart:error', (d) => {
      const denied = d && typeof d.message === 'string' && d.message.includes('PERMISSION_DENIED');
      post(denied ? 'chartAuthRenew' : 'chartError', d);
      if (denied) {
        const now = Date.now(); api.denied = api.denied.filter((t) => now - t < 60000); api.denied.push(now);
        if (api.denied.length >= 3) { post('chartLog', 'token ถูกปฏิเสธซ้ำ — ให้หน้าเว็บต่อ token ใหม่'); nudgePageToken(); }
        s.disconnect();  // 'disconnect' handler reconnects with freshAuth() and re-sends the last request
      }
    });
    s.on('connect', () => { post('chartConnected'); if (api.last) s.emit('chart:subscribe', api.last); });
    s.on('disconnect', (r) => { post('chartDisconnected', r); setTimeout(() => s.connect(), r === 'io client disconnect' ? 500 : 2000); });
    s.on('connect_error', (e) => { post('chartConnectError', e && e.message); setTimeout(() => s.connect(), 5000); });
    window.__vcgChart = api;
    s.connect();
    return 'ok';
  })()`;
  const CHART_REQ_JS = (o) => `window.__vcgChart && window.__vcgChart.req(${JSON.stringify(o)})`;
  // Forwards window.postMessage({__vcg}) from the page to the Android native bridge (no-op on desktop).
  const ANDROID_RELAY_JS = `(() => { if (window.__vcgRelay || !window.__vcgNative) return; window.__vcgRelay = true;
    window.addEventListener('message', (e) => { if (e.source === window && e.data && typeof e.data.__vcg === 'string') { try { window.__vcgNative.post(JSON.stringify({ type: e.data.__vcg, data: e.data.d })); } catch (_) {} } }); })()`;

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
