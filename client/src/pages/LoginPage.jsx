import { useState, useEffect } from "react";
import { api, saveSession } from "../services/api";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("Demo@123");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  useEffect(() => {
    const savedEmail = localStorage.getItem("edulens_remembered_email");
    if (savedEmail) {
      setEmail(savedEmail);
    } else {
      setEmail("reviewer@school.demo");
    }
  }, []);

  async function submit(event) {
    if (event) event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const session = await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password })
      });

      if (rememberMe) {
        localStorage.setItem("edulens_remembered_email", email.trim());
      } else {
        localStorage.removeItem("edulens_remembered_email");
      }

      saveSession(session);
      onLogin(session.user);
    } catch (e) {
      setError(e.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setBusy(false);
    }
  }

  const selectDemoRole = (demoEmail) => {
    setEmail(demoEmail);
    setPassword("Demo@123");
    setError("");
  };

  async function handleForgotPassword(e) {
    e.preventDefault();
    setForgotBusy(true);
    setForgotMessage("");

    try {
      const res = await api("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail })
      });
      setForgotMessage(res.message || "Instructions sent to your institutional address.");
    } catch (err) {
      setForgotMessage(err.message || "Password recovery failed.");
    } finally {
      setForgotBusy(false);
    }
  }

  return (
    <main className="loginContainer">
      {/* Left Branding Hero Section */}
      <section className="loginHero">
        <div className="heroBranding">
          <div className="heroLogo">
            <span className="heroIcon">🏛</span>
            <span className="heroBrandText">edulens</span>
            <span className="heroPill">K-12 INTAKE HUB</span>
          </div>
          <p className="heroSub">Northstar School Group · Automated Document Pipeline</p>
        </div>

        <div className="heroContent">
          <h1>Intelligent intake. Grounded decisions. Total compliance.</h1>
          <p className="heroDesc">
            Streamline K-12 admissions, report card verification, guardianship consent, and intervention records.
            AI extraction accelerates processing while authorised human reviewers retain authoritative control.
          </p>

          <div className="heroFeatures">
            <div className="featureBadge">
              <span className="featIcon">🛡</span>
              <div>
                <strong>PII &amp; Safeguarding</strong>
                <small>Least-privilege isolation &amp; SHA-256 audit</small>
              </div>
            </div>
            <div className="featureBadge">
              <span className="featIcon">✦</span>
              <div>
                <strong>Grounded Gemini OCR</strong>
                <small>Page-level evidence citations &amp; confidence</small>
              </div>
            </div>
            <div className="featureBadge">
              <span className="featIcon">✓</span>
              <div>
                <strong>Cross-Document Checks</strong>
                <small>Discrepancy and expiration detection</small>
              </div>
            </div>
          </div>
        </div>

        <div className="heroFooter">
          <span>Enterprise Grade · ISO 27001 &amp; FERPA Aligned · Antigravity AI Engine</span>
        </div>
      </section>

      {/* Right Sign-in Form Section */}
      <section className="loginFormSection">
        <div className="loginCard">
          <div className="cardHeader">
            <h2>Welcome back</h2>
            <p className="muted">Sign in to your authorized school workspace</p>
          </div>

          {error && <div className="loginAlert error">{error}</div>}

          <form onSubmit={submit} className="formElement">
            <label className="formLabel">
              Institutional Email
              <input
                type="email"
                className="formInput"
                placeholder="name@school.demo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>

            <label className="formLabel">
              Password
              <div className="passwordField">
                <input
                  type={showPassword ? "text" : "password"}
                  className="formInput passwordInput"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="togglePasswordBtn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <div className="formOptions">
              <label className="rememberMeLabel">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember institutional account</span>
              </label>

              <button
                type="button"
                className="linkBtn forgotLink"
                onClick={() => {
                  setForgotEmail(email);
                  setShowForgotModal(true);
                }}
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" className="loginSubmitBtn" disabled={busy}>
              {busy ? "Authenticating…" : "Sign In to Workspace →"}
            </button>
          </form>

          {/* Quick Demo Role Presets */}
          <div className="demoPresetsBlock">
            <span className="demoTitle">Quick Demo Personas (Select to autofill):</span>
            <div className="demoButtonsGrid">
              <button
                type="button"
                className={`demoBtn ${email === "applicant@school.demo" ? "selected" : ""}`}
                onClick={() => selectDemoRole("applicant@school.demo")}
              >
                <strong>Applicant</strong>
                <small>Pranavi</small>
              </button>
              <button
                type="button"
                className={`demoBtn ${email === "reviewer@school.demo" ? "selected" : ""}`}
                onClick={() => selectDemoRole("reviewer@school.demo")}
              >
                <strong>Reviewer</strong>
                <small>Jordan Lee</small>
              </button>
              <button
                type="button"
                className={`demoBtn ${email === "supervisor@school.demo" ? "selected" : ""}`}
                onClick={() => selectDemoRole("supervisor@school.demo")}
              >
                <strong>Supervisor</strong>
                <small>Taylor Morgan</small>
              </button>
              <button
                type="button"
                className={`demoBtn ${email === "admin@school.demo" ? "selected" : ""}`}
                onClick={() => selectDemoRole("admin@school.demo")}
              >
                <strong>Admin</strong>
                <small>Avery Patel</small>
              </button>
            </div>
            <p className="demoHint">All demo accounts use password: <code>Demo@123</code></p>
          </div>
        </div>
      </section>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="modalOverlay" onClick={() => setShowForgotModal(false)}>
          <div className="modalContainer" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h3>Reset Password</h3>
              <button className="modalCloseBtn" onClick={() => setShowForgotModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleForgotPassword} className="modalBody">
              <p className="modalDesc">
                Enter your registered school email address. If an account is found, an authorized recovery link and one-time token will be generated.
              </p>
              {forgotMessage && <div className="loginAlert info">{forgotMessage}</div>}
              <label className="formLabel">
                Account Email
                <input
                  type="email"
                  className="formInput"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="user@school.demo"
                  required
                />
              </label>
              <div className="modalFooter">
                <button
                  type="button"
                  className="btnSecondary"
                  onClick={() => setShowForgotModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btnPrimary" disabled={forgotBusy}>
                  {forgotBusy ? "Sending…" : "Send Reset Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
