// Toast messages (bottom-right). Its own module so any file — even ones loaded before the app state —
// can import it; it reads the "show toasts" preference lazily from PT.S at call time.
import { PT, def } from '../pt';
import { ICON } from '../../icons.js';

export type ToastKind = 'info' | 'ok' | 'warn' | 'error';

export function toast(msg: unknown, kind: ToastKind | string = 'info', ms = 5000): void {
  const S = PT.S as { prefs?: { toast?: boolean } } | undefined;
  if (S && S.prefs && !S.prefs.toast && kind !== 'error') return;
  const box = document.getElementById('toasts'); if (!box) return;
  // one icon per kind (Lucide) instead of emoji in the text
  const t = document.createElement('div'); t.className = 'toast ' + kind;
  t.innerHTML = ICON.html(({ ok: 'circle-check', error: 'circle-x', warn: 'triangle-alert' } as Record<string, string>)[kind] || 'info', 16, 'toast-ic') + '<span></span>';
  (t.lastChild as HTMLElement).textContent = String(msg).replace(/^\s*(?:\p{Extended_Pictographic}️?\s*)+/u, '');
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild!.remove();
  setTimeout(() => t.remove(), ms);
}
def({ toast: [() => toast] });
