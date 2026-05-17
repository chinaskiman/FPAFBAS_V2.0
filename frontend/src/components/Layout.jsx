import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "./ui.jsx";

const navItems = [
  { to: "/dashboard", label: "Signals" },
  { to: "/replay", label: "Replay Lab" },
  { to: "/journal", label: "Journal" },
  { to: "/levels", label: "Active S/R" },
  { to: "/forward-test", label: "Paper Trades" },
  { to: "/settings", label: "Settings" },
  { to: "/ops", label: "Ops" }
];

const pageTitles = {
  "/dashboard": "Signals",
  "/replay": "Replay Lab",
  "/journal": "Journal",
  "/levels": "Active S/R",
  "/forward-test": "Paper Trades",
  "/settings": "Settings",
  "/ops": "Operations"
};

export default function Layout({ authRequired = false, onLogout }) {
  const location = useLocation();
  const [health, setHealth] = useState({ ok: null, ts: null });

  const pageTitle = useMemo(() => {
    const journalDetail = location.pathname.startsWith("/journal/");
    if (journalDetail) {
      return "Journal Detail";
    }
    return pageTitles[location.pathname] ?? "Signals";
  }, [location.pathname]);

  const loadHealth = async () => {
    try {
      const res = await fetch("/api/healthz", { credentials: "same-origin" });
      if (!res.ok) {
        throw new Error("health check failed");
      }
      const data = await res.json();
      setHealth({ ok: Boolean(data.ok), ts: data.ts ?? Date.now() });
    } catch (_err) {
      setHealth({ ok: false, ts: Date.now() });
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
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-kicker">Operations</span>
          <span className="sidebar-title">Futures Alert Bot</span>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="layout-body">
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-kicker">Binance USDT Perp Scanner</span>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-meta">
            <StatusBadge tone={health.ok ? "success" : health.ok === false ? "danger" : "muted"}>
              Service {health.ok ? "OK" : health.ok === false ? "Down" : "Checking"}
            </StatusBadge>
            <span className="topbar-sync">
              Last sync {health.ts ? new Date(health.ts).toLocaleTimeString() : "-"}
            </span>
            <span className="topbar-account">Account</span>
            {authRequired ? (
              <button className="btn btn-small btn-secondary" type="button" onClick={handleLogout}>
                Sign out
              </button>
            ) : null}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
