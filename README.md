# Edulens — K–12 Intelligent Document Intake Hub

## Run locally

1. Copy `.env.example` to `.env` and replace `JWT_SECRET` with a long, random value.
2. Run `npm run dev`.
3. Open `http://localhost:5173`.

## Separate deployment

The requirements deployment model uses Vercel for the frontend and Render for the backend.

### Backend on Render

- Build command: `npm ci`
- Start command: `npm start`
- Root directory: the project root containing `package.json`
- Required variables: `PORT`, `JWT_SECRET`, `FRONTEND_URL`, `PUBLIC_API_URL`, `GEMINI_API_KEY`, and `GEMINI_MODEL`
- Health check: `GET /api/health`

Set `FRONTEND_URL` to the exact Vercel origin and `PUBLIC_API_URL` to the exact Render origin.

### Frontend on Vercel

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: the project root containing `package.json`
- Build variable: `VITE_API_BASE_URL=https://your-backend.onrender.com`

Redeploy the frontend whenever a `VITE_*` variable changes. Never put `GEMINI_API_KEY` in a frontend variable.

SQLite data and local uploads require persistent disk storage. For production, use managed PostgreSQL and object storage instead.

The seeded demo account is `reviewer@school.demo` with password `Demo@123`. A compliance administrator account is also available at `admin@school.demo` with the same demo password.

## What is implemented

- JWT authentication, bcrypt password verification, protected API routes, Helmet headers, structured errors, and server-side roles.
- SQLite-backed cases, documents, exceptions, notifications, users, and append-only audit events.
- A responsive React/Vite workspace for dashboard, secure intake, case review, exception decisions, AI/validation/report placeholders, notifications, and administration.
- PDF/JPG/PNG upload controls, 10 MB limit, filename sanitisation, SHA-256 checksum, scan-state workflow, and document audit logging.
- Human decision controls: exceptions require a reason before approval, correction request, rejection, or escalation is recorded.

## Frontend structure

- `client/src/App.jsx` — app routing and session restoration.
- `client/src/pages/` — individual screen components.
- `client/src/components/` — reusable layout and UI components.
- `client/src/services/api.js` — authenticated API calls and browser session helpers.
- `server/index.js` — Express API, database schema, security middleware, and endpoints.

## Production notes

This is an end-to-end starter. Before production, replace the demo scan state with an isolated malware-scanning service, move uploads to encrypted object storage, configure enterprise identity/MFA and organisation scoping, use a managed PostgreSQL database, and connect `GEMINI_API_KEY` only through backend job workers. Never expose AI keys in the client.
