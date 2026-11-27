<script lang="ts">
  // Connect screen card (connect.ts decides when it shows and fills cnModel).
  import Icon from '../Icon.svelte';
  import { cnModel, type CnAction } from './connect';
  let { act }: { act: (a: CnAction) => void } = $props();
  const m = $derived($cnModel);
  const MT5_STEPS = ['เปิด MT5 และ login บัญชีโบรกเกอร์', 'อนุญาต WebRequest ให้ 127.0.0.1', 'ติด EA PriceTrackerBridge บนกราฟ'];
</script>

{#snippet choices()}
  <div class="cn-q">ดึงราคาจากไหน?</div><div class="cn-srcs">
    <button class="cn-src {m?.source === 'demo' ? 'on' : ''}" data-src="demo" data-cn="demo" onclick={() => act('demo')}><i><Icon name="graduation-cap" size={22} bare /></i><b>Demo</b><small>ฝึก ไม่ต้อง login</small></button><button class="cn-src {m?.source === 'vcg' ? 'on' : ''}" data-src="vcg" onclick={() => act('src:vcg')}><i><Icon name="globe" size={22} bare /></i><b>VCG</b><small>บัญชี VCG Markets</small></button>{#if m?.desktopMt5}<button class="cn-src {m?.source === 'mt5' ? 'on' : ''}" data-src="mt5" onclick={() => act('src:mt5')}><i><Icon name="monitor" size={22} bare /></i><b>MT5</b><small>อ่านอย่างเดียว</small></button>{/if}</div>
{/snippet}
{#snippet status()}
  <div class="cn-status {m?.status.cls}"><span class="cn-dot"></span>{m?.status.text}</div>
{/snippet}
{#snippet foot()}
  <div class="cn-links"><button class="cn-link" data-cn="guide" onclick={() => act('guide')}><Icon name="book-open" size={14} />คู่มือเริ่มต้น</button><span>·</span><button class="cn-link" data-cn="log" onclick={() => act('log')}>ดู Log</button></div>
  <p class="cn-ro"><Icon name="shield-check" size={14} />อ่านและแสดงราคาเท่านั้น · ไม่ส่งคำสั่งซื้อขาย · ไม่ใช่คำแนะนำการลงทุน</p>
{/snippet}
{#snippet li(i: number, t: string, sub: string)}
  <li class={i < (m?.step ?? 1) ? 'done' : i === m?.step ? 'now' : ''}><b>{#if i < (m?.step ?? 1)}<Icon name="check" size={14} bare />{:else}{i + 1}{/if}</b><span>{t}{#if sub}<small>{sub}</small>{/if}</span></li>
{/snippet}

{#if m}
  {#if m.kind === 'web'}
    <div class="cn-card"><div class="cn-logo"><Icon name="chart-line" size={18} />Price Tracker</div><h3>เวอร์ชันเว็บใช้ข้อมูล Demo</h3>
      <p class="cn-p">ราคาจริงจาก VCG / MT5 ใช้ได้ในแอป Mac และแอป Android · บนเว็บฝึกได้ทุกอย่างด้วยข้อมูล Demo</p>
      <button class="cn-primary" data-cn="demo" onclick={() => act('demo')}>เริ่มใช้ Demo</button><button class="cn-link" data-cn="guide" onclick={() => act('guide')}><Icon name="book-open" size={14} />วิธีติดตั้งแอป Mac / Android</button></div>
  {:else if m.kind === 'mt5'}
    <div class="cn-card"><div class="cn-logo"><Icon name="chart-line" size={18} />Price Tracker</div>{@render choices()}
      <h3>รอราคาจาก MT5</h3>
      {@render status()}
      <ol class="cn-steps">{#each MT5_STEPS as t, i (i)}<li><b>{i + 1}</b><span>{t}</span></li>{/each}</ol>
      <button class="cn-primary" data-cn="mt5guide" onclick={() => act('mt5guide')}>ตัวช่วยเชื่อมต่อ MT5</button>
      <p class="cn-safe"><Icon name="lock" size={14} />รหัสผ่านบัญชีกรอกใน MT5 เท่านั้น · EA อ่านอย่างเดียว ส่งออเดอร์ไม่ได้ — ดูออเดอร์/โพซิชันของตัวเองได้</p>{@render foot()}</div>
  {:else}
    <div class="cn-card"><div class="cn-logo"><Icon name="chart-line" size={18} />Price Tracker</div>{@render choices()}
      <h3>เชื่อมต่อ VCG Markets</h3>{@render status()}
      <ol class="cn-steps">
        {@render li(0, 'เปิดหน้า VCG WebTrader', m.stage === 'starting' ? 'กำลังโหลด…' : '')}
        {@render li(1, 'เข้าสู่ระบบด้วยอีเมล + รหัสผ่าน', m.stage === 'login' ? (m.mobile ? 'ปุ่ม Google ใช้ในแอปไม่ได้ ใช้อีเมลแทน' : 'login ครั้งเดียว แอปจำไว้ให้') : '')}
        {@render li(2, 'รับราคาสด', m.stage === 'connecting' ? (m.slow ? 'นานกว่าปกติ' : 'ปกติใช้ไม่เกิน 10 วินาที') : '')}
      </ol>
      {#if !(m.stage === 'connecting' && !m.slow)}
        {#if m.slow || m.netBad}<button class="cn-primary" data-cn="retry" onclick={() => act('retry')}><Icon name="refresh-cw" size={16} />เชื่อมต่อใหม่</button>
        {:else}<button class="cn-primary" data-cn="login" onclick={() => act('login')}>{m.stage === 'connecting' ? 'เปิดหน้า VCG' : 'เข้าสู่ระบบ VCG'}</button>{/if}
      {/if}
      <p class="cn-safe"><Icon name="lock" size={14} />รหัสผ่านกรอกในหน้าของ VCG เอง แอปนี้ไม่เห็นและไม่เก็บรหัสผ่าน · {m.mobile ? 'login เสร็จหน้าจอจะปิดให้เอง' : 'login เสร็จปิดหน้าต่างนั้นได้เลย'}</p>
      <div class="cn-row">{#if m.stage === 'connecting' && !m.slow}<button data-cn="login" onclick={() => act('login')}>เปิดหน้า VCG</button>{/if}{#if m.slow || m.netBad}<button data-cn="login" onclick={() => act('login')}>เปิดหน้า VCG</button>{:else}<button data-cn="retry" onclick={() => act('retry')}><Icon name="refresh-cw" size={14} />เชื่อมต่อใหม่</button>{/if}</div>
      {@render foot()}
      <div class="cn-diag">{m.diag}</div>
    </div>
  {/if}
{/if}
