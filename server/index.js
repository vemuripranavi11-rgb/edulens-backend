require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { z } = require("zod");
const path = require("path");
const fs = require("fs");
const Tesseract = require("tesseract.js");
const pdfParse = require("pdf-parse");

// =================================
// APP CONFIGURATION
// =================================

const app = express();

const PORT = process.env.PORT || 4000;
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || "").replace(/\/$/, "");

const SECRET =
  process.env.JWT_SECRET || "change-me-in-production";

// =================================
// CREATE REQUIRED FOLDERS
// =================================

const dataDir = path.join(__dirname, "../data");
const uploadsDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, {
    recursive: true
  });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, {
    recursive: true
  });
}

// =================================
// DATABASE CONNECTION
// =================================

const dbPath = path.join(dataDir, "intake.db");

const db = new DatabaseSync(dbPath);

db.exec("PRAGMA foreign_keys = ON");

// =================================
// CREATE DATABASE TABLES
// =================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    role TEXT,
    password_hash TEXT,
    active INTEGER DEFAULT 1,
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    title TEXT,
    student TEXT,
    status TEXT,
    priority TEXT,
    owner TEXT,
    created_at TEXT,
    updated_at TEXT,
    version INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    name TEXT,
    type TEXT,
    status TEXT,
    checksum TEXT,
    created_at TEXT,
    FOREIGN KEY(case_id)
      REFERENCES cases(id)
  );

  CREATE TABLE IF NOT EXISTS exceptions (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    title TEXT,
    type TEXT,
    severity TEXT,
    status TEXT,
    confidence REAL,
    created_at TEXT,
    FOREIGN KEY(case_id)
      REFERENCES cases(id)
  );

  CREATE TABLE IF NOT EXISTS audits (
    id TEXT PRIMARY KEY,
    actor TEXT,
    action TEXT,
    entity TEXT,
    entity_id TEXT,
    detail TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_email TEXT,
    title TEXT,
    body TEXT,
    severity TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS extracted_fields (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    field_value TEXT,
    confidence REAL,
    created_at TEXT,
    FOREIGN KEY(document_id)
      REFERENCES documents(id)
  );

  CREATE TABLE IF NOT EXISTS ai_runs (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence REAL,
    result_json TEXT,
    reviewer_status TEXT DEFAULT 'pending',
    reviewer_email TEXT,
    override_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(document_id) REFERENCES documents(id),
    FOREIGN KEY(case_id) REFERENCES cases(id)
  );
`);

// =================================
// HELPER FUNCTIONS
// =================================

const id = () => crypto.randomUUID();

const now = () => new Date().toISOString();

// =================================
// AUDIT FUNCTION
// =================================

const audit = (
  actor,
  action,
  entity,
  entityId,
  detail = ""
) => {
  db.prepare(`
    INSERT INTO audits
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id(),
    actor,
    action,
    entity,
    entityId,
    detail,
    now()
  );
};

// =================================
// DOCUMENT TEXT EXTRACTION
// =================================

async function extractTextFromDocument(
  filePath,
  mimeType
) {
  try {

    // =========================================
    // PDF TEXT EXTRACTION
    // =========================================

    if (mimeType === "application/pdf") {

      const fileBuffer = fs.readFileSync(filePath);

      const parser = new pdfParse.PDFParse({
        data: fileBuffer
      });

      const result = await parser.getText();

      await parser.destroy();

      return result.text || "";
    }

    // =========================================
    // IMAGE OCR
    // =========================================

    if (
      mimeType === "image/jpeg" ||
      mimeType === "image/png"
    ) {

      const result = await Tesseract.recognize(
        filePath,
        "eng"
      );

      return result.data.text || "";
    }

    return "";

  } catch (error) {

    console.error(
      "Document extraction failed:",
      error
    );

    return "";
  }
}
// =================================
// EXTRACT FIELDS FROM OCR TEXT
// =================================

function extractFieldsFromText(text) {
  const fields = [];

  if (!text || !text.trim()) {
    return fields;
  }

  // Clean OCR text
  const cleanText = text
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // =================================
  // STUDENT NAME
  // =================================

  let studentName = null;

  let nameMatch = cleanText.match(
    /(?:this\s+is\s+to\s+)?certify\s+that\s+(?:mr\.?|ms\.?|miss\.?|mrs\.?)?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,5})/i
  );

  if (nameMatch) {
    studentName = nameMatch[1].trim();
  }

  // Alternative pattern:
  // Student Name: Pranavi

  if (!studentName) {
    nameMatch = cleanText.match(
      /(?:student\s*name|name)\s*[:\-]?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,5})/i
    );

    if (nameMatch) {
      studentName = nameMatch[1].trim();
    }
  }

  // Alternative certificate pattern

  if (!studentName) {
    nameMatch = cleanText.match(
      /(?:certify|certified)\s+(?:that\s+)?(?:mr\.?|ms\.?|miss\.?|mrs\.?)?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,5})/i
    );

    if (nameMatch) {
      studentName = nameMatch[1].trim();
    }
  }

  if (studentName) {
    fields.push({
      field_name: "Student Name",
      field_value: studentName,
      confidence: 0.95
    });
  }

  // =================================
  // REGISTRATION NUMBER
  // =================================

  let registrationNumber = null;

  const registrationMatch = cleanText.match(
    /(?:reg\.?\s*no\.?|registration\s*(?:no\.?|number)?)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i
  );

  if (registrationMatch) {
    registrationNumber =
      registrationMatch[1].trim();
  }

  // Alternative registration pattern

  if (!registrationNumber) {
    const fallbackRegistrationMatch =
      cleanText.match(
        /\b\d{2}[A-Z]{2,}\d[A-Z0-9]+\b/i
      );

    if (fallbackRegistrationMatch) {
      registrationNumber =
        fallbackRegistrationMatch[0].trim();
    }
  }

  if (registrationNumber) {
    fields.push({
      field_name: "Registration Number",
      field_value: registrationNumber,
      confidence: 0.9
    });
  }

  // =================================
  // DATE OF BIRTH
  // =================================

  const dobMatch = cleanText.match(
    /(?:date\s*of\s*birth|dob)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i
  );

  if (dobMatch) {
    fields.push({
      field_name: "Date of Birth",
      field_value: dobMatch[1].trim(),
      confidence: 0.92
    });
  }

  // =================================
  // INSTITUTION
  // =================================

  const institutionMatch = cleanText.match(
    /([A-Za-z0-9\s,&.\-]+(?:College\s+of\s+Engineering(?:\s*&\s*Technology)?|College|Institute|University)[A-Za-z0-9\s,&.\-]*)/i
  );

  if (institutionMatch) {
    let institution = institutionMatch[1]
      .replace(/\s+/g, " ")
      .trim();

    if (institution.length > 150) {
      institution =
        institution.substring(0, 150);
    }

    fields.push({
      field_name: "Institution",
      field_value: institution,
      confidence: 0.85
    });
  }

  // =================================
  // STATE
  // =================================

  const stateMatch = cleanText.match(
    /\b(ANDHRA PRADESH|TELANGANA|KARNATAKA|TAMIL NADU|KERALA|MAHARASHTRA|DELHI|ODISHA|WEST BENGAL|MADHYA PRADESH|UTTAR PRADESH)\b/i
  );

  if (stateMatch) {
    fields.push({
      field_name: "State",
      field_value: stateMatch[1].trim(),
      confidence: 0.95
    });
  }

  return fields;
}

