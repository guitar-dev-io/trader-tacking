//+------------------------------------------------------------------+
//| PriceTrackerBridge.mq5                                            |
//| Streams prices and candles from this MetaTrader 5 terminal to the |
//| Price Tracker app on the same computer (TCP 127.0.0.1).           |
//|                                                                   |
//| Setup (once):                                                     |
//|  1. Tools > Options > Expert Advisors:                            |
//|       - Allow algorithmic trading is NOT needed (read-only EA)    |
//|       - Allow WebRequest for listed URL: add 127.0.0.1            |
//|  2. In Price Tracker choose data source "MT5"                     |
//|  3. Drag this EA onto any chart (keep that chart open)            |
//|                                                                   |
//| The EA never places or changes orders. It only READS prices and   |
//| (when asked) your own positions, pending orders and deal history. |
//+------------------------------------------------------------------+
#property copyright "Price Tracker"
#property version   "1.02"
#property description "Sends ticks and candles to Price Tracker (127.0.0.1). Read-only: it never trades."

input string InpHost    = "127.0.0.1"; // Price Tracker address
input int    InpPort    = 7788;        // Price Tracker MT5 port
input int    InpTimerMs = 100;         // How often to send prices (ms)

struct SubInfo
  {
   string            slot;
   string            sym;
   string            tfName;
   ENUM_TIMEFRAMES   tf;
   datetime          lastBarTime;
   double            lastClose;
   double            lastHigh;
   double            lastLow;
  };

int      g_sock = INVALID_HANDLE;
string   g_rx = "";
string   g_watch[];
long     g_lastMsc[];
SubInfo  g_subs[];
long     g_offset = 0;           // broker server time - GMT (seconds)
datetime g_lastTry = 0;
bool     g_warned4014 = false;
bool     g_posSub = false;       // app wants positions/orders pushed when they change
string   g_posLast = "";
uint     g_posAt = 0;

// forward declarations (older MetaEditor builds want them)
bool   EnsureConnected();
void   ReadCommands();
void   SendTicks();
void   SendSubscriptions();
void   HandleCommand(string line);
void   SendHistory(string id, string sym, string tfName, int count, long toUnix);
bool   SendLine(string s);
string Esc(string s);
string BarJson(const MqlRates &r, int digits);
long   ServerOffset();
string MarketWatchJson();
ENUM_TIMEFRAMES TfFrom(string s);
string PositionsJson();
void   SendPositions(bool force);
void   SendDeals(string id, long fromUnix, long toUnix);
//+------------------------------------------------------------------+
int OnInit()
  {
   EventSetMillisecondTimer((int)MathMax(20, InpTimerMs));
   Print("PriceTrackerBridge: started, connecting to ", InpHost, ":", InpPort);
   return(INIT_SUCCEEDED);
  }
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(g_sock != INVALID_HANDLE)
      SocketClose(g_sock);
   g_sock = INVALID_HANDLE;
  }
//+------------------------------------------------------------------+
void OnTimer()
  {
   if(!EnsureConnected())
      return;
   ReadCommands();
   SendTicks();
   SendSubscriptions();
   SendPositions(false);
  }
//+------------------------------------------------------------------+
long ServerOffset()
  {
   long d = (long)(TimeTradeServer() - TimeGMT());
   return (long)(MathRound(d / 900.0) * 900);   // round to 15 minutes
  }
//+------------------------------------------------------------------+
string Esc(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
  }
//+------------------------------------------------------------------+
bool SendLine(string s)
  {
   if(g_sock == INVALID_HANDLE)
      return false;
   uchar buf[];
   int n = StringToCharArray(s + "\n", buf, 0, WHOLE_ARRAY, CP_UTF8) - 1;   // drop the trailing 0
   if(n <= 0)
      return true;
   int sent = SocketSend(g_sock, buf, (uint)n);
   if(sent < 0)
     {
      Print("PriceTrackerBridge: send failed (", GetLastError(), ") - reconnecting");
      SocketClose(g_sock);
      g_sock = INVALID_HANDLE;
      return false;
     }
   return true;
  }
