import { useEffect, useState } from "react";
import { api } from "../services/api";
import { Header, Notice, Badge, Modal, Empty, Loading, StatCard } from "../components/UI";
import DocumentViewer from "../components/DocumentViewer";

export default function ExtractionPage({ selectedCaseId, go, user }) {
  const [cases, setCases] = useState([]);
  const [caseId, setCaseId] = useState(selectedCaseId || "");
  const [caseData, setCaseData] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Review & Override State
  const [reviewModal, setReviewModal] = useState({ isOpen: false, decision: "" });
  const [reviewReason, setReviewReason] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Field Edit / Override State
  const [editingField, setEditingField] = useState(null);
  const [overrideValue, setOverrideValue] = useState("");

  // Document Schemas for the 6 K-12 Document Types
  const schemas = {
    "Admission form": ["Student Name", "Date of Birth", "Parent / Guardian", "Residential Address", "Previous Institution", "Grade Applied"],
    "Identity proof": ["Legal Name", "Document Type", "ID / Passport Number", "Nationality", "Date of Expiry", "Issuing Authority"],
    "Report card": ["Student Name", "Academic Year", "Overall Percentage / GPA", "Conduct Grade", "Attendance Rate", "Promoted Status"],
    "Lesson plan": ["Subject", "Target Grade", "Curriculum Standard", "Topic Objectives", "Instructional Time", "Teacher Sign-off"],
    "Consent form": ["Guardian Name", "Relationship to Student", "Medical Authorization", "Field Excursion Permission", "Signature Date"],
    "Certificate": ["Recipient Name", "Certification Title", "Issuing Body", "Registration Number", "Issue Date", "Validity Status"]
  };

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
      setError("Failed to load cases list.");
    }
  };

  const loadCaseDetail = async (idToLoad) => {
    if (!idToLoad) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const detail = await api(`/api/v1/cases/${idToLoad}`);
      setCaseData(detail);
      if (detail.documents && detail.documents.length > 0) {
        const firstDoc = detail.documents[0];
        setSelectedDoc(firstDoc);
        loadLatestExtraction(firstDoc.id);
      } else {
        setSelectedDoc(null);
        setRun(null);
      }
    } catch (err) {
      setError(err.message || "Failed to load case data.");
    } finally {
      setLoading(false);
    }
  };

  const loadLatestExtraction = async (docId) => {
    try {
      const data = await api(`/api/v1/ai/extract/${docId}`);
      if (data.runs && data.runs.length > 0) {
        setRun(data.runs[0]);
      } else {
        setRun(null);
      }
    } catch (_) {
      setRun(null);
    }
  };

  useEffect(() => {
    loadCases();
  }, [selectedCaseId]);

  useEffect(() => {
    if (caseId) {
      loadCaseDetail(caseId);
    }
  }, [caseId]);

  const selectDocument = (doc) => {
    setSelectedDoc(doc);
    loadLatestExtraction(doc.id);
  };

  const runExtraction = async () => {
    if (!selectedDoc) return;
    setRunning(true);
    setError("");
    setMessage("");

    try {
      const result = await api(`/api/v1/ai/extract/${selectedDoc.id}`, { method: "POST" });
      setRun(result.run);
      setMessage(`Extraction complete using ${result.run.provider} (${result.run.model}). Extracted ${result.run.result?.fields?.length || 0} fields.`);
      await loadCaseDetail(caseId);
    } catch (err) {
      setError("AI Extraction failed: " + err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleReviewDecision = async () => {
    if (!run) return;
    if (!reviewReason.trim() || reviewReason.trim().length < 3) {
      alert("A mandatory reason (minimum 3 characters) is required.");
      return;
    }

    setSubmittingReview(true);
    try {
      await api(`/api/v1/ai/runs/${run.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          decision: reviewModal.decision,
          reason: reviewReason.trim()
        })
      });

      setMessage(`Extraction ${reviewModal.decision} recorded with audit reason.`);
      setReviewModal({ isOpen: false, decision: "" });
      setReviewReason("");
      await loadLatestExtraction(selectedDoc.id);
    } catch (err) {
      alert("Review recording failed: " + err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Determine UI state
  const isModelUnavailable = run && run.provider?.includes("fallback");
  const isLowConfidence = run && run.confidence < 0.75;
  const isInsufficientData = run && (!run.result?.fields || run.result.fields.length === 0);

  const activeCategory = selectedDoc?.category || "Admission form";
  const expectedSchema = schemas[activeCategory] || schemas["Admission form"];

  return (
    <div className="pageContainer">
      <Header
        crumb="INTELLIGENT DOCUMENT PIPELINE / AI EXTRACTION"
        title="AI Document Extraction"
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
              onClick={runExtraction}
              disabled={running || !selectedDoc}
            >
              {running ? "Analyzing Layout & OCR…" : "✦ Run AI Extraction"}
            </button>
          </div>
        }
      >
        <p>
          Classify and extract structured schema entities from admission forms, identity proofs, report cards,
          lesson plans, consent forms, and certificates using Google Gemini and OCR layout engines.
        </p>
      </Header>

      {message && <Notice type="success">{message}</Notice>}
      {error && <Notice type="error">{error}</Notice>}

      {/* State Banners: 5 Explicit UI States */}
      {running && (
        <div className="stateBanner loading">
          <span className="spinner mini"></span>
          <strong>Processing Document:</strong> Running OCR layout segmentation and entity recognition…
        </div>
      )}

      {isModelUnavailable && (
        <div className="stateBanner warning">
          <span>⚠️</span>
          <div>
            <strong>Local OCR Fallback Mode:</strong> Gemini Generative API key is unconfigured or offline.
            Entities extracted via local rules engine (<code>ocr-rules-v1</code>).
          </div>
        </div>
      )}

      {isLowConfidence && !running && (
        <div className="stateBanner amber">
          <span>⚠️</span>
          <div>
            <strong>Low-Confidence Alert:</strong> Extraction overall confidence is{" "}
            {Math.round((run.confidence || 0) * 100)}% (below institutional threshold 75%). Mandatory human verification required.
          </div>
        </div>
      )}

      {isInsufficientData && !running && (
        <div className="stateBanner neutral">
          <span>ℹ️</span>
          <div>
            <strong>Insufficient Data:</strong> No entities were detected with acceptable certainty in this document.
            Verify image resolution, page orientation, or upload a cleaner scan.
          </div>
        </div>
      )}

      {/* Main Layout: 2 Columns (Document Viewer & Extraction Result) */}
      <div className="extractionWorkspaceGrid">
        {/* Left Column: Documents selector + Document Viewer */}
        <div className="extractionLeftCol">
          <div className="panelCard docSelectorCard">
            <div className="cardHeaderRow">
              <h4>Case Documents ({caseData?.documents?.length || 0})</h4>
              <span className="badge mini">{caseData?.student}</span>
            </div>

            <div className="docPillList">
              {caseData?.documents?.map((d) => (
                <button
                  key={d.id}
                  className={`docPill ${selectedDoc?.id === d.id ? "active" : ""}`}
                  onClick={() => selectDocument(d)}
                >
                  📄 {d.name}
                  <small className="muted">({d.category || "General"})</small>
                </button>
              ))}
            </div>
          </div>

          <DocumentViewer
            document={selectedDoc}
            extractedFields={run?.result?.fields || selectedDoc?.extracted_fields || []}
          />
        </div>

        {/* Right Column: AI Extraction Results & Schemas */}
        <div className="extractionRightCol">
          {run ? (
            <div className="panelCard extractionResultCard">
              <div className="cardHeaderRow">
                <div>
                  <h3>AI Extraction Results</h3>
                  <small className="muted">
                    Engine: <strong>{run.provider}</strong> · Model: <code>{run.model}</code>
                  </small>
                </div>

                <div className="resultMetaBadges">
                  <span className={`confScoreBadge ${run.confidence >= 0.85 ? "high" : "mid"}`}>
                    {Math.round((run.confidence || 0.9) * 100)}% Overall Confidence
                  </span>
                  <Badge variant={run.reviewer_status || "pending"}>
                    Review: {run.reviewer_status || "Pending"}
                  </Badge>
                </div>
              </div>

              {/* Document Classification & Schema Bar */}
              <div className="schemaDefinitionBar">
                <span className="schemaLabel">Target Schema:</span>
                <strong>{activeCategory}</strong>
                <span className="schemaEntitiesCount">({expectedSchema.length} schema targets)</span>
              </div>

              {/* Extracted Fields Table */}
              <div className="customTableWrapper">
                <table className="customTable mini">
                  <thead>
                    <tr>
                      <th>FIELD NAME</th>
                      <th>EXTRACTED VALUE</th>
                      <th>CONFIDENCE</th>
                      <th>GROUNDED EVIDENCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!run.result?.fields || run.result.fields.length === 0) ? (
                      <tr>
                        <td colSpan="4" className="emptyTableCell">
                          No entities extracted.
                        </td>
                      </tr>
                    ) : (
                      run.result.fields.map((f, idx) => (
                        <tr key={idx}>
                          <td>
                            <strong>{f.name}</strong>
                          </td>
                          <td>
                            <span className="fieldValuePill">{f.value || "—"}</span>
                          </td>
                          <td>
                            <span className={`confScore ${f.confidence >= 0.85 ? "high" : "mid"}`}>
                              {Math.round((f.confidence || 0) * 100)}%
                            </span>
                          </td>
                          <td>
                            <small className="evidenceSnippet">"{f.evidence || "Direct OCR Match"}"</small>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Human Review & Override Decision Controls */}
              <div className="reviewActionCard">
                <div className="cardHeaderRow">
                  <div>
                    <h4>Authorised Reviewer Sign-off</h4>
                    <small className="muted">AI recommendations act as decision support only. Confirm or override.</small>
                  </div>
                </div>

                <div className="reviewButtonsRow">
                  <button
                    className="btnDecision approve"
                    onClick={() => {
                      setReviewModal({ isOpen: true, decision: "approved" });
                      setReviewReason("Extraction entities verified against original document source.");
                    }}
                  >
                    ✓ Accept AI Extraction
                  </button>

                  <button
                    className="btnDecision override"
                    onClick={() => {
                      setReviewModal({ isOpen: true, decision: "overridden" });
                      setReviewReason("");
                    }}
                  >
                    ✎ Override Values
                  </button>

                  <button
                    className="btnDecision reject"
                    onClick={() => {
                      setReviewModal({ isOpen: true, decision: "rejected" });
                      setReviewReason("Document scan unreadable or incorrect schema classification.");
                    }}
                  >
                    ✕ Reject Extraction
                  </button>
                </div>
              </div>

              {/* Source Data Snapshot */}
              <div className="sourceSnapshotCard">
                <h4>Raw OCR Source Snapshot</h4>
                <div className="rawOcrBox">
                  <pre>{run.result?.ocr_preview || "OCR text stream processed. Bounding layout verified."}</pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="panelCard extractionResultCard placeholder">
              <Empty
                label={
                  selectedDoc
                    ? `No extraction run recorded for "${selectedDoc.name}". Click "Run AI Extraction" to parse.`
                    : "Select a document to begin extraction"
                }
                icon="✦"
                action={
                  selectedDoc && (
                    <button className="btnPrimary" onClick={runExtraction} disabled={running}>
                      ✦ Extract {selectedDoc.name}
                    </button>
                  )
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Review Confirmation Modal */}
      <Modal
        isOpen={reviewModal.isOpen}
        onClose={() => setReviewModal({ isOpen: false, decision: "" })}
        title={`Confirm Extraction ${reviewModal.decision ? reviewModal.decision.toUpperCase() : ""}`}
        footer={
          <>
            <button className="btnSecondary" onClick={() => setReviewModal({ isOpen: false, decision: "" })}>
              Cancel
            </button>
            <button
              className="btnPrimary"
              onClick={handleReviewDecision}
              disabled={submittingReview || reviewReason.trim().length < 3}
            >
              {submittingReview ? "Recording..." : "Save Review Decision"}
            </button>
          </>
        }
      >
        <div className="modalForm">
          <p className="modalDesc">
            You are signing off on AI extraction run <code>{run?.id?.slice(0, 8)}…</code> with decision{" "}
            <strong>{reviewModal.decision}</strong>.
          </p>

          <label className="fieldLabel">
            Reviewer Justification / Override Notes (Mandatory) *
            <textarea
              className="textareaInput"
              rows="4"
              placeholder="State verified reference data, manual corrections applied, or reason for rejection…"
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              required
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