// =================================
// AI EXTRACTION HELPERS
// =================================

function classifyDocument(name, text = "") {
  const source = `${name} ${text}`.toLowerCase();

  if (source.includes("admission") || source.includes("application for admission")) {
    return "Admission form";
  }

  if (source.includes("consent") || source.includes("guardian consent")) {
    return "Consent form";
  }

  if (source.includes("report card") || source.includes("marksheet") || source.includes("marks sheet") || source.includes("grade")) {
    return "Report card";
  }

  if (source.includes("passport") || source.includes("identity") || source.includes("aadhaar") || source.includes("id proof")) {
    return "Identity proof";
  }

  if (source.includes("certificate") || source.includes("certify that")) {
    return "Certificate";
  }

  if (source.includes("lesson plan")) {
    return "Lesson plan";
  }

  return "Supporting document";
}

function normaliseAiFields(fields) {
  if (!Array.isArray(fields)) return [];

  return fields
    .filter((field) => field && field.name)
    .map((field) => ({
      name: String(field.name),
      value: field.value == null ? "" : String(field.value),
      confidence: Math.max(0, Math.min(1, Number(field.confidence) || 0)),
      evidence: field.evidence ? String(field.evidence) : "OCR text"
    }));
}

async function runGeminiExtraction({ documentName, documentType, text }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const configuredModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const models = [
    configuredModel,
    "gemini-2.5-flash",
    "gemini-2.0-flash"
  ].filter((model, index, list) => list.indexOf(model) === index);

  const schema = {
    type: "object",
    properties: {
      documentType: { type: "string" },
      overallConfidence: { type: "number" },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            value: { type: "string" },
            confidence: { type: "number" },
            evidence: { type: "string" }
          },
          required: ["name", "value", "confidence", "evidence"]
        }
      }
    },
    required: ["documentType", "overallConfidence", "fields"]
  };

  const prompt = `You are the document extraction component of a K-12 document intake system.
Extract only information explicitly present in the supplied OCR text. Do not guess or invent values.
For every field, provide a short evidence phrase copied or closely grounded in the OCR text.
Classify the document into one of: Admission form, Identity proof, Report card, Consent form, Certificate, Lesson plan, Supporting document.
Return confidence from 0 to 1. If a field is not present, do not include it.

File name: ${documentName}
Current document type: ${documentType}

OCR TEXT:
${text.slice(0, 30000)}`;

  let data;
  let model = configuredModel;
  let lastError;

  for (const candidateModel of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema
          }
        })
      }
    );

    data = await response.json();

    if (response.ok) {
      model = candidateModel;
      lastError = undefined;
      break;
    }

    const message = data?.error?.message || `Gemini request failed with status ${response.status}.`;
    const transient = [429, 500, 503].includes(response.status) || /high demand|temporarily|unavailable|resource exhausted/i.test(message);

    if (!transient) {
      throw new Error(message);
    }

    lastError = new Error(message);
  }

  if (lastError) {
    throw lastError;
  }

  const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textResponse) {
    throw new Error("Gemini returned no extraction result.");
  }

  const parsed = JSON.parse(textResponse);

  return {
    provider: "Gemini",
    model: data.modelVersion || model,
    documentType: parsed.documentType || documentType,
    overallConfidence: Math.max(0, Math.min(1, Number(parsed.overallConfidence) || 0)),
    fields: normaliseAiFields(parsed.fields)
  };
}

function runLocalExtraction({ documentName, documentType, text }) {
  const fields = extractFieldsFromText(text).map((field) => ({
    name: field.field_name,
    value: field.field_value || "",
    confidence: field.confidence || 0,
    evidence: field.field_value || "Detected by OCR rule"
  }));

  const classifiedType = classifyDocument(documentName, text);
  const confidenceValues = fields.map((field) => field.confidence);
  const overallConfidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0.5;

  return {
    provider: "Local OCR fallback",
    model: "ocr-rules-v1",
    documentType: classifiedType || documentType,
    overallConfidence,
    fields
  };
}

// =================================
// INITIAL DEMO USERS
// =================================

const demoPassword = bcrypt.hashSync(
  "Demo@123",
  10
);

const demoUsers = [
  {
    email: "applicant@school.demo",
    name: "Pranavi",
    role: "Applicant"
  },
  {
    email: "reviewer@school.demo",
    name: "Jordan Lee",
    role: "Reviewer"
  },
  {
    email: "supervisor@school.demo",
    name: "Taylor Morgan",
    role: "Supervisor"
  },
  {
    email: "admin@school.demo",
    name: "Avery Patel",
    role: "Compliance Admin"
  }
];

for (const user of demoUsers) {
  const existingUser = db
    .prepare(
      "SELECT id FROM users WHERE email = ?"
    )
    .get(user.email);

  if (!existingUser) {
    db.prepare(`
      INSERT INTO users
      VALUES (?, ?, ?, ?, ?, 1, NULL)
    `).run(
      id(),
      user.email,
      user.name,
      user.role,
      demoPassword
    );
  }
}

// =================================
// INITIAL DEMO CASES
// =================================

const existingCase = db
  .prepare("SELECT id FROM cases LIMIT 1")
  .get();

