import { useState, useEffect, useRef } from "react";
import { api, saveSession } from "../services/api";

export default function TopNav({ user, setUser, setPage, onSignOut, onMenuToggle }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const notifRef = useRef(null);
  const roleRef = useRef(null);

  // Load unread count and latest notifications
  const loadNotifications = async () => {
    try {
      const data = await api("/api/v1/notifications");
      const items = data.items || [];
      setNotifications(items.slice(0, 5));
      setUnreadCount(items.filter((n) => !n.read).length);
    } catch (_) {
      // Ignore if session expires
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (roleRef.current && !roleRef.current.contains(event.target)) {
        setShowRoleSwitcher(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Demo role switcher helper
  const switchRole = async (targetEmail) => {
    try {
      const session = await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: targetEmail, password: "Demo@123" })
      });
      saveSession(session);
      setUser(session.user);
      setShowRoleSwitcher(false);
      if (session.user.role === "Applicant") {
        setPage("Intake");
      } else if (session.user.role === "Supervisor") {
        setPage("Dashboard");
      } else if (session.user.role === "Compliance Admin") {
        setPage("Administration");
      } else {
        setPage("Cases");
      }
    } catch (err) {
      alert("Role switch failed: " + err.message);
    }
  };

  const markAllRead = async () => {
    try {
      await api("/api/v1/notifications/mark-all-read", { method: "POST" });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
    } catch (err) {
      console.error(err);
    }
  };

  const markSingleRead = async (id, e) => {
    e.stopPropagation();
    try {
      await api(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: 1 } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const demoRoles = [
    { role: "Applicant", name: "Pranavi", email: "applicant@school.demo", desc: "Uploads docs, tracks submissions" },
    { role: "Reviewer", name: "Jordan Lee", email: "reviewer@school.demo", desc: "Reviews extracted fields, resolves exceptions" },
    { role: "Supervisor", name: "Taylor Morgan", email: "supervisor@school.demo", desc: "Monitors ageing, reassigns workload, overrides" },
    { role: "Compliance Admin", name: "Avery Patel", email: "admin@school.demo", desc: "Configures rules, manages users, audit access" }
  ];

  return (
    <div className="topNav">
      <div className="topNavLeft">
        {/* Hamburger menu button — visible only on mobile */}
        <button
          className="hamburgerBtn"
          onClick={onMenuToggle}
          aria-label="Open navigation menu"
          title="Open menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div className="schoolBanner">
          <span className="schoolCrest">🏫</span>
          <div className="schoolMeta">
            <strong>NORTHSTAR SCHOOL GROUP</strong>
            <small>{user?.campus || "Central Operations"} · AI Intake & Decision Hub</small>
          </div>
        </div>
      </div>

      <div className="topNavRight">
        {/* Quick Role Switcher */}
        <div className="navDropdownContainer" ref={roleRef}>
          <button
            className="roleSwitcherBtn"
            onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
            title="Switch demo persona for testing"
          >
            <span className="rolePill">{user?.role}</span>
            <span className="roleName roleNameHide">{user?.name}</span>
            <i className="dropdownArrow">▾</i>
          </button>

          {showRoleSwitcher && (
            <div className="dropdownMenu roleMenu">
              <div className="dropdownHeader">
                <b>Switch Demo Persona</b>
                <small>Test role-based access & permissions</small>
              </div>
              <div className="roleList">
                {demoRoles.map((r) => (
                  <button
                    key={r.email}
                    className={`roleItem ${user?.email === r.email ? "active" : ""}`}
                    onClick={() => switchRole(r.email)}
                  >
                    <div className="roleItemHead">
                      <strong>{r.name}</strong>
                      <span className="badge mini">{r.role}</span>
                    </div>
                    <small>{r.desc}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notifications Bell & Dropdown Panel */}
        <div className="navDropdownContainer" ref={notifRef}>
          <button
            className="notifBellBtn"
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
          >
            🔔
            {unreadCount > 0 && <span className="notifBadge">{unreadCount}</span>}
          </button>

          {showNotifications && (
            <div className="dropdownMenu notifMenu">
              <div className="dropdownHeader notifHeader">
                <div>
                  <b>Notifications</b>
                  <small>{unreadCount} unread</small>
                </div>
                {unreadCount > 0 && (
                  <button className="linkBtn" onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
              </div>

              <div className="notifList">
                {notifications.length === 0 ? (
                  <p className="emptyNotice">No new notifications</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`notifItem ${n.read ? "read" : "unread"}`}
                      onClick={() => {
                        setShowNotifications(false);
                        setPage("Notifications");
                      }}
                    >
                      <div className="notifContent">
                        <div className="notifTitleRow">
                          <span className={`severityDot ${n.severity}`}></span>
                          <strong>{n.title}</strong>
                        </div>
                        <p>{n.body}</p>
                        <small>{new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                      </div>
                      {!n.read && (
                        <button
                          className="markReadCheck"
                          title="Mark read"
                          onClick={(e) => markSingleRead(n.id, e)}
                        >
                          ✓
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="dropdownFooter">
                <button
                  className="fullNotifBtn"
                  onClick={() => {
                    setShowNotifications(false);
                    setPage("Notifications");
                  }}
                >
                  View all notifications →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sign out — hidden text on mobile, icon only */}
        <button className="navSignOutBtn" onClick={onSignOut} title="Sign Out">
          <span className="signOutText">Sign out</span>
          <span className="signOutIcon">⏻</span>
        </button>
      </div>
    </div>
  );
}
