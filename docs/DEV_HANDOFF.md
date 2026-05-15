Developer Handoff — Binance USDT Perpetual Futures Alert Bot (Telegram + UI)
v1.0 | Date: 2026-02-03 | Alert-only, deterministic strategy checks (no auto-trading)

1) System Overview
Always-on service on a VPS that monitors Binance USDT perpetual futures. Signals are evaluated deterministically on candle close for 15m and 1h. Alerts are sent to Telegram and logged. A minimal web UI edits watchlist and levels overrides.
2) Architecture Diagram
                ┌──────────────────────────────┐
                │         Binance (Futures)    │
                │   WS: 15m/1h klines close    │
                │   REST: bootstrap 1w/1d/4h   │
                └──────────────┬───────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────────┐
│                         Data Layer                             │
│  - Candle cache per (symbol, tf)                                │
│  - Derived series: RSI, ATR(5), DI+/DI-, SMA(7/25/99), volume    │
└──────────────┬────────────────────────────────────────┬────────┘
               │                                        │
               ▼                                        ▼
┌──────────────────────────────┐           ┌──────────────────────────────┐
│      Levels Engine (S/R)      │           │       Strategy Engine        │
│  - HTF candle pattern S/R     │           │  - HWC bias + MWC context    │
│  - 1h->1d, 15m->4h mapping    │           │  - continuation/retest/...   │
│  - overrides: add/disable     │           │  - DI peak zones (Option 1)  │
└──────────────┬───────────────┘           └──────────────┬───────────────┘
               │                                          │
               └───────────────┬──────────────────────────┘
                               ▼
                    ┌───────────────────────┐
                    │   Alert Orchestrator   │
                    │  - cooldown / daily cap│
                    │  - format payload      │
                    └─────────┬─────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
      ┌──────────────────┐        ┌───────────────────────┐
      │ Telegram Notifier │        │ Storage (SQLite/JSON)  │
      │  sendMessage      │        │ alerts + audit trail   │
      └──────────────────┘        └───────────┬───────────┘
                                              │
                                              ▼
                                   ┌───────────────────────┐
                                   │        Web UI          │
                                   │ watchlist + levels +   │
                                   │ alerts log (read)      │
                                   └───────────────────────┘
