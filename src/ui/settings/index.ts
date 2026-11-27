// Settings window (Svelte) + the small app-wide bits that lived in settings.js: the titlebar settings/theme
// buttons, Cmd+, and the MT5/EA toasts. Network status moved to src/ui/net.ts.
import { mount } from 'svelte';
import { def } from '../../pt';
import { THEME } from '../../state';
import { toast } from '../toast';
import { ui, type SettingsApi } from '../registry';
import { ICON } from '../../app/icons';
import { $ } from '../../app/app-core';
import '../net';
import Settings from './Settings.svelte';

const host = $('modal-settings')!;
host.replaceChildren();
const view = mount(Settings, { target: host }) as unknown as SettingsApi & { save: () => Promise<void> };
export const SETTINGS: SettingsApi = { open: (s?: string) => view.open(s), show: (k) => view.show(k), close: () => view.close(), eaInfo: () => view.eaInfo() };
ui.settings = SETTINGS;
export const openSettings = SETTINGS.open;

$('settings-btn')!.innerHTML = ICON.svg('gear', 18);
$('settings-btn')!.onclick = () => openSettings();
$('open-settings')!.onclick = () => openSettings();
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); openSettings(); } });

// ---- theme toggle in the titlebar
function syncThemeBtn() {
  const tb = $('theme-btn'); if (!tb) return;
  const t = THEME.get();
  tb.innerHTML = t === 'light' ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'
    : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>';
  tb.title = `ธีม: ${THEME.NAMES[t]} — กดเพื่อเปลี่ยน (มืด → สว่าง → คอนทราสต์สูง)`;
}
if ($('theme-btn')) $('theme-btn')!.onclick = () => { THEME.next(); toast('ธีม: ' + THEME.NAMES[THEME.get()], 'info', 1800); };
THEME.onChange(syncThemeBtn);
syncThemeBtn();

// ---- MT5 auto-launch + EA auto-update messages from the main process
if (vcg.onMt5Auto) vcg.onMt5Auto((m: any) => { if (m && m.state === 'launching') toast('กำลังเปิด MT5 ให้อัตโนมัติ (ย่อหน้าต่าง) — รอสักครู่', 'info', 6000); });
if (vcg.onEAUpdate) vcg.onEAUpdate((d: any) => {
  toast(d.msg + (d.manual ? ' · การตั้งค่า → แหล่งราคา → MT5 → "เปิด MetaEditor"' : ''), d.state === 'ok' ? 'ok' : d.state === 'fail' ? 'warn' : 'info', d.state === 'start' ? 6000 : 12000);
  if (d.state !== 'start') SETTINGS.eaInfo();
});

def({ openSettings: [() => openSettings] });   // tests: PT.openSettings()
