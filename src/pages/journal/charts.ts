// Balance curve + daily P/L bars of the journal page (lightweight-charts). Returns the charts so the page can remove them.
import { TC } from '../../state';
import { chartThemeOptions } from '../../chart/chart';
import { tz, type Computed } from './model.svelte';


export function drawCharts(d: Computed, eqEl: HTMLElement | undefined, dEl: HTMLElement | undefined): { remove(): void }[] {
  const LW = LightweightCharts, c = TC() as any, charts: { remove(): void }[] = [];
  const opt = { autoSize: true, ...chartThemeOptions(11), handleScroll: false, handleScale: false,
    rightPriceScale: { borderColor: c.border }, timeScale: { borderColor: c.border, timeVisible: false } };
  if (eqEl) {
    const ch = LW.createChart(eqEl, opt); charts.push(ch);
    const s = ch.addSeries(LW.AreaSeries, { lineColor: '#2962ff', topColor: '#2962ff40', bottomColor: '#2962ff05', lineWidth: 2, priceLineVisible: false });
    const pts: { time: number; value: number }[] = []; let last = -Infinity;
    for (const p of d.st.curve) { const t = Math.max(p.time + tz(), last + 1); last = t; pts.push({ time: t, value: p.balance }); }
    s.setData(pts);
    if (LW.createSeriesMarkers) LW.createSeriesMarkers(s, pts.filter((_, i) => d.st.curve[i].op).map((p) => ({ time: p.time, position: 'belowBar', shape: 'circle', color: '#f5a623', text: '' })));
    ch.timeScale().fitContent();
  }
  if (dEl) {
    const ch = LW.createChart(dEl, opt); charts.push(ch);
    const s = ch.addSeries(LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
    s.setData(d.st.byDay.map((g) => ({ time: g.key, value: g.net, color: g.net >= 0 ? c.up || '#26a69a' : c.down || '#ef5350' })));
    ch.timeScale().fitContent();
  }
  return charts;
}