//+------------------------------------------------------------------+
string MarketWatchJson()
  {
   string s = "";
   int n = (int)MathMin(SymbolsTotal(true), 300);
   for(int i = 0; i < n; i++)
     {
      if(i > 0)
         s += ",";
      s += "\"" + Esc(SymbolName(i, true)) + "\"";
     }
   return s;
  }
//+------------------------------------------------------------------+
bool EnsureConnected()
  {
   if(g_sock != INVALID_HANDLE && SocketIsConnected(g_sock))
      return true;
   if(g_sock != INVALID_HANDLE)
     {
      SocketClose(g_sock);
      g_sock = INVALID_HANDLE;
     }
   if(TimeLocal() - g_lastTry < 3)
      return false;
   g_lastTry = TimeLocal();
   g_sock = SocketCreate();
   if(g_sock == INVALID_HANDLE)
     {
      Print("PriceTrackerBridge: SocketCreate failed ", GetLastError());
      return false;
     }
   if(!SocketConnect(g_sock, InpHost, (uint)InpPort, 1000))
     {
      int err = GetLastError();
      if(err == 4014 && !g_warned4014)
        {
         Print("PriceTrackerBridge: network not allowed (4014). Add 127.0.0.1 to Tools > Options > Expert Advisors > Allow WebRequest for listed URL. (Does not work in the Strategy Tester.)");
         g_warned4014 = true;
        }
      SocketClose(g_sock);
      g_sock = INVALID_HANDLE;
      return false;
     }
   g_rx = "";
   g_posSub = false;
   g_posLast = "";
   g_offset = ServerOffset();
   ArrayResize(g_subs, 0);
   Print("PriceTrackerBridge: connected to Price Tracker");
   string hello = StringFormat("{\"t\":\"hello\",\"v\":2,\"caps\":[\"pos\",\"deals\"],\"broker\":\"%s\",\"server\":\"%s\",\"offset\":%I64d,\"symbols\":[%s]}",
                               Esc(AccountInfoString(ACCOUNT_COMPANY)), Esc(AccountInfoString(ACCOUNT_SERVER)), g_offset, MarketWatchJson());
   return SendLine(hello);
  }
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES TfFrom(string s)
  {
   if(s == "M1")  return PERIOD_M1;
   if(s == "M5")  return PERIOD_M5;
   if(s == "M15") return PERIOD_M15;
   if(s == "M30") return PERIOD_M30;
   if(s == "H1")  return PERIOD_H1;
   if(s == "H4")  return PERIOD_H4;
   if(s == "D1")  return PERIOD_D1;
   if(s == "W1")  return PERIOD_W1;
   return PERIOD_CURRENT;
  }
//+------------------------------------------------------------------+
string BarJson(const MqlRates &r, int digits)
  {
   return StringFormat("[%I64d,%s,%s,%s,%s]", (long)r.time - g_offset,
                       DoubleToString(r.open, digits), DoubleToString(r.high, digits),
                       DoubleToString(r.low, digits), DoubleToString(r.close, digits));
  }
//+------------------------------------------------------------------+
void ReadCommands()
  {
   uint avail = SocketIsReadable(g_sock);
   if(avail > 0)
     {
      uchar buf[];
      int got = SocketRead(g_sock, buf, avail, 20);
      if(got > 0)
         g_rx += CharArrayToString(buf, 0, got, CP_UTF8);
     }
   int p = StringFind(g_rx, "\n");
   while(p >= 0)
     {
      string line = StringSubstr(g_rx, 0, p);
      g_rx = StringSubstr(g_rx, p + 1);
      StringTrimRight(line);
      HandleCommand(line);
      p = StringFind(g_rx, "\n");
     }
  }
