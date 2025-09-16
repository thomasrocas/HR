import React, { useState, useEffect } from 'react';
import {
  getPrograms,
  createProgram,
  publishProgram,
  deprecateProgram,
  deleteProgram,
  restoreProgram,
  getTemplates,
} from '../api';
import { can, User } from '../rbac';

export default function ProgramsLanding({ currentUser }: { currentUser: User }) {
  const [tab, setTab] = useState<'programs' | 'templates' | 'assignments'>(() => {
    if (typeof window === 'undefined') return 'programs';
    const initialTab = new URLSearchParams(window.location.search).get('tab');
    return initialTab === 'templates' || initialTab === 'assignments' || initialTab === 'programs'
      ? initialTab
      : 'programs';
  });
  const [programs, setPrograms] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    if (tab === 'programs') getPrograms({}).then(r => setPrograms(r.data));
    if (tab === 'templates') getTemplates({}).then(r => setTemplates(r.data));
  }, [tab]);

  const navLinkBase =
    'inline-flex items-center justify-center px-3 py-1.5 rounded-full border text-sm transition-colors';
  const navLinkActive = 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]';
  const navLinkInactive =
    'bg-[var(--surface)] text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--surface-alt)]';
  const navLinkClass = (isActive: boolean) =>
    `${navLinkBase} ${isActive ? navLinkActive : navLinkInactive}`;
  const isTemplatesView = tab === 'templates';

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Programs & Templates</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Publish, template, and assign onboarding experiences for your teammates.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <nav className="flex flex-wrap gap-2">
            <a href="/admin/user-manager" className={navLinkClass(false)}>
              Users
            </a>
            <a href="/admin/role-manager.html" className={navLinkClass(false)}>
              Roles &amp; Programs
            </a>
            <a href="/programs" className={navLinkClass(!isTemplatesView)}>
              Programs
            </a>
            <a href="/programs?tab=templates" className={navLinkClass(isTemplatesView)}>
              Templates
            </a>
          </nav>
          <a href="/" className="text-sm text-[var(--brand-primary)] underline">
            ← Back to Orientation
          </a>
        </div>
      </header>

      {/* Segmented Tabs */}
      <div className="flex gap-2">
        {['programs', 'templates', 'assignments']
          .filter(t => (t === 'assignments' ? can(currentUser, 'assignToUser', 'program') : true))
          .map(t => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`px-4 py-2 rounded-full text-sm ${
                tab === t ? 'bg-[var(--brand-primary)] text-white' : 'bg-[var(--surface-alt)]'
              }`}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
      </div>

      {/* Tab panels */}
      {tab === 'programs' && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Search programs"
            />
            {can(currentUser, 'create', 'program') && (
              <button className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-md">
                New Program
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {programs.map(p => (
              <div key={p.id} className="card p-4 space-y-2">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="text-sm text-[var(--text-muted)]">v{p.version}</p>
                <p className="text-sm">{p.status}</p>
                <p className="text-sm">Owner: {p.owner}</p>
                <p className="text-sm">Assigned: {p.assignedCount}</p>
                <div className="flex gap-2 text-sm pt-2">
                  {can(currentUser, 'update', 'program') && <button className="underline">Edit</button>}
                  {p.status === 'draft' && can(currentUser, 'publish', 'program') && (
                    <button className="underline" onClick={() => publishProgram(p.id)}>
                      Publish
                    </button>
                  )}
                  {p.status === 'published' && can(currentUser, 'deprecate', 'program') && (
                    <button className="underline" onClick={() => deprecateProgram(p.id)}>
                      Deprecate
                    </button>
                  )}
                  {can(currentUser, 'delete', 'program') && p.status !== 'archived' && (
                    <button className="underline" onClick={() => deleteProgram(p.id)}>
                      Delete
                    </button>
                  )}
                  {can(currentUser, 'delete', 'program') && p.status === 'archived' && (
                    <button className="underline" onClick={() => restoreProgram(p.id)}>
                      Restore
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'templates' && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Search templates"
            />
            {can(currentUser, 'create', 'template') && (
              <button className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-md">
                New Template
              </button>
            )}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {templates.map(t => (
              <div key={t.id} className="card p-4 space-y-2">
                <h3 className="font-semibold">{t.name}</h3>
                <p className="text-sm text-[var(--text-muted)]">{t.category}</p>
                <p className="text-sm">Updated: {t.updatedAt || '--'}</p>
                <div className="flex gap-2 text-sm pt-2">
                  {can(currentUser, 'update', 'template') && (
                    <button className="underline">Edit</button>
                  )}
                  {can(currentUser, 'delete', 'template') && (
                    <button className="underline">Delete</button>
                  )}
                </div>
              }
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'assignments' && (
        <section>
          <p className="text-[var(--text-muted)]">
            Bulk assignment UI goes here. Managers/Admins can assign programs to users.
          </p>
        </section>
      )}
    </div>
  );
}
