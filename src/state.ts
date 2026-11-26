// Small shared mutable UI state that many modules write (Phase 2: was a top-level `let` written via PT).
// `view.dirty = true` asks the overlay to redraw on the next frame (app-overlay.js).
import { def } from './pt';

export const view = { dirty: true };
def({ dirty: [() => view.dirty, (v) => { view.dirty = Boolean(v); }] });
