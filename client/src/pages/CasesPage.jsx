import { useEffect, useState } from "react";
import { api } from "../services/api";
import { Header, Notice, Badge, Modal, Empty, Loading } from "../components/UI";
import DocumentViewer from "../components/DocumentViewer";

export default function CasesPage({ selected, go, user }) {
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(selected || "");
  const [caseDetail, setCaseDetail] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCampus, setFilterCampus] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Reviewer comment state
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Decision Modal state
  const [decisionModal, setDecisionModal] = useState({
    isOpen: false,
    status: "",
    title: ""
  });
  const [decisionReason, setDecisionReason] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // New Case Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    student: "",
    priority: "medium",
    campus: "Central Campus",
    category: "Admission",
    owner: user?.name || "Jordan Lee"
  });

  const loadCases = async () => {
    try {
      const data = await api(`/api/v1/cases?q=${encodeURIComponent(searchQuery)}&campus=${filterCampus}&status=${filterStatus}`);
      const items = data.items || [];
      setCases(items);

      if (selectedCaseId) {
        loadCaseDetail(selectedCaseId);
      } else if (items.length > 0 && !caseDetail) {
        setSelectedCaseId(items[0].id);
        loadCaseDetail(items[0].id);
      }
    } catch (err) {
      setError(err.message || "Failed to load cases.");
    }
  };

  const loadCaseDetail = async (id) => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const detail = await api(`/api/v1/cases/${id}`);
      setCaseDetail(detail);
      if (detail.documents && detail.documents.length > 0) {
        setSelectedDoc((current) => {
          const found = detail.documents.find((d) => d.id === current?.id);
          return found || detail.documents[0];
        });
      } else {
        setSelectedDoc(null);
      }
    } catch (err) {
      setError(err.message || "Failed to load case workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, [searchQuery, filterCampus, filterStatus]);

  useEffect(() => {
    if (selected) {
      setSelectedCaseId(selected);
      loadCaseDetail(selected);
    }
  }, [selected]);

  const selectCase = (id) => {
    setSelectedCaseId(id);
    loadCaseDetail(id);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedCaseId) return;
    setSubmittingComment(true);

    try {
      const res = await api(`/api/v1/cases/${selectedCaseId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: newComment.trim() })
      });
      setCaseDetail((prev) => ({
        ...prev,
        comments: [...(prev.comments || []), res.comment]
      }));
      setNewComment("");
      setMessage("Comment added to case collaboration thread.");
    } catch (err) {
      setError(err.message || "Failed to post comment.");
    } finally {
      setSubmittingComment(false);
    }
  };

  const openDecisionModal = (status, title) => {
    setDecisionModal({ isOpen: true, status, title });
    setDecisionReason("");
  };

  const executeDecision = async () => {
    if (!decisionReason.trim() || decisionReason.trim().length < 3) {
      alert("A mandatory reason (minimum 3 characters) is required for governance.");
      return;
    }

    setSubmittingDecision(true);
    try {
      await api(`/api/v1/cases/${selectedCaseId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: decisionModal.status,
          reason: decisionReason.trim()
        })
      });

      setMessage(`Decision recorded: Case marked as ${decisionModal.status}. Logged to audit.`);
      setDecisionModal({ isOpen: false, status: "", title: "" });
      await loadCaseDetail(selectedCaseId);
      await loadCases();
    } catch (err) {
      alert("Decision failed: " + err.message);
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleCreateCase = async (e) => {
    e.preventDefault();
    if (!createForm.title || !createForm.student) return;

    try {
      const res = await api("/api/v1/cases", {
        method: "POST",
        body: JSON.stringify(createForm)
      });
      setShowCreateModal(false);
      setMessage(`Case created for ${createForm.student}.`);
      setCreateForm({
        title: "",
        student: "",
        priority: "medium",
        campus: "Central Campus",
        category: "Admission",
        owner: user?.name || "Jordan Lee"
      });
      await loadCases();
      if (res.case?.id) {
        selectCase(res.case.id);
      }
    } catch (err) {
      alert("Failed to create case: " + err.message);
    }
  };

  // Helper for confidence badge styling
  const getConfidenceBadge = (score) => {
    const s = Number(score) || 0;
    if (s >= 0.88) return <span className="confBadge high">{Math.round(s * 100)}% High</span>;
    if (s >= 0.7) return <span className="confBadge mid">{Math.round(s * 100)}% Med</span>;
    return <span className="confBadge low">{Math.round(s * 100)}% Low</span>;
  };

  return (
    <div className="pageContainer workspaceContainer">
      <Header
        crumb="CASE WORKSPACE / REVIEW &amp; VALIDATION"
        title="Case Review Workspace"
        actions={
          <button className="btnPrimary" onClick={() => setShowCreateModal(true)}>
            + New Case Intake
          </button>
        }
      >
        <p>
          Integrated document viewer, source-extracted fields, confidence grading, reviewer collaboration,
          and authoritative audit-trailed decisions.
        </p>
      </Header>

      {message && <Notice type="success">{message}</Notice>}
      {error && <Notice type="error">{error}</Notice>}

      {/* Main Workspace 3-Column Layout */}
      <div className="caseWorkspaceGrid">
        {/* Left Column: Cases Navigator */}
        <div className="casesListPanel">
          <div className="panelCard caseSearchHeader">
            <input
              type="text"
              className="searchBarInput"
              placeholder="Search student or case title…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="caseFilterRow">
              <select
                className="filterSelect mini"
                value={filterCampus}
                onChange={(e) => setFilterCampus(e.target.value)}
              >
                <option value="all">All Campuses</option>
                <option value="Central Campus">Central</option>
                <option value="North Campus">North</option>
                <option value="West Wing">West</option>
                <option value="South Campus">South</option>
              </select>

              <select
                className="filterSelect mini"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All States</option>
                <option value="pending-review">Pending</option>
                <option value="in-review">In Review</option>
                <option value="exception">Exception</option>
                <option value="approved">Approved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="casesScrollList">
            {cases.length === 0 ? (
              <Empty label="No cases matching query" icon="🔍" />
            ) : (
              cases.map((c) => (
                <div
                  key={c.id}
                  className={`caseItemCard ${selectedCaseId === c.id ? "active" : ""}`}
                  onClick={() => selectCase(c.id)}
                >
                  <div className="caseItemTop">
                    <strong className="caseStudent">{c.student}</strong>
                    <Badge variant={c.status}>{c.status}</Badge>
                  </div>
                  <p className="caseTitleDesc">{c.title}</p>
                  <div className="caseItemMeta">
                    <span className="caseCampus">{c.campus || "Central"}</span>
                    <span className={`casePriority priority-${c.priority}`}>{c.priority}</span>
                    <small>{new Date(c.updated_at).toLocaleDateString()}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center Column: Original Document Viewer */}
        <div className="documentViewerSection">
          {loading ? (
            <Loading label="Loading document preview &amp; case repository…" />
          ) : caseDetail ? (
            <div className="viewerWrapper">
              {/* Document Selector Bar */}
              <div className="relatedDocsBar">
                <span className="barLabel">Associated Evidence ({caseDetail.documents?.length || 0}):</span>
                <div className="docTabsRow">
                  {caseDetail.documents?.map((d) => (
                    <button
                      key={d.id}
                      className={`docTabItem ${selectedDoc?.id === d.id ? "active" : ""}`}
                      onClick={() => setSelectedDoc(d)}
                    >
                      <span className="tabDocIcon">📄</span>
                      <span className="tabDocName">{d.name}</span>
                      <span className="tabDocCategory">({d.category || "General"})</span>
                    </button>
                  ))}
                  {(!caseDetail.documents || caseDetail.documents.length === 0) && (
                    <span className="noDocsText">No documents uploaded to this case yet.</span>
                  )}
                </div>
              </div>

              {/* Document Viewer Component */}
              <DocumentViewer
                document={selectedDoc}
                extractedFields={selectedDoc?.extracted_fields || []}
              />
            </div>
          ) : (
            <Empty label="Select a case from the left panel to begin review" icon="👈" />
          )}
        </div>

        {/* Right Column: Extracted Entities, Decision Toolbar & Comments */}
        <div className="caseSideReviewPanel">
          {caseDetail ? (
            <>
              {/* Case Summary & Authoritative Decision Actions */}
              <div className="panelCard decisionActionCard">
                <div className="cardHeaderRow">
                  <div>
                    <h3 className="caseDetailStudent">{caseDetail.student}</h3>
                    <small className="muted">Case Ref: {caseDetail.id.slice(0, 12)}… · v{caseDetail.version}</small>
                  </div>
                  <Badge variant={caseDetail.status}>{caseDetail.status}</Badge>
                </div>

                {/* Reviewer Action Bar */}
                <div className="decisionButtonsBar">
                  <button
                    className="btnDecision approve"
                    onClick={() => openDecisionModal("approved", "Approve Enrollment / Case")}
                  >
                    ✓ Approve
                  </button>
                  <button
                    className="btnDecision correction"
                    onClick={() => openDecisionModal("in-review", "Request Correction / More Info")}
                  >
                    ✎ Request Correction
                  </button>
                  <button
                    className="btnDecision escalate"
                    onClick={() => openDecisionModal("escalated", "Escalate to Supervisor")}
                  >
                    ▲ Escalate
                  </button>
                  <button
                    className="btnDecision reject"
                    onClick={() => openDecisionModal("rejected", "Reject Submission")}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>

              {/* Extracted Fields with Confidence Highlights */}
              <div className="panelCard extractedFieldsCard">
                <div className="cardHeaderRow">
                  <div>
                    <h4>Extracted Entities</h4>
                    <small className="muted">
                      Source: {selectedDoc ? selectedDoc.name : "Active document"}
                    </small>
                  </div>
                  {selectedDoc?.extracted_fields && (
                    <span className="badge mini blue">
                      {selectedDoc.extracted_fields.filter((f) => f.field_name !== "OCR Text").length} fields
                    </span>
                  )}
                </div>

                <div className="fieldsListContainer">
                  {!selectedDoc?.extracted_fields ||
                  selectedDoc.extracted_fields.filter((f) => f.field_name !== "OCR Text").length === 0 ? (
                    <p className="noFieldsNotice">
                      No entities extracted for this document yet. Click below to run AI extraction.
                    </p>
                  ) : (
                    selectedDoc.extracted_fields
                      .filter((f) => f.field_name !== "OCR Text")
                      .map((f) => (
                        <div key={f.id} className="fieldRowItem">
                          <div className="fieldItemHeader">
                            <span className="fieldLabel">{f.field_name}</span>
                            {getConfidenceBadge(f.confidence)}
                          </div>
                          <div className="fieldValueDisplay">
                            <strong>{f.field_value || "—"}</strong>
                            {f.evidence_text && (
                              <small className="evidenceQuote">Evidence: "{f.evidence_text}"</small>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Active Exceptions on this case */}
              {caseDetail.exceptions && caseDetail.exceptions.length > 0 && (
                <div className="panelCard exceptionsMiniCard">
                  <div className="cardHeaderRow">
                    <h4>Active Exceptions ({caseDetail.exceptions.length})</h4>
                    <span className="badge red">Attention Required</span>
                  </div>
                  <div className="exceptionsListMini">
                    {caseDetail.exceptions.map((ex) => (
                      <div key={ex.id} className="exceptionItemMini">
                        <span className="exIcon">⚠️</span>
                        <div className="exContent">
                          <strong>{ex.title}</strong>
                          <small>Severity: {ex.severity} · Status: {ex.status}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reviewer Collaboration Comments Thread */}
              <div className="panelCard commentsCard">
                <h4>Reviewer Collaboration</h4>
                <div className="commentsThread">
                  {caseDetail.comments && caseDetail.comments.length > 0 ? (
                    caseDetail.comments.map((cm) => (
                      <div key={cm.id} className="commentBubble">
                        <div className="commentAuthorRow">
                          <strong>{cm.author_name}</strong>
                          <span className="badge mini">{cm.author_role}</span>
                          <small>{new Date(cm.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                        </div>
                        <p className="commentBody">{cm.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="noCommentsPlaceholder">No comments recorded yet. Start discussion below.</p>
                  )}
                </div>

                <form onSubmit={handleAddComment} className="commentInputForm">
                  <input
                    type="text"
                    className="textInput commentInput"
                    placeholder="Add an internal note or review finding…"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    disabled={submittingComment}
                  />
                  <button type="submit" className="btnMini" disabled={submittingComment || !newComment.trim()}>
                    {submittingComment ? "Posting…" : "Post"}
                  </button>
                </form>
              </div>

              {/* Immutable Decision Audit Timeline */}
              {caseDetail.audit && caseDetail.audit.length > 0 && (
                <div className="panelCard auditTimelineCard">
                  <h4>Decision &amp; Audit Trail</h4>
                  <div className="timelineList">
                    {caseDetail.audit.slice(0, 5).map((a) => (
                      <div key={a.id} className="timelineItem">
                        <div className="timelineDot"></div>
                        <div className="timelineInfo">
                          <strong>{a.action}</strong>
                          <p>{a.detail || "System action executed."}</p>
                          <small>{a.actor} · {new Date(a.created_at).toLocaleString()}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Decision Confirmation Modal */}
      <Modal
        isOpen={decisionModal.isOpen}
        onClose={() => setDecisionModal({ isOpen: false, status: "", title: "" })}
        title={decisionModal.title}
        footer={
          <>
            <button
              type="button"
              className="btnSecondary"
              onClick={() => setDecisionModal({ isOpen: false, status: "", title: "" })}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btnPrimary"
              onClick={executeDecision}
              disabled={submittingDecision || decisionReason.trim().length < 3}
            >
              {submittingDecision ? "Recording Decision…" : "Commit Decision & Sign Audit"}
            </button>
          </>
        }
      >
        <div className="decisionModalBody">
          <p className="modalPrompt">
            You are recording a material decision on student case <strong>{caseDetail?.student}</strong>.
            This action updates the operational state to <code>{decisionModal.status}</code> and is logged immutably.
          </p>

          <label className="fieldLabel">
            Reason / Justification for Decision (Mandatory) *
            <textarea
              className="textareaInput"
              rows="4"
              placeholder="Specify supporting evidence, policy citation, or required corrections…"
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              required
            />
          </label>
        </div>
      </Modal>

      {/* Create New Case Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Case Workspace"
        footer={
          <>
            <button type="button" className="btnSecondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </button>
            <button type="button" className="btnPrimary" onClick={handleCreateCase}>
              Create Case Workspace
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateCase} className="modalForm">
          <label className="fieldLabel">
            Student Full Legal Name *
            <input
              type="text"
              className="textInput"
              placeholder="e.g. Maya Sharma"
              value={createForm.student}
              onChange={(e) => setCreateForm({ ...createForm, student: e.target.value })}
              required
            />
          </label>

          <label className="fieldLabel">
            Case Title / Description *
            <input
              type="text"
              className="textInput"
              placeholder="e.g. Admission Review — Maya Sharma"
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              required
            />
          </label>

          <div className="formRow">
            <label className="fieldLabel">
              School Campus *
              <select
                className="selectInput"
                value={createForm.campus}
                onChange={(e) => setCreateForm({ ...createForm, campus: e.target.value })}
              >
                <option value="Central Campus">Central Campus</option>
                <option value="North Campus">North Campus</option>
                <option value="West Wing">West Wing</option>
                <option value="South Campus">South Campus</option>
              </select>
            </label>

            <label className="fieldLabel">
              Category *
              <select
                className="selectInput"
                value={createForm.category}
                onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
              >
                <option value="Admission">Admission Form</option>
                <option value="Identity">Identity Proof</option>
                <option value="Report Card">Report Card</option>
                <option value="Lesson Plan">Lesson Plan</option>
                <option value="Consent">Consent Form</option>
                <option value="Certificate">Certificate</option>
              </select>
            </label>
          </div>

          <div className="formRow">
            <label className="fieldLabel">
              Priority Level
              <select
                className="selectInput"
                value={createForm.priority}
                onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>

            <label className="fieldLabel">
              Lead Reviewer Assignee
              <input
                type="text"
                className="textInput"
                value={createForm.owner}
                onChange={(e) => setCreateForm({ ...createForm, owner: e.target.value })}
              />
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}