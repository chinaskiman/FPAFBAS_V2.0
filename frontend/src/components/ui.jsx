export function Card({ as: Component = "section", className = "", children, ...props }) {
  return (
    <Component className={`card ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}

export function StatusBadge({ tone = "muted", children, className = "" }) {
  const toneClass =
    {
      success: "status-success",
      warning: "status-warning",
      danger: "status-danger",
      muted: "status-muted"
    }[tone] ?? "status-muted";
  return <span className={`status-badge ${toneClass} ${className}`.trim()}>{children}</span>;
}

export function EmptyState({ children = "No alerts found. Adjust filters or increase the date range." }) {
  return <p className="empty-state">{children}</p>;
}

export function ErrorState({ children, onRetry }) {
  return (
    <div className="error" role="alert">
      <span>{children}</span>
      {onRetry ? (
        <button className="btn btn-small btn-secondary" type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function LoadingSkeleton({ label = "Loading" }) {
  return <div className="loading-skeleton" aria-label={label} />;
}
