import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { exportJournalJsonl, fetchJournalSignals } from "../api/journal.js";
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  SeverityBadge,
  StatusBadge
} from "../components/ui.jsx";

const formatNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return Number(value).toFixed(2);
};

const formatTimestamp = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString();
};

const getSignalStatus = (item) => item.status ?? item.payload?.status ?? item.meta?.status ?? "recorded";
const getSignalSeverity = (item) => {
  const severity = item.severity ?? item.payload?.severity ?? item.meta?.severity;
  if (severity) return severity;
  const score = Number(item.score ?? item.payload?.score ?? item.meta?.score);
  if (Number.isFinite(score)) {
    if (score >= 85) return "critical";
    if (score >= 70) return "high";
    if (score >= 50) return "medium";
  }
  return "low";
};
const getTakeProfit = (item) =>
  item.take_profit_price ?? item.tp_price ?? item.payload?.take_profit?.price ?? item.payload?.target?.price;
const getStrategyLabel = (item) =>
  `${item.payload?.strategy?.id ?? item.meta?.strategy_id ?? "-"}@${item.payload?.strategy?.version ?? item.meta?.strategy_version ?? "-"}`;
const getEntryPrice = (item) => item.entry_price ?? item.payload?.entry?.price;
const getStopPrice = (item) => item.stop_price ?? item.payload?.stop?.price;
const getSignalTime = (item) => item.created_at_ms ?? item.payload?.created_at_ms;
const getStatusTone = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error")) return "danger";
  if (normalized.includes("active") || normalized.includes("sent")) return "success";
  if (normalized.includes("new") || normalized.includes("pending")) return "primary";
  return "reviewed";
};
const getDirectionTone = (direction) => (direction === "long" ? "active" : direction === "short" ? "failed" : "muted");
const formatConfidence = (item) => {
  const score = item.score ?? item.payload?.score ?? item.meta?.score;
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return getSignalSeverity(item);
  }
  return `${Number(score).toFixed(0)}%`;
};

