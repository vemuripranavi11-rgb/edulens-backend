import { useEffect, useState } from "react";
import { api } from "../services/api";
import { Header, Notice, Badge, Tabs, Loading, Empty, StatCard } from "../components/UI";

export default function AdministrationPage({ user }) {
  const [activeTab, setActiveTab] = useState("audit");
  const [auditItems, setAuditItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Audit Filter state
  const [auditSearch, setAuditSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterActor, setFilterActor] = useState("all");

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [auditRes, settingsRes] = await Promise.all([
        api(`/api/v1/audit/search?q=${encodeURIComponent(auditSearch)}&action=${filterAction}&actor=${filterActor}`),
        api("/api/v1/settings")
      ]);
      setAuditItems(auditRes.items || []);
      setSettings(settingsRes.settings || {});
    } catch (err) {
      setError(err.message || "Failed to load audit or system settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [auditSearch, filterAction, filterActor]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setMessage("");
    try {
      await api("/api/v1/settings", {
        method: "PUT",
        body: JSON.stringify({ settings })
      });
      setMessage("System settings and threshold rules successfully updated and logged to audit.");
      await loadAdminData();
    } catch (err) {
      alert("Failed to save settings: " + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const tabs = [
    { id: "audit", label: "Immutable Audit Trail", count: auditItems.length },
    { id: "settings", label: "System & Governance Settings" }
  ];

  // Distinct actors and actions for filters
  const actionTypes = [
    "LOGIN",
    "CASE_DECISION_UPDATED",
    "CASE_COMMENT_ADDED",
    "AI_EXTRACTION_EXECUTED",
    "AI_SUMMARY_GENERATED",
    "AI_FEEDBACK_RECORDED",
    "USER_CREATED",
    "USER_UPDATED",
    "REPORT_GENERATED",
    "SETTINGS_CONFIG_UPDATED"
  ];

  return (
    <div className="pageContainer">
      <Header
        crumb="SECURITY &amp; COMPLIANCE / AUDIT &amp; CONFIG"
        title="Audit Logs &amp; System Settings"
      >
        <p>
          Immutable ledger of security-sensitive events, data access, AI runs, and material decisions.
          Compliance administrators configure validation thresholds, AI models, and institutional master data.
        </p>
      </Header>

      {message && <Notice type="success">{message}</Notice>}
      {error && <Notice type="error">{error}</Notice>}

      {/* Admin KPI Overview */}
      <div className="statsGrid fourCols">
        <StatCard
          label="Total Audit Events"
          value={auditItems.length}
          subtext="Cryptographically sealed"
          status="blue"
        />
        <StatCard
          label="Tamper Resistance"
          value="Append-Only"
          subtext="Modifications strictly forbidden"
          status="green"
        />
        <StatCard
          label="Confidence Threshold"
          value={`${Math.round((settings?.confidence_thresholds?.autoReviewThreshold || 0.85) * 100)}%`}
          subtext="Human review required below"
          status="amber"
        />
        <StatCard
          label="Primary AI Model"
          value={settings?.ai_config?.preferredModel || "gemini-3.7-flash"}
          subtext="Active extraction engine"
          status="neutral"
        />
      </div>

      {/* Tab Switcher */}
      <div className="adminTabsContainer">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === "audit" ? (
        /* Tab 1: Immutable Searchable Audit Trail */
        <section className="panelCard auditTableSection">
          <div className="cardHeaderRow">
            <div>
              <h3>Security &amp; Material Decision Audit Trail</h3>
              <p className="muted">Permanent chronological log of system authentication, case decisions, and AI execution</p>
            </div>

            <div className="tableFiltersGroup">
              <input
                type="text"
                className="searchInput"
                placeholder="Search audit detail, actor, or entity…"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
              />

              <select
                className="filterSelect"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
              >
                <option value="all">All Action Types</option>
                {actionTypes.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="customTableWrapper">
            <table className="customTable">
              <thead>
                <tr>
                  <th>ACTION TYPE</th>
                  <th>ACTOR</th>
                  <th>ENTITY</th>
                  <th>DETAILS / DECISION JUSTIFICATION</th>
                  <th>TIMESTAMP</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="emptyTableCell">
                      Loading audit events…
                    </td>
                  </tr>
                ) : auditItems.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="emptyTableCell">
                      <Empty label="No audit events matching criteria" icon="📜" />
                    </td>
                  </tr>
                ) : (
                  auditItems.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <span className={`auditActionPill ${a.action.toLowerCase()}`}>
                          {a.action}
                        </span>
                      </td>
                      <td>
                        <strong>{a.actor}</strong>
                      </td>
                      <td>
                        <span className="entityTag">{a.entity}</span>
                        {a.entity_id && (
                          <small className="muted block">ID: {a.entity_id.slice(0, 8)}…</small>
                        )}
                      </td>
                      <td>
                        <span className="auditDetailText">{a.detail || "System event completed."}</span>
                      </td>
                      <td>
                        <small className="timestampText">{new Date(a.created_at).toLocaleString()}</small>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        /* Tab 2: System Settings & Governance Controls */
        <section className="panelCard settingsFormSection">
          <div className="cardHeaderRow">
            <div>
              <h3>Institutional Governance &amp; AI Configuration</h3>
              <p className="muted">Define thresholds for automated routing, model hyperparameters, and master data</p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="settingsForm">
            {/* Section 1: Confidence Thresholds */}
            <div className="settingsGroup">
              <h4>1. Confidence &amp; Human-in-the-Loop Routing</h4>
              <p className="muted">Configure thresholds that trigger mandatory human reviewer verification:</p>

              <div className="formRow">
                <label className="fieldLabel">
                  Auto-Review Threshold ({Math.round((settings?.confidence_thresholds?.autoReviewThreshold || 0.85) * 100)}%)
                  <input
                    type="range"
                    min="0.50"
                    max="0.95"
                    step="0.05"
                    value={settings?.confidence_thresholds?.autoReviewThreshold || 0.85}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        confidence_thresholds: {
                          ...settings.confidence_thresholds,
                          autoReviewThreshold: parseFloat(e.target.value)
                        }
                      })
                    }
                  />
                  <small className="muted">Extractions below this confidence are flagged for manual review.</small>
                </label>

                <label className="fieldLabel">
                  High-Risk Triage Threshold ({Math.round((settings?.confidence_thresholds?.highRiskThreshold || 0.70) * 100)}%)
                  <input
                    type="range"
                    min="0.40"
                    max="0.80"
                    step="0.05"
                    value={settings?.confidence_thresholds?.highRiskThreshold || 0.70}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        confidence_thresholds: {
                          ...settings.confidence_thresholds,
                          highRiskThreshold: parseFloat(e.target.value)
                        }
                      })
                    }
                  />
                  <small className="muted">Triggers immediate supervisor escalation and warning banner.</small>
                </label>
              </div>
            </div>

            {/* Section 2: Generative AI Parameters */}
            <div className="settingsGroup">
              <h4>2. Generative AI Engine &amp; Fallbacks</h4>
              <p className="muted">Backend model selection and grounded extraction rules:</p>

              <div className="formRow">
                <label className="fieldLabel">
                  Primary Model Engine
                  <select
                    className="selectInput"
                    value={settings?.ai_config?.preferredModel || "gemini-3.7-flash"}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        ai_config: { ...settings.ai_config, preferredModel: e.target.value }
                      })
                    }
                  >
                    <option value="gemini-3.7-flash">Google Gemini 3.7 Flash (Recommended)</option>
                    <option value="gemini-2.5-flash">Google Gemini 2.5 Flash</option>
                    <option value="gemini-1.5-pro">Google Gemini 1.5 Pro</option>
                  </select>
                </label>

                <label className="fieldLabel">
                  Model Sampling Temperature
                  <input
                    type="number"
                    className="textInput"
                    step="0.1"
                    min="0.0"
                    max="1.0"
                    value={settings?.ai_config?.temperature ?? 0.2}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        ai_config: { ...settings.ai_config, temperature: parseFloat(e.target.value) }
                      })
                    }
                  />
                  <small className="muted">Low temperature (0.0–0.2) ensures strictly factual grounded extraction.</small>
                </label>
              </div>
            </div>

            {/* Section 3: Master Data & Campuses */}
            <div className="settingsGroup">
              <h4>3. Educational Master Data</h4>
              <p className="muted">Academic intake terms and organizational branch locations:</p>

              <div className="formRow">
                <label className="fieldLabel">
                  Active Academic Year
                  <input
                    type="text"
                    className="textInput"
                    value={settings?.master_data?.academicYear || "2026-2027"}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        master_data: { ...settings.master_data, academicYear: e.target.value }
                      })
                    }
                  />
                </label>

                <label className="fieldLabel">
                  Default SLA Target Window (Hours)
                  <input
                    type="number"
                    className="textInput"
                    value={settings?.workflow_rules?.defaultSlaHours || 48}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        workflow_rules: { ...settings.workflow_rules, defaultSlaHours: parseInt(e.target.value, 10) }
                      })
                    }
                  />
                </label>
              </div>
            </div>

            <div className="settingsSubmitRow">
              <button type="submit" className="btnPrimary" disabled={savingSettings}>
                {savingSettings ? "Saving Settings…" : "Save System Configuration →"}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
