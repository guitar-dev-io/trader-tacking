// Deterministic synthetic OHLC series for tests (seeded LCG random walk with slow trend waves).
function series(n, { start = 3400, step = 3600, seed = 7, wave = 120, amp = 0.6, noise = 6 } = {}) {
  let p = start, s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647, c = [];
  for (let i = 0; i < n; i++) {
    const o = p, cl = o + Math.sin(i / wave) * amp + (r() - 0.5) * noise;
    c.push({ time: 1.7e9 + i * step, open: o, high: Math.max(o, cl) + r() * 3, low: Math.min(o, cl) - r() * 3, close: cl }); p = cl;
  }
  return c;
}
module.exports = { series };
