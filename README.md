# Futures Alert Bot

Alert-only Binance USDT perpetual futures scanner with:
- `backend/`: FastAPI service, Binance ingestion (REST bootstrap + WS closed candles), indicators, S/R levels, openings, alert persistence, Telegram notifications, replay/backtest.
- `frontend/`: Vite + React dashboard with watchlist management, TradingView-style chart workspace, replay UI, and alert review.

Production deployment: see `DEPLOYMENT.md`.

## Quickstart

### Backend
Requirements: Python 3.11+

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate
pip install -r requirements.txt
pytest
uvicorn app.main:app --reload --port 8000
```

### Frontend
Requirements: Node 18+

```powershell
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/health` to `http://localhost:8000`.

## Docker (Production)

```powershell
cp .env.example .env
docker compose up -d --build
```

The web UI will be at `http://localhost/`.

### VPS (Public HTTPS + 24/7)

```bash
cp .env.example .env
# set ADMIN_TOKEN, DOMAIN, ACME_EMAIL, CORS_ORIGINS=https://<DOMAIN>
chmod +x scripts/vps_preflight.sh scripts/vps_deploy.sh scripts/vps_healthcheck.sh
bash scripts/vps_deploy.sh
```

The web UI will be at `https://<DOMAIN>/`.

## Environment (.env)

The backend loads env vars from `backend/.env` (if present) via `python-dotenv`.
For Docker Compose, use the repo-root `.env`.
If `/data` does not exist (local dev), the backend falls back to the repo `data/` directory.
You can also set them in your shell.

