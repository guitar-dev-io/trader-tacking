// Test preload: pretends to be the Android app (Capacitor + native VcgWeb plugin) so bridge.js runs its native path.
// The fake WebTrader page shows a login form until window.__mock.login() is called.
const listeners = {};
const mock = { url: 'https://vcgmarkets.com/webtrader', loggedIn: false, shows: 0, visible: false };
window.__mock = mock;
mock.login = () => { mock.loggedIn = true; };
const VcgWeb = {
  addListener: (n, cb) => { (listeners[n] ||= []).push(cb); return Promise.resolve({ remove() {} }); },
  start: async () => ({}),
  getUrl: async () => ({ url: mock.url }),
  eval: async ({ js }) => {
    if (js.includes('input[type=password]')) return { value: JSON.stringify(JSON.stringify({ pw: !mock.loggedIn, mgr: mock.loggedIn, path: '/webtrader', title: 'WebTrader' })) };
    if (js.includes('_wsSharedManager') && js.length < 400) return { value: JSON.stringify(mock.loggedIn ? false : false) };   // CONNECTED_JS: never connects in this mock
    return { value: 'null' };
  },
  show: async () => { mock.shows++; mock.visible = true; return { visible: true, w: 390, h: 800, url: mock.url }; },
  hide: async () => { mock.visible = false; (listeners.hidden || []).forEach((f) => f({})); return {}; },
  navigate: async () => ({}), reload: async () => ({}), clearData: async () => ({}), minimize: async () => ({}),
};
window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { VcgWeb }, registerPlugin: () => VcgWeb };
