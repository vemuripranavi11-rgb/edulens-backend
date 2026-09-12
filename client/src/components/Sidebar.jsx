import { useEffect } from "react";

export default function Sidebar({ page, setPage, user, onSignOut, isOpen, onClose }) {
  const role = user?.role || "Reviewer";

  // Close drawer on page navigation (mobile)
  const navigate = (id) => {
    setPage(id);
    if (onClose) onClose();
  };

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && isOpen && onClose) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Prevent body scroll when drawer is open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Define navigation items with icons and permitted roles
  const navItems = [
    { id: "Dashboard", label: "Dashboard", icon: "⌂", roles: ["Reviewer", "Supervisor", "Compliance Admin"] },
    { id: "Intake", label: "Document Intake", icon: "↑", roles: ["Applicant", "Reviewer", "Supervisor", "Compliance Admin"] },
    { id: "Cases", label: "Case Workspace", icon: "▣", roles: ["Applicant", "Reviewer", "Supervisor", "Compliance Admin"] },
    { id: "Exceptions", label: "Exception Queue", icon: "!", roles: ["Reviewer", "Supervisor", "Compliance Admin"] },
    { id: "Extraction", label: "AI Extraction", icon: "✦", roles: ["Reviewer", "Supervisor", "Compliance Admin"] },
    { id: "Validation", label: "Validation Checks", icon: "✓", roles: ["Reviewer", "Supervisor", "Compliance Admin"] },
    { id: "Summaries", label: "Decision Support", icon: "≡", roles: ["Reviewer", "Supervisor", "Compliance Admin"] },
    { id: "Reports", label: "Reports & Analytics", icon: "▥", roles: ["Reviewer", "Supervisor", "Compliance Admin"] },
    { id: "Notifications", label: "Notifications", icon: "●", roles: ["Applicant", "Reviewer", "Supervisor", "Compliance Admin"] },
    { id: "Users", label: "User Management", icon: "👥", roles: ["Supervisor", "Compliance Admin"] },
    { id: "Administration", label: "Audit & Settings", icon: "⚙", roles: ["Compliance Admin"] }
  ];

  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="sidebarOverlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`appSidebar${isOpen ? " sidebarOpen" : ""}`} role="navigation" aria-label="Main navigation">
        {/* Mobile close button */}
        <button
          className="sidebarCloseBtn"
          onClick={onClose}
          aria-label="Close menu"
        >
          ✕
        </button>

        <div className="sidebarBrand">
          <div className="brandLogo">
            <span className="brandIcon">🏛</span>
            <span className="brandName">edulens</span>
            <small className="brandTag">DECISION HUB</small>
          </div>
          <div className="orgBadge">
            <span>NORTHSTAR SCHOOL GROUP</span>
          </div>
        </div>

        <nav className="sidebarNav">
          <div className="navSectionTitle">MAIN WORKSPACE</div>
          {visibleItems.map((item) => (
            <button
              key={item.id}
              className={`navItem ${page === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
              title={item.label}
            >
              <i className="navIcon">{item.icon}</i>
              <span className="navLabel">{item.label}</span>
              {page === item.id && <span className="activeIndicator" />}
            </button>
          ))}
        </nav>

        <div className="sidebarProfile">
          <div className="profileAvatar">
            {user?.name ? user.name.slice(0, 2).toUpperCase() : "U"}
          </div>
          <div className="profileMeta">
            <b className="profileName">{user?.name || "User"}</b>
            <small className="profileRole">{user?.role || "Reviewer"}</small>
            <small className="profileCampus">{user?.campus || "Central Campus"}</small>
          </div>
          <button className="sidebarSignOut" onClick={onSignOut} title="Sign Out">
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