//+------------------------------------------------------------------+
//| Commands from Price Tracker (one per line, fields split by "|"):  |
//|   WATCH|SYM1,SYM2              send ticks for these symbols       |
//|   HIST|id|SYM|TF|count|toUnix  send history (toUnix = UTC, 0=now) |
//|   SUB|slot|SYM|TF              stream the forming candle          |
//|   POS|1 / POS|0                 push my positions + orders (on/off)|
//|   DEALS|id|fromUnix|toUnix      my deal history (UTC, read-only)   |
//|   PING                                                             |
//+------------------------------------------------------------------+
void HandleCommand(string line)
  {
   if(line == "")
      return;
   string f[];
   int n = StringSplit(line, '|', f);
   if(n <= 0)
      return;
   if(f[0] == "PING")
     {
      SendLine("{\"t\":\"pong\"}");
      return;
     }
   if(f[0] == "WATCH" && n >= 2)
     {
      string syms[];
      int k = StringSplit(f[1], ',', syms);
      ArrayResize(g_watch, 0);
      ArrayResize(g_lastMsc, 0);
      for(int i = 0; i < k; i++)
        {
         if(syms[i] == "")
            continue;
         if(!SymbolSelect(syms[i], true))
           {
            SendLine(StringFormat("{\"t\":\"unknown\",\"s\":\"%s\"}", Esc(syms[i])));
            continue;
           }
         int m = ArraySize(g_watch);
         ArrayResize(g_watch, m + 1);
         ArrayResize(g_lastMsc, m + 1);
         g_watch[m] = syms[i];
         g_lastMsc[m] = 0;
        }
      return;
     }
   if(f[0] == "HIST" && n >= 6)
     {
      SendHistory(f[1], f[2], f[3], (int)StringToInteger(f[4]), StringToInteger(f[5]));
      return;
     }
   if(f[0] == "POS")
     {
      g_posSub = (n < 2 || f[1] != "0");
      SendPositions(true);
      return;
     }
   if(f[0] == "DEALS" && n >= 4)
     {
      SendDeals(f[1], StringToInteger(f[2]), StringToInteger(f[3]));
      return;
     }
   if(f[0] == "SUB" && n >= 4)
     {
      ENUM_TIMEFRAMES tf = TfFrom(f[3]);
      SymbolSelect(f[2], true);
      int idx = -1;
      for(int i = 0; i < ArraySize(g_subs); i++)
         if(g_subs[i].slot == f[1])
            idx = i;
      if(idx < 0)
        {
         idx = ArraySize(g_subs);
         ArrayResize(g_subs, idx + 1);
        }
      g_subs[idx].slot = f[1];
      g_subs[idx].sym = f[2];
      g_subs[idx].tfName = f[3];
      g_subs[idx].tf = tf;
      g_subs[idx].lastBarTime = 0;
      g_subs[idx].lastClose = 0;
      g_subs[idx].lastHigh = 0;
      g_subs[idx].lastLow = 0;
      return;
     }
  }
//+------------------------------------------------------------------+
void SendHistory(string id, string sym, string tfName, int count, long toUnix)
  {
   ENUM_TIMEFRAMES tf = TfFrom(tfName);
   if(!SymbolSelect(sym, true))
     {
      SendLine(StringFormat("{\"t\":\"err\",\"id\":%s,\"msg\":\"unknown symbol %s\"}", id, Esc(sym)));
      return;
     }
   count = (int)MathMax(10, MathMin(count, 5000));
   datetime toTime = (toUnix > 0) ? (datetime)(toUnix + g_offset) : TimeTradeServer();
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int got = CopyRates(sym, tf, toTime, count, r);
   if(got <= 0)
     {
      SendLine(StringFormat("{\"t\":\"err\",\"id\":%s,\"retry\":1,\"msg\":\"history not ready (%d)\"}", id, GetLastError()));
      return;
     }
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   string s = StringFormat("{\"t\":\"bars\",\"id\":%s,\"s\":\"%s\",\"tf\":\"%s\",\"dg\":%d,\"bars\":[", id, Esc(sym), tfName, digits);
   for(int i = 0; i < got; i++)
     {
      if(i > 0)
         s += ",";
      s += BarJson(r[i], digits);
     }
   s += "]}";
   SendLine(s);
  }
