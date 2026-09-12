import { useEffect, useState } from "react";
import { api } from "../services/api";
import { Header, Notice, Badge, Modal, Empty, Loading, StatCard } from "../components/UI";

export default function ValidationPage({ selectedCaseId, go, user }) {
  const [cases, setCases] = useState([]);
  const [caseId, setCaseId] = useState(selectedCaseId || "");
  const [caseData, setCaseData] = useState(null);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Override Check Modal State
  const [overrideModal, setOverrideModal] = useState({ isOpen: false, check: null });
  const [overrideReason, setOverrideReason] = useState("");
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const loadCases = async () => {
    try {
      const data = await api("/api/v1/cases");
      const items = data.items || [];
      setCases(items);
      if (selectedCaseId) {
        setCaseId(selectedCaseId);
      } else if (items.length > 0 && !caseId) {
        setCaseId(items[0].id);
      }
    } catch (err) {
      setError("Failed to load cases.");
    }
  };

  const loadCaseValidation = async (idToLoad) => {
    if (!idToLoad) return;
    setLoading(true);
    setError("");
    try {
      const [caseRes, valRes] = await Promise.all([
        api(`/api/v1/cases/${idToLoad}`),
        api(`/api/v1/validation/${idToLoad}`)
      ]);
      setCaseData(caseRes);
      setValidation(valRes);
    } catch (err) {
      setError(err.message || "Failed to load validation checks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, [selectedCaseId]);

  useEffect(() => {
    if (caseId) {
      loadCaseValidation(caseId);
    }
  }, [caseId]);

  const runValidation = async () => {
    if (!caseId) return;
    setRunning(true);
    setMessage("");
    setError("");
    try {
      const res = await api(`/api/v1/validation/${caseId}/run`, { method: "POST" });
      setValidation(res);
      setMessage(`Validation evaluated: Overall Status "${res.status ? res.status.toUpperCase() : "COMPLETED"}".`);
      await loadCaseValidation(caseId);
    } catch (err) {
      setError("Validation run failed: " + err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleOverrideCheck = async () => {
    if (!overrideReason.trim()) {
      alert("A mandatory reason is required to override automated validation.");
      return;
    }

    setSubmittingOverride(true);
    try {
      // Simulate/record override in audit
      await api(`/api/v1/cases/${caseId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          content: `VALIDATION OVERRIDE: Check "${overrideModal.check?.name}" manually cleared. Reason: ${overrideReason.trim()}`
        })
      });

      setMessage(`Validation check "${overrideModal.check?.name}" cleared with authorized override.`);
      setOverrideModal({ isOpen: false, check: null });
      setOverrideReason("");
      await loadCaseValidation(caseId);
    } catch (err) {
      alert("Override failed: " + err.message);
    } finally {
      setSubmittingOverride(false);
    }
  };

  const checks = validation?.checks || [];
  const passedCount = checks.filter((c) => c.status === "passed").length;
  const failedCount = checks.filter((c) => c.status === "failed").length;
  const reviewCount = checks.filter((c) => c.status === "review-required").length;

  return (
    <div className="pageContainer">
      <Header
        crumb="INTELLIGENT VALIDATION / AUDIT RULES"
        title="Validation &amp; Cross-Document Checks"
        actions={
          <div className="headerButtonGroup">
            <select
              className="selectInput"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.student} — {c.title}
                </option>
              ))}
            </select>

            <button
              className="btnPrimary"
              onClick={runValidation}
              disabled={running || !caseId}
            >
              {running ? "Evaluating Rules Matrix…" : "✓ Run Validation Checks"}
            </button>
          </div>
        }
      >
        <p>
          Verify extracted values against format rules, institutional reference data, previous submissions,
          and multi-document cross-referencing. Clearly separate AI suggestions from approved business values.
        </p>
      </Header>

      {message && <Notice type="success">{message}</Notice>}
      {error && <Notice type="error">{error}</Notice>}

      {/* Validation Scorecards */}
      <div className="statsGrid fourCols">
        <StatCard
          label="Validation Status"
          value={validation?.status ? validation.status.toUpperCase() : "PENDING"}
          subtext={`Case: ${caseData?.student || "Student"}`}
          status={validation?.status === "passed" ? "green" : validation?.status === "failed" ? "red" : "amber"}
        />
        <StatCard
          label="Passed Checks"
          value={passedCount}
          subtext="Satisfies institutional rules"
          status="green"
        />
        <StatCard
          label="Failed / Discrepancies"
          value={failedCount}
          subtext="Critical blocks or conflicts"
          status={failedCount > 0 ? "red" : "neutral"}
        />
        <StatCard
          label="Review Threshold Alerts"
          value={reviewCount}
          subtext="Confidence &lt; 75% requires sign-off"
          status={reviewCount > 0 ? "amber" : "neutral"}
        />
      </div>

      {/* Cross-Document Comparison Matrix Card */}
      <section className="panelCard crossDocMatrixSection">
        <div className="cardHeaderRow">
          <div>
            <h3>Cross-Document Consistency Matrix</h3>
            <p className="muted">Multi-document matching across Admission Forms, Identity Proofs, and Report Cards</p>
          </div>
          <span className="badge mini blue">Student: {caseData?.student}</span>
        </div>

        <div className="customTableWrapper">
          <table className="customTable">
            <thead>
              <tr>
                <th>VALIDATION RULE</th>
                <th>CHECK TYPE</th>
                <th>STATUS</th>
                <th>AI SUGGESTION / EVIDENCE</th>
                <th>APPROVED BUSINESS DECISION</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="emptyTableCell">
                    Evaluating consistency matrix…
                  </td>
                </tr>
              ) : checks.length === 0 ? (
                <tr>
                  <td colSpan="6" className="emptyTableCell">
                    <Empty label="No validation results yet. Click 'Run Validation Checks' to evaluate this case." icon="📋" />
                  </td>
                </tr>
              ) : (
                checks.map((c, i) => (
                  <tr key={i} className={`checkRow ${c.status}`}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td>
                      <span className="ruleTypePill">
                        {c.name.includes("Cross") ? "Cross-Document" : c.name.includes("OCR") ? "Integrity" : "Format Rule"}
                      </span>
                    </td>
                    <td>
                      <span className={`checkStatusBadge ${c.status}`}>
                        {c.status === "passed" ? "✓ Passed" : c.status === "failed" ? "✕ Failed" : "⚠️ Review"}
                      </span>
                    </td>
                    <td>
                      <div className="aiSuggestionCell">
                        <span>{c.message}</span>
                        {c.confidence > 0 && (
                          <small className="muted block">AI Confidence: {Math.round(c.confidence * 100)}%</small>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="businessDecisionCell">
                        {c.status === "passed" ? (
                          <span className="badge mini green">Validated Standard</span>
                        ) : (
                          <span className="badge mini amber">Reviewer Override Required</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="tableActionBtns">
                        {c.status !== "passed" ? (
                          <button
                            className="btnMini primary"
                            onClick={() => setOverrideModal({ isOpen: true, check: c })}
                          >
                            ✎ Override
                          </button>
                        ) : (
                          <span className="checkedMark">✓ In Order</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Active Validation Exceptions */}
      {validation?.exceptions && validation.exceptions.length > 0 && (
        <section className="panelCard activeExceptionsSection">
          <div className="cardHeaderRow">
            <div>
              <h3>Exceptions Triggered by Validation ({validation.exceptions.length})</h3>
              <p className="muted">Items routed automatically to human exception review queue</p>
            </div>
            {go && (
              <button className="btnSecondary mini" onClick={() => go("Exceptions")}>
                Open Exception Queue →
              </button>
            )}
          </div>

          <div className="exceptionsListMini">
            {validation.exceptions.map((ex) => (
              <div key={ex.id} className={`exListItem ${ex.severity}`}>
                <div className="exListMain">
                  <span className={`severityBadge ${ex.severity}`}>{ex.severity}</span>
                  <strong>{ex.title}</strong>
                  <small className="muted">Type: {ex.type} · Confidence: {Math.round((ex.confidence || 0.75) * 100)}%</small>
                </div>
                <Badge variant={ex.status}>{ex.status}</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Override Justification Modal */}
      <Modal
        isOpen={overrideModal.isOpen}
        onClose={() => setOverrideModal({ isOpen: false, check: null })}
        title={`Override Rule: ${overrideModal.check?.name}`}
        footer={
          <>
            <button className="btnSecondary" onClick={() => setOverrideModal({ isOpen: false, check: null })}>
              Cancel
            </button>
            <button
              className="btnPrimary"
              onClick={handleOverrideCheck}
              disabled={submittingOverride || !overrideReason.trim()}
            >
              {submittingOverride ? "Recording..." : "Confirm Override & Log Audit"}
            </button>
          </>
        }
      >
        <div className="modalForm">
          <p className="modalDesc">
            You are applying a manual business override on rule <strong>{overrideModal.check?.name}</strong> for student{" "}
            <strong>{caseData?.student}</strong>.
          </p>

          <label className="fieldLabel">
            Authoritative Justification / Policy Citation (Mandatory) *
            <textarea
              className="textareaInput"
              rows="4"
              placeholder="e.g. Verified original birth certificate presented in person by parent; discrepancy cleared under Admission Regulation 4.2..."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              required
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
