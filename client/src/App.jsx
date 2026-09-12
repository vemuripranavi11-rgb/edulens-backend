import { useEffect, useState } from "react";
import { api, clearSession } from "./services/api";

import Sidebar from "./components/Sidebar";
import TopNav from "./components/TopNav";
import { Loading } from "./components/UI";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import IntakePage from "./pages/IntakePage";
import CasesPage from "./pages/CasesPage";
import ExceptionsPage from "./pages/ExceptionsPage";
import ExtractionPage from "./pages/ExtractionPage";
import ValidationPage from "./pages/ValidationPage";
import SummariesPage from "./pages/SummariesPage";
import ReportsPage from "./pages/ReportsPage";
import NotificationsPage from "./pages/NotificationsPage";
import UsersPage from "./pages/UsersPage";
import AdministrationPage from "./pages/AdministrationPage";

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("Dashboard");
  const [selectedCaseId, setSelectedCaseId] = useState(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Check whether user is already logged in
  useEffect(() => {
    const checkSession = async () => {
      const savedUser = localStorage.getItem("user");
      const token = localStorage.getItem("token");

      if (!token || !savedUser) {
        setReady(true);
        return;
      }

      try {
        await api("/api/v1/dashboard");
        const parsed = JSON.parse(savedUser);
        setUser(parsed);

        // Role-based initial page routing
        if (parsed.role === "Applicant") {
          setPage("Intake");
        } else if (parsed.role === "Supervisor") {
          setPage("Dashboard");
        } else {
          setPage("Dashboard");
        }
      } catch (error) {
        console.error("Session verification failed:", error);
        clearSession();
        setUser(null);
      } finally {
        setReady(true);
      }
    };

    checkSession();
  }, []);

  // Close sidebar on page navigate (for mobile)
  const go = (nextPage, id) => {
    setPage(nextPage);
    setSidebarOpen(false);
    if (id) {
      setSelectedCaseId(id);
    }
  };

  // Show loading screen while checking login
  if (!ready) {
    return <Loading label="Initializing Edulens K-12 Hub…" />;
  }

  // Show login page when user is not logged in
  if (!user) {
    return (
      <LoginPage
        onLogin={(loggedInUser) => {
          setUser(loggedInUser);
          if (loggedInUser.role === "Applicant") {
            setPage("Intake");
          } else if (loggedInUser.role === "Supervisor") {
            setPage("Dashboard");
          } else if (loggedInUser.role === "Compliance Admin") {
            setPage("Dashboard");
          } else {
            setPage("Cases");
          }
        }}
      />
    );
  }

  const handleSignOut = () => {
    clearSession();
    setUser(null);
    setPage("Dashboard");
    setSelectedCaseId(undefined);
    setSidebarOpen(false);
  };

  // The 12 Application Pages Map
  const pages = {
    Dashboard: <DashboardPage go={go} user={user} />,
    Intake: <IntakePage go={go} user={user} />,
    Cases: <CasesPage selected={selectedCaseId} go={go} user={user} />,
    Exceptions: <ExceptionsPage user={user} go={go} />,
    Extraction: <ExtractionPage selectedCaseId={selectedCaseId} go={go} user={user} />,
    Validation: <ValidationPage selectedCaseId={selectedCaseId} go={go} user={user} />,
    Summaries: <SummariesPage selectedCaseId={selectedCaseId} go={go} user={user} />,
    Reports: <ReportsPage user={user} />,
    Notifications: <NotificationsPage user={user} go={go} />,
    Users: <UsersPage user={user} />,
    Administration: <AdministrationPage user={user} />
  };

  return (
    <div className="app">
      <Sidebar
        page={page}
        setPage={setPage}
        user={user}
        onSignOut={handleSignOut}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="mainWrapper">
        <TopNav
          user={user}
          setUser={setUser}
          setPage={setPage}
          onSignOut={handleSignOut}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
        />

        <main className="content">
          {pages[page] || <DashboardPage go={go} user={user} />}
        </main>
      </div>
    </div>
  );
}