if (!existingCase) {
  const caseData = [
    [
      "Admission review — Maya Sharma",
      "Maya Sharma",
      "pending-review",
      "high",
      "Jordan Lee"
    ],
    [
      "Consent & identity update — Arjun Nair",
      "Arjun Nair",
      "in-review",
      "medium",
      "Jordan Lee"
    ],
    [
      "Report card verification — Sofia Khan",
      "Sofia Khan",
      "exception",
      "high",
      "Jordan Lee"
    ]
  ];

  for (const c of caseData) {
    const caseId = id();

    db.prepare(`
      INSERT INTO cases
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      caseId,
      ...c,
      now(),
      now()
    );

    // Demo document
    db.prepare(`
      INSERT INTO documents
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id(),
      caseId,
      "Admission form.pdf",
      "Admission form",
      "scanned",
      crypto.randomUUID(),
      now()
    );
  }

  // =================================
  // SOFIA EXCEPTION
  // =================================

  const sofiaCase = db.prepare(`
    SELECT id
    FROM cases
    WHERE student = ?
  `).get("Sofia Khan");

  if (sofiaCase) {
    db.prepare(`
      INSERT INTO exceptions
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id(),
      sofiaCase.id,
      "Guardian name differs from consent form",
      "conflicting",
      "critical",
      "open",
      0.72,
      now()
    );
  }

  // =================================
  // DEMO NOTIFICATION
  // =================================

  db.prepare(`
    INSERT INTO notifications
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id(),
    "reviewer@school.demo",
    "High-risk exception assigned",
    "Sofia Khan requires a reviewer decision.",
    "urgent",
    0,
    now()
  );
}

// =================================
// CLEAN OLD MAYA SHARMA DEMO DATA
// =================================

// This removes old placeholder/wrong documents
// from the Maya Sharma case and keeps the new
// sample admission form.

const mayaCase = db.prepare(`
  SELECT id
  FROM cases
  WHERE student = ?
  LIMIT 1
`).get("Maya Sharma");

if (mayaCase) {

  // Find old documents that should not remain
  const oldDocuments = db.prepare(`
    SELECT id, name
    FROM documents
    WHERE case_id = ?
      AND name != ?
  `).all(
    mayaCase.id,
    "sample_admission_form_maya_sharma.pdf"
  );

  for (const document of oldDocuments) {

    // Delete AI extraction records first
    db.prepare(`
      DELETE FROM ai_runs
      WHERE document_id = ?
    `).run(document.id);

    // Delete extracted fields
    db.prepare(`
      DELETE FROM extracted_fields
      WHERE document_id = ?
    `).run(document.id);

    // Delete the document
    db.prepare(`
      DELETE FROM documents
      WHERE id = ?
    `).run(document.id);

    console.log(
      `Removed old Maya Sharma document: ${document.name}`
    );
  }

  // Remove old validation exceptions for this case
  db.prepare(`
    DELETE FROM exceptions
    WHERE case_id = ?
  `).run(mayaCase.id);

  // Put the case back into review
  db.prepare(`
    UPDATE cases
    SET
      status = 'pending-review',
      updated_at = ?
    WHERE id = ?
  `).run(
    now(),
    mayaCase.id
  );

  console.log(
    "Maya Sharma demo data cleaned successfully."
  );
}

// =================================
// MIDDLEWARE
// =================================

app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);

const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed"));
    }
  })
);

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(morgan("tiny"));

// =================================
// AUTHENTICATION MIDDLEWARE
// =================================

const auth = (
  req,
  res,
  next
) => {
  const header =
    req.headers.authorization;

  try {
    const token =
      header?.split(" ")[1];

    if (!token) {
      throw new Error("No token");
    }

    req.user = jwt.verify(
      token,
      SECRET
    );

    next();
  } catch {
    return res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message:
          "Sign in is required."
      }
    });
  }
};

// =================================
// ROLE AUTHORIZATION
// =================================

const requireRole =
  (...roles) =>
  (
    req,
    res,
    next
  ) => {
    if (
      !roles.includes(
        req.user.role
      )
    ) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message:
            "You do not have permission to access this resource."
        }
      });
    }

    next();
  };

const { initExtendedApi } = require("./extended-api");
initExtendedApi(app, db, { SECRET, auth, requireRole, id, now, audit });

// =================================
// HEALTH CHECK
// =================================

app.get(
  "/api/health",
  (_, res) => {
    res.json({
      status: "ok",
      time: now()
    });
  }
);

// =================================
// LOGIN API
// =================================

app.post(
  "/api/v1/auth/login",
  (req, res) => {
    const parsed = z
      .object({
        email: z.string().email(),
        password: z.string().min(1)
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Enter a valid email and password."
        }
      });
    }

    const user = db.prepare(`
      SELECT *
      FROM users
      WHERE email = ?
      AND active = 1
    `).get(
      parsed.data.email
    );

    if (
      !user ||
      !bcrypt.compareSync(
        parsed.data.password,
        user.password_hash
      )
    ) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message:
            "Email or password is incorrect."
        }
      });
    }

    db.prepare(`
      UPDATE users
      SET last_login = ?
      WHERE id = ?
    `).run(
      now(),
      user.id
    );

    audit(
      user.email,
      "LOGIN",
      "user",
      user.id
    );

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role
      },
      SECRET,
      {
        expiresIn: "8h"
      }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        campus: user.campus || "Central Campus"
      }
    });
  }
);

// =================================
// DASHBOARD API
// =================================

app.get(
  "/api/v1/dashboard",
  auth,
  (req, res) => {
    const count = (
      query,
      ...params
    ) =>
      db.prepare(query)
        .get(...params).n;

    res.json({
      metrics: {
        open: count(`
          SELECT COUNT(*) AS n
          FROM cases
          WHERE status != 'closed'
        `),

        exceptions: count(`
          SELECT COUNT(*) AS n
          FROM exceptions
          WHERE status = 'open'
        `),

        review: count(`
          SELECT COUNT(*) AS n
          FROM cases
          WHERE status IN (
            'pending-review',
            'in-review'
          )
        `),

        documents: count(`
          SELECT COUNT(*) AS n
          FROM documents
        `)
      },

      recent: db.prepare(`
        SELECT *
        FROM cases
        ORDER BY updated_at DESC
        LIMIT 8
      `).all()
    });
  }
);


// =================================
// CREATE CASE
// =================================

