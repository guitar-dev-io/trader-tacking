// Types for the legacy icons module (icons.ts) used by TypeScript modules.
declare module '*icons.ts' {
  export const ICON: { svg(name: string, size?: number): string; html(name: string, size?: number, cls?: string): string; has(name: string): boolean };
}