Common settings:
- `DATA_DIR` (default: `/data`)
- `SQLITE_PATH` (default: `/data/app.db`)
- `WATCHLIST_PATH` (default: `/data/watchlist.json`)
- `POLLER_LOCK_PATH` (default: `/data/poller.lock`)
- `LOG_LEVEL` (default: `INFO`)
- `BINANCE_FAPI_REST` (default: `https://fapi.binance.com`)
- `BINANCE_FAPI_WS` (default: `wss://fstream.binance.com`)
- `BINANCE_STREAM_TFS` (default: `15m,1h,4h,1d`)
- `CACHE_MAXLEN` (default: `1200`)
- `DISABLE_INGESTION=1` to skip Binance bootstrap/WS during tests
- `POLL_SECONDS` (default: `15`) poller interval
- `POLLER_START_PAUSED` (`true|false`, default: `false`)
- `TELEGRAM_ENABLED` (`true|false`, default: auto-enabled if token+chat_id present)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_TIMEOUT_SECONDS` (default: `10`)
- `TELEGRAM_MAX_RETRIES` (default: `2`, transient HTTP/network errors)
- `TELEGRAM_RETRY_BASE_SECONDS` (default: `1`, exponential backoff base)
- `TELEGRAM_RETRY_MAX_SECONDS` (default: `30`, backoff cap)
- `TELEGRAM_PARSE_MODE` (optional: `MarkdownV2` or `HTML`)
- `TELEGRAM_DISABLE_WEB_PAGE_PREVIEW` (`true|false`, default: `true`)
- `TELEGRAM_MESSAGE_THREAD_ID` (optional, for forum-topic messages)
- `ADMIN_TOKEN` (required for operator endpoints)
- `APP_LOGIN_USERNAME` and `APP_LOGIN_PASSWORD` (optional UI/API login; when both are set, `/api/*` routes require a browser session)
- `CORS_ORIGINS` (comma-separated, default: `http://localhost:5173`)

Example `backend/.env`:
```env
TELEGRAM_BOT_TOKEN=123456789:abcd-your-token
TELEGRAM_CHAT_ID=123456789
TELEGRAM_ENABLED=true
POLL_SECONDS=15
ADMIN_TOKEN=change-me
APP_LOGIN_USERNAME=admin
APP_LOGIN_PASSWORD=change-this-password
CORS_ORIGINS=http://localhost,http://127.0.0.1
```

## How It Works

- On startup, backend bootstraps klines from Binance REST and opens WS streams for closed 15m/1h/4h/1d candles.
- Candle caches feed indicators, candle-pattern S/R levels, and signal detection.
- S/R detection uses confirmed HTF candles only: 1h entries use Daily levels, and 15m entries use 4H levels.
- The S/R algorithm scans the latest completed HTF candles for bullish->bearish resistance and bearish->bullish support patterns. It uses only candle opens, closes, and color.
- HWC and MWC are context/analytics only; they do not suppress or filter entries.
- DI peak uses Option 1 from the PRD: DI pivot highs are clustered into peak zones and current DI is checked within 3% proximity.
- Setup candle detection requires SMA7/25/99, directional wick >= 1.5x body, and SMA7 behind the candle body.
- Alerts are persisted to SQLite and de-duplicated before notifying Telegram.
- Replay mode runs the same pipeline candle-by-candle without lookahead and reports performance by setup, direction, HWC/MWC context, and quality grade.

## Key Endpoints

Core:
- `GET /health` (legacy)
- `GET /healthz`
- `GET /readyz`
- `GET /api/watchlist` / `PUT /api/watchlist`
- `GET /api/candles/{symbol}/{tf}?limit=500` (time in ms)
- `GET /api/levels/{symbol}?entry_tf=15m&debug=1`
- `GET /api/openings/{symbol}/{tf}?limit=300`
- `GET /api/alerts?limit=100&offset=0` / `GET /api/alerts/{id}`

Signals & filters:
- `GET /api/level_events/{symbol}/{tf}?limit=300`
- `GET /api/setup_candles/{symbol}/{tf}?limit=300`
- `GET /api/di_peak/{symbol}/{tf}`
- `GET /api/volume/{symbol}/{tf}`
- `GET /api/rsi/{symbol}/{tf}`
- `GET /api/hwc/{symbol}`

Operator:
- `GET /api/poller/status` (requires `Authorization: Bearer <ADMIN_TOKEN>`)
- `POST /api/poller/mode` `{ "mode": "run|pause_new|pause_all" }` (admin)
- `POST /api/telegram/test` (admin)
- `GET /api/alerts/export.csv` (admin)
- `GET /api/forward_test/export.csv` (admin)

Forward test:
- `GET /api/forward_test/status`
- `GET /api/forward_test/summary`
- `GET /api/forward_test/equity?limit=3000`
- `GET /api/forward_test/trades?limit=200&offset=0`
- `POST /api/forward_test/mode` `{ "enabled": true|false }` (admin)

Replay:
- `GET /api/replay/{symbol}/{tf}?from_ms=...&to_ms=...&step=...&warmup=...`
- `GET /api/replay_summary/{symbol}/{tf}?from_ms=...&to_ms=...&step=...&warmup=...`
- `GET /api/replay_performance/{symbol}/{tf}?from_ms=...&to_ms=...&warmup=...`

## Frontend Highlights

- Watchlist management (add/remove symbols, edit entry TFs).
- Chart Workspace with candlesticks, SMA7/21/50, DI+/DI-/ADX, active support/resistance lines, and signal markers.
- Replay UI with date/time lookback windows, 15m and 1h entry results, trade outcome rows, backend performance cards, and setup-type performance tables.
- Alert review with filtering/pagination and Telegram message preview.
- Journal page with filters, detail drawer, and JSONL export (admin token required).
- Forward Test page with live paper-trading metrics, equity/drawdown charts, regime/time analytics, and trade table export.

## Auto Journal

Every notified signal is journaled with:
- 100-candle lookback (including signal candle)
- indicators (ATR/RSI/DI/ADX + existing series)
- planned entry = next candle open

Env vars:
- `JOURNAL_DB_URL` (optional; if unset, uses `data/journal.db`)
- `JOURNAL_INTRACANDLE_MODEL` (reserved for outcome tracking; default `worst_case`)
- `ADMIN_TOKEN` (required for `/api/journal/export.jsonl`)
- `FT_STARTING_EQUITY` (default `10000`)
- `FT_LEVERAGE` (default `20`)
- `FT_RISK_PCT` (default `0.01`)
- `FT_MAX_POSITIONS` (default `3`)
- `FT_FEE_RATE` (default `0.001`)
- `FT_TP_R` (default `2.0`)
- `FT_CANCEL_AFTER_CANDLES` (default `3`)
- `FT_RISK_FREE_RATE` (default `0.02`)
- `FT_TIMEZONE` (default `Europe/Berlin`)

UI:
- Open the **Journal** section in the dashboard to browse entries.
- Export JSONL prompts for `ADMIN_TOKEN` (stored in memory only).

## Notes

- Candle timestamps are epoch **milliseconds** in the backend and API.
- The frontend chart converts ms -> seconds for `lightweight-charts`.
