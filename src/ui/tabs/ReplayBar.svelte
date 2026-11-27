<script lang="ts">
  // Bar Replay controls (learn.ts REPLAY owns the logic; this only renders and forwards clicks).
  import Icon from '../Icon.svelte';
  import { rp, type ReplayActions } from './replay-view';
  let { api }: { api: ReplayActions } = $props();
  const SPEEDS: [string, string][] = [['1', '1 แท่ง/วิ'], ['2', '2/วิ'], ['5', '5/วิ'], ['10', '10/วิ'], ['25', '25/วิ']];
</script>

<div id="replaybar" class={$rp.visible ? '' : 'hidden'}>
  <span class="rp-title"><Icon name="rewind" size={16} />Replay</span>
  <button data-r="back" title="ถอย 1 แท่ง" aria-label="ถอย 1 แท่ง" onclick={() => api.back()}><Icon name="skip-back" size={16} bare /></button><button data-r="play" title="เล่น/หยุด (Space)" aria-label="เล่น/หยุด" onclick={() => api.play()}><Icon name={$rp.playing ? 'pause' : 'play'} size={16} bare /></button><button data-r="step" title="เดินหน้า 1 แท่ง (→)" aria-label="เดินหน้า 1 แท่ง" onclick={() => api.step()}><Icon name="skip-forward" size={16} bare /></button>
  <select data-r="speed" title="ความเร็ว" value={String($rp.speed)} onchange={(e) => api.speed(+e.currentTarget.value)}>
    {#each SPEEDS as [v, t] (v)}<option value={v}>{t}</option>{/each}
  </select>
  <span class="rp-info">{$rp.info}</span><button data-r="exit" class="rp-exit" title="ออกจาก Replay" onclick={() => api.exit()}><Icon name="x" size={14} />ออก</button>
</div>
