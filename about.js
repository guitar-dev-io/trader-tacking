import { PT, def } from './src/pt.ts';
import { $, esc } from './app-core.js';
def({ SUPPORT: [() => SUPPORT] });
// Developer credit + "support the developer" (settings → เกี่ยวกับ, mobile More page).
// Fill SUPPORT.links with real channels; entries without a url are not shown.
const SUPPORT = {
  developer: 'guiar-dev',
  repo: 'https://github.com/guitar-dev-io/trader-tacking',
  // EXAMPLES so the layout can be reviewed — replace with real channels (set example: false or remove the flag)
  links: [
    { label: 'PromptPay', sub: 'สแกน QR ด้วยแอปธนาคาร', qr: 'assets/support-qr-example.svg', url: '', example: true },
    { label: 'Buy Me a Coffee', sub: 'buymeacoffee.com/your-name', url: 'https://www.buymeacoffee.com/', example: true },
    { label: 'GitHub Sponsors', sub: 'github.com/sponsors/your-name', url: 'https://github.com/sponsors', example: true },
  ],
};
(() => {
  // Lucide icons (ISC): heart, github, bug, star
  const svg = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  };
  const links = SUPPORT.links.filter((l) => l.url || l.qr);
  const html = () => `<div class="about-dev">
      <div class="ad-row">${svg(I.code)}<span>พัฒนาโดย <b>${esc(SUPPORT.developer)}</b></span></div>
      <div class="ad-sup"><b>${svg(I.heart)}สนับสนุนผู้พัฒนา</b>
        <p class="muted">แอปนี้ใช้ฟรี ถ้ามีประโยชน์ช่วยสนับสนุนค่ากาแฟ ค่าเซิร์ฟเวอร์ และเวลาพัฒนาต่อได้ที่นี่</p>
        ${links.some((l) => l.example) ? '<p class="ad-ex">ตัวอย่างหน้าตา — ยังไม่ใช่ช่องทางจริง</p>' : ''}
        ${links.length ? `<div class="ad-links">${links.map((l) => `<a class="ad-btn${l.example ? ' ex' : ''}" ${l.url && !l.example ? `href="${esc(l.url)}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>${l.qr ? `<img src="${esc(l.qr)}" alt="">` : ''}<span><b>${esc(l.label)}</b><small>${esc(l.sub || '')}</small></span></a>`).join('')}</div>`
          : '<p class="muted ad-soon">ช่องทางสนับสนุนจะเปิดเร็ว ๆ นี้</p>'}
        <p class="muted">อีกวิธีที่ช่วยได้มาก: บอกต่อเพื่อนเทรดเดอร์ หรือแจ้งปัญหา/ไอเดียให้ผู้พัฒนา</p>
        <a class="ad-link" href="${SUPPORT.repo}/issues" target="_blank" rel="noopener">${svg(I.bug)}แจ้งปัญหา / เสนอไอเดีย</a>
      </div></div>`;
  function mount() {
    const about = document.querySelector('[data-sec="about"]');
    if (about && !about.querySelector('.about-dev')) { const v = $('st-about-ver'); (v || about.lastElementChild).insertAdjacentHTML(v ? 'beforebegin' : 'afterend', html()); }
    const more = document.querySelector('#tab-more .m-more');
    if (more && !more.querySelector('.about-dev')) { const ver = more.querySelector('.m-ver'); (ver || more.lastElementChild).insertAdjacentHTML('beforebegin', html()); }
  }
  mount(); setTimeout(mount, 1500);           // the mobile More page is built by mobile.js
  
})();
