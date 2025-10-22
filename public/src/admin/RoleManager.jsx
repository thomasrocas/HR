import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';

const ALL_ROLES = ['admin', 'manager', 'viewer', 'trainee', 'auditor'];
const MANAGER_EDITABLE_ROLES = ['viewer', 'trainee'];

const createStatus = () => ({ message: '', error: '' });

function normalizeRoles(list = []) {
  return Array.from(new Set(list)).sort();
}

export default function RoleManager() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [generalError, setGeneralError] = useState('');

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');

  const [programs, setPrograms] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [programsError, setProgramsError] = useState('');

  const [query, setQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [roleDraft, setRoleDraft] = useState([]);
  const [rolesStatus, setRolesStatus] = useState(createStatus);
  const [savingRoles, setSavingRoles] = useState(false);

  const [selectedProgramIds, setSelectedProgramIds] = useState([]);
  const [preloadStatus, setPreloadStatus] = useState(createStatus);
  const [preloadingPrograms, setPreloadingPrograms] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingMe(true);
    setGeneralError('');
    (async () => {
      try {
        const response = await fetch('/me', { credentials: 'include' });
        if (!response.ok) throw new Error('me');
        const meData = await response.json();
        if (!active) return;
        setCurrentUser(meData);
      } catch (error) {
        if (!active) return;
        setCurrentUser(null);
        setGeneralError('We could not verify your session. Please refresh the page.');
      } finally {
        if (active) setLoadingMe(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const canManage = useMemo(() => {
    const roles = currentUser?.roles || [];
    return roles.some(role => role === 'admin' || role === 'manager');
  }, [currentUser]);

  const isAdmin = useMemo(() => Boolean(currentUser?.roles?.includes('admin')), [currentUser]);
  const isManager = useMemo(() => Boolean(currentUser?.roles?.includes('manager')), [currentUser]);
  const managerOnly = isManager && !isAdmin;

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await fetch('/rbac/users', { credentials: 'include' });
      if (!response.ok) throw new Error('users');
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('users');
      setUsers(
        data.map(user => ({
          ...user,
          roles: Array.isArray(user.roles) ? user.roles : [],
        })),
      );
      setUsersError('');
      return true;
    } catch (_error) {
      setUsers([]);
      setUsersError('Unable to load users. Please try again.');
      return false;
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchPrograms = useCallback(async () => {
    setProgramsLoading(true);
    try {
      const response = await fetch('/programs', { credentials: 'include' });
      if (!response.ok) throw new Error('programs');
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('programs');
      setPrograms(data);
      setProgramsError('');
      return true;
    } catch (_error) {
      setPrograms([]);
      setProgramsError('Unable to load programs. Preloading will be unavailable.');
      return false;
    } finally {
      setProgramsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser || !canManage) return;
    let active = true;
    (async () => {
      const [usersOk, programsOk] = await Promise.all([fetchUsers(), fetchPrograms()]);
      if (!active) return;
      if (usersOk && programsOk) {
        setGeneralError('');
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUser, canManage, fetchUsers, fetchPrograms]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter(user => {
      const name = (user.full_name || user.name || '').toLowerCase();
      const username = (user.username || user.email || '').toLowerCase();
      return name.includes(term) || username.includes(term);
    });
  }, [users, query]);

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId('');
      return;
    }
    const stillSelected = users.some(user => user.id === selectedUserId);
    if (!stillSelected) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId]);

  const selectedUser = useMemo(
    () => users.find(user => user.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  useEffect(() => {
    if (selectedUser) {
      setRoleDraft(Array.isArray(selectedUser.roles) ? selectedUser.roles : []);
    } else {
      setRoleDraft([]);
    }
    setRolesStatus(createStatus());
    setSelectedProgramIds([]);
    setPreloadStatus(createStatus());
  }, [selectedUser]);

  const sanitizedDraft = useMemo(() => {
    const base = Array.isArray(roleDraft) ? roleDraft : [];
    const unique = Array.from(new Set(base));
    return managerOnly ? unique.filter(role => MANAGER_EDITABLE_ROLES.includes(role)) : unique;
  }, [roleDraft, managerOnly]);

  const comparableCurrentRoles = useMemo(() => {
    if (!selectedUser) return [];
    const base = Array.isArray(selectedUser.roles) ? selectedUser.roles : [];
    const filtered = managerOnly ? base.filter(role => MANAGER_EDITABLE_ROLES.includes(role)) : base;
    return Array.from(new Set(filtered));
  }, [selectedUser, managerOnly]);

  const hasRoleChanges = useMemo(() => {
    if (!selectedUser) return false;
    return (
      normalizeRoles(sanitizedDraft).join('|') !==
      normalizeRoles(comparableCurrentRoles).join('|')
    );
  }, [selectedUser, sanitizedDraft, comparableCurrentRoles]);

  const sortedPrograms = useMemo(() => {
    return [...programs].sort((a, b) => {
      const labelA = (a.title || a.name || '').toLowerCase();
      const labelB = (b.title || b.name || '').toLowerCase();
      return labelA.localeCompare(labelB);
    });
  }, [programs]);

  const handleRefreshUsers = async () => {
    await fetchUsers();
  };

  const handleToggleRole = role => {
    if (!selectedUser) return;
    if (managerOnly && !MANAGER_EDITABLE_ROLES.includes(role)) return;
    setRoleDraft(prev => (prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]));
  };

  const handleSaveRoles = async () => {
    if (!selectedUser || !hasRoleChanges) return;
    setSavingRoles(true);
    setRolesStatus(createStatus());
    try {
      const nextRoles = managerOnly
        ? sanitizedDraft.filter(role => MANAGER_EDITABLE_ROLES.includes(role))
        : sanitizedDraft;
      const response = await fetch(`/rbac/users/${selectedUser.id}/roles`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: nextRoles }),
      });
      if (!response.ok) throw new Error('save');
      setUsers(prev =>
        prev.map(user => (user.id === selectedUser.id ? { ...user, roles: nextRoles } : user)),
      );
      setRolesStatus({
        message: 'Roles updated successfully.',
        error: '',
      });
    } catch (_error) {
      setRolesStatus({
        message: '',
        error: 'Unable to update roles. Please try again.',
      });
    } finally {
      setSavingRoles(false);
    }
  };

  const handleToggleProgram = programId => {
    setSelectedProgramIds(prev =>
      prev.includes(programId) ? prev.filter(id => id !== programId) : [...prev, programId],
    );
  };

  const handlePreloadPrograms = async () => {
    if (!selectedUser) return;
    if (!selectedProgramIds.length) {
      setPreloadStatus({
        message: '',
        error: 'Select at least one program to preload.',
      });
      return;
    }
    setPreloadingPrograms(true);
    setPreloadStatus(createStatus());
    try {
      for (const programId of selectedProgramIds) {
        const response = await fetch(
          `/rbac/users/${selectedUser.id}/programs/${encodeURIComponent(programId)}/instantiate`,
          {
            method: 'POST',
            credentials: 'include',
          },
        );
        if (!response.ok) throw new Error('preload');
      }
      setPreloadStatus({
        message: `Queued ${selectedProgramIds.length} program${
          selectedProgramIds.length === 1 ? '' : 's'
        } for ${selectedUser.full_name || selectedUser.username || 'this user'}.`,
        error: '',
      });
      setSelectedProgramIds([]);
    } catch (_error) {
      setPreloadStatus({
        message: '',
        error: 'Unable to preload programs. Please try again.',
      });
    } finally {
      setPreloadingPrograms(false);
    }
  };

  if (loadingMe) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-alt text-ink-muted">
        Loading role manager…
      </div>
    );
  }

  if (generalError && !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-alt px-4">
        <div className="panel max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-muted">{generalError}</p>
        </div>
      </div>
    );
  }

  if (currentUser && !canManage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-alt px-4">
        <div className="panel max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold text-ink">Access denied</h1>
          <p className="mt-2 text-sm text-ink-muted">
            You need an admin or manager role to manage team permissions.
          </p>
        </div>
      </div>
    );
  }

  const errors = [usersError, programsError].filter(Boolean);

  return (
    <div className="min-h-screen bg-surface-alt text-ink">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Role &amp; Program Manager</h1>
            <p className="text-sm text-ink-muted">
              Manage permissions and preload programs for your team.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/admin/users" className="btn btn-outline text-sm">
              Users
            </a>
            <a href="/admin/roles" className="btn btn-primary text-sm">
              Roles &amp; Programs
            </a>
            <a
              href="/admin/program-template-manager.html"
              className="btn btn-outline text-sm"
            >
              Program Templates
            </a>
          </div>
        </header>

        {errors.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {errors.map((msg, idx) => (
              <p key={idx} className={idx > 0 ? 'mt-1' : undefined}>
                {msg}
              </p>
            ))}
          </div>
        )}

        <section className="panel p-6 space-y-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[240px] flex-1 space-y-2">
              <label className="label-text" htmlFor="role-manager-search">
                Find user
              </label>
              <input
                id="role-manager-search"
                className="form-field"
                type="search"
                placeholder="Search by name or username…"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <span className="label-text">Selected user</span>
              <div className="text-sm font-medium">
                {selectedUser
                  ? `${selectedUser.full_name || selectedUser.username || '—'}${
                      selectedUser.username ? ` (${selectedUser.username})` : ''
                    }`
                  : '—'}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleRefreshUsers}
                disabled={usersLoading}
              >
                {usersLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="panel-section overflow-hidden">
              <div className="max-h-[26rem] overflow-y-auto">
                {usersLoading && !users.length ? (
                  <div className="px-4 py-6 text-sm text-ink-muted">Loading users…</div>
                ) : filteredUsers.length ? (
                  filteredUsers.map(user => {
                    const isActive = user.id === selectedUserId;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => setSelectedUserId(user.id)}
                        className={`flex w-full flex-col gap-1 border-b border-border/60 px-4 py-3 text-left text-sm transition-colors last:border-b-0 ${
                          isActive
                            ? 'border-l-4 border-brand-primary bg-surface font-semibold shadow-sm'
                            : 'hover:bg-surface'
                        }`}
                      >
                        <span>{user.full_name || user.username || '—'}</span>
                        <span className="text-xs text-ink-muted">
                          {user.username || user.email || '—'}
                        </span>
                        <span className="text-xs text-ink-muted">
                          Roles: {user.roles && user.roles.length ? user.roles.join(', ') : 'None assigned'}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-4 py-6 text-sm text-ink-muted">
                    {query ? 'No users match your search.' : 'No users available.'}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="panel-section space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Roles</h2>
                    <p className="mt-1 text-xs text-ink-muted">
                      {managerOnly
                        ? 'Managers can only toggle viewer or trainee roles.'
                        : 'Select the roles to assign to this user.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveRoles}
                    disabled={!selectedUser || savingRoles || !hasRoleChanges}
                  >
                    {savingRoles ? 'Saving…' : 'Save roles'}
                  </button>
                </div>

                {selectedUser ? (
                  <div className="flex flex-wrap gap-3">
                    {ALL_ROLES.map(role => {
                      const disabled = managerOnly && !MANAGER_EDITABLE_ROLES.includes(role);
                      return (
                        <label
                          key={role}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                            disabled ? 'opacity-50' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border text-brand-primary focus:ring-focus"
                            checked={roleDraft.includes(role)}
                            onChange={() => handleToggleRole(role)}
                            disabled={disabled}
                          />
                          <span className="capitalize">{role}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
                    Select a user to manage roles.
                  </div>
                )}

                {rolesStatus.message && (
                  <div className="text-sm text-brand-primary">{rolesStatus.message}</div>
                )}
                {rolesStatus.error && (
                  <div className="text-sm text-red-600">{rolesStatus.error}</div>
                )}
              </div>

              <div className="panel-section space-y-4 p-4">
                <div>
                  <h2 className="text-sm font-semibold">Preload programs</h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    Queue programs for the selected user to start immediately.
                  </p>
                </div>
                {programsLoading && !programs.length ? (
                  <div className="text-sm text-ink-muted">Loading programs…</div>
                ) : sortedPrograms.length ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {sortedPrograms.map(program => {
                      const id = program.program_id || program.id;
                      const label = program.title || program.name || id;
                      return (
                        <label
                          key={id}
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-alt"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border text-brand-primary focus:ring-focus"
                            value={id}
                            checked={selectedProgramIds.includes(id)}
                            onChange={() => handleToggleProgram(id)}
                            disabled={!selectedUser}
                          />
                          <span className="truncate" title={label}>
                            {label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
                    No programs available to preload.
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handlePreloadPrograms}
                    disabled={
                      !selectedUser ||
                      !selectedProgramIds.length ||
                      preloadingPrograms ||
                      Boolean(programsError)
                    }
                  >
                    {preloadingPrograms ? 'Preloading…' : 'Preload selected programs'}
                  </button>
                  {preloadStatus.message && (
                    <span className="text-sm text-brand-primary">{preloadStatus.message}</span>
                  )}
                  {preloadStatus.error && (
                    <span className="text-sm text-red-600">{preloadStatus.error}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// Mount automatically when loaded directly
if (typeof document !== 'undefined') {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    const root = ReactDOM.createRoot(rootEl);
    root.render(<RoleManager />);
  }
}