import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getUsers,
  createUser,
  updateUserRoles,
  deactivateUser,
  reactivateUser,
  seed,
} from '../api';
import { can, Role, User } from '../rbac';
import { ALL_ROLES, getActionAvailability, MANAGER_EDITABLE_ROLES } from './actionPermissions';

/**
 * Landing page for managing users.
 * Provides search, filters, table, and modals/drawers for user lifecycle actions.
 */
export default function UsersLanding({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchUsers = useCallback(() => {
    getUsers({ query, role: roleFilter, status: statusFilter }).then(r => setUsers(r.data));
  }, [query, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /* ------------------------- Modal handlers ------------------------- */
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', roles: ['viewer'] as Role[] });

  const [roleEditorUser, setRoleEditorUser] = useState<User | null>(null);
  const [roleDraft, setRoleDraft] = useState<Role[]>([]);
  const [roleEditorMeta, setRoleEditorMeta] = useState<{
    toggleable: Role[];
    locked: Role[];
    managerOnly: boolean;
  }>({ toggleable: [], locked: [], managerOnly: false });
  const [roleError, setRoleError] = useState('');

  const globalActions = useMemo(() => getActionAvailability(currentUser), [currentUser]);

  useEffect(() => {
    if (!globalActions.canInvite) {
      setShowCreate(false);
    }
  }, [globalActions.canInvite]);

  useEffect(() => {
    if (!globalActions.canManageRoles) {
      setRoleEditorUser(null);
    }
  }, [globalActions.canManageRoles]);

  const handleOpenCreate = () => {
    if (!globalActions.canInvite) return;
    setNewUser({ name: '', email: '', roles: ['viewer'] as Role[] });
    setShowCreate(true);
  };

  const handleInvite = async () => {
    if (!globalActions.canInvite) return;
    await createUser({ ...newUser, status: 'pending' });
    setShowCreate(false);
    fetchUsers();
    alert('Invite sent');
  };

  const handleOpenRoles = (user: User) => {
    if (!globalActions.canManageRoles) return;
    const availability = getActionAvailability(currentUser, user);
    setRoleEditorUser(user);
    setRoleDraft(user.roles);
    setRoleEditorMeta({
      toggleable: availability.toggleableRoles,
      locked: availability.lockedRoles,
      managerOnly: availability.managerOnly,
    });
    setRoleError('');
  };

  const handleToggleRole = (role: Role) => {
    if (!roleEditorUser) return;
    if (!roleEditorMeta.toggleable.includes(role)) return;
    setRoleDraft(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role],
    );
  };

  const handleSaveRoles = async () => {
    if (!roleEditorUser || !globalActions.canManageRoles) return;
    try {
      const allowed = new Set(roleEditorMeta.toggleable);
      const locked = roleEditorMeta.managerOnly ? roleEditorMeta.locked : [];
      const filteredRoles = roleEditorMeta.managerOnly
        ? Array.from(
            new Set([
              ...locked,
              ...roleDraft.filter(role => allowed.has(role)),
            ] as Role[]),
          )
        : roleDraft;
      const updated = await updateUserRoles(roleEditorUser.id, filteredRoles);
      setUsers(prev =>
        prev.map(u => (u.id === updated.id ? { ...u, roles: updated.roles } : u)),
      );
      setRoleEditorUser(null);
    } catch (_err) {
      setRoleError('Failed to update roles. Please try again.');
    }
  };

  const handleCloseRoles = () => {
    setRoleEditorUser(null);
    setRoleError('');
  };

  const handleDeactivate = async (user: User) => {
    if (!can(currentUser, 'deactivate', 'user')) return;
    await deactivateUser(user.id, '');
    setUsers(prev =>
      prev.map(u => (u.id === user.id ? { ...u, status: 'suspended' } : u)),
    );
  };

  const handleReactivate = async (user: User) => {
    if (!can(currentUser, 'reactivate', 'user')) return;
    await reactivateUser(user.id);
    setUsers(prev =>
      prev.map(u => (u.id === user.id ? { ...u, status: 'active' } : u)),
    );
  };

  const handleAssignPrograms = (user: User) => {
    if (!can(currentUser, 'assignPrograms', 'user')) return;
    console.info(`Assign programs for ${user.name}`);
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

        {globalActions.canInvite && (
          <button
            onClick={handleOpenCreate}
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
                  No users. {globalActions.canInvite ? 'Create one?' : ''}
                </td>
              </tr>
            )}
            {users.map(u => {
              const rowActions = getActionAvailability(currentUser, u);
              return (
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
                    <button className="text-sm underline" disabled={!globalActions.canEdit}>
                      Edit
                    </button>
                    {rowActions.canManageRoles && (
                      <button className="text-sm underline" onClick={() => handleOpenRoles(u)}>
                        Roles
                      </button>
                    )}
                    {rowActions.canAssignPrograms && (
                      <button className="text-sm underline" onClick={() => handleAssignPrograms(u)}>
                        Assign
                      </button>
                    )}
                    {rowActions.canDeactivate && (
                      <button className="text-sm underline" onClick={() => handleDeactivate(u)}>
                        Deactivate
                      </button>
                    )}
                    {rowActions.canReactivate && (
                      <button className="text-sm underline" onClick={() => handleReactivate(u)}>
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
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
                disabled={!globalActions.canInvite}
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {roleEditorUser && (
        <div
          className="fixed inset-0 bg-black/30 flex justify-end"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseRoles}
        >
          <div
            className="w-96 bg-white h-full p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Manage Roles</h2>
            {roleEditorMeta.managerOnly && (
              <p className="text-xs text-[var(--text-muted)]">
                Managers may only toggle {MANAGER_EDITABLE_ROLES.join(' or ')} roles. Existing roles remain read only.
              </p>
            )}
            <div className="space-y-2">
              {ALL_ROLES.map(role => {
                const disabled = !roleEditorMeta.toggleable.includes(role);
                return (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={roleDraft.includes(role)}
                      onChange={() => handleToggleRole(role)}
                      disabled={disabled}
                    />
                    <span className="capitalize">{role}</span>
                  </label>
                );
              })}
            </div>
            {roleError && <div className="text-sm text-red-600">{roleError}</div>}
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-2 text-sm" onClick={handleCloseRoles}>
                Cancel
              </button>
              <button
                className="px-3 py-2 text-sm bg-[var(--brand-primary)] text-white rounded-md"
                onClick={handleSaveRoles}
                disabled={!globalActions.canManageRoles}
              >
                Save
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