const getLocalMs = (date, endOfDay = false) => {
  if (!date) return null;
  const iso = endOfDay ? `${date}T23:59:59` : `${date}T00:00:00`;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function JournalPage({ symbols = [] }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    symbol: "",
    timeframe: "",
    fromDate: "",
    toDate: "",
    limit: 100
  });
  const [search, setSearch] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [exportStatus, setExportStatus] = useState("");

  const loadSignals = async () => {
    setLoading(true);
    setError("");
    try {
      const fromMs = getLocalMs(filters.fromDate);
      const toMs = getLocalMs(filters.toDate, true);
      const data = await fetchJournalSignals({
        symbol: filters.symbol,
        timeframe: filters.timeframe,
        fromMs,
        toMs,
        limit: filters.limit
      });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load journal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSignals();
  }, [filters.symbol, filters.timeframe, filters.fromDate, filters.toDate, filters.limit]);

  const quickRange = (days) => {
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    setFilters((prev) => ({
      ...prev,
      fromDate: from.toISOString().slice(0, 10),
      toDate: now.toISOString().slice(0, 10)
    }));
  };

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const haystack = [item.symbol, item.signal_id].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [items, search]);

  const uniqueSymbols = useMemo(() => {
    if (symbols.length > 0) return symbols;
    return Array.from(new Set(items.map((item) => item.symbol).filter(Boolean)));
  }, [symbols, items]);

  const statusCounts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const direction = String(item.direction || "").toLowerCase();
        if (direction === "long") acc.long += 1;
        if (direction === "short") acc.short += 1;
        const severity = String(getSignalSeverity(item)).toLowerCase();
        if (severity === "critical" || severity === "high") acc.highPriority += 1;
        return acc;
      },
      { long: 0, short: 0, highPriority: 0 }
    );
  }, [items]);

  const handleSelectDetail = (signalId) => {
    navigate(`/journal/${signalId}`);
  };

  const handleReplay = (event) => {
    event.stopPropagation();
    navigate("/replay");
  };

  const handleExport = async () => {
    setExportStatus("");
    try {
      const fromMs = getLocalMs(filters.fromDate);
      const toMs = getLocalMs(filters.toDate, true);
      const blob = await exportJournalJsonl(
        {
          symbol: filters.symbol,
          timeframe: filters.timeframe,
          fromMs,
          toMs,
          limit: filters.limit
        },
        adminToken.trim()
      );
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      downloadBlob(blob, `journal_export_${stamp}.jsonl`);
      setExportStatus("Exported");
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        setExportStatus("Invalid token");
      } else {
        setExportStatus(err instanceof Error ? err.message : "Export failed");
      }
    }
  };

  return (
    <div className="app journal-page" id="journal">
      <PageHeader
        title="Journal"
        eyebrow="Signal audit trail"
        actions={
          <>
            <button className="btn" type="button" onClick={loadSignals} disabled={loading}>
              Refresh
            </button>
            <button className="btn btn-secondary" type="button" onClick={handleExport}>
              Export JSONL
            </button>
          </>
        }
      >
        Review generated signals, inspect strategy context, and export historical evidence.
      </PageHeader>

      <div className="metric-strip journal-metrics">
        <MetricCard label="Loaded entries" value={items.length} />
        <MetricCard label="Filtered rows" value={filteredItems.length} />
        <MetricCard label="Long signals" value={statusCounts.long} tone="success" />
        <MetricCard label="Short signals" value={statusCounts.short} tone="danger" />
        <MetricCard label="High priority" value={statusCounts.highPriority} tone={statusCounts.highPriority > 0 ? "warning" : "default"} />
        <MetricCard label="Export status" value={exportStatus || "Ready"} />
      </div>

      <section className="card journal-filter-card">
        <h2>Filters</h2>
        <div className="journal-filter-bar">
          <label className="field">
            <span>Symbol</span>
            <select value={filters.symbol} onChange={(event) => setFilters((prev) => ({ ...prev, symbol: event.target.value }))}>
              <option value="">All</option>
              {uniqueSymbols.map((symbol) => (
                <option key={`journal-${symbol}`} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Timeframe</span>
            <select value={filters.timeframe} onChange={(event) => setFilters((prev) => ({ ...prev, timeframe: event.target.value }))}>
              <option value="">All</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="1w">1w</option>
            </select>
          </label>
          <label className="field">
            <span>From</span>
            <input type="date" value={filters.fromDate} onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value }))} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={filters.toDate} onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value }))} />
          </label>
          <label className="field journal-search-field">
            <span>Search</span>
            <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Symbol or signal id" />
          </label>
          <label className="field">
            <span>Limit</span>
            <select value={filters.limit} onChange={(event) => setFilters((prev) => ({ ...prev, limit: Number(event.target.value) }))}>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
          <div className="journal-filter-actions">
            <button className="btn btn-small btn-secondary" type="button" onClick={() => quickRange(1)}>
              24h
            </button>
            <button className="btn btn-small btn-secondary" type="button" onClick={() => quickRange(7)}>
              7d
            </button>
            <button className="btn btn-small btn-secondary" type="button" onClick={() => quickRange(30)}>
              30d
            </button>
          </div>
        </div>
      </section>

      <section className="card journal-export-card">
        <h2>Export</h2>
        <div className="journal-export-bar">
          <label className="field journal-token-field">
            <span>Admin token</span>
            <input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="Required for JSONL export" />
          </label>
          <button className="btn" type="button" onClick={handleExport}>
            Export JSONL
          </button>
          {exportStatus ? <StatusBadge tone={exportStatus === "Exported" ? "success" : "warning"}>{exportStatus}</StatusBadge> : null}
        </div>
      </section>

      <section className="card journal-table-card">
        <div className="journal-table-header">
          <div>
            <h2>Alert History</h2>
            <p className="muted">
              Showing {filteredItems.length} of {items.length} loaded journal entries.
            </p>
          </div>
        </div>

        {error ? <ErrorState title="Could not load journal" onRetry={loadSignals}>{error}</ErrorState> : null}
        {loading ? <LoadingSkeleton label="Loading journal rows" rows={6} /> : null}
        {!loading && !error && filteredItems.length === 0 ? (
          <EmptyState title="No journal entries found">Adjust filters or increase the date range.</EmptyState>
        ) : null}
        {!loading && filteredItems.length > 0 ? (
          <DataTable className="journal-data-table">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Severity</th>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>TF</th>
                  <th>Direction</th>
                  <th>Strategy</th>
                  <th>Entry</th>
                  <th>SL</th>
                  <th>TP</th>
                  <th>Confidence</th>
                  <th>Signal ID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.signal_id} className="clickable" onClick={() => handleSelectDetail(item.signal_id)}>
                    <td>
                      <StatusBadge tone={getStatusTone(getSignalStatus(item))}>{getSignalStatus(item)}</StatusBadge>
                    </td>
                    <td>
                      <SeverityBadge severity={getSignalSeverity(item)} />
                    </td>
                    <td>{formatTimestamp(getSignalTime(item))}</td>
                    <td className="mono-cell">{item.symbol}</td>
                    <td>
                      <StatusBadge tone="primary">{item.timeframe ?? "-"}</StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone={getDirectionTone(item.direction)}>{item.direction ?? "-"}</StatusBadge>
                    </td>
                    <td>{getStrategyLabel(item)}</td>
                    <td>{formatNumber(getEntryPrice(item))}</td>
                    <td>{formatNumber(getStopPrice(item))}</td>
                    <td>{formatNumber(getTakeProfit(item))}</td>
                    <td>{formatConfidence(item)}</td>
                    <td className="mono-cell">{item.signal_id ?? "-"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn-small"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSelectDetail(item.signal_id);
                          }}
                        >
                          Open
                        </button>
                        <button className="btn btn-small btn-secondary" type="button" onClick={handleReplay}>
                          Replay
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        ) : null}
      </section>
    </div>
  );
}
