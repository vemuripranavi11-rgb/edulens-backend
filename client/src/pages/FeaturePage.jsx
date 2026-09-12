import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Header, Empty, Loading, Notice } from '../components/UI';

const content = {
  Summaries: {
    title: 'Grounded summaries & decision support',
    subtitle: 'Prepare source-linked summaries for authorised human review.',
    heading: 'Summary workspace',
    description:
      'This workspace will use validated case evidence to generate grounded summaries.'
  }
};

export default function FeaturePage({ page, selectedCaseId, go, user }) {
  if (page === 'Extraction') {
    return (
      <ExtractionPage
        selectedCaseId={selectedCaseId}
        go={go}
        user={user}
      />
    );
  }

  if (page === 'Validation') {
    return (
      <ValidationPage
        selectedCaseId={selectedCaseId}
        go={go}
        user={user}
      />
    );
  }

  const info = content[page];

  return (
    <>
      <Header crumb={page.toUpperCase()} title={info.title}>
        <p>{info.subtitle}</p>
      </Header>

      <section className="panel feature">
        <span>AI DECISION SUPPORT</span>
        <h2>{info.heading}</h2>
        <p>{info.description}</p>

        <div className="notice">
          <b>Next stage</b>
          <p>
            AI Extraction is now connected to uploaded documents. This
            workspace will use those results in the next implementation stage.
          </p>
        </div>
      </section>
    </>
  );
}

/* =========================================================
   VALIDATION PAGE
   ========================================================= */

