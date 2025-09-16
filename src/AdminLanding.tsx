import React, { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import UsersLanding from './users/UsersLanding';
import ProgramsLanding from './programs/ProgramsLanding';
import TemplatesLanding from './templates/TemplatesLanding';
import { can, User } from './rbac';

type AdminTab = 'users' | 'programs' | 'templates';

type TabConfig = {
  id: AdminTab;
  label: string;
  canView: (user: User) => boolean;
};

const TAB_CONFIG: TabConfig[] = [
  {
    id: 'users',
    label: 'Manage Users',
    canView: user => can(user, 'read', 'user'),
  },
  {
    id: 'programs',
    label: 'Manage Programs',
    canView: user => can(user, 'read', 'program'),
  },
  {
    id: 'templates',
    label: 'Manage Templates',
    canView: user => can(user, 'read', 'template'),
  },
];

const getRequestedTab = (search: string): AdminTab | null => {
  if (!search) return null;
  const param = new URLSearchParams(search).get('tab');
  return param === 'users' || param === 'programs' || param === 'templates'
    ? param
    : null;
};

export default function AdminLanding({ currentUser }: { currentUser: User }): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();

  const availableTabs = useMemo(
    () => TAB_CONFIG.filter(tab => tab.canView(currentUser)),
    [currentUser],
  );
  const availableIds = availableTabs.map(tab => tab.id);

  const requestedTab = useMemo<AdminTab | null>(
    () => getRequestedTab(location.search),
    [location.search],
  );

  const activeTab: AdminTab | null = useMemo(() => {
    if (requestedTab && availableIds.includes(requestedTab)) return requestedTab;
    return availableIds[0] ?? null;
  }, [availableIds, requestedTab]);

  useEffect(() => {
    if (!activeTab) return;
    if (requestedTab === activeTab) return;

    const params = new URLSearchParams(location.search);
    params.set('tab', activeTab);
    const query = params.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ''}`, { replace: true });
  }, [activeTab, requestedTab, location.pathname, location.search, navigate]);

  const handleTabChange = useCallback(
    (tab: AdminTab) => {
      if (tab === activeTab) return;
      const params = new URLSearchParams(location.search);
      params.set('tab', tab);
      const query = params.toString();
      navigate(`${location.pathname}${query ? `?${query}` : ''}`);
    },
    [activeTab, location.pathname, location.search, navigate],
  );

  if (!activeTab) {
    return (
      <div className="p-8">
        <div className="card p-6 text-center text-[var(--text-muted)]">
          You do not have access to any admin tools.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Admin Console</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Manage users, programs, and templates for the orientation platform.
        </p>
      </header>

      <nav role="tablist" aria-label="Admin management areas">
        <div className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 shadow-sm">
          {availableTabs.map(tab => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                  isActive
                    ? 'bg-[var(--brand-primary)] text-white shadow'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      <section>
        {activeTab === 'users' && <UsersLanding currentUser={currentUser} />}
        {activeTab === 'programs' && (
          <ProgramsLanding key="programs" currentUser={currentUser} />
        )}
        {activeTab === 'templates' && (
          <TemplatesLanding key="templates" currentUser={currentUser} />
        )}
      </section>
    </div>
  );
}