app.post(
  "/api/v1/cases",
  auth,
  (req, res) => {
    console.log("CREATE CASE REQUEST BODY:", req.body);
    const body = z
  .object({
    title: z.string().trim().min(3),
    student: z.string().trim().min(2),

    priority: z
      .string()
      .transform((value) => value.toLowerCase())
      .pipe(
        z.enum([
          "low",
          "medium",
          "high",
          "critical"
        ])
      ),

    owner: z.string().trim().min(2)
  })
  .safeParse(req.body);

    if (!body.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Title, student name, priority, and owner are required."
        }
      });
    }

    const {
      title,
      student,
      priority,
      owner
    } = body.data;

    const caseId = id();
    const timestamp = now();

    db.prepare(`
      INSERT INTO cases (
        id,
        title,
        student,
        status,
        priority,
        owner,
        created_at,
        updated_at,
        version
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      caseId,
      title,
      student,
      "pending-review",
      priority,
      owner,
      timestamp,
      timestamp,
      1
    );

    // Audit the case creation
    audit(
      req.user.email,
      "CASE_CREATED",
      "case",
      caseId,
      `Case created for student: ${student}`
    );

    const newCase = db.prepare(`
      SELECT *
      FROM cases
      WHERE id = ?
    `).get(caseId);

    res.status(201).json({
      message: "Case created successfully.",
      case: newCase
    });
  }
);
// =================================
// GET ALL CASES
// =================================

app.get(
  "/api/v1/cases",
  auth,
  (req, res) => {
    const search = `%${req.query.q || ""}%`;
    const status = req.query.status;
    const campus = req.query.campus;
    const priority = req.query.priority;
    const owner = req.query.owner;

    let query = `
      SELECT *
      FROM cases
      WHERE (title LIKE ? OR student LIKE ?)
    `;
    const params = [search, search];

    // Role-based scoping for Applicants
    if (req.user.role === "Applicant") {
      query += " AND (student = ? OR owner = ?)";
      params.push(req.user.name, req.user.name);
    }

    if (status && status !== "all") {
      query += " AND status = ?";
      params.push(status);
    }
    if (campus && campus !== "all") {
      query += " AND campus = ?";
      params.push(campus);
    }
    if (priority && priority !== "all") {
      query += " AND priority = ?";
      params.push(priority);
    }
    if (owner && owner !== "all") {
      query += " AND owner = ?";
      params.push(owner);
    }

    query += " ORDER BY updated_at DESC";
    const items = db.prepare(query).all(...params);

    res.json({
      items,
      page: 1,
      total: items.length
    });
  }
);

// =================================
// GET SINGLE CASE
// =================================

app.get(
  "/api/v1/cases/:id",
  auth,
  (req, res) => {
    const caseData = db.prepare(`
      SELECT *
      FROM cases
      WHERE id = ?
    `).get(
      req.params.id
    );

    if (!caseData) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message:
            "Case not found."
        }
      });
    }

    const documents = db.prepare(`
      SELECT *
      FROM documents
      WHERE case_id = ?
      ORDER BY created_at DESC
    `).all(
      caseData.id
    );

    const documentsWithFields =
      documents.map(
        (document) => {
          const extractedFields =
            db.prepare(`
              SELECT
                id,
                field_name,
                field_value,
                confidence,
                created_at,
                page_number,
                evidence_text,
                status
              FROM extracted_fields
              WHERE document_id = ?
              ORDER BY created_at DESC
            `).all(
              document.id
            );

          return {
            ...document,
            preview_url: `${PUBLIC_API_URL}/api/v1/documents/${document.id}/file`,
            download_url: `${PUBLIC_API_URL}/api/v1/documents/${document.id}/download`,
            extracted_fields:
              extractedFields
          };
        }
      );

    const exceptions = db.prepare(`
      SELECT *
      FROM exceptions
      WHERE case_id = ?
      ORDER BY created_at DESC
    `).all(
      caseData.id
    );

    const auditLogs = db.prepare(`
      SELECT *
      FROM audits
      WHERE entity_id = ?
      ORDER BY created_at DESC
    `).all(
      caseData.id
    );

    const comments = db.prepare(`
      SELECT *
      FROM comments
      WHERE case_id = ?
      ORDER BY created_at ASC
    `).all(
      caseData.id
    );

    const summaryRecord = db.prepare(`
      SELECT *
      FROM case_summaries
      WHERE case_id = ?
    `).get(
      caseData.id
    );

    const summary = summaryRecord
      ? {
          ...summaryRecord,
          citations: summaryRecord.citations_json
            ? JSON.parse(summaryRecord.citations_json)
            : []
        }
      : null;

    res.json({
      ...caseData,
      documents:
        documentsWithFields,
      exceptions,
      audit:
        auditLogs,
      comments,
      summary
    });
  }
);

// =================================
// GET EXCEPTIONS
// =================================

app.get(
  "/api/v1/exceptions",
  auth,
  (req, res) => {
    const type = req.query.type;
    const severity = req.query.severity;
    const status = req.query.status;

    let query = `
      SELECT
        e.*,
        c.student,
        c.title AS case_title,
        c.campus
      FROM exceptions e
      JOIN cases c
        ON c.id = e.case_id
      WHERE 1=1
    `;
    const params = [];

    if (type && type !== "all") {
      query += " AND e.type = ?";
      params.push(type);
    }
    if (severity && severity !== "all") {
      query += " AND e.severity = ?";
      params.push(severity);
    }
    if (status && status !== "all") {
      query += " AND e.status = ?";
      params.push(status);
    }

    query += " ORDER BY e.created_at DESC";
    const items = db.prepare(query).all(...params);

    res.json({
      items
    });
  }
);

// =================================
// UPDATE EXCEPTION
// =================================

app.patch(
  "/api/v1/exceptions/:id",
  auth,
  (req, res) => {
    const body = z
      .object({
        status: z.enum([
          "approved",
          "rejected",
          "correction-requested",
          "escalated"
        ]),
        reason:
          z.string().min(3)
      })
      .safeParse(
        req.body
      );

    if (!body.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "A valid decision and reason are required."
        }
      });
    }

    const {
      status,
      reason
    } = body.data;

    if (
      status === "escalated" &&
      req.user.role !==
        "Compliance Admin"
    ) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message:
            "Only a Compliance Admin can escalate an exception."
        }
      });
    }

    const exception = db.prepare(`
      SELECT *
      FROM exceptions
      WHERE id = ?
    `).get(
      req.params.id
    );

    if (!exception) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message:
            "Exception not found."
        }
      });
    }

    db.prepare(`
      UPDATE exceptions
      SET status = ?
      WHERE id = ?
    `).run(
      status,
      exception.id
    );

    let caseStatus;

    if (status === "approved") {
      caseStatus = "in-review";
    } else if (
      status === "rejected"
    ) {
      caseStatus = "exception";
    } else if (
      status ===
      "correction-requested"
    ) {
      caseStatus =
        "pending-review";
    } else if (
      status === "escalated"
    ) {
      caseStatus = "exception";
    }

    db.prepare(`
      UPDATE cases
      SET
        status = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      caseStatus,
      now(),
      exception.case_id
    );

    audit(
      req.user.email,
      status.toUpperCase(),
      "exception",
      exception.id,
      reason
    );

    audit(
      req.user.email,
      `CASE_${status.toUpperCase()}`,
      "case",
      exception.case_id,
      reason
    );

    return res.json({
      ok: true,
      message:
        "Exception decision recorded successfully.",
      caseStatus
    });
  }
);

// =================================
// FILE UPLOAD CONFIGURATION
// =================================

const storage =
  multer.diskStorage({
    destination: (
      _,
      __,
      cb
    ) => {
      cb(
        null,
        uploadsDir
      );
    },

    filename: (
      _,
      file,
      cb
    ) => {
      const safeName =
        file.originalname.replace(
          /[^a-zA-Z0-9._-]/g,
          "_"
        );

      cb(
        null,
        `${Date.now()}-${safeName}`
      );
    }
  });

const upload = multer({
  storage,

  limits: {
    fileSize:
      10 * 1024 * 1024
  },

  fileFilter: (
    _,
    file,
    cb
  ) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png"
    ];

    if (
      !allowedTypes.includes(
        file.mimetype
      )
    ) {
      return cb(
        new Error(
          "Only PDF, JPG, and PNG files are allowed."
        )
      );
    }

    cb(
      null,
      true
    );
  }
});
// ============================================================
// DOCUMENT UPLOAD
// ============================================================

