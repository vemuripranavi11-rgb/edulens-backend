import { useEffect, useState } from "react";
import { api } from "../services/api";
import { Header, Notice, Badge, Modal, Empty, StatCard } from "../components/UI";

export default function ExceptionsPage({ user, go }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Action Modal State
  const [selectedException, setSelectedException] = useState(null);
  const [actionStatus, setActionStatus] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Evidence Drill-down State
  const [drillDownItem, setDrillDownItem] = useState(null);

  const loadExceptions = async () => {
    setLoading(true);
    try {
      const data = await api(`/api/v1/exceptions?type=${filterType}&severity=${filterSeverity}&status=${filterStatus}`);
      setItems(data.items || []);
    } catch (err) {
      setError(err.message || "Failed to load exception queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExceptions();
  }, [filterType, filterSeverity, filterStatus]);

  const openActionModal = (item, status) => {
    setSelectedException(item);
    setActionStatus(status);
    setActionReason("");
  };

  const submitDecision = async () => {
    if (!actionReason.trim() || actionReason.trim().length < 3) {
      alert("Please enter a mandatory justification (minimum 3 characters).");
      return;
    }

    setSubmitting(true);
    try {
      await api(`/api/v1/exceptions/${selectedException.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: actionStatus,
          reason: actionReason.trim()
        })
      });

      setMessage(`Exception "${selectedException.title}" marked as ${actionStatus}. Audit trail updated.`);
      setSelectedException(null);
      setActionReason("");
      await loadExceptions();
    } catch (err) {
      alert("Failed to submit exception decision: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Severity stats
  const criticalCount = items.filter((i) => i.severity === "critical").length;
  const conflictingCount = items.filter((i) => i.type === "conflicting").length;
  const missingCount = items.filter((i) => i.type === "missing").length;

  return (
    <div className="pageContainer">
      <Header
        crumb="GOVERNANCE &amp; RISK / EXCEPTION QUEUE"
        title="Exception Review Queue"
      >
        <p>
          Resolve discrepancies, conflicting guardian data, low-confidence OCR extracts, expired certifications,
          and duplicate uploads. Every override requires an authoritative, recorded justification.
        </p>
      </Header>

      {message && <Notice type="success">{message}</Notice>}
      {error && <Notice type="error">{error}</Notice>}

      {/* Exception Metrics */}
      <div className="statsGrid fourCols">
        <StatCard
          label="Active Exceptions"
          value={items.length}
          subtext="Awaiting reviewer triage"
          status={items.length > 0 ? "amber" : "green"}
        />
        <StatCard
          label="Critical Discrepancies"
          value={criticalCount}
          subtext="Guardian or identity conflicts"
          status={criticalCount > 0 ? "red" : "green"}
        />
        <StatCard
          label="Conflicting Information"
          value={conflictingCount}
          subtext="Cross-document data mismatch"
          status="blue"
        />
        <StatCard
          label="Missing Required Evidence"
          value={missingCount}
          subtext="Mandatory fields or missing pages"
          status="neutral"
        />
      </div>

      {/* Filter and Control Bar */}
      <section className="panelCard filtersPanel">
        <div className="filterControlsGroup">
          <div className="filterItem">
            <span className="filterLabel">Exception Type:</span>
            <select
              className="filterSelect"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="conflicting">Conflicting Information</option>
              <option value="missing">Missing Information</option>
              <option value="low-confidence">Low-Confidence Extraction</option>
              <option value="expired">Expired Documentation</option>
              <option value="duplicate">Duplicate Uploads</option>
            </select>
          </div>

          <div className="filterItem">
            <span className="filterLabel">Severity:</span>
            <select
              className="filterSelect"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="filterItem">
            <span className="filterLabel">Queue State:</span>
            <select
              className="filterSelect"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="open">Open &amp; Pending</option>
              <option value="approved">Approved / Overridden</option>
              <option value="correction-requested">Correction Requested</option>
              <option value="escalated">Escalated</option>
              <option value="rejected">Rejected</option>
              <option value="all">All States</option>
            </select>
          </div>
        </div>
      </section>

      {/* Exception Items Queue Table */}
      <section className="panelCard exceptionTableSection">
        <div className="customTableWrapper">
          <table className="customTable">
            <thead>
              <tr>
                <th>SEVERITY</th>
                <th>EXCEPTION DETAILS</th>
                <th>CATEGORY</th>
                <th>STUDENT / CASE</th>
                <th>CAMPUS</th>
                <th>AI CONFIDENCE</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="emptyTableCell">
                    Loading exceptions queue…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="7" className="emptyTableCell">
                    <Empty label="No exceptions found in this queue state." icon="🎉" />
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className={`exceptionRow ${item.severity}`}>
                    <td>
                      <span className={`severityBadge ${item.severity}`}>
                        {item.severity ? item.severity.toUpperCase() : "NORMAL"}
                      </span>
                    </td>
                    <td>
                      <div className="exceptionTitleCell">
                        <strong>{item.title}</strong>
                        <small className="muted">ID: {item.id.slice(0, 8)}… · Logged {new Date(item.created_at).toLocaleDateString()}</small>
                      </div>
                    </td>
                    <td>
                      <Badge variant={item.type}>{item.type}</Badge>
                    </td>
                    <td>
                      <div>
                        <strong>{item.student}</strong>
                        <small className="muted block">{item.case_title}</small>
                      </div>
                    </td>
                    <td>{item.campus || "Central Campus"}</td>
                    <td>
                      <span className={`confScore ${item.confidence < 0.75 ? "low" : "mid"}`}>
                        {Math.round((item.confidence || 0.7) * 100)}%
                      </span>
                    </td>
                    <td>
                      <div className="tableActionBtns">
                        <button
                          className="btnMini primary"
                          onClick={() => openActionModal(item, "approved")}
                          title="Approve / Override Exception"
                        >
                          ✓ Approve
                        </button>
                        <button
                          className="btnMini outline"
                          onClick={() => openActionModal(item, "correction-requested")}
                          title="Request applicant/parent correction"
                        >
                          ✎ Correct
                        </button>
                        <button
                          className="btnMini danger"
                          onClick={() => openActionModal(item, "escalated")}
                          title="Escalate to Supervisor"
                        >
                          ▲ Escalate
                        </button>
                        <button
                          className="btnMini textBtn"
                          onClick={() => setDrillDownItem(item)}
                          title="View evidence drill-down"
                        >
                          🔍 Drill down
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Decision Justification Modal */}
      <Modal
        isOpen={!!selectedException}
        onClose={() => setSelectedException(null)}
        title={`Resolve Exception: ${selectedException?.title}`}
        footer={
          <>
            <button
              type="button"
              className="btnSecondary"
              onClick={() => setSelectedException(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btnPrimary"
              onClick={submitDecision}
              disabled={submitting || actionReason.trim().length < 3}
            >
              {submitting ? "Committing Decision…" : `Confirm ${actionStatus ? actionStatus.toUpperCase() : ""}`}
            </button>
          </>
        }
      >
        {selectedException && (
          <div className="exceptionModalBody">
            <div className="alertNotice info">
              <strong>Target Student:</strong> {selectedException.student} ({selectedException.case_title})
              <br />
              <strong>Proposed Action:</strong> <Badge variant={actionStatus}>{actionStatus}</Badge>
            </div>

            <label className="fieldLabel">
              Governance Justification / Reviewer Notes (Mandatory) *
              <textarea
                className="textareaInput"
                rows="4"
                placeholder="Detail why this exception is approved, rejected, or escalated according to school policy…"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                required
              />
            </label>
          </div>
        )}
      </Modal>

      {/* Drill-down Drawer Modal */}
      <Modal
        isOpen={!!drillDownItem}
        onClose={() => setDrillDownItem(null)}
        title="Exception Evidence Drill-Down"
        maxWidth="680px"
        footer={
          <>
            <button
              type="button"
              className="btnSecondary"
              onClick={() => setDrillDownItem(null)}
            >
              Close
            </button>
            {go && drillDownItem && (
              <button
                type="button"
                className="btnPrimary"
                onClick={() => {
                  const caseId = drillDownItem.case_id;
                  setDrillDownItem(null);
                  go("Cases", caseId);
                }}
              >
                Open Case Review Workspace →
              </button>
            )}
          </>
        }
      >
        {drillDownItem && (
          <div className="drillDownContent">
            <div className="drillDownMetaGrid">
              <div>
                <small className="muted">Student</small>
                <strong>{drillDownItem.student}</strong>
              </div>
              <div>
                <small className="muted">Case Reference</small>
                <strong>{drillDownItem.case_title}</strong>
              </div>
              <div>
                <small className="muted">Severity</small>
                <span className={`severityBadge ${drillDownItem.severity}`}>{drillDownItem.severity}</span>
              </div>
              <div>
                <small className="muted">AI Extraction Confidence</small>
                <strong>{Math.round((drillDownItem.confidence || 0.75) * 100)}%</strong>
              </div>
            </div>

            <div className="drillDownCard">
              <h4>Discrepancy Details</h4>
              <p className="drillDownDesc">{drillDownItem.title}</p>
              <div className="evidenceQuoteBox">
                <small className="muted">Detected Root Factor:</small>
                <p>
                  System cross-compared primary intake records against secondary submissions.
                  Field value inconsistency exceeds authorized K-12 variance threshold (0.15).
                </p>
              </div>
            </div>

            <div className="drillDownSteps">
              <h4>Prescribed Resolution Workflow:</h4>
              <ol>
                <li>Inspect original documents in the Case Review Workspace.</li>
                <li>Compare student birth certificate or passport against guardian declaration.</li>
                <li>Request official school correction or override with compliance authorization.</li>
              </ol>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}