import { useEffect, useState } from "react";
import { api } from "../services/api";
import { Header, Notice, Badge, Modal, Empty, Loading, StatCard, Tabs } from "../components/UI";

export default function NotificationsPage({ go }) {
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  // Preferences Modal State
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [preferences, setPreferences] = useState({
    emailOnCritical: true,
    emailOnAssign: true,
    inAppAll: true,
    dailyDigest: false
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const [notifsRes, prefRes] = await Promise.all([
        api("/api/v1/notifications"),
        api("/api/v1/notifications/preferences").catch(() => ({ preferences: null }))
      ]);
      setItems(notifsRes.items || []);
      if (prefRes.preferences) {
        setPreferences(prefRes.preferences);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const markRead = async (id) => {
    try {
      await api(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: 1 } : n)));
      setMessage("Notification marked as read.");
    } catch (err) {
      console.error(err);
    }
  };

  const markAllRead = async () => {
    try {
      await api("/api/v1/notifications/mark-all-read", { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, read: 1 })));
      setMessage("All notifications marked as read.");
    } catch (err) {
      console.error(err);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await api(`/api/v1/notifications/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((n) => n.id !== id));
      setMessage("Notification dismissed.");
    } catch (err) {
      console.error(err);
    }
  };

  const savePreferences = async (e) => {
    e.preventDefault();
    setSavingPrefs(true);
    try {
      await api("/api/v1/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences })
      });
      setShowPrefsModal(false);
      setMessage("Institutional notification preferences saved.");
    } catch (err) {
      alert("Failed to save preferences: " + err.message);
    } finally {
      setSavingPrefs(false);
    }
  };

  // Filter items by tab
  const filteredItems = items.filter((item) => {
    if (activeTab === "unread") return !item.read;
    if (activeTab === "urgent") return item.severity === "urgent" || item.severity === "critical";
    if (activeTab === "assigned") return item.title.toLowerCase().includes("assign");
    if (activeTab === "system") return item.user_email === null || item.title.toLowerCase().includes("system");
    return true;
  });

  const unreadCount = items.filter((i) => !i.read).length;
  const urgentCount = items.filter((i) => i.severity === "urgent" || i.severity === "critical").length;

  const tabs = [
    { id: "all", label: "All Alerts", count: items.length },
    { id: "unread", label: "Unread", count: unreadCount },
    { id: "urgent", label: "Urgent & Exceptions", count: urgentCount },
    { id: "assigned", label: "Case Assignments" },
    { id: "system", label: "System & AI Runs" }
  ];

  return (
    <div className="pageContainer">
      <Header
        crumb="COMMUNICATION / NOTIFICATIONS HUB"
        title="Notifications &amp; Alerts"
        actions={
          <div className="headerButtonGroup">
            <button className="btnSecondary" onClick={() => setShowPrefsModal(true)}>
              ⚙ Notification Preferences
            </button>
            {unreadCount > 0 && (
              <button className="btnPrimary" onClick={markAllRead}>
                ✓ Mark All as Read
              </button>
            )}
          </div>
        }
      >
        <p>
          Real-time notification ledger for case assignments, high-risk exceptions, due date SLAs,
          AI extraction completions, and security alerts.
        </p>
      </Header>

      {message && <Notice type="success">{message}</Notice>}

      {/* Overview Stat Cards */}
      <div className="statsGrid fourCols">
        <StatCard
          label="Total Notifications"
          value={items.length}
          subtext="Recorded in user mailbox"
          status="blue"
        />
        <StatCard
          label="Unread Alerts"
          value={unreadCount}
          subtext="Requiring reviewer attention"
          status={unreadCount > 0 ? "amber" : "green"}
        />
        <StatCard
          label="Urgent Exceptions"
          value={urgentCount}
          subtext="Critical discrepancies flagged"
          status={urgentCount > 0 ? "red" : "green"}
        />
        <StatCard
          label="Channel Policy"
          value="In-App + Mail"
          subtext="FERPA &amp; child safeguarding compliant"
          status="neutral"
        />
      </div>

      {/* Tabs Filter Bar */}
      <div className="notificationsTabsRow">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* Notifications List Section */}
      <section className="panelCard notifFeedCard">
        {loading ? (
          <Loading label="Retrieving notification events…" />
        ) : filteredItems.length === 0 ? (
          <Empty label="No notifications in this view" icon="🔔" />
        ) : (
          <div className="notificationsFeedList">
            {filteredItems.map((n) => (
              <article key={n.id} className={`notificationRow ${n.read ? "read" : "unread"}`}>
                <div className="notifRowLeft">
                  <span className={`severityDot large ${n.severity || "normal"}`}></span>
                  <div className="notifTextContent">
                    <div className="notifRowHeader">
                      <strong className="notifTitleText">{n.title}</strong>
                      <Badge variant={n.severity || "normal"}>{n.severity || "normal"}</Badge>
                      {!n.read && <span className="unreadTag">NEW</span>}
                    </div>
                    <p className="notifBodyText">{n.body}</p>
                    <small className="notifMetaText">
                      Logged {new Date(n.created_at).toLocaleString()} · Institutional Scope
                    </small>
                  </div>
                </div>

                <div className="notifRowActions">
                  {!n.read && (
                    <button
                      className="btnMini outline"
                      onClick={() => markRead(n.id)}
                      title="Mark as Read"
                    >
                      Mark read
                    </button>
                  )}
                  {go && n.title.toLowerCase().includes("exception") && (
                    <button
                      className="btnMini primary"
                      onClick={() => go("Exceptions")}
                      title="Open Exception Review Queue"
                    >
                      View Queue →
                    </button>
                  )}
                  {go && !n.title.toLowerCase().includes("exception") && (
                    <button
                      className="btnMini"
                      onClick={() => go("Cases")}
                      title="Open Case Review Workspace"
                    >
                      Open Case →
                    </button>
                  )}
                  <button
                    className="btnMini textBtn dismissBtn"
                    onClick={() => deleteNotification(n.id)}
                    title="Dismiss notification"
                  >
                    ✕
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Notification Preferences Modal */}
      <Modal
        isOpen={showPrefsModal}
        onClose={() => setShowPrefsModal(false)}
        title="Institutional Notification Preferences"
        footer={
          <>
            <button className="btnSecondary" onClick={() => setShowPrefsModal(false)}>
              Cancel
            </button>
            <button className="btnPrimary" onClick={savePreferences} disabled={savingPrefs}>
              {savingPrefs ? "Saving…" : "Save Preferences"}
            </button>
          </>
        }
      >
        <form onSubmit={savePreferences} className="modalForm">
          <p className="modalDesc">
            Configure how alert events are routed to your account according to role responsibilities:
          </p>

          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={preferences.emailOnCritical}
              onChange={(e) => setPreferences({ ...preferences, emailOnCritical: e.target.checked })}
            />
            <div>
              <strong>Immediate Alert on Critical Exceptions</strong>
              <small className="muted block">Dispatches notification when guardian or identity mismatch is detected.</small>
            </div>
          </label>

          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={preferences.emailOnAssign}
              onChange={(e) => setPreferences({ ...preferences, emailOnAssign: e.target.checked })}
            />
            <div>
              <strong>Case Assignment Notifications</strong>
              <small className="muted block">Notify when a student file is routed to your queue by a supervisor.</small>
            </div>
          </label>

          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={preferences.inAppAll}
              onChange={(e) => setPreferences({ ...preferences, inAppAll: e.target.checked })}
            />
            <div>
              <strong>In-App Top Navigation Bell Alerts</strong>
              <small className="muted block">Display live badges and dropdown alerts in the top bar.</small>
            </div>
          </label>

          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={preferences.dailyDigest}
              onChange={(e) => setPreferences({ ...preferences, dailyDigest: e.target.checked })}
            />
            <div>
              <strong>Daily Intake Digest</strong>
              <small className="muted block">Receive an end-of-day summary of completed intake cases across campuses.</small>
            </div>
          </label>
        </form>
      </Modal>
    </div>
  );
}
