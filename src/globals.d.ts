// Globals the renderer gets from outside its own modules.
//  • vcg: the platform API — preload on desktop (src/main/preload.ts) or src/platform/bridge.ts on Android/web.
//    Desktop members are fully typed; platform-only extras (Android plugin calls) stay index-typed.
//  • APP_VERSION: set by version.js in the web build.
type VcgApi = import('./main/preload').VcgDesktopApi & { platform: string; [extra: string]: any };
declare global {
  const vcg: VcgApi;
  const APP_VERSION: string | undefined;
}
export {};
