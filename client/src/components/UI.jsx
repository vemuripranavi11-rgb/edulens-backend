export function Header({ crumb, title, children, actions }) {
  return (
    <header className="pageHeader">
      <div className="headerMain">
        {crumb && <p className="crumb">{crumb}</p>}
        <h1>{title}</h1>
        {children}
      </div>
      {actions && <div className="headerActions">{actions}</div>}
    </header>
  );
}

export function Loading({ label = "Loading secure workspace…" }) {
  return (
    <div className="loadingContainer">
      <div className="spinner"></div>
      <p>{label}</p>
    </div>
  );
}

export function Empty({ label = "No records found", action, icon = "📁" }) {
  return (
    <div className="emptyState">
      <span className="emptyIcon">{icon}</span>
      <p className="emptyLabel">{label}</p>
      {action && <div className="emptyAction">{action}</div>}
    </div>
  );
}

export function Notice({ children, type = "info" }) {
  if (!children) return null;
  return <div className={`alertNotice ${type}`}>{children}</div>;
}

export function Badge({ children, variant = "default", dot = false }) {
  const cleanVariant = String(variant).toLowerCase().replace(/\s+/g, "-");
  return (
    <span className={`statusBadge ${cleanVariant}`}>
      {dot && <span className="badgeDot"></span>}
      {children}
    </span>
  );
}

export function StatCard({ label, value, subtext, trend, icon, status = "default" }) {
  return (
    <div className={`statCard ${status}`}>
      <div className="statCardHeader">
        <span className="statLabel">{label}</span>
        {icon && <span className="statIcon">{icon}</span>}
      </div>
      <strong className="statValue">{value}</strong>
      {subtext && <small className="statSubtext">{subtext}</small>}
      {trend && (
        <span className={`statTrend ${trend.direction === "up" ? "positive" : "neutral"}`}>
          {trend.direction === "up" ? "↑" : "↓"} {trend.text}
        </span>
      )}
    </div>
  );
}

export function Modal({ isOpen, onClose, title, children, footer, maxWidth = "580px" }) {
  if (!isOpen) return null;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div
        className="modalContainer"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <h3>{title}</h3>
          <button className="modalCloseBtn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>
        <div className="modalBody">{children}</div>
        {footer && <div className="modalFooter">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="tabsContainer">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tabButton ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tabBadge">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
