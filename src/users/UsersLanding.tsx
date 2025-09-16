import React, { useEffect, useState } from 'react';
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

/**
 * Landing page for managing users.
 * Provides search, filters, table, and modals/drawers for user lifecycle actions.
 */
export default function UsersLanding({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    getUsers({ query, role: roleFilter, status: statusFilter }).then(r => setUsers(r.data));
  }, [query, roleFilter, statusFilter]);

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
                  {can(currentUser, 'manageRoles', 'user') && (
                    <button className="text-sm underline">Roles</button>
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
    </div>
  );
}

UsersLanding.defaultProps = {
  currentUser: seed.users[0],
};