//+------------------------------------------------------------------+
void SendTicks()
  {
   for(int i = 0; i < ArraySize(g_watch); i++)
     {
      MqlTick t;
      if(!SymbolInfoTick(g_watch[i], t))
         continue;
      if((long)t.time_msc == g_lastMsc[i])
         continue;
      g_lastMsc[i] = (long)t.time_msc;
      int digits = (int)SymbolInfoInteger(g_watch[i], SYMBOL_DIGITS);
      double dayOpen = iOpen(g_watch[i], PERIOD_D1, 0);
      SendLine(StringFormat("{\"t\":\"tick\",\"s\":\"%s\",\"bid\":%s,\"ask\":%s,\"ms\":%I64d,\"dg\":%d,\"open\":%s}",
                            Esc(g_watch[i]), DoubleToString(t.bid, digits), DoubleToString(t.ask, digits),
                            (long)t.time_msc - g_offset * 1000, digits, DoubleToString(dayOpen, digits)));
     }
  }
//+------------------------------------------------------------------+
void SendSubscriptions()
  {
   for(int i = 0; i < ArraySize(g_subs); i++)
     {
      MqlRates r[];
      ArraySetAsSeries(r, false);
      if(CopyRates(g_subs[i].sym, g_subs[i].tf, 0, 2, r) != 2)
         continue;
      int digits = (int)SymbolInfoInteger(g_subs[i].sym, SYMBOL_DIGITS);
      bool newBar = (r[1].time != g_subs[i].lastBarTime);
      bool changed = newBar || r[1].close != g_subs[i].lastClose || r[1].high != g_subs[i].lastHigh || r[1].low != g_subs[i].lastLow;
      if(!changed)
         continue;
      string bars = newBar ? BarJson(r[0], digits) + "," + BarJson(r[1], digits) : BarJson(r[1], digits);
      SendLine(StringFormat("{\"t\":\"bar\",\"slot\":\"%s\",\"s\":\"%s\",\"tf\":\"%s\",\"bars\":[%s]}",
                            Esc(g_subs[i].slot), Esc(g_subs[i].sym), g_subs[i].tfName, bars));
      g_subs[i].lastBarTime = r[1].time;
      g_subs[i].lastClose = r[1].close;
      g_subs[i].lastHigh = r[1].high;
      g_subs[i].lastLow = r[1].low;
     }
  }
//+------------------------------------------------------------------+
//+------------------------------------------------------------------+
//| Read-only: the trader's own positions, pending orders and account |
//+------------------------------------------------------------------+
string Num(double v, int digits)
  {
   return DoubleToString(v, digits);
  }
string PositionsJson()
  {
   string s = "{\"t\":\"pos\",\"acct\":{";
   s += StringFormat("\"currency\":\"%s\",\"balance\":%s,\"equity\":%s,\"margin\":%s,\"free\":%s,\"leverage\":%I64d,\"demo\":%s",
                     Esc(AccountInfoString(ACCOUNT_CURRENCY)), Num(AccountInfoDouble(ACCOUNT_BALANCE), 2), Num(AccountInfoDouble(ACCOUNT_EQUITY), 2),
                     Num(AccountInfoDouble(ACCOUNT_MARGIN), 2), Num(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2), AccountInfoInteger(ACCOUNT_LEVERAGE),
                     (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL) ? "false" : "true");
   s += "},\"positions\":[";
   int n = PositionsTotal();
   for(int i = 0; i < n; i++)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0)
         continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      if(StringLen(s) > 0 && StringSubstr(s, StringLen(s) - 1) != "[")
         s += ",";
      s += StringFormat("{\"ticket\":%I64u,\"s\":\"%s\",\"side\":\"%s\",\"vol\":%s,\"open\":%s,\"sl\":%s,\"tp\":%s,\"price\":%s,\"profit\":%s,\"swap\":%s,\"time\":%I64d,\"magic\":%I64d,\"comment\":\"%s\"}",
                        tk, Esc(sym), (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "buy" : "sell",
                        Num(PositionGetDouble(POSITION_VOLUME), 2), Num(PositionGetDouble(POSITION_PRICE_OPEN), dg),
                        Num(PositionGetDouble(POSITION_SL), dg), Num(PositionGetDouble(POSITION_TP), dg),
                        Num(PositionGetDouble(POSITION_PRICE_CURRENT), dg), Num(PositionGetDouble(POSITION_PROFIT), 2),
                        Num(PositionGetDouble(POSITION_SWAP), 2), (long)PositionGetInteger(POSITION_TIME) - g_offset,
                        PositionGetInteger(POSITION_MAGIC), Esc(PositionGetString(POSITION_COMMENT)));
     }
   s += "],\"orders\":[";
   n = OrdersTotal();
   for(int i = 0; i < n; i++)
     {
      ulong tk = OrderGetTicket(i);
      if(tk == 0)
         continue;
      string sym = OrderGetString(ORDER_SYMBOL);
      int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      string ty = EnumToString((ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE));
      StringReplace(ty, "ORDER_TYPE_", "");
      StringToLower(ty);
      if(StringSubstr(s, StringLen(s) - 1) != "[")
         s += ",";
      s += StringFormat("{\"ticket\":%I64u,\"s\":\"%s\",\"type\":\"%s\",\"vol\":%s,\"price\":%s,\"sl\":%s,\"tp\":%s,\"time\":%I64d}",
                        tk, Esc(sym), ty, Num(OrderGetDouble(ORDER_VOLUME_CURRENT), 2), Num(OrderGetDouble(ORDER_PRICE_OPEN), dg),
                        Num(OrderGetDouble(ORDER_SL), dg), Num(OrderGetDouble(ORDER_TP), dg), (long)OrderGetInteger(ORDER_TIME_SETUP) - g_offset);
     }
   s += "]}";
   return s;
  }
