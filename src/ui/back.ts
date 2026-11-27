// Android back / mobile "back": a stack of handlers. The most recently registered runs first; the first one that
// returns true has handled the press. Replaces the old chained window.__mobileBack / PT.__mobileBack.
import { def } from '../pt';
type Handler = () => boolean;
const stack: Handler[] = [];
/** register a handler; returns an unregister function */
export function onBack(h: Handler): () => void { stack.unshift(h); return () => { const i = stack.indexOf(h); if (i >= 0) stack.splice(i, 1); }; }
/** run the handlers; true if one handled the back press */
export function back(): boolean { for (const h of stack.slice()) if (h()) return true; return false; }
// tests/devtools: PT.__mobileBack() runs the stack (old name kept for the UI suite)
def({ __mobileBack: [() => back] });
