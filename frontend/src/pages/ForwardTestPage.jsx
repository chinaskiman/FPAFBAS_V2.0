import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingSkeleton, MetricCard, PageHeader, StatusBadge } from "../components/ui.jsx";

const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`${url} failed with ${res.status}`);
  }
  return res.json();
};

const fmt = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toFixed(digits);
};

const fmtPct = (value, digits = 2) => (value === null || value === undefined ? "-" : `${fmt(value, digits)}%`);
const fmtMoney = (value) => (value === null || value === undefined ? "-" : `${fmt(value, 2)} USDT`);
const fmtTs = (value) => (value ? new Date(value).toLocaleString() : "-");
const fmtDuration = (ms) => {
  if (!ms || ms < 0) return "-";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
};
const fmtLeverage = (value) => (value === null || value === undefined ? "-" : `${fmt(value, 0)}x`);
const fmtRisk = (value) => (value === null || value === undefined ? "-" : fmtPct(Number(value) * 100));
const fmtMeta = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
};
const valueTone = (value) => {
  const number = Number(value);
  if (Number.isNaN(number) || number === 0) return "default";
  return number > 0 ? "success" : "danger";
};
const statusLabel = (status, error) => {
  if (error) return "Error";
  if (!status) return "Loading";
  return status.enabled ? "Running" : "Paused";
};
const statusTone = (status, error) => {
  if (error) return "danger";
  if (!status) return "muted";
  return status.enabled ? "success" : "warning";
};

