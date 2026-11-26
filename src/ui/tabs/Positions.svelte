<script lang="ts">
  // "ออเดอร์ของฉัน (MT5)" panel in the ราคา tab — READ-ONLY view of the user's MT5 account, positions, pending
  // orders and (optionally) deal history. positions.js owns the data and the chart lines; it pushes a snapshot
  // into `posView`. Nothing here can place, change or close an order.
  import Icon from '../Icon.svelte';
  import { posView } from './positions-view';

  let { onRow, onOpt }: { onRow: (sym: string) => void; onOpt: (k: 'onChart' | 'hist' | 'days', v: boolean | number) => void } = $props();
  const ORD: Record<string, string> = { buy_limit: 'Buy Limit', sell_limit: 'Sell Limit', buy_stop: 'Buy Stop', sell_stop: 'Sell Stop', buy_stop_limit: 'Buy Stop Limit', sell_stop_limit: 'Sell Stop Limit' };
  const money = (v: number) => (v >= 0 ? '+' : '') + Number(v).toFixed(2);
  const cls = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
  const when = (t: number) => new Date(t * 1000).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const v = $derived($posView);
  const a = $derived((v.data && v.data.acct) || {});
  const hist = $derived.by(() => {
    if (!v.deals) return null;
    const closed = v.deals.filter((x: any) => x.entry === 'out' || x.entry === 'inout' || x.entry === 'outby');
    const net = closed.reduce((s: number, x: any) => s + x.profit + x.commission + x.swap, 0) + v.deals.filter((x: any) => x.entry === 'in').reduce((s: number, x: any) => s + x.commission, 0);
    const win = closed.filter((x: any) => x.profit > 0).length;
    return { closed, net, wr: closed.length ? Math.round((win / closed.length) * 100) : 0, rows: closed.slice(-15).reverse() };
  });
</script>

<div class="pos-h"><b>ออเดอร์ของฉัน (MT5)</b><span class="pos-ro" title="แอปนี้อ่านอย่างเดียว ส่ง/แก้/ปิดออเดอร์ไม่ได้"><Icon name="lock" size={11} />อ่านอย่างเดียว</span>{#if v.data}<span class="pos-acc {a.demo ? 'demo' : 'real'}">{a.demo ? 'DEMO' : 'REAL'}</span>{/if}</div>
{#if !v.data}
  <p class="muted pos-empty">{!v.mt5.connected ? 'รอ EA ใน MT5 เชื่อมต่อ…' : v.mt5.eaVersion && v.mt5.eaVersion < 2 ? 'EA ใน MT5 เป็นรุ่นเก่า — กด "เปิด MT5 พร้อม EA" ในคู่มือ หรือติดตั้ง EA ใหม่ เพื่อดูออเดอร์ของคุณ' : 'กำลังอ่านข้อมูลบัญชี…'}</p>
{:else}
  {@const fl = (a.equity || 0) - (a.balance || 0)}
  <div class="pos-acct"><span>Balance<b>{Number(a.balance || 0).toFixed(2)}</b></span><span>Equity<b>{Number(a.equity || 0).toFixed(2)}</b></span><span>ลอยตัว<b class={cls(fl)}>{money(fl)}</b></span><small>{a.currency || ''}{a.leverage ? ' · 1:' + a.leverage : ''}</small></div>
  {#if v.data.positions.length || v.data.orders.length}
    <table class="pos-t"><tbody>
      {#each v.data.positions as p}<tr data-s={p.s} class={v.same(p.s) ? 'cur' : ''} onclick={() => onRow(p.s)}><td>{p.s}</td>
        <td class={p.side === 'buy' ? 'up' : 'down'}>{p.side === 'buy' ? 'Buy' : 'Sell'} {p.vol}</td><td>{p.open}<small>→ {p.price}</small></td>
        <td class={cls(p.profit + p.swap)}>{money(p.profit + p.swap)}</td></tr>{/each}
      {#each v.data.orders as o}<tr data-s={o.s} class={v.same(o.s) ? 'cur' : ''} onclick={() => onRow(o.s)}><td>{o.s}</td><td>{ORD[o.type] || o.type} {o.vol}</td><td>{o.price}</td><td class="muted">รอ</td></tr>{/each}
    </tbody></table>
  {:else}<p class="muted pos-empty">ไม่มีออเดอร์เปิดอยู่</p>{/if}
{/if}
<div class="pos-opts"><label class="chk"><input type="checkbox" data-o="onChart" checked={v.opt.onChart} onchange={(e) => onOpt('onChart', (e.currentTarget as HTMLInputElement).checked)}> เส้นบนกราฟ</label>
  <label class="chk"><input type="checkbox" data-o="hist" checked={v.opt.hist} onchange={(e) => onOpt('hist', (e.currentTarget as HTMLInputElement).checked)}> ประวัติ</label>
  {#if v.opt.hist}<select data-o="days" value={v.opt.days} onchange={(e) => onOpt('days', +(e.currentTarget as HTMLSelectElement).value)}>{#each [1, 7, 30, 90] as n}<option value={n}>{n} วัน</option>{/each}</select>{/if}</div>
{#if hist}
  <div class="pos-hist"><div class="pos-sum">ปิดไป <b>{hist.closed.length}</b> ครั้ง · ชนะ <b>{hist.wr}%</b> · สุทธิ <b class={cls(hist.net)}>{money(hist.net)}</b></div>
    {#if hist.rows.length}<table class="pos-t"><tbody>{#each hist.rows as x}<tr data-s={x.s} onclick={() => onRow(x.s)}><td>{when(x.time)}</td><td>{x.s}</td><td>{x.side === 'sell' ? 'ปิด Buy' : 'ปิด Sell'} {x.vol}</td><td class={cls(x.profit)}>{money(x.profit + x.commission + x.swap)}</td></tr>{/each}</tbody></table>
    {:else}<p class="muted pos-empty">ไม่มีการซื้อขายในช่วงนี้</p>{/if}</div>
{/if}
