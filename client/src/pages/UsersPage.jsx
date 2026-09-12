import { useEffect, useState } from "react";
import { api } from "../services/api";
import { Header, Notice, Badge, Modal, Empty, Loading, StatCard } from "../components/UI";

export default function UsersPage({ user }) {
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    role: "Reviewer",
    campus: "Central Campus",
    password: "Demo@123"
  });
  const [creating, setCreating] = useState(false);

  // Edit User Modal State
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    role: "Reviewer",
    campus: "Central Campus",
    active: 1
  });
  const [updating, setUpdating] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await api(`/api/v1/users?q=${encodeURIComponent(searchQuery)}&role=${filterRole}`);
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || "Failed to load user directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [searchQuery, filterRole]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api("/api/v1/users", {
        method: "POST",
        body: JSON.stringify(createForm)
      });
      setMessage(`User ${createForm.email} created with role ${createForm.role}.`);
      setShowCreateModal(false);
      setCreateForm({
        name: "",
        email: "",
        role: "Reviewer",
        campus: "Central Campus",
        password: "Demo@123"
      });
      await loadUsers();
    } catch (err) {
      alert("Failed to create user: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editUser) return;
    setUpdating(true);
    try {
      await api(`/api/v1/users/${editUser.id}`, {
        method: "PATCH",
        body: JSON.stringify(editForm)
      });
      setMessage(`Updated account for ${editUser.email}.`);
      setEditUser(null);
      await loadUsers();
    } catch (err) {
      alert("Failed to update user: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const toggleUserActive = async (target) => {
    const nextState = target.active ? 0 : 1;
    try {
      await api(`/api/v1/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: nextState })
      });
      setMessage(`User ${target.email} ${nextState ? "activated" : "deactivated"}.`);
      await loadUsers();
    } catch (err) {
      alert("Status toggle failed: " + err.message);
    }
  };

  const openEditModal = (target) => {
    setEditUser(target);
    setEditForm({
      role: target.role,
      campus: target.campus || "Central Campus",
      active: target.active
    });
  };

  const rolesList = ["Applicant", "Reviewer", "Supervisor", "Compliance Admin"];

  return (
    <div className="pageContainer">
      <Header
        crumb="SECURITY &amp; ACCESS CONTROL / USER MANAGEMENT"
        title="User &amp; Role Management"
        actions={
          <button className="btnPrimary" onClick={() => setShowCreateModal(true)}>
            + Create New User
          </button>
        }
      >
        <p>
          Configure institutional roles (Applicant, Reviewer, Supervisor, Compliance Admin), campus assignment scopes,
          account activation status, and enforce least-privilege security controls.
        </p>
      </Header>

      {message && <Notice type="success">{message}</Notice>}
      {error && <Notice type="error">{error}</Notice>}

      {/* Role Breakdown KPIs */}
      <div className="statsGrid fourCols">
        <StatCard
          label="Total Authorized Users"
          value={users.length}
          subtext="Across Northstar School Group"
          status="blue"
        />
        <StatCard
          label="Reviewers &amp; Staff"
          value={users.filter((u) => u.role === "Reviewer" || u.role === "Supervisor").length}
          subtext="Document evaluation personnel"
          status="green"
        />
        <StatCard
          label="Compliance Administrators"
          value={users.filter((u) => u.role === "Compliance Admin").length}
          subtext="Full system configuration scope"
          status="neutral"
        />
        <StatCard
          label="Access Policy Status"
          value="Enforced"
          subtext="Least-privilege RBAC active"
          status="green"
        />
      </div>

      {/* User Directory Table Card */}
      <section className="panelCard usersTableSection">
        <div className="cardHeaderRow">
          <div>
            <h3>School Staff &amp; Applicant Directory</h3>
            <p className="muted">Manage accounts, assign campus scopes, and review last login activity</p>
          </div>

          <div className="tableFiltersGroup">
            <input
              type="text"
              className="searchInput"
              placeholder="Search user name or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select
              className="filterSelect"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <option value="all">All Roles</option>
              {rolesList.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="customTableWrapper">
          <table className="customTable">
            <thead>
              <tr>
                <th>USER / EMAIL</th>
                <th>ROLE PERMISSION</th>
                <th>CAMPUS ASSIGNMENT</th>
                <th>ACCOUNT STATUS</th>
                <th>LAST SIGN IN</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="emptyTableCell">
                    Loading users directory…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="emptyTableCell">
                    <Empty label="No users found matching query" icon="👥" />
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="userNameCell">
                        <div className="userAvatarSmall">
                          {u.name ? u.name.slice(0, 2).toUpperCase() : "U"}
                        </div>
                        <div>
                          <strong>{u.name}</strong>
                          <small className="muted block">{u.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`roleBadge ${u.role ? u.role.toLowerCase().replace(/\s+/g, "-") : ""}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>{u.campus || "Central Campus"}</td>
                    <td>
                      <span className={`statusPill ${u.active ? "active" : "inactive"}`}>
                        <span className="dot"></span>
                        {u.active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td>
                      {u.last_login ? (
                        new Date(u.last_login).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="tableActionBtns">
                        <button
                          className="btnMini outline"
                          onClick={() => openEditModal(u)}
                          title="Edit user details"
                        >
                          ✎ Edit
                        </button>
                        <button
                          className={`btnMini ${u.active ? "danger" : "primary"}`}
                          onClick={() => toggleUserActive(u)}
                          title={u.active ? "Deactivate account" : "Activate account"}
                        >
                          {u.active ? "Deactivate" : "Activate"}
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

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New User Account"
        footer={
          <>
            <button className="btnSecondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </button>
            <button
              className="btnPrimary"
              onClick={handleCreateUser}
              disabled={creating || !createForm.name || !createForm.email}
            >
              {creating ? "Creating…" : "Create User Account"}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateUser} className="modalForm">
          <label className="fieldLabel">
            Full Name *
            <input
              type="text"
              className="textInput"
              placeholder="e.g. Elena Rostova"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              required
            />
          </label>

          <label className="fieldLabel">
            Institutional Email *
            <input
              type="email"
              className="textInput"
              placeholder="elena@school.demo"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              required
            />
          </label>

          <div className="formRow">
            <label className="fieldLabel">
              Role Authority *
              <select
                className="selectInput"
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              >
                {rolesList.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <label className="fieldLabel">
              Campus Scope *
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
          </div>

          <label className="fieldLabel">
            Initial Temporary Password *
            <input
              type="password"
              className="textInput"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              required
            />
          </label>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={!!editUser}
        onClose={() => setEditUser(null)}
        title={`Edit User: ${editUser?.email}`}
        footer={
          <>
            <button className="btnSecondary" onClick={() => setEditUser(null)}>
              Cancel
            </button>
            <button className="btnPrimary" onClick={handleUpdateUser} disabled={updating}>
              {updating ? "Saving…" : "Save Changes"}
            </button>
          </>
        }
      >
        <form onSubmit={handleUpdateUser} className="modalForm">
          <label className="fieldLabel">
            Role Permission *
            <select
              className="selectInput"
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
            >
              {rolesList.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="fieldLabel">
            Campus Scope *
            <select
              className="selectInput"
              value={editForm.campus}
              onChange={(e) => setEditForm({ ...editForm, campus: e.target.value })}
            >
              <option value="Central Campus">Central Campus</option>
              <option value="North Campus">North Campus</option>
              <option value="West Wing">West Wing</option>
              <option value="South Campus">South Campus</option>
            </select>
          </label>

          <label className="fieldLabel">
            Account Status *
            <select
              className="selectInput"
              value={editForm.active}
              onChange={(e) => setEditForm({ ...editForm, active: Number(e.target.value) })}
            >
              <option value={1}>Active</option>
              <option value={0}>Deactivated (Suspended)</option>
            </select>
          </label>
        </form>
      </Modal>
    </div>
  );
}
