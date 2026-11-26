<script lang="ts">
  // Developer credit + support box (settings → เกี่ยวกับ, mobile More page). Lucide icons (ISC): heart, code, bug.
  import { SUPPORT } from './support';
  const I = {
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  };
  const svg = (d: string) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const links = SUPPORT.links.filter((l) => l.url || l.qr);
</script>

<div class="about-dev">
  <div class="ad-row">{@html svg(I.code)}<span>พัฒนาโดย <b>{SUPPORT.developer}</b></span></div>
  <div class="ad-sup"><b>{@html svg(I.heart)}สนับสนุนผู้พัฒนา</b>
    <p class="muted">แอปนี้ใช้ฟรี ถ้ามีประโยชน์ช่วยสนับสนุนค่ากาแฟ ค่าเซิร์ฟเวอร์ และเวลาพัฒนาต่อได้ที่นี่</p>
    {#if links.some((l) => l.example)}<p class="ad-ex">ตัวอย่างหน้าตา — ยังไม่ใช่ช่องทางจริง</p>{/if}
    {#if links.length}
      <div class="ad-links">{#each links as l (l.label)}<a class="ad-btn" class:ex={l.example} href={l.url && !l.example ? l.url : undefined} target={l.url && !l.example ? '_blank' : undefined} rel={l.url && !l.example ? 'noopener' : undefined} aria-disabled={l.url && !l.example ? undefined : 'true'}>{#if l.qr}<img src={l.qr} alt="">{/if}<span><b>{l.label}</b><small>{l.sub || ''}</small></span></a>{/each}</div>
    {:else}<p class="muted ad-soon">ช่องทางสนับสนุนจะเปิดเร็ว ๆ นี้</p>{/if}
    <p class="muted">อีกวิธีที่ช่วยได้มาก: บอกต่อเพื่อนเทรดเดอร์ หรือแจ้งปัญหา/ไอเดียให้ผู้พัฒนา</p>
    <a class="ad-link" href="{SUPPORT.repo}/issues" target="_blank" rel="noopener">{@html svg(I.bug)}แจ้งปัญหา / เสนอไอเดีย</a>
  </div>
</div>
