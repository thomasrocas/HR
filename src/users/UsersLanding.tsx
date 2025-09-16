import React, { useEffect, useMemo, useState } from 'react';
import {
  getUsers,
  createUser,
  updateUserRoles,
  assignPrograms,
  deactivateUser,
  reactivateUser,
  archiveUser,
  seed,
} from '../api';
import { can, hasRole, Role, User } from '../rbac';

const ALL_ROLES: Role[] = ['admin', 'manager', 'viewer', 'trainee'];
const MANAGER_EDITABLE_ROLES: Role[] = ['viewer', 'trainee'];

const sortRoles = (roles: Role[]): Role[] =>
  ALL_ROLES.filter(role => roles.includes(role));

const ROLE_DETAILS: Record<Role, { label: string; description: string }> = {
  admin: {
    label: 'Admin',
    description: 'Full access to user, program, and template management.',
  },
  manager: {
    label: 'Manager',
    description: 'Can manage programs and assignments for their teams.',
  },
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to dashboards and records.',
  },
  trainee: {
    label: 'Trainee',
    description: 'Can view their own onboarding tasks.',
  },
};

/**
 * Landing page for managing users.
 * Provides search, filters, table, and modals/drawers for user lifecycle actions.
 */
export default function UsersLanding({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const canManageRoles = can(currentUser, 'manageRoles', 'user');
  const managerOnly = hasRole(currentUser, 'manager') && !hasRole(currentUser, 'admin');

  const [roleModalUser, setRoleModalUser] = useState<User | null>(null);
  const [roleModalRoles, setRoleModalRoles] = useState<Role[]>([]);
  const [roleModalError, setRoleModalError] = useState('');
  const [isSavingRoles, setIsSavingRoles] = useState(false);

  const selectedUserName = useMemo(() => {
    if (!roleModalUser) return '';
    return roleModalUser.name || roleModalUser.email || 'this user';
  }, [roleModalUser]);

  const rolesChanged = useMemo(() => {
    if (!roleModalUser) return false;
    const originalRoles = new Set<Role>(roleModalUser.roles);
    const selectedRoles = new Set<Role>(roleModalRoles);
    return ALL_ROLES.some(
      role => selectedRoles.has(role) !== originalRoles.has(role),
    );
  }, [roleModalRoles, roleModalUser]);

  useEffect(() => {
    getUsers({ query, role: roleFilter, status: statusFilter }).then(r => setUsers(r.data));
  }, [query, roleFilter, statusFilter]);

  const openRoleModal = (user: User) => {
    if (!canManageRoles) return;
    setRoleModalUser(user);
    setRoleModalRoles(sortRoles(user.roles));
    setRoleModalError('');
  };

  const closeRoleModal = () => {
    if (isSavingRoles) return;
    setRoleModalUser(null);
    setRoleModalRoles([]);
    setRoleModalError('');
  };

  const handleRoleToggle = (role: Role) => {
    if (!roleModalUser) return;
    if (managerOnly && !MANAGER_EDITABLE_ROLES.includes(role)) return;
    setRoleModalRoles(prev => {
      const next = prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role];
      return sortRoles(next);
    });
  };

  const handleRolesSave = async () => {
    if (!roleModalUser) return;
    setIsSavingRoles(true);
    setRoleModalError('');
    try {
      const editableSelection = managerOnly
        ? roleModalRoles.filter(role => MANAGER_EDITABLE_ROLES.includes(role))
        : roleModalRoles;
      const lockedRoles = managerOnly
        ? roleModalUser.roles.filter(role => !MANAGER_EDITABLE_ROLES.includes(role))
        : [];
      const combinedRoles = managerOnly
        ? [...editableSelection, ...lockedRoles]
        : editableSelection;
      const rolesToPersist = sortRoles(Array.from(new Set<Role>(combinedRoles)));
      await updateUserRoles(roleModalUser.id, rolesToPersist);
      setUsers(prev =>
        prev.map(user =>
          user.id === roleModalUser.id ? { ...user, roles: rolesToPersist } : user,
        ),
      );
      setRoleModalUser(null);
      setRoleModalRoles([]);
    } catch (_err) {
      setRoleModalError('Failed to update roles. Please try again.');
    } finally {
      setIsSavingRoles(false);
    }
  };

  /* ------------------------- Modal handlers ------------------------- */
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', roles: ['viewer'] as Role[] });

  const handleInvite = async () => {
    await createUser({ ...newUser, status: 'pending' });
    setShowCreate(false);
    getUsers({}).then(r => setUsers(r.data));
    alert('Invite sent');
  };

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Manage user accounts, roles, and program assignments.
        </p>
        <div className="flex gap-6 text-sm">
          <span>Active: {users.filter(u => u.status === 'active').length}</span>
          <span>Pending: {users.filter(u => u.status === 'pending').length}</span>
          <span>Suspended: {users.filter(u => u.status === 'suspended').length}</span>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="border rounded-md px-3 py-2 text-sm"
          placeholder="Search name/email"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <select
          className="border rounded-md px-2 py-2 text-sm"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          <option>admin</option>
          <option>manager</option>
          <option>trainee</option>
          <option>viewer</option>
        </select>
        <select
          className="border rounded-md px-2 py-2 text-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>

        {can(currentUser, 'create', 'user') && (
          <button
            onClick={() => setShowCreate(true)}
            className="ml-auto bg-[var(--brand-primary)] text-white px-4 py-2 rounded-md"
          >
            Add User
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead className="bg-[var(--surface-alt)]">
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Status</th>
              <th>Programs</th>
              <th>Last Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-[var(--text-muted)]">
                  No users. {can(currentUser, 'create', 'user') ? 'Create one?' : ''}
                </td>
              </tr>
            )}
            {users.map(u => (
              <tr key={u.id} className="border-t border-[var(--border)]">
                <td className="whitespace-nowrap">{u.name}</td>
                <td>{u.email}</td>
                <td className="space-x-1">
                  {u.roles.map(r => (
                    <span key={r} className={`badge badge-${r}`}>
                      {r}
                    </span>
                  ))}
                </td>
                <td>{u.status}</td>
                <td className="space-x-1">
                  {(u as any).programs?.map((p: string) => (
                    <span key={p} className="badge bg-[var(--brand-accent)] text-white">
                      {p}
                    </span>
                  ))}
                </td>
                <td>{(u as any).lastActive ?? '--'}</td>
                <td className="flex gap-2">
                  <button className="text-sm underline" disabled={!can(currentUser, 'update', 'user')}>
                    Edit
                  </button>
                  {canManageRoles && (
                    <button className="text-sm underline" onClick={() => openRoleModal(u)}>
                      Roles
                    </button>
                  )}
                  {can(currentUser, 'assignPrograms', 'user') && (
                    <button className="text-sm underline">Assign</button>
                  )}
                  {u.status !== 'suspended' && can(currentUser, 'deactivate', 'user') && (
                    <button className="text-sm underline" onClick={() => deactivateUser(u.id, '')}>
                      Deactivate
                    </button>
                  )}
                  {u.status === 'suspended' && can(currentUser, 'reactivate', 'user') && (
                    <button className="text-sm underline" onClick={() => reactivateUser(u.id)}>
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Invite Drawer */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/30 flex justify-end"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-96 bg-white h-full p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Invite User</h2>
            <input
              className="w-full border rounded-md px-3 py-2"
              placeholder="Full name"
              value={newUser.name}
              onChange={e => setNewUser({ ...newUser, name: e.target.value })}
            />
            <input
              className="w-full border rounded-md px-3 py-2"
              placeholder="Email"
              value={newUser.email}
              onChange={e => setNewUser({ ...newUser, email: e.target.value })}
            />
            <label className="block text-sm font-medium">Role</label>
            <select
              className="w-full border rounded-md px-2 py-2"
              value={newUser.roles[0]}
              onChange={e => setNewUser({ ...newUser, roles: [e.target.value as Role] })}
            >
              <option>viewer</option>
              <option>trainee</option>
              <option>manager</option>
              <option>admin</option>
            </select>
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-2 text-sm" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button
                className="px-3 py-2 text-sm bg-[var(--brand-primary)] text-white rounded-md"
                onClick={handleInvite}
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {roleModalUser && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roles-dialog-title"
          onClick={closeRoleModal}
        >
          <div
            className="w-full max-w-lg bg-white rounded-lg shadow-xl p-6 space-y-5"
            onClick={e => e.stopPropagation()}
          >
            <header className="space-y-1">
              <h2 id="roles-dialog-title" className="text-lg font-semibold">
                Manage roles
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Update access for {selectedUserName}.
                {managerOnly
                  ? ' Managers can only assign viewer or trainee roles.'
                  : ''}
              </p>
            </header>

            <fieldset className="space-y-3">
              <legend className="sr-only">Roles</legend>
              {ALL_ROLES.map(role => {
                const disabled =
                  (managerOnly && !MANAGER_EDITABLE_ROLES.includes(role)) || isSavingRoles;
                const detail = ROLE_DETAILS[role];
                return (
                  <label
                    key={role}
                    className={`flex items-start justify-between gap-4 rounded-md border border-[var(--border)] px-3 py-2 text-sm ${
                      disabled ? 'opacity-60' : ''
                    }`}
                  >
                    <span>
                      <span className="block font-medium">{detail.label}</span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        {detail.description}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={roleModalRoles.includes(role)}
                      onChange={() => handleRoleToggle(role)}
                      disabled={disabled}
                    />
                  </label>
                );
              })}
            </fieldset>

            {roleModalError && (
              <div className="text-sm text-red-600" role="alert">
                {roleModalError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-2 text-sm"
                onClick={closeRoleModal}
                disabled={isSavingRoles}
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 text-sm bg-[var(--brand-primary)] text-white rounded-md disabled:opacity-60"
                onClick={handleRolesSave}
                disabled={!rolesChanged || isSavingRoles}
              >
                {isSavingRoles ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

UsersLanding.defaultProps = {
  currentUser: seed.users[0],
};
