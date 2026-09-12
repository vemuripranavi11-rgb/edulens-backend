const assert = require("assert");

const BASE = "http://localhost:4000";

async function runAllTests() {
  console.log("==================================================");
  console.log("EDULENS K-12 HUB END-TO-END AUTOMATED TEST SUITE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`• Testing: ${name}... `);
      await fn();
      console.log("✅ PASSED");
      passed++;
    } catch (err) {
      console.log("❌ FAILED:", err.message);
      failed++;
    }
  }

  // 1. Health check
  await test("1. API Health Check", async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, "ok");
  });

  // 2. Authentication for all 4 roles
  let reviewerToken = "";
  let supervisorToken = "";
  let adminToken = "";
  let applicantToken = "";

  const rolesToTest = [
    { email: "applicant@school.demo", role: "Applicant" },
    { email: "reviewer@school.demo", role: "Reviewer" },
    { email: "supervisor@school.demo", role: "Supervisor" },
    { email: "admin@school.demo", role: "Compliance Admin" }
  ];

  for (const r of rolesToTest) {
    await test(`2. Auth login for ${r.role} (${r.email})`, async () => {
      const res = await fetch(`${BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: r.email, password: "Demo@123" })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.token);
      assert.strictEqual(data.user.role, r.role);

      if (r.role === "Reviewer") reviewerToken = data.token;
      if (r.role === "Supervisor") supervisorToken = data.token;
      if (r.role === "Compliance Admin") adminToken = data.token;
      if (r.role === "Applicant") applicantToken = data.token;
    });
  }

  // 3. Forgot Password
  await test("3. Forgot Password Recovery Flow", async () => {
    const res = await fetch(`${BASE}/api/v1/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "reviewer@school.demo" })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.ok);
  });

  // 4. Cases API & Role Scoping
  let firstCaseId = "";
  await test("4. Cases Retrieval & Filtering", async () => {
    const res = await fetch(`${BASE}/api/v1/cases`, {
      headers: { Authorization: `Bearer ${reviewerToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.items));
    assert.ok(data.items.length > 0);
    firstCaseId = data.items[0].id;
  });

  // 5. Case Details with Documents, Extracted Fields, Comments & Summary
  let firstDocId = "";
  await test("5. Case Review Workspace Details", async () => {
    const res = await fetch(`${BASE}/api/v1/cases/${firstCaseId}`, {
      headers: { Authorization: `Bearer ${reviewerToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.id);
    assert.ok(Array.isArray(data.documents));
    assert.ok(Array.isArray(data.exceptions));
    assert.ok(Array.isArray(data.audit));
    assert.ok(Array.isArray(data.comments));
    if (data.documents.length > 0) {
      firstDocId = data.documents[0].id;
    }
  });

  // 6. Collaborative Reviewer Comments
  await test("6. Case Collaboration Comments Thread", async () => {
    const res = await fetch(`${BASE}/api/v1/cases/${firstCaseId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${reviewerToken}`
      },
      body: JSON.stringify({ content: "Automated test audit verification comment." })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.comment.id);
  });

  // 7. Document Preview & High-Fidelity Streaming
  if (firstDocId) {
    await test("7. Document Preview Streaming (/file)", async () => {
      const res = await fetch(`${BASE}/api/v1/documents/${firstDocId}/file`, {
        headers: { Authorization: `Bearer ${reviewerToken}` }
      });
      assert.strictEqual(res.status, 200);
      const contentType = res.headers.get("content-type");
      assert.ok(contentType.includes("image/svg+xml") || contentType.includes("application/pdf") || contentType.includes("image/"));
    });
  }

  // 8. Document Comparison Endpoint
  await test("8. Side-by-Side Document Comparison (/compare)", async () => {
    const res = await fetch(`${BASE}/api/v1/cases/${firstCaseId}/compare`, {
      headers: { Authorization: `Bearer ${reviewerToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data !== null);
  });

  // 9. Supervisor Dashboard & Ageing Workload
  await test("9. Supervisor Dashboard & Ageing Analysis", async () => {
    const res = await fetch(`${BASE}/api/v1/supervisor/dashboard`, {
      headers: { Authorization: `Bearer ${supervisorToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.ageing);
    assert.ok(Array.isArray(data.workloads));
  });

  // 10. Exception Review Queue & Actions
  await test("10. Exception Review Queue", async () => {
    const res = await fetch(`${BASE}/api/v1/exceptions`, {
      headers: { Authorization: `Bearer ${reviewerToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.items));
  });

  // 11. AI Extraction API
  if (firstDocId) {
    await test("11. AI Document Extraction Endpoint", async () => {
      const res = await fetch(`${BASE}/api/v1/ai/extract/${firstDocId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${reviewerToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.run);
      assert.ok(data.run.model);
    });
  }

  // 12. Grounded Summaries & Feedback
  await test("12. AI Grounded Summary Generation & Citations", async () => {
    const res = await fetch(`${BASE}/api/v1/ai/summarize/${firstCaseId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${reviewerToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.summary);
    assert.ok(data.summary.summary_text);
    assert.ok(data.summary.decision_recommendation);
    assert.ok(Array.isArray(data.summary.citations));
  });

  // 13. AI Quality Metrics
  await test("13. AI Quality, Drift & Latency Metrics", async () => {
    const res = await fetch(`${BASE}/api/v1/ai/metrics`, {
      headers: { Authorization: `Bearer ${reviewerToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.accuracyRate !== undefined);
    assert.ok(data.modelDrift !== undefined);
  });

  // 14. Validation Engine & Cross-Document Checks
  await test("14. Validation Engine Run", async () => {
    const res = await fetch(`${BASE}/api/v1/validation/${firstCaseId}/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${reviewerToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.status);
    assert.ok(Array.isArray(data.checks));
  });

  // 15. Reports & Analytics Metrics
  await test("15. Reports & Analytics Metrics", async () => {
    const res = await fetch(`${BASE}/api/v1/reports/metrics`, {
      headers: { Authorization: `Bearer ${reviewerToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.summary);
    assert.ok(data.byCategory);
  });

  // 16. CSV Report Generation
  await test("16. Report Generation & CSV Export", async () => {
    const res = await fetch(`${BASE}/api/v1/reports/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${reviewerToken}`
      },
      body: JSON.stringify({ reportType: "Operational Overview", campus: "Central Campus", dateRange: "30D" })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.csv.includes("Case ID,Title"));
  });

  // 17. User Management (Admin Only)
  await test("17. User Directory Management", async () => {
    const res = await fetch(`${BASE}/api/v1/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.users));
    assert.ok(data.users.some((u) => u.role === "Compliance Admin"));
  });

  // 18. System Settings & Configuration (Admin Only)
  await test("18. System Settings Configuration", async () => {
    const res = await fetch(`${BASE}/api/v1/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.settings);
    assert.ok(data.settings.confidence_thresholds);
  });

  // 19. Searchable Immutable Audit Log
  await test("19. Searchable Audit Trail", async () => {
    const res = await fetch(`${BASE}/api/v1/audit/search?q=LOGIN`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.items));
  });

  // 20. Notifications API
  await test("20. Notifications Retrieval & Preferences", async () => {
    const res = await fetch(`${BASE}/api/v1/notifications`, {
      headers: { Authorization: `Bearer ${reviewerToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.items));
  });

  console.log("==================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});