export default function ForwardTestPage() {
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [equity, setEquity] = useState([]);
  const [tradesData, setTradesData] = useState({ items: [], total: 0, limit: 100, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tradesFilters, setTradesFilters] = useState({ symbol: "", tf: "", direction: "" });
  const [tradesLimit, setTradesLimit] = useState(100);
  const [tradesOffset, setTradesOffset] = useState(0);

  const loadOverview = async () => {
    const [statusRes, summaryRes, equityRes] = await Promise.all([
      fetchJson("/api/forward_test/status"),
      fetchJson("/api/forward_test/summary"),
      fetchJson("/api/forward_test/equity?limit=3000")
    ]);
    setStatus(statusRes);
    setSummary(summaryRes);
    setEquity(Array.isArray(equityRes.items) ? equityRes.items : []);
  };

  const loadTrades = async () => {
    const params = new URLSearchParams();
    params.set("limit", String(tradesLimit));
    params.set("offset", String(tradesOffset));
    if (tradesFilters.symbol) params.set("symbol", tradesFilters.symbol);
    if (tradesFilters.tf) params.set("tf", tradesFilters.tf);
    if (tradesFilters.direction) params.set("direction", tradesFilters.direction);
    const data = await fetchJson(`/api/forward_test/trades?${params.toString()}`);
    setTradesData(data);
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadOverview(), loadTrades()]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    loadTrades().catch((err) => setError(err instanceof Error ? err.message : "Unknown error"));
  }, [tradesLimit, tradesOffset, tradesFilters.symbol, tradesFilters.tf, tradesFilters.direction]);

  useEffect(() => {
    const timer = setInterval(() => {
      refreshAll();
    }, 60000);
    return () => clearInterval(timer);
  }, [tradesLimit, tradesOffset, tradesFilters.symbol, tradesFilters.tf, tradesFilters.direction]);

  const metrics = summary?.metrics ?? {};
  const breakdowns = summary?.breakdowns ?? {};
  const charts = summary?.charts ?? {};

  const performanceCards = useMemo(
    () => [
      ["Net Profit", fmtMoney(metrics.net_profit), fmtPct(metrics.return_on_equity_pct), valueTone(metrics.net_profit)],
      ["Gross Profit", fmtMoney(metrics.gross_profit), null, "success"],
      ["Gross Loss", fmtMoney(metrics.gross_loss), null, "danger"],
      ["Profit Factor", fmt(metrics.profit_factor, 3), null, Number(metrics.profit_factor) >= 1 ? "success" : "warning"],
      ["Win Rate", fmtPct(metrics.win_rate_pct), `${fmtPct(metrics.loss_rate_pct)} loss rate`, "default"],
      ["Total Trades", fmt(metrics.total_trades, 0), `${fmt(metrics.consecutive_wins, 0)}W / ${fmt(metrics.consecutive_losses, 0)}L streak`, "default"]
    ],
    [metrics]
  );

  const riskMetrics = useMemo(
    () => [
      ["Average R:R", fmt(metrics.risk_reward_ratio, 3)],
      ["Expectancy / Trade", fmtMoney(metrics.expectancy_per_trade)],
      ["Average Win", fmtMoney(metrics.average_win)],
      ["Average Loss", fmtMoney(metrics.average_loss)],
      ["Max Drawdown", fmtPct(metrics.max_drawdown_pct)],
      ["Absolute Drawdown", fmtMoney(metrics.absolute_drawdown)],
      ["Recovery Factor", fmt(metrics.recovery_factor, 3)],
      ["Volatility of Returns", fmt(metrics.volatility_of_returns, 4)]
    ],
    [metrics]
  );

  const costMetrics = useMemo(
    () => [
      ["Funding Fees Paid", fmtMoney(metrics.funding_fees_paid)],
      ["Funding Fees Received", fmtMoney(metrics.funding_fees_received)],
      ["Trading Fees Paid", fmtMoney(metrics.trading_fees_paid)],
      ["Slippage", fmtMoney(metrics.slippage_paid)],
      ["Average Holding Time", fmtDuration(metrics.average_holding_time_ms)],
      ["Exposure Time", fmtPct(metrics.exposure_time_pct)]
    ],
    [metrics]
  );

  const marginMetrics = useMemo(
    () => [
      ["Margin Usage Avg", fmtPct(metrics.margin_usage_pct_avg)],
      ["Margin Usage Max", fmtPct(metrics.margin_usage_pct_max)],
      ["Liq Distance Avg", fmtPct(metrics.liquidation_distance_pct_avg)],
      ["Liq Distance Min", fmtPct(metrics.liquidation_distance_pct_min)],
      ["ROE", fmtPct(metrics.return_on_equity_pct)],
      ["Position Size Consistency", fmt(metrics.position_size_consistency, 4)]
    ],
    [metrics]
  );

  const longShort = breakdowns.long_short_performance ?? [];
  const regimePerf = breakdowns.market_regime_performance ?? [];
  const hourPerf = breakdowns.time_of_day_performance ?? [];
  const dayPerf = breakdowns.day_of_week_performance ?? [];
  const dailyPnl = charts.daily_pnl ?? [];
  const equityCurve = charts.equity_curve?.length ? charts.equity_curve : equity;
  const drawdownCurve = (equityCurve ?? []).map((item) => ({ time: item.time, value: item.drawdown_pct ?? 0 }));
  const maeMfe = charts.mae_mfe ?? [];
  const hasTrades = (tradesData.items ?? []).length > 0;
  const hasForwardData = Boolean(summary) && ((equityCurve ?? []).length > 0 || hasTrades || Number(metrics.total_trades) > 0);

  const exportTrades = async () => {
    const token = window.prompt("Enter ADMIN_TOKEN for CSV export:");
    if (!token) return;
    try {
      const res = await fetch("/api/forward_test/export.csv", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error(`export failed with ${res.status}`);
      }
      const text = await res.text();
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "forward_test_trades.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  };

  const setForwardMode = async (enabled) => {
    const token = window.prompt("Enter ADMIN_TOKEN:");
    if (!token) return;
    try {
      await fetchJson("/api/forward_test/mode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ enabled })
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mode update failed");
    }
  };

  return (
    <div className="forward-test-page paper-trades-page">
      <PageHeader
        eyebrow="Simulated execution"
        title="Paper Trades"
        actions={
          <>
            <button className="btn btn-small btn-secondary" type="button" onClick={refreshAll}>
              Refresh
            </button>
            <button className="btn btn-small btn-success" type="button" onClick={() => setForwardMode(true)}>
              Run
            </button>
            <button className="btn btn-small btn-warning" type="button" onClick={() => setForwardMode(false)}>
              Pause
            </button>
            <button className="btn btn-small btn-secondary" type="button" onClick={exportTrades}>
              Export CSV
            </button>
          </>
        }
      >
        Forward-test strategy performance using simulated execution.
      </PageHeader>

      {error ? (
        <ErrorState title="Could not load paper trade data" onRetry={refreshAll} onViewLogs={() => window.location.assign("/ops")}>
          Check the bot service status or retry the request.
        </ErrorState>
      ) : null}

      {loading && !summary ? (
        <LoadingSkeleton label="Loading paper trade data" rows={3} />
      ) : (
        <>
          <div className="metric-strip paper-status-strip">
            <MetricCard
              label="Status"
              value={<StatusBadge tone={statusTone(status, error)}>{statusLabel(status, error)}</StatusBadge>}
            />
            <MetricCard label="Start Time" value={fmtTs(status?.start_time)} />
            <MetricCard label="Open Positions" value={fmt(status?.open_positions, 0)} />
            <MetricCard label="Pending Orders" value={fmt(status?.pending_orders, 0)} />
            <MetricCard label="Leverage" value={fmtLeverage(status?.leverage)} />
            <MetricCard label="Risk per Trade" value={fmtRisk(status?.risk_pct)} />
          </div>

          {!hasForwardData ? (
            <section className="card paper-empty-card">
              <EmptyState
                title="No forward test data yet"
                actions={
                  <>
                    <button className="btn btn-small btn-success" type="button" onClick={() => setForwardMode(true)}>
                      Run forward test
                    </button>
                    <button className="btn btn-small btn-secondary" type="button" onClick={refreshAll}>
                      Refresh
                    </button>
                  </>
                }
              >
                Start the paper trading engine to generate simulated trades, PnL, drawdown, and risk metrics.
              </EmptyState>
            </section>
          ) : null}

          <div className="paper-trades-grid">
            <main className="paper-main-column">
              <section className="card paper-performance-card">
                <div className="card-header">
                  <h2>Performance Overview</h2>
                </div>
                <div className="card-body">
                  <div className="paper-performance-grid">
                    {performanceCards.map(([label, value, detail, tone]) => (
                      <MetricCard key={label} label={label} value={value} detail={detail} tone={tone} />
                    ))}
                  </div>
                </div>
              </section>

              <section className="card paper-chart-card">
                <div className="card-header">
                  <h2>Equity / PnL</h2>
                </div>
                <div className="card-body">
                  {(equityCurve ?? []).length > 1 ? (
                    <div className="paper-chart-grid">
                      <ChartPanel title="Equity Curve">
                        <SimpleLineChart
                          points={(equityCurve ?? []).map((item) => ({ x: item.time, y: item.equity }))}
                          yLabel="Equity"
                        />
                      </ChartPanel>
                      <ChartPanel title="Drawdown Curve">
                        <SimpleLineChart
                          points={(drawdownCurve ?? []).map((item) => ({ x: item.time, y: item.value }))}
                          yLabel="Drawdown %"
                        />
                      </ChartPanel>
                      <ChartPanel title="Daily PnL">
                        <SimpleBarChart
                          items={(dailyPnl ?? []).map((item) => ({ label: item.day, value: item.net_profit }))}
                        />
                      </ChartPanel>
                      <ChartPanel title="MAE vs MFE">
                        <SimpleScatterChart
                          items={(maeMfe ?? []).map((item) => ({ x: item.mae_r, y: item.mfe_r, value: item.net_pnl }))}
                          xLabel="MAE (R)"
                          yLabel="MFE (R)"
                        />
                      </ChartPanel>
                    </div>
                  ) : (
                    <EmptyState title="No equity curve yet">
                      Run the forward test to generate simulated performance data.
                    </EmptyState>
                  )}
                </div>
              </section>

              <section className="card paper-breakdown-card">
                <div className="card-header">
                  <h2>Strategy Breakdowns</h2>
                </div>
                <div className="card-body">
                  <div className="paper-chart-grid paper-chart-grid-compact">
                    <ChartPanel title="Time of Day">
                      <SimpleBarChart
                        items={(hourPerf ?? []).map((item) => ({ label: String(item.hour), value: item.net_profit }))}
                      />
                    </ChartPanel>
                    <ChartPanel title="Day of Week">
                      <SimpleBarChart
                        items={(dayPerf ?? []).map((item) => ({ label: item.day?.slice(0, 3), value: item.net_profit }))}
                      />
                    </ChartPanel>
                    <ChartPanel title="Market Regime">
                      <SimpleBarChart
                        items={(regimePerf ?? []).map((item) => ({ label: item.regime, value: item.net_profit }))}
                      />
                    </ChartPanel>
                    <ChartPanel title="Long vs Short">
                      <SimpleBarChart
                        items={(longShort ?? []).map((item) => ({ label: item.side, value: item.net_profit }))}
                      />
                    </ChartPanel>
                  </div>
                </div>
              </section>

              <section className="card paper-trades-card">
                <div className="card-header paper-trades-header">
                  <div>
                    <h2>Trades</h2>
                    <span className="muted">{fmt(tradesData.total ?? 0, 0)} closed trades</span>
                  </div>
                  <div className="paper-trades-filters">
                    <input
                      placeholder="Symbol"
                      value={tradesFilters.symbol}
                      onChange={(e) => {
                        setTradesOffset(0);
                        setTradesFilters((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }));
                      }}
                    />
                    <select
                      value={tradesFilters.tf}
                      onChange={(e) => {
                        setTradesOffset(0);
                        setTradesFilters((prev) => ({ ...prev, tf: e.target.value }));
                      }}
                    >
                      <option value="">All TF</option>
                      <option value="15m">15m</option>
                      <option value="1h">1h</option>
                      <option value="4h">4h</option>
                      <option value="1d">1d</option>
                    </select>
                    <select
                      value={tradesFilters.direction}
                      onChange={(e) => {
                        setTradesOffset(0);
                        setTradesFilters((prev) => ({ ...prev, direction: e.target.value }));
                      }}
                    >
                      <option value="">All Sides</option>
                      <option value="long">Long</option>
                      <option value="short">Short</option>
                    </select>
                    <select
                      value={tradesLimit}
                      onChange={(e) => {
                        setTradesOffset(0);
                        setTradesLimit(Number(e.target.value));
                      }}
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={500}>500</option>
                    </select>
                  </div>
                </div>
                <div className="card-body">
                  {hasTrades ? (
                    <>
                      <div className="table-wrap paper-trades-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Time</th>
                              <th>Symbol</th>
                              <th>TF</th>
                              <th>Direction</th>
                              <th>Entry</th>
                              <th>Exit</th>
                              <th>Size</th>
                              <th>PnL</th>
                              <th>R:R</th>
                              <th>Fees</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(tradesData.items ?? []).map((item, index) => {
                              const hasSplitFees = item.funding_fee !== undefined || item.trading_fee !== undefined;
                              const fees =
                                item.fees ??
                                item.total_fees ??
                                (hasSplitFees ? Number(item.funding_fee ?? 0) + Number(item.trading_fee ?? 0) : null);
                              const direction = String(item.direction ?? "").toLowerCase();
                              return (
                                <tr key={item.id ?? `${item.symbol}-${item.exit_time}-${index}`}>
                                  <td>{fmtTs(item.exit_time ?? item.entry_time)}</td>
                                  <td>{item.symbol ?? "-"}</td>
                                  <td>{item.tf ?? "-"}</td>
                                  <td>
                                    <StatusBadge tone={direction === "short" ? "danger" : "success"}>
                                      {item.direction ?? "-"}
                                    </StatusBadge>
                                  </td>
                                  <td>{fmt(item.entry_price, 4)}</td>
                                  <td>{fmt(item.exit_price, 4)}</td>
                                  <td>{fmt(item.position_size ?? item.size ?? item.qty, 4)}</td>
                                  <td className={Number(item.net_pnl) >= 0 ? "pos" : "neg"}>{fmtMoney(item.net_pnl)}</td>
                                  <td>{fmt(item.risk_reward ?? item.rr ?? item.mfe_r, 3)}</td>
                                  <td>{fmtMoney(fees)}</td>
                                  <td>
                                    <StatusBadge tone={item.status === "failed" ? "danger" : "muted"}>
                                      {item.status ?? item.exit_reason ?? "Closed"}
                                    </StatusBadge>
                                  </td>
                                  <td>
                                    <div className="row-actions">
                                      <button
                                        className="btn btn-small btn-ghost"
                                        type="button"
                                        disabled={!item.id || !navigator.clipboard}
                                        onClick={() => navigator.clipboard.writeText(String(item.id))}
                                      >
                                        Copy ID
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="pagination">
                        <span>
                          {fmt(tradesOffset + 1, 0)}-
                          {fmt(Math.min(tradesOffset + tradesLimit, tradesData.total ?? 0), 0)} of{" "}
                          {fmt(tradesData.total ?? 0, 0)}
                        </span>
                        <div className="pagination-actions">
                          <button
                            className="btn btn-small btn-secondary"
                            type="button"
                            disabled={tradesOffset <= 0}
                            onClick={() => setTradesOffset((prev) => Math.max(0, prev - tradesLimit))}
                          >
                            Prev
                          </button>
                          <button
                            className="btn btn-small btn-secondary"
                            type="button"
                            disabled={tradesOffset + tradesLimit >= (tradesData.total ?? 0)}
                            onClick={() => setTradesOffset((prev) => prev + tradesLimit)}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <EmptyState title="No trades found">
                      Run the forward test or adjust filters to review simulated execution history.
                    </EmptyState>
                  )}
                </div>
              </section>
            </main>

            <aside className="paper-side-column">
              <MetricGroup title="Risk Metrics" items={riskMetrics} />
              <MetricGroup title="Cost & Execution" items={costMetrics} />
              <MetricGroup title="Margin & Liquidation" items={marginMetrics} />
              <MetricGroup
                title="Test Controls"
                items={[
                  ["Symbols", fmtMeta(status?.symbols ?? metrics.symbols)],
                  ["Timeframes", fmtMeta(status?.timeframes ?? metrics.timeframes)],
                  ["Strategy", fmtMeta(status?.strategy ?? metrics.strategy)],
                  ["Risk Model", fmtMeta(status?.risk_model ?? metrics.risk_model)],
                  ["Leverage", fmtLeverage(status?.leverage)],
                  ["Started At", fmtTs(status?.start_time)],
                  ["Last Updated", fmtTs(status?.last_updated ?? summary?.generated_at)]
                ]}
              />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function ChartPanel({ title, children }) {
  return (
    <div className="paper-chart-panel">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function MetricGroup({ title, items }) {
  return (
    <section className="card paper-metric-group">
      <div className="card-header">
        <h2>{title}</h2>
      </div>
      <div className="card-body">
        <div className="paper-metric-list">
          {items.map(([label, value]) => (
            <div className="paper-metric-row" key={label}>
              <span>{label}</span>
              <strong>{value === null || value === undefined || value === "" ? "-" : value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SimpleLineChart({ points, yLabel }) {
  const width = 980;
  const height = 280;
  const pad = 30;
  if (!Array.isArray(points) || points.length < 2) {
    return <p className="muted">Not enough data.</p>;
  }
  const xs = points.map((item) => Number(item.x));
  const ys = points.map((item) => Number(item.y));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;
  const toX = (x) => pad + ((x - minX) / xRange) * (width - pad * 2);
  const toY = (y) => height - pad - ((y - minY) / yRange) * (height - pad * 2);
  const path = points.map((item, idx) => `${idx === 0 ? "M" : "L"} ${toX(item.x)} ${toY(item.y)}`).join(" ");
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="svg-chart">
        <rect x="0" y="0" width={width} height={height} fill="var(--panel-bg)" />
        <path d={path} fill="none" stroke="var(--accent-2)" strokeWidth="2" />
        <text x={pad} y={pad - 8} className="chart-label">
          {yLabel}: min {fmt(minY)} / max {fmt(maxY)}
        </text>
      </svg>
    </div>
  );
}

function SimpleBarChart({ items }) {
  const width = 980;
  const height = 280;
  const pad = 30;
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="muted">Not enough data.</p>;
  }
  const values = items.map((item) => Number(item.value) || 0);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);
  const range = maxVal - minVal || 1;
  const barWidth = (width - pad * 2) / items.length;
  const zeroY = height - pad - ((0 - minVal) / range) * (height - pad * 2);
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="svg-chart">
        <rect x="0" y="0" width={width} height={height} fill="var(--panel-bg)" />
        <line x1={pad} y1={zeroY} x2={width - pad} y2={zeroY} stroke="var(--line-muted)" strokeWidth="1" />
        {items.map((item, idx) => {
          const value = Number(item.value) || 0;
          const x = pad + idx * barWidth + barWidth * 0.1;
          const w = barWidth * 0.8;
          const y = height - pad - ((Math.max(value, 0) - minVal) / range) * (height - pad * 2);
          const y0 = height - pad - ((Math.min(value, 0) - minVal) / range) * (height - pad * 2);
          const h = Math.max(1, Math.abs(y - y0));
          return (
            <g key={`${item.label}-${idx}`}>
              <rect x={x} y={Math.min(y, y0)} width={w} height={h} fill={value >= 0 ? "var(--pos)" : "var(--neg)"} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SimpleScatterChart({ items, xLabel, yLabel }) {
  const width = 980;
  const height = 320;
  const pad = 40;
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="muted">Not enough data.</p>;
  }
  const xs = items.map((item) => Number(item.x) || 0);
  const ys = items.map((item) => Number(item.y) || 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;
  const toX = (x) => pad + ((x - minX) / xRange) * (width - pad * 2);
  const toY = (y) => height - pad - ((y - minY) / yRange) * (height - pad * 2);
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="svg-chart">
        <rect x="0" y="0" width={width} height={height} fill="var(--panel-bg)" />
        <text x={pad} y={pad - 12} className="chart-label">
          {xLabel} vs {yLabel}
        </text>
        {items.map((item, idx) => (
          <circle
            key={idx}
            cx={toX(item.x)}
            cy={toY(item.y)}
            r="4"
            fill={(Number(item.value) || 0) >= 0 ? "var(--pos)" : "var(--neg)"}
            opacity="0.85"
          />
        ))}
      </svg>
    </div>
  );
}
