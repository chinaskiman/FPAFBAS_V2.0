import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "./ui.jsx";

const navGroups = [
  {
    label: "Monitor",
    items: [
      { to: "/dashboard", label: "Signals" },
      { to: "/replay", label: "Replay Lab" },
      { to: "/journal", label: "Journal" },
      { to: "/levels", label: "Active S/R" }
    ]
  },
  {
    label: "Trading",
    items: [
      { to: "/forward-test", label: "Paper Trades" },
      { label: "Strategies", disabled: true },
      { label: "Risk", disabled: true }
    ]
  },
  {
    label: "System",
    items: [
      { to: "/settings", label: "Settings" },
      { to: "/ops", label: "Ops" },
      { label: "Logs", disabled: true }
    ]
  }
];

const pageTitles = {
  "/dashboard": "Signals",
  "/replay": "Replay Lab",
  "/journal": "Journal",
  "/levels": "Active S/R",
  "/forward-test": "Paper Trades",
  "/settings": "Settings",
  "/ops": "System Health"
};

export default function Layout({ authRequired = false, onLogout }) {
  return <AppShell authRequired={authRequired} onLogout={onLogout} />;
}

export function AppShell({ authRequired = false, onLogout }) {
  const location = useLocation();
  const [health, setHealth] = useState({ ok: null, ts: null, latencyMs: null });

  const pageTitle = useMemo(() => {
    if (location.pathname.startsWith("/journal/")) {
      return "Journal Detail";
    }
    return pageTitles[location.pathname] ?? "Signals";
  }, [location.pathname]);

  const loadHealth = async () => {
    const started = performance.now();
    try {
      const res = await fetch("/api/healthz", { credentials: "same-origin" });
      const latencyMs = Math.round(performance.now() - started);
      if (!res.ok) {
        throw new Error("health check failed");
      }
      const data = await res.json();
      setHealth({ ok: Boolean(data.ok), ts: data.ts ?? Date.now(), latencyMs });
    } catch (_err) {
      setHealth({ ok: false, ts: Date.now(), latencyMs: null });
    }
  };

  useEffect(() => {
    loadHealth();
    const timer = setInterval(loadHealth, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    onLogout?.();
  };

  return (
    <div className="layout app-shell">
      <SidebarNav health={health} />
      <div className="layout-body">
        <TopBar pageTitle={pageTitle} health={health} authRequired={authRequired} onLogout={handleLogout} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function SidebarNav({ health }) {
  const statusTone = health?.ok ? "success" : health?.ok === false ? "danger" : "muted";
  const statusLabel = health?.ok ? "Scanner Online" : health?.ok === false ? "Scanner Offline" : "Checking";
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Futures Alert Bot</span>
        <span className="sidebar-kicker">USDT Perp Scanner</span>
      </div>
      <nav className="nav" aria-label="Primary navigation">
        {navGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            <div className="nav-group-items">
              {group.items.map((item) =>
                item.disabled ? (
                  <span key={item.label} className="nav-link nav-link-disabled" aria-disabled="true">
                    {item.label}
                  </span>
                ) : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                  >
                    {item.label}
                  </NavLink>
                )
              )}
            </div>
          </div>
        ))}
      </nav>
      <div className="sidebar-status">
        <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
        <span>{health?.latencyMs === null || health?.latencyMs === undefined ? "Latency —" : `Latency ${health.latencyMs}ms`}</span>
      </div>
    </aside>
  );
}

export function TopBar({ pageTitle, health, authRequired, onLogout }) {
  const statusTone = health.ok ? "success" : health.ok === false ? "danger" : "muted";
  const statusLabel = health.ok ? "Online" : health.ok === false ? "Disconnected" : "Checking";

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="topbar-kicker">Workspace</span>
        <h1>{pageTitle}</h1>
      </div>
      <div className="topbar-meta">
        <StatusBadge tone={statusTone}>Scanner {statusLabel}</StatusBadge>
        <span className="topbar-metric">Latency {health.latencyMs === null ? "—" : `${health.latencyMs}ms`}</span>
        <span className="topbar-sync">
          Last sync {health.ts ? new Date(health.ts).toLocaleTimeString() : "—"}
        </span>
        <span className="topbar-account">Account</span>
        {authRequired ? (
          <button className="btn btn-small btn-secondary" type="button" onClick={onLogout}>
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  );
}