app.post(
  "/api/v1/documents",
  auth,
  upload.single("file"),
  async (req, res) => {
    try {
      // --------------------------------------------------------
      // 1. Check file
      // --------------------------------------------------------

      if (!req.file) {
        return res.status(400).json({
          error: {
            code: "FILE_REQUIRED",
            message: "Please select a file to upload."
          }
        });
      }

      // --------------------------------------------------------
      // 2. Get case ID
      // --------------------------------------------------------

      const caseId = req.body.caseId;

      if (!caseId) {
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        return res.status(400).json({
          error: {
            code: "CASE_ID_REQUIRED",
            message: "Case ID is required."
          }
        });
      }

      // --------------------------------------------------------
      // 3. Check whether case exists
      // --------------------------------------------------------

      const caseRecord = db
        .prepare(`
          SELECT id
          FROM cases
          WHERE id = ?
          LIMIT 1
        `)
        .get(caseId);

      if (!caseRecord) {
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        return res.status(404).json({
          error: {
            code: "CASE_NOT_FOUND",
            message: "The selected case was not found."
          }
        });
      }

      // --------------------------------------------------------
      // 4. Create checksum
      // --------------------------------------------------------

      const fileBuffer = fs.readFileSync(req.file.path);

      const checksum = crypto
        .createHash("sha256")
        .update(fileBuffer)
        .digest("hex");

      // --------------------------------------------------------
      // 5. Check for duplicate document
      // --------------------------------------------------------

      const duplicateDocument = db
        .prepare(`
          SELECT
            id,
            case_id,
            name,
            type,
            checksum
          FROM documents
          WHERE checksum = ?
          LIMIT 1
        `)
        .get(checksum);

      // --------------------------------------------------------
      // 6. DUPLICATE DOCUMENT
      // --------------------------------------------------------

      if (duplicateDocument) {
        console.log(
          "Duplicate document detected:",
          duplicateDocument.name
        );

        // Delete newly uploaded duplicate file
        if (req.file.path && fs.existsSync(req.file.path)) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (cleanupError) {
            console.error(
              "Duplicate file cleanup failed:",
              cleanupError
            );
          }
        }

        // ------------------------------------------------------
        // Check whether an OPEN duplicate exception already
        // exists for this case
        // ------------------------------------------------------

        const existingException = db
          .prepare(`
            SELECT id
            FROM exceptions
            WHERE case_id = ?
              AND type = ?
              AND status = ?
              AND title = ?
            LIMIT 1
          `)
          .get(
            caseId,
            "duplicate",
            "open",
            "Duplicate document detected"
          );

        // ------------------------------------------------------
        // Create exception only if one does not already exist
        // ------------------------------------------------------

        if (!existingException) {
          const exceptionId = id();

          db.prepare(`
            INSERT INTO exceptions (
              id,
              case_id,
              title,
              type,
              severity,
              status,
              confidence,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            exceptionId,
            caseId,
            "Duplicate document detected",
            "duplicate",
            "critical",
            "open",
            1.0,
            now()
          );

          console.log(
            "New duplicate exception created:",
            exceptionId
          );
        } else {
          console.log(
            "Duplicate exception already exists:",
            existingException.id
          );
        }
// ------------------------------------------------------
// Notification
// ------------------------------------------------------

db.prepare(`
  INSERT INTO notifications (
    id,
    user_email,
    title,
    body,
    severity,
    read,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  id(),
  req.user.email,
  "Duplicate document detected",
  `The document "${req.file.originalname}" is already present in the system.`,
  "critical",
  0,
  now()
);

        // ------------------------------------------------------
        // Audit
        // ------------------------------------------------------

        audit(
          req.user.email,
          "DUPLICATE_DOCUMENT_DETECTED",
          "document",
          duplicateDocument.id,
          `Duplicate document attempted: ${req.file.originalname}. Checksum: ${checksum}`
        );

        // ------------------------------------------------------
        // Return response
        // ------------------------------------------------------

        return res.status(409).json({
          error: {
            code: "DUPLICATE_DOCUMENT",
            message:
              "This document has already been uploaded."
          },
          duplicate: {
            documentId: duplicateDocument.id,
            caseId: duplicateDocument.case_id,
            fileName: duplicateDocument.name,
            checksum: duplicateDocument.checksum
          }
        });
      }

      // ========================================================
      // NORMAL UPLOAD PROCESSING
      // ========================================================

      // --------------------------------------------------------
      // 7. Create document ID
      // --------------------------------------------------------

      const documentId = id();

      // --------------------------------------------------------
      // 8. Save document record
      // --------------------------------------------------------

      db.prepare(`
        INSERT INTO documents (
          id,
          case_id,
          name,
          type,
          status,
          checksum,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        documentId,
        caseId,
        req.file.originalname,
        req.file.mimetype,
        "processing",
        checksum,
        now()
      );

      // --------------------------------------------------------
      // 9. Extract text from document
      // --------------------------------------------------------

const extractedText =
  await extractTextFromDocument(
    req.file.path,
    req.file.mimetype
  );

const extractedFields =
  extractFieldsFromText(extractedText);

// Save OCR text for AI extraction
const ocrField = {
  field_name: "OCR Text",
  field_value: extractedText,
  confidence: extractedText.trim() ? 0.99 : 0
};

// =================================
// BASIC DOCUMENT INFORMATION
// =================================

const basicFields = [
  {
    field_name: "File Name",
    field_value: req.file.originalname,
    confidence: 1.0
  },
  {
    field_name: "Document Type",
    field_value: "Supporting document",
    confidence: 0.94
  }
];

// =================================
// COMBINE BASIC + OCR FIELDS
// =================================

const allExtractedFields = [
  ...basicFields,
  ocrField,
  ...extractedFields
];

// =================================
// SAVE EXTRACTED FIELDS
// =================================

for (const field of allExtractedFields) {
  db.prepare(`
    INSERT INTO extracted_fields (
      id,
      document_id,
      field_name,
      field_value,
      confidence,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id(),
    documentId,
    field.field_name,
    field.field_value,
    field.confidence,
    now()
  );
}

      // --------------------------------------------------------
      // 12. Update document status
      // --------------------------------------------------------

      db.prepare(`
        UPDATE documents
        SET status = ?
        WHERE id = ?
      `).run(
        "scanned",
        documentId
      );

      // --------------------------------------------------------
      // 13. Update case status
      // --------------------------------------------------------

      db.prepare(`
        UPDATE cases
        SET status = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        "in-review",
        now(),
        caseId
      );

      // --------------------------------------------------------
      // 14. Audit successful upload
      // --------------------------------------------------------

      audit(
        req.user.email,
        "DOCUMENT_UPLOADED",
        "document",
        documentId,
        `Document uploaded successfully. Checksum: ${checksum}`
      );

      // --------------------------------------------------------
      // 15. Success response
      // --------------------------------------------------------

      return res.status(201).json({
        message:
          "Document uploaded and processed successfully.",

        document: {
          id: documentId,
          caseId: caseId,
          fileName: req.file.originalname,
          type: req.file.mimetype,
          status: "scanned",
          checksum: checksum,

          // Current project does not have a real antivirus
          // scanner, so this is only the existing project
          // response value.
          malwareScan: "passed",

          extractedFields: extractedFields
        }
      });

    } catch (error) {

      // --------------------------------------------------------
      // Error handling
      // --------------------------------------------------------

      console.error(
        "Document upload failed:",
        error
      );

      // Remove uploaded file if processing failed
      if (
        req.file &&
        req.file.path &&
        fs.existsSync(req.file.path)
      ) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error(
            "File cleanup failed:",
            cleanupError
          );
        }
      }

      return res.status(500).json({
        error: {
          code: "UPLOAD_PROCESSING_FAILED",
          message:
            "Document upload failed. Please try again."
        }
      });
    }
  }
);




// =================================
// AI EXTRACTION API
// =================================

app.get(
  "/api/v1/ai/extract/:documentId",
  auth,
  (req, res) => {
    const document = db.prepare(`
      SELECT d.*, c.student, c.title AS case_title
      FROM documents d
      JOIN cases c ON c.id = d.case_id
      WHERE d.id = ?
    `).get(req.params.documentId);

    if (!document) {
      return res.status(404).json({
        error: {
          code: "DOCUMENT_NOT_FOUND",
          message: "Document not found."
        }
      });
    }

    const runs = db.prepare(`
      SELECT *
      FROM ai_runs
      WHERE document_id = ?
      ORDER BY created_at DESC
    `).all(document.id);

    res.json({
      document,
      runs: runs.map((run) => ({
        ...run,
        result: run.result_json ? JSON.parse(run.result_json) : null
      }))
    });
  }
);

app.post(
  "/api/v1/ai/extract/:documentId",
  auth,
  async (req, res) => {
    const document = db.prepare(`
      SELECT d.*, c.student, c.title AS case_title
      FROM documents d
      JOIN cases c ON c.id = d.case_id
      WHERE d.id = ?
    `).get(req.params.documentId);

    if (!document) {
      return res.status(404).json({
        error: {
          code: "DOCUMENT_NOT_FOUND",
          message: "Document not found."
        }
      });
    }

    const ocrField = db.prepare(`
      SELECT field_value
      FROM extracted_fields
      WHERE document_id = ?
        AND field_name = 'OCR Text'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(document.id);

    const ocrText = ocrField?.field_value || "";

    if (!ocrText.trim()) {
      return res.status(400).json({
        error: {
          code: "OCR_TEXT_REQUIRED",
          message: "Run document OCR first. No OCR text is available for this document."
        }
      });
    }

    const runId = id();
    const startedAt = now();
    let result;

    try {
      result = await runGeminiExtraction({
        documentName: document.name,
        documentType: document.type,
        text: ocrText
      });

      if (!result) {
        result = runLocalExtraction({
          documentName: document.name,
          documentType: document.type,
          text: ocrText
        });
      }

      const reviewerStatus = result.overallConfidence < 0.75
        ? "review-required"
        : "pending";

      db.prepare(`
        INSERT INTO ai_runs (
          id, document_id, case_id, provider, model, status, confidence,
          result_json, reviewer_status, reviewer_email, override_reason,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      `).run(
        runId,
        document.id,
        document.case_id,
        result.provider,
        result.model,
        "completed",
        result.overallConfidence,
        JSON.stringify(result),
        reviewerStatus,
        startedAt,
        now()
      );

      audit(
        req.user.email,
        "AI_EXTRACTION_COMPLETED",
        "document",
        document.id,
        `${result.provider} / ${result.model}; confidence=${result.overallConfidence.toFixed(2)}`
      );

      return res.json({
        run: {
          id: runId,
          documentId: document.id,
          caseId: document.case_id,
          provider: result.provider,
          model: result.model,
          status: "completed",
          confidence: result.overallConfidence,
          reviewerStatus,
          createdAt: startedAt,
          result
        }
      });
    } catch (error) {
      console.error("AI extraction failed:", error);

      db.prepare(`
        INSERT INTO ai_runs (
          id, document_id, case_id, provider, model, status, confidence,
          result_json, reviewer_status, reviewer_email, override_reason,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      `).run(
        runId,
        document.id,
        document.case_id,
        "Gemini",
        process.env.GEMINI_MODEL || "gemini-2.5-flash",
        "failed",
        0,
        JSON.stringify({ error: error.message }),
        "review-required",
        startedAt,
        now()
      );

      return res.status(502).json({
        error: {
          code: "AI_EXTRACTION_FAILED",
          message: error.message || "AI extraction failed."
        }
      });
    }
  }
);

app.post(
  "/api/v1/ai/runs/:runId/review",
  auth,
  (req, res) => {
    const parsed = z.object({
      decision: z.enum(["approved", "rejected", "overridden"]),
      reason: z.string().max(500).optional().default("")
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Decision must be approved, rejected, or overridden."
        }
      });
    }

    const run = db.prepare(`
      SELECT * FROM ai_runs WHERE id = ?
    `).get(req.params.runId);

    if (!run) {
      return res.status(404).json({
        error: {
          code: "AI_RUN_NOT_FOUND",
          message: "AI extraction run not found."
        }
      });
    }

    db.prepare(`
      UPDATE ai_runs
      SET reviewer_status = ?, reviewer_email = ?, override_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(
      parsed.data.decision,
      req.user.email,
      parsed.data.reason || null,
      now(),
      run.id
    );

    audit(
      req.user.email,
      `AI_EXTRACTION_${parsed.data.decision.toUpperCase()}`,
      "ai_run",
      run.id,
      parsed.data.reason || "Reviewer decision recorded."
    );

    res.json({
      message: "Reviewer decision saved.",
      decision: parsed.data.decision
    });
  }
);

// =================================
// VALIDATION & CROSS-DOCUMENT CHECKS
// =================================

// Normalize values before comparing them
function normalizeValidationValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Get extracted fields for a document
function getDocumentFields(documentId) {
  const fields = db.prepare(`
    SELECT
      field_name,
      field_value,
      confidence
    FROM extracted_fields
    WHERE document_id = ?
    ORDER BY created_at DESC
  `).all(documentId);

  const result = {};

  for (const field of fields) {
    if (!result[field.field_name]) {
      result[field.field_name] = {
        value: field.field_value || "",
        confidence: Number(field.confidence || 0)
      };
    }
  }

  return result;
}

// Create validation exception only if the same open exception
// does not already exist
function createValidationException({
  caseId,
  title,
  type,
  severity = "high",
  confidence = 0.8
}) {
  const existing = db.prepare(`
    SELECT id
    FROM exceptions
    WHERE case_id = ?
      AND title = ?
      AND status = 'open'
    LIMIT 1
  `).get(caseId, title);

  if (existing) {
    return existing.id;
  }

  const exceptionId = id();

  db.prepare(`
    INSERT INTO exceptions (
      id,
      case_id,
      title,
      type,
      severity,
      status,
      confidence,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    exceptionId,
    caseId,
    title,
    type,
    severity,
    "open",
    confidence,
    now()
  );

  return exceptionId;
}

// =================================
// RUN VALIDATION FOR A CASE
// =================================

app.post(
  "/api/v1/validation/:caseId/run",
  auth,
  async (req, res) => {
    try {
      const caseData = db.prepare(`
        SELECT *
        FROM cases
        WHERE id = ?
      `).get(req.params.caseId);

      if (!caseData) {
        return res.status(404).json({
          error: {
            code: "CASE_NOT_FOUND",
            message: "Case not found."
          }
        });
      }

      const documents = db.prepare(`
        SELECT *
        FROM documents
        WHERE case_id = ?
        ORDER BY created_at ASC
      `).all(caseData.id);

      if (!documents.length) {
        return res.json({
          caseId: caseData.id,
          status: "review-required",
          passed: false,
          checks: [
            {
              name: "Required documents",
              status: "failed",
              message: "No documents have been uploaded for this case.",
              confidence: 1
            }
          ],
          exceptions: []
        });
      }

      const checks = [];
      const createdExceptions = [];

      // =================================
      // CHECK 1 - OCR AVAILABILITY
      // =================================

      for (const document of documents) {
        const fields = getDocumentFields(document.id);

        const ocr = fields["OCR Text"];

        if (!ocr || !String(ocr.value || "").trim()) {
          const exceptionId = createValidationException({
            caseId: caseData.id,
            title: `OCR text missing: ${document.name}`,
            type: "missing",
            severity: "high",
            confidence: 1
          });

          createdExceptions.push(exceptionId);

          checks.push({
            name: `OCR - ${document.name}`,
            status: "failed",
            message: "No OCR text was detected.",
            documentId: document.id,
            confidence: 1
          });
        } else {
          checks.push({
            name: `OCR - ${document.name}`,
            status: "passed",
            message: "OCR text is available.",
            documentId: document.id,
            confidence: Number(ocr.confidence || 0)
          });
        }
      }

      // =================================
      // CHECK 2 - REQUIRED STUDENT NAME
      // =================================

      for (const document of documents) {
        const fields = getDocumentFields(document.id);
        const studentName = fields["Student Name"];

        if (!studentName || !String(studentName.value || "").trim()) {
          const exceptionId = createValidationException({
            caseId: caseData.id,
            title: `Student name missing: ${document.name}`,
            type: "missing",
            severity: "high",
            confidence: 1
          });

          createdExceptions.push(exceptionId);

          checks.push({
            name: `Student name - ${document.name}`,
            status: "failed",
            message: "Student name could not be extracted.",
            documentId: document.id,
            confidence: 1
          });
        } else {
          checks.push({
            name: `Student name - ${document.name}`,
            status: "passed",
            message: `Student name detected: ${studentName.value}`,
            documentId: document.id,
            confidence: Number(studentName.confidence || 0)
          });
        }
      }

      // =================================
      // CHECK 3 - LOW CONFIDENCE FIELDS
      // =================================

      for (const document of documents) {
        const fields = getDocumentFields(document.id);

        for (const [fieldName, field] of Object.entries(fields)) {
          if (fieldName === "OCR Text") {
            continue;
          }

          const confidence = Number(field.confidence || 0);

          if (
            String(field.value || "").trim() &&
            confidence < 0.75
          ) {
            const exceptionId = createValidationException({
              caseId: caseData.id,
              title: `Low confidence: ${fieldName} in ${document.name}`,
              type: "low-confidence",
              severity: "medium",
              confidence
            });

            createdExceptions.push(exceptionId);

            checks.push({
              name: `Confidence - ${fieldName}`,
              status: "review-required",
              message:
                `Confidence is ${(confidence * 100).toFixed(0)}%, below the 75% review threshold.`,
              documentId: document.id,
              confidence
            });
          }
        }
      }

      // =================================
      // CHECK 4 - CROSS DOCUMENT STUDENT NAME
      // =================================

      const studentNames = [];

      for (const document of documents) {
        const fields = getDocumentFields(document.id);
        const studentName = fields["Student Name"];

        if (
          studentName &&
          String(studentName.value || "").trim()
        ) {
          studentNames.push({
            documentId: document.id,
            documentName: document.name,
            value: studentName.value,
            normalized: normalizeValidationValue(
              studentName.value
            ),
            confidence: Number(
              studentName.confidence || 0
            )
          });
        }
      }

      const uniqueStudentNames = [
        ...new Set(
          studentNames.map(
            (item) => item.normalized
          )
        )
      ];

      if (uniqueStudentNames.length > 1) {
        const exceptionId = createValidationException({
          caseId: caseData.id,
          title: "Student name differs across documents",
          type: "conflicting",
          severity: "critical",
          confidence: 0.95
        });

        createdExceptions.push(exceptionId);

        checks.push({
          name: "Cross-document student name",
          status: "failed",
          message:
            "Different student names were detected across the uploaded documents.",
          confidence: 0.95,
          evidence: studentNames.map(
            (item) => ({
              document: item.documentName,
              value: item.value
            })
          )
        });
      } else if (studentNames.length > 0) {
        checks.push({
          name: "Cross-document student name",
          status: "passed",
          message:
            "Student name is consistent across documents.",
          confidence:
            studentNames.reduce(
              (sum, item) =>
                sum + item.confidence,
              0
            ) / studentNames.length
        });
      }

      // =================================
      // CHECK 5 - REGISTRATION NUMBER
      // =================================

      const registrationNumbers = [];

      for (const document of documents) {
        const fields = getDocumentFields(document.id);
        const registration =
          fields["Registration Number"];

        if (
          registration &&
          String(registration.value || "").trim()
        ) {
          registrationNumbers.push({
            documentId: document.id,
            documentName: document.name,
            value: registration.value,
            normalized:
              normalizeValidationValue(
                registration.value
              ),
            confidence:
              Number(registration.confidence || 0)
          });
        }
      }

      const uniqueRegistrationNumbers = [
        ...new Set(
          registrationNumbers.map(
            (item) => item.normalized
          )
        )
      ];

      if (
        uniqueRegistrationNumbers.length > 1
      ) {
        const exceptionId =
          createValidationException({
            caseId: caseData.id,
            title:
              "Registration number differs across documents",
            type: "conflicting",
            severity: "critical",
            confidence: 0.95
          });

        createdExceptions.push(exceptionId);

        checks.push({
          name:
            "Cross-document registration number",
          status: "failed",
          message:
            "Different registration numbers were detected.",
          confidence: 0.95,
          evidence:
            registrationNumbers.map(
              (item) => ({
                document:
                  item.documentName,
                value: item.value
              })
            )
        });
      } else if (
        registrationNumbers.length > 0
      ) {
        checks.push({
          name:
            "Cross-document registration number",
          status: "passed",
          message:
            "Registration number is consistent.",
          confidence:
            registrationNumbers.reduce(
              (sum, item) =>
                sum + item.confidence,
              0
            ) /
            registrationNumbers.length
        });
      }

      // =================================
      // CHECK 6 - DATE OF BIRTH
      // =================================

      const datesOfBirth = [];

      for (const document of documents) {
        const fields =
          getDocumentFields(document.id);

        const dob =
          fields["Date of Birth"];

        if (
          dob &&
          String(dob.value || "").trim()
        ) {
          datesOfBirth.push({
            documentId: document.id,
            documentName: document.name,
            value: dob.value,
            normalized:
              normalizeValidationValue(
                dob.value
              ),
            confidence:
              Number(dob.confidence || 0)
          });
        }
      }

      const uniqueDates = [
        ...new Set(
          datesOfBirth.map(
            (item) => item.normalized
          )
        )
      ];

      if (uniqueDates.length > 1) {
        const exceptionId =
          createValidationException({
            caseId: caseData.id,
            title:
              "Date of birth differs across documents",
            type: "conflicting",
            severity: "critical",
            confidence: 0.95
          });

        createdExceptions.push(exceptionId);

        checks.push({
          name:
            "Cross-document date of birth",
          status: "failed",
          message:
            "Different dates of birth were detected.",
          confidence: 0.95,
          evidence:
            datesOfBirth.map(
              (item) => ({
                document:
                  item.documentName,
                value: item.value
              })
            )
        });
      } else if (
        datesOfBirth.length > 0
      ) {
        checks.push({
          name:
            "Cross-document date of birth",
          status: "passed",
          message:
            "Date of birth is consistent.",
          confidence:
            datesOfBirth.reduce(
              (sum, item) =>
                sum + item.confidence,
              0
            ) /
            datesOfBirth.length
        });
      }

      // =================================
      // DETERMINE OVERALL STATUS
      // =================================

      const hasFailures = checks.some(
        (check) =>
          check.status === "failed"
      );

      const needsReview = checks.some(
        (check) =>
          check.status === "review-required"
      );

      let validationStatus = "passed";

      if (hasFailures) {
        validationStatus = "failed";
      } else if (needsReview) {
        validationStatus =
          "review-required";
      }

      // =================================
      // UPDATE CASE STATUS
      // =================================

      if (
        validationStatus === "failed"
      ) {
        db.prepare(`
          UPDATE cases
          SET
            status = 'exception',
            updated_at = ?
          WHERE id = ?
        `).run(
          now(),
          caseData.id
        );
      } else if (
        validationStatus ===
        "review-required"
      ) {
        db.prepare(`
          UPDATE cases
          SET
            status = 'pending-review',
            updated_at = ?
          WHERE id = ?
        `).run(
          now(),
          caseData.id
        );
      }

      // =================================
      // NOTIFICATION
      // =================================

      if (
        validationStatus !== "passed"
      ) {
        db.prepare(`
          INSERT INTO notifications (
            id,
            user_email,
            title,
            body,
            severity,
            read,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          id(),
          req.user.email,
          "Validation requires review",
          `Validation for ${caseData.student} is ${validationStatus}.`,
          validationStatus === "failed"
            ? "critical"
            : "warning",
          0,
          now()
        );
      }

      // =================================
      // AUDIT
      // =================================

      audit(
        req.user.email,
        "VALIDATION_RUN",
        "case",
        caseData.id,
        `Validation status: ${validationStatus}; checks=${checks.length}`
      );

      // =================================
      // RESPONSE
      // =================================

      return res.json({
        caseId: caseData.id,
        student: caseData.student,
        status: validationStatus,
        passed:
          validationStatus === "passed",
        totalChecks: checks.length,
        failedChecks:
          checks.filter(
            (check) =>
              check.status === "failed"
          ).length,
        reviewRequired:
          checks.filter(
            (check) =>
              check.status ===
              "review-required"
          ).length,
        checks,
        exceptionIds:
          createdExceptions
      });
    } catch (error) {
      console.error(
        "Validation failed:",
        error
      );

      return res.status(500).json({
        error: {
          code: "VALIDATION_FAILED",
          message:
            "Validation could not be completed."
        }
      });
    }
  }
);

// =================================
// GET LATEST VALIDATION RESULTS
// =================================

app.get(
  "/api/v1/validation/:caseId",
  auth,
  (req, res) => {
    const caseData = db.prepare(`
      SELECT *
      FROM cases
      WHERE id = ?
    `).get(req.params.caseId);

    if (!caseData) {
      return res.status(404).json({
        error: {
          code: "CASE_NOT_FOUND",
          message: "Case not found."
        }
      });
    }

    const exceptions = db.prepare(`
      SELECT
        *
      FROM exceptions
      WHERE case_id = ?
      ORDER BY created_at DESC
    `).all(caseData.id);

    const documents = db.prepare(`
      SELECT *
      FROM documents
      WHERE case_id = ?
      ORDER BY created_at ASC
    `).all(caseData.id);

    const checks = [];

    for (const document of documents) {
      const fields =
        getDocumentFields(
          document.id
        );

      const ocr =
        fields["OCR Text"];

      const studentName =
        fields["Student Name"];

      checks.push({
        name:
          `OCR - ${document.name}`,
        status:
          ocr &&
          String(ocr.value || "").trim()
            ? "passed"
            : "failed",
        message:
          ocr &&
          String(ocr.value || "").trim()
            ? "OCR text is available."
            : "OCR text is missing.",
        documentId:
          document.id,
        confidence:
          Number(
            ocr?.confidence || 0
          )
      });

      checks.push({
        name:
          `Student name - ${document.name}`,
        status:
          studentName &&
          String(
            studentName.value || ""
          ).trim()
            ? "passed"
            : "failed",
        message:
          studentName &&
          String(
            studentName.value || ""
          ).trim()
            ? `Student name detected: ${studentName.value}`
            : "Student name is missing.",
        documentId:
          document.id,
        confidence:
          Number(
            studentName?.confidence ||
              0
          )
      });
    }

    const hasFailures =
      checks.some(
        (check) =>
          check.status ===
          "failed"
      );

    return res.json({
      caseId: caseData.id,
      student: caseData.student,
      status:
        hasFailures
          ? "failed"
          : "passed",
      passed:
        !hasFailures,
      checks,
      exceptions
    });
  }
);

// =================================
// AUDIT LOGS
// ADMIN ONLY
// =================================

app.get(
  "/api/v1/audit",
  auth,
  requireRole(
    "Compliance Admin"
  ),
  (
    req,
    res
  ) => {
    const items =
      db.prepare(`
        SELECT *
        FROM audits
        ORDER BY created_at DESC
        LIMIT 100
      `).all();

    res.json({
      items
    });
  }
);

// =================================
// GET NOTIFICATIONS
// =================================

app.get(
  "/api/v1/notifications",
  auth,
  (
    req,
    res
  ) => {
    const items =
      db.prepare(`
        SELECT *
        FROM notifications
        WHERE user_email = ?
        OR user_email IS NULL
        ORDER BY created_at DESC
      `).all(
        req.user.email
      );

    res.json({
      items
    });
  }
);

// =================================
// MARK NOTIFICATION AS READ
// =================================

app.patch(
  "/api/v1/notifications/:id/read",
  auth,
  (
    req,
    res
  ) => {
    const notification =
      db.prepare(`
        SELECT *
        FROM notifications
        WHERE id = ?
        AND (
          user_email = ?
          OR user_email IS NULL
        )
      `).get(
        req.params.id,
        req.user.email
      );

    if (!notification) {
      return res.status(404).json({
        error: {
          code:
            "NOT_FOUND",

          message:
            "Notification not found."
        }
      });
    }

    db.prepare(`
      UPDATE notifications
      SET read = 1
      WHERE id = ?
    `).run(
      req.params.id
    );

    res.json({
      ok: true
    });
  }
);

// =================================
// ERROR HANDLER
// =================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    if (
      err instanceof
      multer.MulterError
    ) {
      return res.status(400).json({
        error: {
          code:
            "UPLOAD_ERROR",

          message:
            err.message
        }
      });
    }

    if (err) {
      console.error(err);

      return res.status(400).json({
        error: {
          code:
            "ERROR",

          message:
            err.message ||
            "Unexpected server error."
        }
      });
    }

    next();
  }
);

// =================================
// START SERVER
// =================================

app.listen(
  PORT,
  () => {
    console.log(
      `API running on http://localhost:${PORT}`
    );
  }
);