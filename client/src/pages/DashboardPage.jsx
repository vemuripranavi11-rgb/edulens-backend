import { useEffect, useState } from "react";
import { api } from "../services/api";
import { Header, StatCard, Badge, Modal, Empty, Loading } from "../components/UI";

export default function DashboardPage({ go, user }) {
  const [data, setData] = useState(null);
  const [supervisorData, setSupervisorData] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCampus, setFilterCampus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [casesList, setCasesList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Compare Modal State
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareCaseId, setCompareCaseId] = useState("");
  const [compareData, setCompareData] = useState(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Assign Reviewer Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignCase, setAssignCase] = useState(null);
  const [newAssignee, setNewAssignee] = useState("Jordan Lee");
  const [assignReason, setAssignReason] = useState("");

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dash, sup, casesRes] = await Promise.all([
        api("/api/v1/dashboard"),
        api("/api/v1/supervisor/dashboard"),
        api(`/api/v1/cases?q=${encodeURIComponent(searchQuery)}&campus=${filterCampus}&priority=${filterPriority}&status=${filterStatus}`)
      ]);

      setData(dash);
      setSupervisorData(sup);
      setCasesList(casesRes.items || []);
    } catch (err) {
      console.error("Failed to load supervisor dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [searchQuery, filterCampus, filterPriority, filterStatus]);

  const openCompareModal = async (cId) => {
    setCompareCaseId(cId);
    setShowCompareModal(true);
    setLoadingCompare(true);
    try {
      const res = await api(`/api/v1/cases/${cId}/compare`);
      setCompareData(res);
    } catch (err) {
      alert("Failed to load document comparison: " + err.message);
    } finally {
      setLoadingCompare(false);
    }
  };

  const handleReassign = async () => {
    if (!assignReason.trim()) {
      alert("Please provide a reason for reassigning reviewer workload.");
      return;
    }

    try {
      await api(`/api/v1/cases/${assignCase.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          owner: newAssignee,
          reason: assignReason.trim()
        })
      });

      setShowAssignModal(false);
      setAssignCase(null);
      setAssignReason("");
      await loadAll();
    } catch (err) {
      alert("Reassignment failed: " + err.message);
    }
  };

  if (loading && !data) {
    return <Loading label="Loading supervisor intelligence &amp; live operational view…" />;
  }

  const ageing = supervisorData?.ageing || { under24h: 3, days1to3: 2, days4to7: 1, over7days: 0 };
  const workloads = supervisorData?.workloads || [];

  return (
    <div className="pageContainer">
      <Header
        crumb="HOME / SUPERVISOR INTELLIGENCE"
        title={`Supervisor Operations · ${user?.name || "Taylor Morgan"}`}
        actions={
          <div className="headerButtonGroup">
            <button className="btnSecondary" onClick={loadAll}>
              ↻ Refresh Live Feed
            </button>
            <button className="btnPrimary" onClick={() => go("Cases")}>
              View All Cases Workspace →
            </button>
          </div>
        }
      >
        <p>
          Operational oversight across K-12 intakes: case ageing velocity, reviewer workload distribution,
          bottlenecks, and cross-document comparative analysis.
        </p>
      </Header>

      {/* Primary Metric Indicators */}
      <div className="statsGrid fourCols">
        <StatCard
          label="Active Cases in Flight"
          value={data?.metrics?.open || casesList.length}
          subtext="Under active intake &amp; review"
          status="blue"
        />
        <StatCard
          label="Pending Review"
          value={data?.metrics?.review || 3}
          subtext="Ready for decision sign-off"
          status="amber"
        />
        <StatCard
          label="Exceptions Requiring Triage"
          value={data?.metrics?.exceptions || 1}
          subtext="Discrepancy or conflict flagged"
          status="red"
        />
        <StatCard
          label="Verified Documents"
          value={data?.metrics?.documents || 14}
          subtext="Checksum &amp; OCR verified"
          status="green"
        />
      </div>

      {/* Supervisor Case Ageing Analysis Grid */}
      <section className="panelCard ageingSection">
        <div className="cardHeaderRow">
          <div>
            <h3>Case Ageing &amp; SLA Velocity</h3>
            <p className="muted">Time elapsed since document intake without final decision sign-off</p>
          </div>
          <span className="badge mini blue">Institutional SLA: 72 Hours</span>
        </div>

        <div className="ageingGrid">
          <div className="ageingPillar green">
            <div className="ageingPillarHeader">
              <span>&lt; 24 Hours (Fresh)</span>
              <strong>{ageing.under24h}</strong>
            </div>
            <div className="pillarBar"><div className="fill" style={{ width: "85%" }}></div></div>
            <small>Within standard initial intake window</small>
          </div>

          <div className="ageingPillar yellow">
            <div className="ageingPillarHeader">
              <span>1 – 3 Days (Approaching SLA)</span>
              <strong>{ageing.days1to3}</strong>
            </div>
            <div className="pillarBar"><div className="fill" style={{ width: "50%" }}></div></div>
            <small>Secondary checks or parent consent pending</small>
          </div>

          <div className="ageingPillar orange">
            <div className="ageingPillarHeader">
              <span>4 – 7 Days (Escalation Warning)</span>
              <strong>{ageing.days4to7}</strong>
            </div>
            <div className="pillarBar"><div className="fill" style={{ width: "25%" }}></div></div>
            <small>Requires supervisor intervention</small>
          </div>

          <div className="ageingPillar red">
            <div className="ageingPillarHeader">
              <span>&gt; 7 Days (Overdue Breaches)</span>
              <strong>{ageing.over7days}</strong>
            </div>
            <div className="pillarBar"><div className="fill" style={{ width: `${Math.max(10, ageing.over7days * 20)}%` }}></div></div>
            <small>Immediate triage mandatory</small>
          </div>
        </div>
      </section>

      {/* Reviewer Workload Distribution */}
      <section className="panelCard workloadsSection">
        <div className="cardHeaderRow">
          <div>
            <h3>Reviewer Workload Distribution</h3>
            <p className="muted">Active caseload per reviewer to balance throughput and prevent bottlenecks</p>
          </div>
        </div>

        <div className="workloadCardsGrid">
          {workloads.map((w) => (
            <div key={w.email} className="workloadCard">
              <div className="workloadCardTop">
                <div className="reviewerAvatar">
                  {w.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{w.name}</strong>
                  <small className="muted block">{w.campus} · {w.role}</small>
                </div>
              </div>

              <div className="workloadMetricsRow">
                <div>
                  <span className="metricLabel">Active Cases</span>
                  <strong className="metricVal">{w.openCases}</strong>
                </div>
                <div>
                  <span className="metricLabel">Exceptions</span>
                  <strong className="metricVal textRed">{w.openExceptions}</strong>
                </div>
                <div>
                  <span className="metricLabel">Capacity</span>
                  <strong className="metricVal">{w.loadPercentage}%</strong>
                </div>
              </div>

              <div className="capacityBar">
                <div
                  className={`capacityFill ${w.loadPercentage > 75 ? "high" : "normal"}`}
                  style={{ width: `${w.loadPercentage}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comprehensive Case Search & Triage Table */}
      <section className="panelCard searchTableSection">
        <div className="cardHeaderRow">
          <div>
            <h3>Case Search &amp; Material Decision Log</h3>
            <p className="muted">Global search across student records with multi-parameter filtering</p>
          </div>

          <div className="tableFiltersGroup">
            <input
              type="text"
              className="searchInput"
              placeholder="Search case, student, or id…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select
              className="filterSelect"
              value={filterCampus}
              onChange={(e) => setFilterCampus(e.target.value)}
            >
              <option value="all">All Campuses</option>
              <option value="Central Campus">Central Campus</option>
              <option value="North Campus">North Campus</option>
              <option value="West Wing">West Wing</option>
              <option value="South Campus">South Campus</option>
            </select>

            <select
              className="filterSelect"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              className="filterSelect"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="pending-review">Pending Review</option>
              <option value="in-review">In Review</option>
              <option value="exception">Exception</option>
              <option value="approved">Approved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        <div className="customTableWrapper">
          <table className="customTable">
            <thead>
              <tr>
                <th>CASE / STUDENT</th>
                <th>CAMPUS</th>
                <th>STATUS</th>
                <th>PRIORITY</th>
                <th>ASSIGNED REVIEWER</th>
                <th>LAST UPDATED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {casesList.length === 0 ? (
                <tr>
                  <td colSpan="7" className="emptyTableCell">
                    <Empty label="No cases found matching your criteria" icon="🔍" />
                  </td>
                </tr>
              ) : (
                casesList.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div>
                        <strong>{c.title}</strong>
                        <small className="muted block">Student: {c.student} · v{c.version}</small>
                      </div>
                    </td>
                    <td>{c.campus || "Central"}</td>
                    <td>
                      <Badge variant={c.status}>{c.status}</Badge>
                    </td>
                    <td>
                      <span className={`priorityPill priority-${c.priority}`}>{c.priority}</span>
                    </td>
                    <td>
                      <div className="ownerCell">
                        <span>{c.owner || "Unassigned"}</span>
                        <button
                          className="btnMini textBtn"
                          onClick={() => {
                            setAssignCase(c);
                            setNewAssignee(c.owner || "Jordan Lee");
                            setShowAssignModal(true);
                          }}
                          title="Reassign reviewer"
                        >
                          ✎ Reassign
                        </button>
                      </div>
                    </td>
                    <td>{new Date(c.updated_at).toLocaleDateString()}</td>
                    <td>
                      <div className="tableActionBtns">
                        <button
                          className="btnMini"
                          onClick={() => go("Cases", c.id)}
                          title="Open Case Workspace"
                        >
                          Workspace
                        </button>
                        <button
                          className="btnMini outline"
                          onClick={() => openCompareModal(c.id)}
                          title="Compare Evidence Documents"
                        >
                          Compare Docs
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

      {/* Reassign Reviewer Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title={`Reassign Reviewer Workload: ${assignCase?.student}`}
        footer={
          <>
            <button className="btnSecondary" onClick={() => setShowAssignModal(false)}>
              Cancel
            </button>
            <button className="btnPrimary" onClick={handleReassign}>
              Confirm Reassignment
            </button>
          </>
        }
      >
        <div className="modalForm">
          <p className="modalDesc">
            Reallocating review responsibility for <strong>{assignCase?.title}</strong>.
            The newly assigned staff member will receive an automated notification alert.
          </p>

          <label className="fieldLabel">
            Assign Lead Reviewer *
            <select
              className="selectInput"
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
            >
              <option value="Jordan Lee">Jordan Lee (Reviewer · Central)</option>
              <option value="Marcus Vance">Marcus Vance (Reviewer · North)</option>
              <option value="Taylor Morgan">Taylor Morgan (Supervisor)</option>
              <option value="Avery Patel">Avery Patel (Compliance Admin)</option>
            </select>
          </label>

          <label className="fieldLabel">
            Supervisor Reassignment Justification *
            <textarea
              className="textareaInput"
              rows="3"
              placeholder="e.g. Balancing queue volume or subject matter expertise..."
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              required
            />
          </label>
        </div>
      </Modal>

      {/* Document Comparison Modal */}
      <Modal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        title="Side-by-Side Document Comparative Analysis"
        maxWidth="880px"
        footer={
          <button className="btnSecondary" onClick={() => setShowCompareModal(false)}>
            Close Comparison View
          </button>
        }
      >
        {loadingCompare ? (
          <Loading label="Performing entity cross-referencing..." />
        ) : compareData ? (
          <div className="comparisonModalBody">
            {!compareData.canCompare ? (
              <Empty label={compareData.message || "Cannot compare documents"} icon="📄" />
            ) : (
              <>
                <div className="comparisonHeaderGrid">
                  <div className="docColHeader">
                    <span className="badge blue">Document 1</span>
                    <strong>{compareData.doc1.name}</strong>
                    <small className="muted">{compareData.doc1.category}</small>
                  </div>
                  <div className="docColHeader center">
                    <span>Field Entity Match</span>
                  </div>
                  <div className="docColHeader">
                    <span className="badge green">Document 2</span>
                    <strong>{compareData.doc2.name}</strong>
                    <small className="muted">{compareData.doc2.category}</small>
                  </div>
                </div>

                <div className="comparisonsTableWrapper">
                  <table className="comparisonTable">
                    <thead>
                      <tr>
                        <th>DOC 1 VALUE</th>
                        <th>ENTITY NAME</th>
                        <th>STATUS</th>
                        <th>DOC 2 VALUE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareData.comparisons.map((row, idx) => (
                        <tr key={idx} className={`compRow ${row.status}`}>
                          <td>
                            <strong>{row.doc1Value}</strong>
                            {row.doc1Confidence > 0 && (
                              <small className="muted block">
                                {Math.round(row.doc1Confidence * 100)}% conf
                              </small>
                            )}
                          </td>
                          <td>
                            <span className="entityPill">{row.field}</span>
                          </td>
                          <td>
                            <span className={`compBadge ${row.status}`}>
                              {row.status === "match" ? "✓ Match" : row.status === "conflict" ? "⚠️ Conflict" : "Single"}
                            </span>
                          </td>
                          <td>
                            <strong>{row.doc2Value}</strong>
                            {row.doc2Confidence > 0 && (
                              <small className="muted block">
                                {Math.round(row.doc2Confidence * 100)}% conf
                              </small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}