function ValidationPage({ selectedCaseId, go, user }) {
  const [cases, setCases] = useState([]);
  const [caseId, setCaseId] = useState(selectedCaseId || '');
  const [caseData, setCaseData] = useState(null);
  const [validation, setValidation] = useState(null);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');

  const canRunValidation =
    user?.role === 'Reviewer' ||
    user?.role === 'Supervisor' ||
    user?.role === 'Compliance Admin';

  /* =======================================================
     LOAD CASES
     ======================================================= */

  useEffect(() => {
    let active = true;

    const loadCases = async () => {
      try {
        const data = await api('/api/v1/cases');

        if (!active) return;

        const availableCases = data.items || [];

        setCases(availableCases);

        if (selectedCaseId) {
          setCaseId(selectedCaseId);
        } else if (availableCases.length > 0) {
          setCaseId((current) => current || availableCases[0].id);
        }
      } catch (error) {
        if (active) {
          console.error('Failed to load cases:', error);

          setMessage(
            error.message || 'Failed to load cases.'
          );
        }
      }
    };

    loadCases();

    return () => {
      active = false;
    };
  }, [selectedCaseId]);

  /* =======================================================
     LOAD CASE + VALIDATION
     ======================================================= */

  useEffect(() => {
    if (!caseId) {
      setCaseData(null);
      setValidation(null);
      setLoading(false);
      return;
    }

    let active = true;

    const loadData = async () => {
      setLoading(true);
      setMessage('');

      try {
        const [caseResult, validationResult] =
          await Promise.all([
            api('/api/v1/cases/' + caseId),
            api('/api/v1/validation/' + caseId)
          ]);

        if (!active) return;

        setCaseData(caseResult);
        setValidation(validationResult);
      } catch (error) {
        if (active) {
          console.error(
            'Failed to load validation:',
            error
          );

          setMessage(
            error.message ||
              'Failed to load validation information.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [caseId]);

  /* =======================================================
     RUN VALIDATION
     ======================================================= */

  const runValidation = async () => {
    if (!caseId) {
      setMessage('Please select a case first.');
      return;
    }

    if (!canRunValidation) {
      setMessage(
        'Your role does not have permission to run validation.'
      );
      return;
    }

    setRunning(true);
    setMessage(
      'Running validation and cross-document checks...'
    );

    try {
      /*
       * STEP 1
       * Run the validation checks.
       */
      const runResult = await api(
        '/api/v1/validation/' + caseId + '/run',
        {
          method: 'POST',
          body: JSON.stringify({})
        }
      );

      /*
       * STEP 2
       * Fetch the persisted validation exceptions.
       *
       * The POST response returns exceptionIds,
       * while the GET endpoint returns the actual
       * exception objects.
       */
      let latestValidation = null;

      try {
        latestValidation = await api(
          '/api/v1/validation/' + caseId
        );
      } catch (refreshError) {
        console.error(
          'Could not refresh validation exceptions:',
          refreshError
        );
      }

      /*
       * STEP 3
       * Combine the POST validation checks with
       * the persisted exceptions.
       */
      setValidation({
        ...runResult,

        checks:
          runResult.checks ||
          latestValidation?.checks ||
          [],

        exceptions:
          latestValidation?.exceptions ||
          runResult.exceptions ||
          [],

        exceptionIds:
          runResult.exceptionIds ||
          []
      });

      /*
       * STEP 4
       * Show appropriate result message.
       */
      if (
        runResult.status === 'exception' ||
        (runResult.exceptionIds &&
          runResult.exceptionIds.length > 0)
      ) {
        setMessage(
          'Validation completed. Exceptions were found and require review.'
        );
      } else if (
        runResult.status === 'review-required'
      ) {
        setMessage(
          'Validation completed. Some results require human review.'
        );
      } else {
        setMessage(
          'Validation completed successfully. No blocking exceptions were found.'
        );
      }
    } catch (error) {
      console.error(
        'Validation failed:',
        error
      );

      setMessage(
        error.message ||
          'Validation failed.'
      );
    } finally {
      setRunning(false);
    }
  };

  /* =======================================================
     REFRESH VALIDATION
     ======================================================= */

  const refreshValidation = async () => {
    if (!caseId) {
      return;
    }

    try {
      setMessage(
        'Refreshing validation results...'
      );

      const data = await api(
        '/api/v1/validation/' + caseId
      );

      setValidation((previous) => ({
        ...(previous || {}),
        ...data,

        /*
         * Preserve detailed checks from the previous
         * POST validation result if GET does not return them.
         */
        checks:
          data.checks?.length
            ? data.checks
            : previous?.checks || [],

        exceptions:
          data.exceptions || []
      }));

      setMessage(
        'Validation results refreshed.'
      );
    } catch (error) {
      console.error(
        'Refresh failed:',
        error
      );

      setMessage(
        error.message ||
          'Unable to refresh validation results.'
      );
    }
  };

  /* =======================================================
     LOADING
     ======================================================= */

  if (loading) {
    return <Loading />;
  }

  /* =======================================================
     DATA
     ======================================================= */

  const checks =
    validation?.checks || [];

  const exceptions =
    validation?.exceptions || [];

  const exceptionCount =
    exceptions.length ||
    validation?.exceptionIds?.length ||
    0;

  const passedChecks =
    checks.filter((check) => {
      const status = String(
        check.status ||
          check.result ||
          ''
      ).toLowerCase();

      return (
        status === 'passed' ||
        status === 'pass'
      );
    }).length;

  const failedChecks =
    checks.filter((check) => {
      const status = String(
        check.status ||
          check.result ||
          ''
      ).toLowerCase();

      return (
        status === 'failed' ||
        status === 'fail'
      );
    }).length;

  const reviewChecks =
    checks.filter((check) => {
      const status = String(
        check.status ||
          check.result ||
          ''
      ).toLowerCase();

      return (
        status === 'review-required' ||
        status === 'review_required' ||
        status === 'review'
      );
    }).length;

  /* =======================================================
     UI
     ======================================================= */

  return (
    <>
      <Header
        crumb="AI / VALIDATION"
        title="Validation & cross-document checks"
      >
        <p>
          Compare extracted information across documents,
          identify missing information, detect conflicts,
          and route low-confidence results for human review.
        </p>
      </Header>

      <section className="panel feature">

        {/* =================================================
            CASE SELECTION
            ================================================= */}

        <label>
          Case

          <select
            value={caseId}
            onChange={(event) => {
              const value =
                event.target.value;

              setCaseId(value);

              /*
               * Do not navigate to Cases here.
               * Keep the user inside the Validation page.
               */
            }}
          >
            <option value="">
              Select a case
            </option>

            {cases.map((item) => (
              <option
                value={item.id}
                key={item.id}
              >
                {item.title}
              </option>
            ))}
          </select>
        </label>

        {/* =================================================
            CASE INFORMATION
            ================================================= */}

        {caseData && (
          <div className="info">

            <b>
              {caseData.title}
            </b>

            <p className="muted">
              Student: {caseData.student} · Priority:{' '}
              {caseData.priority} · Owner:{' '}
              {caseData.owner}
            </p>

          </div>
        )}

        {/* =================================================
            VALIDATION ACTIONS
            ================================================= */}

        <div className="actions">

          {canRunValidation && (
            <button
              onClick={runValidation}
              disabled={
                running ||
                !caseId
              }
            >
              {running
                ? 'Running validation...'
                : 'Run Validation'}
            </button>
          )}

          <button
            className="outline"
            onClick={refreshValidation}
            disabled={
              !caseId ||
              running
            }
          >
            Refresh Results
          </button>

        </div>

        {/* =================================================
            VALIDATION SUMMARY
            ================================================= */}

        {validation && (
          <>
            <h3>
              Validation summary
            </h3>

            <div className="stats">

              <div className="stat">
                <p>Status</p>

                <strong>
                  {validation.status ||
                    'Not evaluated'}
                </strong>
              </div>

              <div className="stat">
                <p>Total checks</p>

                <strong>
                  {checks.length}
                </strong>
              </div>

              <div className="stat">
                <p>Passed</p>

                <strong>
                  {passedChecks}
                </strong>
              </div>

              <div className="stat">
                <p>Failed</p>

                <strong>
                  {failedChecks}
                </strong>
              </div>

              <div className="stat">
                <p>Review</p>

                <strong>
                  {reviewChecks}
                </strong>
              </div>

              <div className="stat">
                <p>Exceptions</p>

                <strong>
                  {exceptionCount}
                </strong>
              </div>

            </div>
          </>
        )}

        {/* =================================================
            CHECK RESULTS
            ================================================= */}

        <h3>
          Validation checks
        </h3>

        {checks.length === 0 ? (
          <Empty
            label="No validation checks are available. Run validation to check this case."
          />
        ) : (
          <div className="table">

            <div className="tr head">
              <span>CHECK</span>
              <span>TYPE</span>
              <span>STATUS</span>
              <span>DETAILS</span>
            </div>

            {checks.map(
              (check, index) => {

                const status = String(
                  check.status ||
                    check.result ||
                    'unknown'
                );

                const statusClass =
                  status
                    .toLowerCase()
                    .replace(
                      /[^a-z0-9]+/g,
                      '-'
                    );

                return (
                  <div
                    className="tr row"
                    key={
                      check.id ||
                      `${check.name || 'check'}-${index}`
                    }
                  >

                    <span>
                      <b>
                        {check.name ||
                          check.title ||
                          'Validation check'}
                      </b>
                    </span>

                    <span>
                      {check.type ||
                        check.category ||
                        'Rule'}
                    </span>

                    <span>
                      <em
                        className={
                          'badge ' +
                          statusClass
                        }
                      >
                        {status}
                      </em>
                    </span>

                    <span>
                      {check.message ||
                        check.details ||
                        check.description ||
                        'No additional details'}
                    </span>

                  </div>
                );
              }
            )}

          </div>
        )}

        {/* =================================================
            EXCEPTIONS
            ================================================= */}

        <h3>
          Validation exceptions
        </h3>

        {exceptions.length === 0 ? (

          <div className="notice">

            <b>
              No validation exceptions
            </b>

            <p>
              No missing, conflicting, or
              low-confidence validation exceptions
              were returned for this case.
            </p>

          </div>

        ) : (

          <div className="fields">

            {exceptions.map(
              (exception, index) => (

                <div
                  className="notice"
                  key={
                    exception.id ||
                    `${exception.title || 'exception'}-${index}`
                  }
                >

                  <b>
                    {exception.title ||
                      exception.type ||
                      'Validation exception'}
                  </b>

                  <p>
                    {exception.description ||
                      exception.message ||
                      'This exception requires human review.'}
                  </p>

                  <p className="muted">

                    {exception.type && (
                      <>
                        Type: {exception.type} ·{' '}
                      </>
                    )}

                    {exception.severity && (
                      <>
                        Severity:{' '}
                        {exception.severity} ·{' '}
                      </>
                    )}

                    {exception.status && (
                      <>
                        Status:{' '}
                        {exception.status}
                      </>
                    )}

                  </p>

                </div>
              )
            )}

          </div>
        )}

        {/* =================================================
            HUMAN REVIEW NOTICE
            ================================================= */}

        {exceptionCount > 0 && (
          <div className="notice">

            <b>
              Human review required
            </b>

            <p>
              One or more validation exceptions were
              detected. A reviewer should verify the
              supporting documents before a material
              decision is made.
            </p>

          </div>
        )}

        {/* =================================================
            READ ONLY NOTICE
            ================================================= */}

        {!canRunValidation && (
          <div className="notice">

            <b>
              Read-only access
            </b>

            <p>
              Your current role can view validation
              results but cannot run validation checks.
            </p>

          </div>
        )}

        {/* =================================================
            MESSAGE
            ================================================= */}

        {message && (
          <Notice>
            {message}
          </Notice>
        )}

      </section>
    </>
  );
}

/* =========================================================
   AI EXTRACTION PAGE
   ========================================================= */

function ExtractionPage({ selectedCaseId, go, user }) {
  const [cases, setCases] = useState([]);
  const [caseId, setCaseId] = useState(selectedCaseId || '');
  const [caseData, setCaseData] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewReason, setReviewReason] = useState('');

  const canReview =
    user?.role === 'Reviewer' ||
    user?.role === 'Supervisor' ||
    user?.role === 'Compliance Admin';

  // =========================================
  // LOAD CASES
  // =========================================

  useEffect(() => {
    let active = true;

    const loadCases = async () => {
      try {
        const data = await api('/api/v1/cases');

        if (!active) return;

        const availableCases = data.items || [];
        setCases(availableCases);

        if (selectedCaseId) {
          setCaseId(selectedCaseId);
        } else if (availableCases.length > 0 && !caseId) {
          setCaseId(availableCases[0].id);
        }
      } catch (error) {
        if (active) {
          console.error('Failed to load cases:', error);
          setMessage(error.message || 'Failed to load cases.');
        }
      }
    };

    loadCases();

    return () => {
      active = false;
    };
  }, [selectedCaseId]);

  // =========================================
  // LOAD SELECTED CASE
  // =========================================

  useEffect(() => {
    if (!caseId) {
      setCaseData(null);
      setSelectedDocument(null);
      setRun(null);
      setLoading(false);
      return;
    }

    let active = true;

    const loadCase = async () => {
      setLoading(true);
      setMessage('');
      setSelectedDocument(null);
      setRun(null);
      setReviewReason('');

      try {
        const data = await api('/api/v1/cases/' + caseId);

        if (active) setCaseData(data);
      } catch (error) {
        if (active) {
          console.error('Failed to load case:', error);
          setMessage(error.message || 'Failed to load case.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadCase();

    return () => {
      active = false;
    };
  }, [caseId]);

  // =========================================
  // SELECT DOCUMENT AND LOAD PREVIOUS RUN
  // =========================================

  const selectDocument = async (document) => {
    setSelectedDocument(document);
    setRun(null);
    setMessage('');
    setReviewReason('');

    try {
      const data = await api(
        '/api/v1/ai/extract/' + document.id
      );

      if (data.runs?.length) {
        const latestRun = data.runs[0];

        setRun({
          ...latestRun,
          result: latestRun.result,
          createdAt:
            latestRun.created_at ||
            latestRun.createdAt,
          reviewerStatus:
            latestRun.reviewer_status ||
            latestRun.reviewerStatus
        });
      }
    } catch (error) {
      console.error(
        'Failed to load previous AI runs:',
        error
      );
    }
  };

  // =========================================
  // RUN AI EXTRACTION
  // =========================================

  const runExtraction = async () => {
    if (!selectedDocument) {
      setMessage('Please select a document first.');
      return;
    }

    setRunning(true);
    setMessage(
      'Running AI extraction. Please wait...'
    );

    try {
      const data = await api(
        '/api/v1/ai/extract/' +
          selectedDocument.id,
        {
          method: 'POST'
        }
      );

      setRun(data.run);
      setReviewReason('');

      setMessage(
        'AI extraction completed. Review the extracted fields and evidence below.'
      );
    } catch (error) {
      console.error(
        'AI extraction failed:',
        error
      );

      setMessage(
        error.message ||
          'AI extraction failed.'
      );
    } finally {
      setRunning(false);
    }
  };

  // =========================================
  // REVIEW AI RESULT
  // =========================================

  const reviewResult = async (decision) => {
    if (!run?.id) {
      setMessage(
        'Run AI extraction before reviewing the result.'
      );

      return;
    }

    if (!canReview) {
      setMessage(
        'Your role does not have permission to review AI results.'
      );

      return;
    }

    if (
      (decision === 'overridden' ||
        decision === 'rejected') &&
      !reviewReason.trim()
    ) {
      setMessage(
        'Please enter a reason for this review decision.'
      );

      return;
    }

    try {
      setReviewing(true);

      await api(
        '/api/v1/ai/runs/' +
          run.id +
          '/review',
        {
          method: 'POST',
          body: JSON.stringify({
            decision,
            reason: reviewReason.trim()
          })
        }
      );

      setRun((previous) => ({
        ...previous,
        reviewerStatus: decision,
        reviewer_status: decision
      }));

      setMessage(
        `Reviewer decision saved: ${decision}.`
      );
    } catch (error) {
      console.error(
        'Reviewer decision failed:',
        error
      );

      setMessage(
        error.message ||
          'Unable to save reviewer decision.'
      );
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  const documents =
    caseData?.documents || [];

  const result = run?.result;

  const confidence = Number(
    result?.overallConfidence ??
      run?.confidence ??
      0
  );

  const confidencePercent =
    Math.round(
      Math.max(
        0,
        Math.min(1, confidence)
      ) * 100
    );

  return (
    <>
      <Header
        crumb="AI / EXTRACTION"
        title="AI document extraction"
      >
        <p>
          Extract structured information from uploaded documents,
          classify the document, show confidence and evidence, and
          route low-confidence results for human review.
        </p>
      </Header>

      <section className="panel feature">

        {/* CASE SELECTION */}

        <label>
          Case

          <select
            value={caseId}
            onChange={(event) => {
              const value =
                event.target.value;

              setCaseId(value);

              go?.(
                'Cases',
                value
              );
            }}
          >
            <option value="">
              Select a case
            </option>

            {cases.map((item) => (
              <option
                value={item.id}
                key={item.id}
              >
                {item.title}
              </option>
            ))}
          </select>
        </label>

        {caseData && (
          <div className="info">
            <b>{caseData.title}</b>

            <p className="muted">
              Student: {caseData.student} ·
              Priority: {caseData.priority} ·
              Owner: {caseData.owner}
            </p>
          </div>
        )}

        {/* DOCUMENTS */}

        <h3>Documents</h3>

        {documents.length === 0 ? (
          <Empty label="No documents are attached to this case." />
        ) : (
          <div className="table">

            <div className="tr head">
              <span>DOCUMENT</span>
              <span>TYPE</span>
              <span>STATUS</span>
              <span>ACTION</span>
            </div>

            {documents.map((document) => (
              <button
                type="button"
                className="tr row"
                key={document.id}
                onClick={() =>
                  selectDocument(document)
                }
              >

                <span>
                  <b>{document.name}</b>

                  <small>
                    {document.checksum
                      ? document.checksum.slice(
                          0,
                          16
                        ) + '...'
                      : 'No checksum'}
                  </small>
                </span>

                <span>
                  {document.type}
                </span>

                <span>
                  <em
                    className={
                      'badge ' +
                      document.status
                    }
                  >
                    {document.status}
                  </em>
                </span>

                <span>
                  {selectedDocument?.id ===
                  document.id
                    ? 'Selected'
                    : 'Select'}
                </span>

              </button>
            ))}

          </div>
        )}

        {/* SELECTED DOCUMENT */}

        {selectedDocument && (
          <div className="evidence">

            <h3>
              Selected document
            </h3>

            <p>
              <b>
                {selectedDocument.name}
              </b>
            </p>

            <p className="muted">
              Type: {selectedDocument.type} ·
              Status: {selectedDocument.status}
            </p>

            <p className="muted">
              Checksum:{' '}
              {selectedDocument.checksum ||
                'Not available'}
            </p>

            <button
              onClick={runExtraction}
              disabled={running}
            >
              {running
                ? 'Running AI extraction...'
                : 'Run AI Extraction'}
            </button>

          </div>
        )}

        {/* RESULT */}

        {run && result && (
          <div className="evidence">

            <span>
              AI DECISION SUPPORT
            </span>

            <h3>
              Extraction result
            </h3>

            <div className="stats">

              <div className="stat">
                <p>
                  Document classification
                </p>

                <strong>
                  {result.documentType ||
                    'Supporting document'}
                </strong>
              </div>

              <div className="stat">
                <p>
                  Overall confidence
                </p>

                <strong>
                  {confidencePercent}%
                </strong>
              </div>

              <div className="stat">
                <p>
                  Provider
                </p>

                <strong>
                  {run.provider ||
                    'Unknown'}
                </strong>
              </div>

              <div className="stat">
                <p>
                  Model
                </p>

                <strong>
                  {run.model ||
                    'Unknown'}
                </strong>
              </div>

            </div>

            <div className="meter">
              <i
                style={{
                  width:
                    `${confidencePercent}%`
                }}
              />
            </div>

            <p className="muted">
              Generated:{' '}
              {run.createdAt
                ? new Date(
                    run.createdAt
                  ).toLocaleString()
                : 'Not available'}
            </p>

            <p>
              <b>
                Review status:
              </b>{' '}
              {run.reviewerStatus ||
                run.reviewer_status ||
                'pending'}
            </p>

            {confidencePercent < 75 && (
              <div className="notice">

                <b>
                  Human review required
                </b>

                <p>
                  This result has confidence
                  below 75%. A reviewer should
                  verify the extracted information
                  before using it for a material
                  decision.
                </p>

              </div>
            )}

            {/* EXTRACTED FIELDS */}

            <h3>
              Extracted fields
            </h3>

            {result.fields?.length ? (
              <div className="fields">

                {result.fields.map(
                  (field, index) => {

                    const fieldConfidence =
                      Math.round(
                        Math.max(
                          0,
                          Math.min(
                            1,
                            Number(
                              field.confidence
                            ) || 0
                          )
                        ) * 100
                      );

                    return (
                      <p
                        key={
                          `${field.name}-${index}`
                        }
                      >

                        <b>
                          {field.name}
                        </b>

                        <span>
                          {field.value ||
                            'Not detected'}
                        </span>

                        <em>
                          {fieldConfidence}%
                          confidence
                        </em>

                        <small>
                          Evidence:{' '}
                          {field.evidence ||
                            'OCR text'}
                        </small>

                      </p>
                    );
                  }
                )}

              </div>
            ) : (
              <Empty label="No fields were extracted." />
            )}

            {/* REVIEW */}

            {canReview ? (
              <>

                <h3>
                  Human review
                </h3>

                <label>
                  Review reason

                  <textarea
                    value={reviewReason}
                    onChange={(event) =>
                      setReviewReason(
                        event.target.value
                      )
                    }
                    placeholder="Required when overriding or rejecting the AI result"
                    rows="4"
                    maxLength="500"
                  />
                </label>

                <div className="actions">

                  <button
                    onClick={() =>
                      reviewResult(
                        'approved'
                      )
                    }
                    disabled={reviewing}
                  >
                    Approve extraction
                  </button>

                  <button
                    className="outline"
                    onClick={() =>
                      reviewResult(
                        'overridden'
                      )
                    }
                    disabled={reviewing}
                  >
                    Override
                  </button>

                  <button
                    className="outline"
                    onClick={() =>
                      reviewResult(
                        'rejected'
                      )
                    }
                    disabled={reviewing}
                  >
                    Reject
                  </button>

                </div>

              </>
            ) : (
              <div className="notice">

                <b>
                  Read-only access
                </b>

                <p>
                  Your current role can view AI
                  extraction results but cannot
                  approve, override, or reject them.
                </p>

              </div>
            )}

          </div>
        )}

        {message && (
          <Notice>
            {message}
          </Notice>
        )}

      </section>
    </>
  );
}