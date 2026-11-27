// Windows or macOS? (the desktop preload tags <html> with os-win32 / os-darwin)
export function isWin(): boolean {
  const c = document.documentElement.classList;
  return (typeof vcg !== 'undefined' && vcg.os === 'win32') || c.contains('os-win32') || (!c.contains('os-darwin') && /^Win/i.test(navigator.platform || ''));
}
// "⌘," → "Ctrl+," on Windows, for shortcut hints in UI text
export function osKeys(t: string): string { return isWin() ? String(t).replace(/⇧⌘/g, 'Ctrl+Shift+').replace(/⌘/g, 'Ctrl+') : t; }
