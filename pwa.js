import { PT, def } from './src/pt.ts';
// Web app (PWA): offline cache + "install as app" button. Only in a normal browser over http(s) —
// never inside the Android (Capacitor) app or the desktop (Electron) app.
(() => {
  const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (native || window.vcg?.platform === 'desktop' || !/^https?:$/.test(location.protocol) || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // a new version was deployed: take it on the next start, and tell the user
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller && PT.toast) PT.toast('มีเวอร์ชันใหม่ — ปิดแล้วเปิดแอปใหม่เพื่ออัปเดต', 'info', 8000);
      });
    });
  }).catch(() => {});

  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  let deferred = null;
  const btn = document.createElement('button');
  btn.id = 'pwa-install'; btn.className = 'hidden';
  btn.innerHTML = `${PT.ICON && PT.ICON.html ? PT.ICON.html('download', 16) : ''}<span>ติดตั้งเป็นแอป</span><i data-x title="ซ่อน">×</i>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
  if (document.body) document.body.appendChild(btn);
  const hidden = () => { try { return localStorage.getItem('pwaHide') === '1'; } catch (_) { return false; } };
  const show = () => { if (!hidden()) btn.classList.remove('hidden'); };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; show(); });
  window.addEventListener('appinstalled', () => { btn.classList.add('hidden'); if (PT.toast) PT.toast('ติดตั้งแล้ว — เปิดจากหน้าจอหลัก/Launchpad ได้เลย', 'ok'); });
  if (ios) setTimeout(show, 4000);
  btn.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) { btn.classList.add('hidden'); try { localStorage.setItem('pwaHide', '1'); } catch (_) {} return; }
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r.outcome === 'accepted') btn.classList.add('hidden'); }
    else if (ios && PT.toast) PT.toast('iPhone/iPad: กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศร) → "เพิ่มไปยังหน้าจอโฮม"', 'info', 10000);
  });
})();