//+------------------------------------------------------------------+
void SendPositions(bool force)
  {
   if(!force && !g_posSub)
      return;
   if(!force && GetTickCount() - g_posAt < 1000)
      return;                                  // at most once per second
   g_posAt = GetTickCount();
   string s = PositionsJson();
   if(!force && s == g_posLast)
      return;
   g_posLast = s;
   SendLine(s);
  }
//+------------------------------------------------------------------+
void SendDeals(string id, long fromUnix, long toUnix)
  {
   datetime fromT = (datetime)(fromUnix + g_offset);
   datetime toT = (toUnix > 0) ? (datetime)(toUnix + g_offset) : TimeTradeServer() + 3600;
   if(!HistorySelect(fromT, toT))
     {
      SendLine(StringFormat("{\"t\":\"err\",\"id\":%s,\"msg\":\"HistorySelect failed (%d)\"}", id, GetLastError()));
      return;
     }
   string s = StringFormat("{\"t\":\"deals\",\"id\":%s,\"deals\":[", id);
   int n = (int)MathMin(HistoryDealsTotal(), 2000);
   bool first = true;
   for(int i = 0; i < n; i++)
     {
      ulong tk = HistoryDealGetTicket(i);
      if(tk == 0)
         continue;
      long ty = HistoryDealGetInteger(tk, DEAL_TYPE);
      if(ty != DEAL_TYPE_BUY && ty != DEAL_TYPE_SELL)
         continue;                             // skip balance / credit / commission rows
      string sym = HistoryDealGetString(tk, DEAL_SYMBOL);
      int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      long en = HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(!first)
         s += ",";
      first = false;
      s += StringFormat("{\"ticket\":%I64u,\"pos\":%I64d,\"s\":\"%s\",\"side\":\"%s\",\"entry\":\"%s\",\"vol\":%s,\"price\":%s,\"profit\":%s,\"commission\":%s,\"swap\":%s,\"time\":%I64d}",
                        tk, HistoryDealGetInteger(tk, DEAL_POSITION_ID), Esc(sym), (ty == DEAL_TYPE_BUY) ? "buy" : "sell",
                        (en == DEAL_ENTRY_IN) ? "in" : (en == DEAL_ENTRY_OUT) ? "out" : (en == DEAL_ENTRY_INOUT) ? "inout" : "outby",
                        Num(HistoryDealGetDouble(tk, DEAL_VOLUME), 2), Num(HistoryDealGetDouble(tk, DEAL_PRICE), dg),
                        Num(HistoryDealGetDouble(tk, DEAL_PROFIT), 2), Num(HistoryDealGetDouble(tk, DEAL_COMMISSION), 2),
                        Num(HistoryDealGetDouble(tk, DEAL_SWAP), 2), (long)HistoryDealGetInteger(tk, DEAL_TIME) - g_offset);
     }
   s += "]}";
   SendLine(s);
  }
//+------------------------------------------------------------------+
