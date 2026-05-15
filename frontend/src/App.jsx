import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";

import Layout from "./components/Layout.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import JournalPage from "./pages/JournalPage.jsx";
import JournalDetailPage from "./pages/JournalDetailPage.jsx";
import LevelsPage from "./pages/LevelsPage.jsx";
import OpsPage from "./pages/OpsPage.jsx";
import ReplayPage from "./pages/ReplayPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import ForwardTestPage from "./pages/ForwardTestPage.jsx";

export default function App() {
  const [auth, setAuth] = useState({ loading: true, required: false, authenticated: false });

  const loadAuth = async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!res.ok) {
        throw new Error("auth check failed");
      }
      const data = await res.json();
      setAuth({
        loading: false,
        required: Boolean(data.auth_required),
        authenticated: Boolean(data.authenticated)
      });
    } catch (_err) {
      setAuth({ loading: false, required: false, authenticated: true });
    }
  };

  useEffect(() => {
    loadAuth();
  }, []);

  if (auth.loading) {
    return <div className="login-shell"><div className="login-panel">Loading...</div></div>;
  }

  if (auth.required && !auth.authenticated) {
    return <LoginPanel onLogin={loadAuth} />;
  }

  return (
    <Routes>
      <Route element={<Layout authRequired={auth.required} onLogout={loadAuth} />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage view="dashboard" />} />
        <Route path="/replay" element={<ReplayPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/journal/:signalId" element={<JournalDetailPage />} />
        <Route path="/levels" element={<LevelsPage />} />
        <Route path="/forward-test" element={<ForwardTestPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/ops" element={<OpsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

function LoginPanel({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        throw new Error("Invalid username or password");
      }
      await onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <div>
          <p className="eyebrow">Futures Alert Bot</p>
          <h1>Sign In</h1>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <label className="field">
          <span>User ID</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
