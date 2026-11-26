// Developer credit + "support the developer" channels. Entries without a url/qr are not shown.
export interface SupportLink { label: string; sub?: string; url?: string; qr?: string; example?: boolean }
export const SUPPORT: { developer: string; repo: string; links: SupportLink[] } = {
  developer: 'guiar-dev',
  repo: 'https://github.com/guitar-dev-io/trader-tacking',
  // EXAMPLES so the layout can be reviewed — replace with real channels (set example: false or remove the flag)
  links: [
    { label: 'PromptPay', sub: 'สแกน QR ด้วยแอปธนาคาร', qr: 'assets/support-qr-example.svg', url: '', example: true },
    { label: 'Buy Me a Coffee', sub: 'buymeacoffee.com/your-name', url: 'https://www.buymeacoffee.com/', example: true },
    { label: 'GitHub Sponsors', sub: 'github.com/sponsors/your-name', url: 'https://github.com/sponsors', example: true },
  ],
};
