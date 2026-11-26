// Source pill in the watchlist header (VCG / MT5 / Demo + state) with its switch menu; ⌘ → Ctrl in titles on Windows.
import { S } from '../../state';
import { connStatus } from '../../../app-data.js';
import { ui } from '../registry';
import { ICON } from '../../../icons.js';
import { setSource } from '../../../extras.js';
import { isWin, osKeys } from '../os';

declare const vcg: any;
export const SRC_UI = (() => {
  const st = (): Record<string, any> => connStatus || {};
  function info() {
    const s = st(), m = s.mt5 || {}, nq = Object.keys(S.quotes || {}).length;
    if (S.source === 'demo') return { cls: 'ok', t: 'Demo · Binance (ฝึก)', hint: '' };
    if (S.source === 'mt5') {
      if (!m.connected) return { cls: 'wait', t: 'MT5 · รอ EA เชื่อมต่อ', hint: 'เปิด MT5 แล้วติด EA PriceTrackerBridge บนกราฟ — กดที่ป้าย → วิธีเชื่อมต่อ' };
      const unk = (m.unknown || []);
      return { cls: nq ? 'ok' : 'wait', t: 'MT5 · ' + (m.broker || 'เชื่อมต่อแล้ว'),
        hint: unk.length ? `ไม่พบใน MT5: ${unk.join(', ')} — โบรกเกอร์นี้ใช้ชื่อเช่น ${(m.symbols || [])[0] || 'XAUUSD.m'} (แอปจับคู่ให้เองในเวอร์ชันใหม่)` : nq ? '' : 'Bid / Ask จะขึ้นเมื่อมี tick แรก · ช่วงตลาดปิดจะเป็น —' };
    }
    if (s.connected) return { cls: nq ? 'ok' : 'wait', t: 'VCG · ' + (nq ? 'ราคาสด' : 'รอ tick แรก'), hint: nq ? '' : 'Bid / Ask จะขึ้นเมื่อมี tick แรก · ช่วงตลาดปิดจะเป็น —' };
    return { cls: s.loggedIn ? 'wait' : 'bad', t: 'VCG · ' + (s.loggedIn ? 'กำลังเชื่อมต่อ…' : 'ยังไม่ได้ login'), hint: s.loggedIn ? '' : 'กดที่ป้ายด้านบน → วิธีเชื่อมต่อ / login' };
  }
  // pill menu: switch source / open the guide
  function menu() {
    let m: HTMLElement | null = document.getElementById('src-menu');
    if (m) { m.remove(); return; }
    const pill = document.getElementById('src-pill')!, r = pill.getBoundingClientRect();
    const cap = vcg.capabilities || {};
    const it = (k: string, icon: string, t: string, sub: string, dis?: boolean) => `<button role="menuitemradio" aria-checked="${S.source === k}" data-src="${k}" ${dis ? 'disabled' : ''}><i>${ICON.svg(icon, 20)}</i><span><b>${t}</b><small>${sub}</small></span>${S.source === k ? '<em>' + ICON.svg('check', 16) + '</em>' : ''}</button>`;
    m = document.createElement('div'); m.id = 'src-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = it('vcg', 'globe', 'VCG Markets', 'ราคาจริงจากบัญชี VCG', !cap.vcg)
      + (cap.mt5 ? it('mt5', 'monitor', 'MT5 โบรกเกอร์ของฉัน', 'EA อ่านอย่างเดียว ส่งออเดอร์ไม่ได้') : '')
      + it('demo', 'graduation-cap', 'Demo (ฝึก)', 'ไม่ต้อง login')
      + '<hr><button data-src="guide"><i>' + ICON.svg('book-open', 20) + '</i><span><b>วิธีเชื่อมต่อ / login</b><small>คู่มือเริ่มต้นทีละขั้น</small></span></button>';
    document.body.appendChild(m);
    const w = 260; m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px'; m.style.top = (r.bottom + 6) + 'px';
    m.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-src]') as HTMLButtonElement | null; if (!b || b.disabled) return;
      m!.remove();
      if (b.dataset.src === 'guide') ui.setup?.open(S.source === 'mt5' ? 'mt5' : S.source === 'demo' ? 'start' : 'vcg', S.source === 'vcg' ? 1 : 0);
      else if (b.dataset.src !== S.source) setSource(b.dataset.src!);
    };
    setTimeout(() => document.addEventListener('click', function off(e: Event) { if (!m!.contains(e.target as Node) && e.target !== pill) { m!.remove(); } document.removeEventListener('click', off, true); }, true), 0);
  }
  function render() {
    const pill = document.getElementById('src-pill') as (HTMLElement & { _wired?: number }) | null; if (!pill) return;
    if (!pill._wired) { pill._wired = 1; pill.onclick = (e) => { e.stopPropagation(); menu(); }; }
    const i = info(), cls = 'src-pill ' + i.cls;
    if (pill.className !== cls) pill.className = cls;
    if (pill.textContent !== i.t) pill.textContent = i.t;
    const h = document.getElementById('src-hint'); if (h && h.textContent !== i.hint) h.textContent = i.hint;
  }
  function osText() {
    if (!isWin()) return;
    document.querySelectorAll<HTMLElement>('[title*="⌘"]').forEach((e) => { e.title = osKeys(e.title); });
  }
  setTimeout(() => { render(); osText(); }, 0);
  setInterval(render, 1000);
  return { render, info, menu };
})();
ui.srcPill = SRC_UI;
