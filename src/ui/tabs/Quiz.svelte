<script lang="ts">
  // "ฝึกด้วย Replay" panel: pick a start bar, random exercise, skip/exit, results. learn.js QUIZ/REPLAY own the logic.
  import Icon from '../Icon.svelte';
  import { quizView } from './practice-view';
  let { api }: { api: any } = $props();
  const v = $derived($quizView);
</script>

{#if v}
  <div class="panel-h">ฝึกด้วย Replay</div>
  <p class="muted">ย้อนกราฟแล้วเล่นทีละแท่ง โดยไม่เห็นอนาคต — ฝึกตีโซน วางจุดเข้า SL TP แล้วดูผล</p>
  <div class="btns"><button id="rp-pick" onclick={() => api.pick()}><Icon name="rewind" size={15} />เลือกจุดเริ่มบนกราฟ</button><button id="rp-quiz" class="primary" onclick={() => api.start()}><Icon name="target" size={15} />สุ่มโจทย์</button>{#if v.canSkip}<button id="rp-skip" onclick={() => api.skip()}>ข้าม (ไม่เข้า)</button>{/if}{#if v.inReplay}<button id="rp-exit" onclick={() => api.exit()}>ออกจาก Replay</button>{/if}</div>
  <div class="sum" style="margin-top:8px"><span>โจทย์ที่ทำ</span><b>{v.done} (ข้าม {v.skipped})</b><span>ถูกทาง</span><b>{v.win}</b><span>R เฉลี่ย</span><b>{v.avgR}</b></div>
  <p class="muted">คีย์ลัด: Space = เล่น/หยุด · → = 1 แท่ง · Shift+→ = 10 แท่ง · ← = ถอย</p>
{/if}
