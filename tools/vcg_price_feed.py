"""
VCG Markets live price feed (bid/ask) via the WebTrader Socket.IO stream.

How it works
------------
VCG WebTrader (vcgmarkets.com/webtrader) streams quotes over Socket.IO:
    server     : wss://prod-ws-server.anttix.app
    namespace  : /symbol
    auth       : {token: <JWT, ~15 min>, account: <account id>, country: <e.g. TH>}
    send       : "symbol:subscribe"  {"symbols": ["XAUUSD", ...]}
    receive    : "symbol:data"  {"quoteList": {"quotes": [...]}} | {"quote": {...}}
                 "symbol:subscriptionUpdate" {"symbols": [...]}
    price      : {"scale": 2, "value": 352834}  ->  3528.34

The JWT expires every 15 minutes and is refreshed by the web app itself, so this
script opens the real WebTrader in a browser (Playwright, with a saved profile),
lets the app handle login and tokens, and reads the WebSocket frames.

Setup
-----
    pip install playwright
    python -m playwright install chromium

Usage
-----
    # first run: a browser window opens, log in once (session is saved in ./vcg_profile)
    python vcg_price_feed.py XAUUSD EURUSD BTCUSD

    # later runs can be headless and write to CSV
    python vcg_price_feed.py XAUUSD EURUSD --headless --csv prices.csv
"""

import argparse
import asyncio
import csv
import json
import re
import sys
from datetime import datetime

WEBTRADER_URL = "https://vcgmarkets.com/webtrader"
WS_HOST = "prod-ws-server.anttix.app"
NAMESPACE = "/symbol"

# Socket.IO v4 text frame: "42/symbol,<optional ack id>[\"event\", payload]"
FRAME_RE = re.compile(r"^42" + re.escape(NAMESPACE) + r",\d*(\[.*\])$", re.S)


def decimal(v):
    """{'scale': 2, 'value': 352834} -> 3528.34"""
    if not isinstance(v, dict) or "value" not in v:
        return None
    return v["value"] / (10 ** v.get("scale", 0))


def parse_quote(q):
    bid, ask = decimal(q.get("bid")), decimal(q.get("ask"))
    pct = decimal(q.get("priceChangePercent"))  # ratio, e.g. -0.0065
    return {
        "symbol": q.get("symbol"),
        "time": q.get("time"),
        "bid": bid,
        "ask": ask,
        "spread": round(ask - bid, 10) if bid is not None and ask is not None else None,
        "change": decimal(q.get("priceChange")),
        "change_pct": round(pct * 100, 4) if pct is not None else None,
    }


def parse_frame(payload):
    """Return (event, data) for a /symbol Socket.IO frame, else None."""
    if not isinstance(payload, str):
        return None
    m = FRAME_RE.match(payload)
    if not m:
        return None
    try:
        arr = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None
    if not arr:
        return None
    return arr[0], (arr[1] if len(arr) > 1 else None)


def quotes_from_data(data):
    if not isinstance(data, dict):
        return []
    if data.get("quoteList", {}).get("quotes"):
        return [parse_quote(q) for q in data["quoteList"]["quotes"]]
    if data.get("quote"):
        return [parse_quote(data["quote"])]
    return []


# JS run inside the page: (re)subscribe using the app's own Socket.IO connection.
SUBSCRIBE_JS = """
(symbols) => {
  const mgr = globalThis._wsSharedManager;
  if (!mgr) return 'no-manager';
  const s = mgr.socket('/symbol');
  if (!s.connected) return 'not-connected';
  s.emit('symbol:subscribe', { symbols });
  return 'ok';
}
"""


async def run(symbols, headless, csv_path, profile_dir, quiet):
    from playwright.async_api import async_playwright

    wanted = set(s.upper() for s in symbols)
    current_subs = set()
    latest = {}
    csv_file = writer = None
    if csv_path:
        csv_file = open(csv_path, "a", newline="", encoding="utf-8")
        writer = csv.DictWriter(
            csv_file,
            fieldnames=["symbol", "time", "bid", "ask", "spread", "change", "change_pct"],
        )
        if csv_file.tell() == 0:
            writer.writeheader()

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            profile_dir, headless=headless, viewport={"width": 1400, "height": 900}
        )
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()

        def on_frame(payload):
            parsed = parse_frame(payload)
            if not parsed:
                return
            event, data = parsed
            if event == "symbol:subscriptionUpdate":
                current_subs.clear()
                current_subs.update((data or {}).get("symbols", []))
            elif event == "symbol:data":
                for q in quotes_from_data(data):
                    if q["symbol"] not in wanted:
                        continue
                    latest[q["symbol"]] = q
                    if writer:
                        writer.writerow(q)
                        csv_file.flush()
                    if not quiet:
                        print(
                            f"{q['time']}  {q['symbol']:<10} bid={q['bid']:<12} "
                            f"ask={q['ask']:<12} spread={q['spread']}  chg%={q['change_pct']}",
                            flush=True,
                        )

        def on_ws(ws):
            if WS_HOST in ws.url:
                ws.on("framereceived", on_frame)

        page.on("websocket", on_ws)  # must be attached before navigation
        await page.goto(WEBTRADER_URL)

        print("Waiting for WebTrader (log in in the browser window if asked)...", file=sys.stderr)
        while True:
            try:
                if "/webtrader" in page.url and await page.evaluate(
                    "() => !!(globalThis._wsSharedManager && "
                    "globalThis._wsSharedManager.socket('/symbol').connected)"
                ):
                    break
            except Exception:
                pass
            await asyncio.sleep(2)
        print(f"Connected. Subscribing: {sorted(wanted)}", file=sys.stderr)

        # Keep our symbols subscribed. The page re-sends its own list on reconnect
        # or when you change symbol, so we merge ours back in when that happens.
        while True:
            if not wanted.issubset(current_subs):
                merged = sorted(current_subs | wanted)
                try:
                    await page.evaluate(SUBSCRIBE_JS, merged)
                except Exception as e:  # page navigating / reloading
                    print(f"subscribe retry: {e}", file=sys.stderr)
            await asyncio.sleep(3)


def main():
    ap = argparse.ArgumentParser(description="VCG Markets live price feed")
    ap.add_argument("symbols", nargs="+", help="e.g. XAUUSD EURUSD BTCUSD")
    ap.add_argument("--headless", action="store_true", help="run without a window (after first login)")
    ap.add_argument("--csv", help="append every tick to this CSV file")
    ap.add_argument("--profile", default="./vcg_profile", help="browser profile dir (keeps login)")
    ap.add_argument("--quiet", action="store_true", help="do not print ticks")
    a = ap.parse_args()
    try:
        asyncio.run(run(a.symbols, a.headless, a.csv, a.profile, a.quiet))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
