export function PageHeader({ title, eyebrow, actions, children }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {children ? <p className="page-header-copy">{children}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function Card({ as: Component = "section", title, actions, className = "", children, ...props }) {
  return (
    <Component className={`card ${className}`.trim()} {...props}>
      {title || actions ? (
        <div className="card-header">
          {title ? <h2>{title}</h2> : <span />}
          {actions ? <div className="card-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </Component>
  );
}

export function MetricCard({ label, value, detail, tone = "default" }) {
  const displayValue = value === null || value === undefined || value === "" ? "—" : value;
  return (
    <div className={`metric-card metric-card-${tone}`}>
      <span>{label}</span>
      <strong className={displayValue === "—" ? "muted-value" : ""}>{displayValue}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function StatusBadge({ tone = "muted", children, className = "" }) {
  const toneClass =
    {
      online: "status-success",
      active: "status-success",
      success: "status-success",
      degraded: "status-warning",
      warning: "status-warning",
      disconnected: "status-danger",
      failed: "status-danger",
      danger: "status-danger",
      new: "status-primary",
      primary: "status-primary",
      reviewed: "status-muted",
      muted: "status-muted"
    }[tone] ?? "status-muted";
  return <span className={`status-badge ${toneClass} ${className}`.trim()}>{children}</span>;
}

export function SeverityBadge({ severity = "low", children, className = "" }) {
  const normalized = String(severity || "low").toLowerCase();
  const toneClass =
    {
      critical: "severity-critical",
      high: "severity-high",
      medium: "severity-medium",
      low: "severity-low"
    }[normalized] ?? "severity-low";
  return <span className={`severity-badge ${toneClass} ${className}`.trim()}>{children ?? severity}</span>;
}

export function DataTable({ children, className = "" }) {
  return <div className={`table-wrap data-table ${className}`.trim()}>{children}</div>;
}

export function EmptyState({
  title = "No live alerts yet",
  children = "Your scanner is online. New signals will appear here when strategy conditions are met.",
  actions
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{children}</span>
      {actions ? <div className="state-actions">{actions}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Could not load data",
  children = "Check the service status or retry the request.",
  onRetry,
  onViewLogs
}) {
  return (
    <div className="error state-panel" role="alert">
      <strong>{title}</strong>
      <span>{children}</span>
      <div className="state-actions">
        {onRetry ? (
          <button className="btn btn-small" type="button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {onViewLogs ? (
          <button className="btn btn-small btn-secondary" type="button" onClick={onViewLogs}>
            View logs
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function LoadingSkeleton({ label = "Loading", rows = 1 }) {
  return (
    <div className="loading-skeleton-stack" aria-label={label}>
      {Array.from({ length: rows }).map((_, index) => (
        <div className="loading-skeleton" key={index} />
      ))}
    </div>
  );
}

export function DisconnectedState({ lastHeartbeat, onRetry, onViewOps }) {
  return (
    <ErrorState
      title="Scanner disconnected"
      onRetry={onRetry}
      onViewLogs={onViewOps}
    >
      Last heartbeat {lastHeartbeat ? new Date(lastHeartbeat).toLocaleString() : "unknown"}.
    </ErrorState>
  );
}