3) Components & Responsibilities
•	Binance Ingest: Subscribe to 15m/1h kline close events (WebSocket). Bootstrap higher TF history (REST). Reconnect with backoff.
•	Candle Cache: In-memory ring buffer per (symbol, tf) storing OHLCV + timestamps. Persisting raw candles is optional.
•	Indicators: Compute RSI(14), ATR(5), SMA(7/25/99), DI+/DI-, ADX(14), volume stats. Calculations run after candle close.
•	Levels Engine: Auto S/R from confirmed HTF candle color/open/close patterns only. 1H entries use Daily S/R; 15m entries use 4H S/R. Apply overrides (add/pin, disable).
•	DI Peak Engine (Option 1): Build DI peak zones from DI pivot highs (2L/2R) + clustering; flag DI 'at peak' if within 3% of a zone.
•	Strategy Engine: Implements setup detection (Continuation/Retest/Fake-out/Setup candle). HWC/MWC are context/analytics only and do not suppress alerts.
•	Replay Performance Engine: Groups replay outcomes by setup, symbol, timeframe, direction, HWC, MWC, and A/B/C quality grade.
•	Alert Orchestrator: Spam control (cooldown + daily cap). Formats Telegram message + structured JSON payload.
•	Notifier: Send Telegram alerts.
•	Storage: Log alerts to SQLite (recommended) for audit and UI history.
•	Web UI: CRUD for watchlist and level overrides; read alert history.
4) Deterministic Strategy Logic (Locked Rules)
Bias context:
•	Compute HWC Dow structure on 1W and 1D using pivot swings (2L/2R).
•	Compute MWC Dow structure on 1D and 4H using the same pivot swing logic.
•	HWC and MWC are reported in signal context, Telegram messages, replay grouping, and dashboard tables.
•	HWC and MWC do not suppress alerts.
Levels (S/R):
•	Use only confirmed/closed HTF candles.
•	For 1H entry evaluation, calculate S/R from 1D candles. For 15m entry evaluation, calculate S/R from 4H candles.
•	Default lookback is 14 completed HTF candles.
•	Resistance: scan bullish->bearish HTF pairs, choose the pair with the highest bullish close, and use the bearish candle open.
•	Support: scan bearish->bullish HTF pairs, choose the pair with the lowest bearish close, and use the bullish candle open.
•	There is one active resistance and one active support. Recompute only on new confirmed HTF closes and cache active levels between HTF closes.
•	Do not use pivot highs/lows, swing points, fractals, VWAP, order blocks, clustering, or other SMC logic for S/R.
•	Apply overrides: add/pin levels always included; disable removes matching auto levels within tolerance.
Setups (evaluated on entry TF candle close):
•	Continuation (strong momentum only): LONG closes above active resistance or SHORT closes below active support AND volume is highest of last 10 candles AND DI not at peak.
•	Retest: wick tags the level; pullback volume is declining; alert triggers on close back in trend direction. SL beyond retest candle extreme + 0.15%.
•	Fake-out (within 10 candles): failed break of active support/resistance; retest volume increasing (vol > prev AND vol > MA10); candle closes back inside => alert. Include SL note: beyond fake extreme + 0.15%.
•	Setup Candle: SMA(7/25/99) present; wick >= 1.5× body (directional); SMA7 behind candle body; alert on close; SL other side of candle. LONG requires bullish body + lower rejection wick + SMA7 at/below body low. SHORT requires bearish body + upper rejection wick + SMA7 at/above body high.
5) Data Contracts
watchlist.json example (dev contract):
{
  "symbols": [
    {
      "symbol": "BTCUSDT",
      "enabled": true,
      "entry_tfs": [
        "15m",
        "1h"
      ],
      "setups": {
        "continuation": true,
        "retest": true,
        "fakeout": true,
        "setup_candle": true
      },
      "levels": {
        "auto": true,
        "max_levels": 12,
        "cluster_tol_pct": 0.003,
        "htf_timeframe": "auto",
        "lookback_window": 14,
        "overrides": {
          "add": [
            42000.0,
            43850.0
          ],
          "disable": [
            41520.0
          ]
        }
      }
    }
  ],
  "global": {
    "max_alerts_per_symbol_per_day": 6,
    "cooldown_minutes": 60
  }
}
Environment variables (.env):
•	TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
•	BINANCE_FAPI_REST=https://fapi.binance.com
•	BINANCE_FAPI_WS=wss://fstream.binance.com/ws
•	SQLITE_PATH=...
•	DI_PEAK_PROX_PCT=0.03, FAKEOUT_WINDOW_CANDLES=10
•	ALERT_COOLDOWN_MINUTES=60, MAX_ALERTS_PER_SYMBOL_PER_DAY=6
6) Web UI + API Endpoints
Minimal UI routes (server-rendered or SPA):
•	GET / : dashboard (enabled symbols + last alerts)
•	GET /watchlist : list symbols and toggles
•	GET /levels/{symbol} : manage pinned/disabled levels
•	GET /alerts : searchable alert log
Minimal API endpoints (JSON):
•	GET /api/alerts?limit=100 : recent alerts
•	GET /api/watchlist : fetch watchlist.json
•	PUT /api/watchlist : replace watchlist.json (validated)
•	POST /api/levels/{symbol}/add : add pinned level
•	POST /api/levels/{symbol}/disable : disable level
•	POST /api/levels/{symbol}/enable : re-enable disabled level
Replay/performance API endpoints:
•	GET /api/replay/{symbol}/{tf}?from_ms=...&to_ms=...&step=...&warmup=... : candle-by-candle replay output
•	GET /api/replay_summary/{symbol}/{tf}?from_ms=...&to_ms=...&step=...&warmup=... : replay counts + backend performance summary
•	GET /api/replay_performance/{symbol}/{tf}?from_ms=...&to_ms=...&warmup=... : performance report only, computed with step=1
7) Alert Payload & Telegram Message Format
Telegram message fields:
•	symbol | tf | setup | direction
•	price close
•	bias context: Weekly, Daily, 4H, HWC, MWC
•	level (if applicable)
•	why (volume spike / DI pass / wick tag / fake-out conditions)
•	TradingView link (optional)
•	Notes (SL reference reminders)
Structured payload (stored in DB) should include:
•	ts (unix seconds), symbol, tf, setup, direction, level, close_price
•	details: { why, vol_stat, di_stat, window_remaining, etc. }
•	links: { tradingview }
•	version string for strategy rules
8) Spam Control & Safety
•	Cooldown: suppress new alerts for (symbol, tf) for N minutes (default 60).
•	Daily cap: max alerts per symbol per day (default 6).
•	No trading keys. Alert-only.
•	Optional: Basic auth on UI if exposed to internet.
9) Deployment (VPS)
•	Run as a single service (Docker recommended) with restart policy.
•	Persist data volume for watchlist.json + SQLite DB.
•	Health endpoint recommended: GET /health returning ok + WS status.
•	Logging: structured logs (timestamp, symbol, tf, setup, errors).
10) Testing Checklist (Quick)
•	Replay historical klines to validate each setup triggers at correct candle close.
•	Use 30-day replay reports on liquid symbols before changing setup filters.
•	Compare setup type, timeframe, direction, HWC/MWC context, quality grade, win rate, realized R, max RR, and drawdown R.
•	Validate HTF candle-pattern S/R detection and entry-TF mapping with unit tests.
•	Disconnect WS to ensure auto reconnect.
•	Edit levels in UI and confirm they affect alerts.
