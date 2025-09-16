import React, { useState, useEffect, useCallback } from 'react';
import {
  getPrograms,
  publishProgram,
  deprecateProgram,
  archiveProgram,
  restoreProgram,
  getProgramTemplates,
  Program,
  Template,
} from '../api';
import { can, User } from '../rbac';

type TabKey = 'programs' | 'templates' | 'assignments';
type FeedbackState = { type: 'success' | 'error'; message: string } | null;
type ProgramAction = 'publish' | 'deprecate' | 'archive' | 'restore';

const successMessages: Record<ProgramAction, string> = {
  publish: 'Program published successfully.',
  deprecate: 'Program deprecated successfully.',
  archive: 'Program archived successfully.',
  restore: 'Program restored successfully.',
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Please try again.';

export default function ProgramsLanding({ currentUser }: { currentUser: User }) {
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'programs';
    const initialTab = new URLSearchParams(window.location.search).get('tab');
    return initialTab === 'templates' || initialTab === 'assignments'
      ? (initialTab as TabKey)
      : 'programs';
  });
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const selectedProgram = selectedProgramId
    ? programs.find(program => program.id === selectedProgramId) ?? null
    : null;

  const refreshPrograms = useCallback(async () => {
    const response = await getPrograms({});
    setPrograms(response.data);
    setSelectedProgramId(prev => {
      if (prev && response.data.some(program => program.id === prev)) {
        return prev;
      }
      return response.data[0]?.id ?? null;
    });
    return response.data;
  }, []);

  const refreshTemplates = useCallback(
    async (programId?: string) => {
      const targetProgramId = programId ?? selectedProgramId;
      if (!targetProgramId) {
        setTemplates([]);
        return [] as Template[];
      }
      const response = await getProgramTemplates(targetProgramId);
      setTemplates(response.data);
      return response.data;
    },
    [selectedProgramId],
  );

  useEffect(() => {
    if (tab === 'programs') {
      refreshPrograms().catch(error => {
        setFeedback({
          type: 'error',
          message: `Unable to load programs. ${getErrorMessage(error)}`,
        });
      });
    } else if (tab === 'templates' && programs.length === 0) {
      refreshPrograms().catch(error => {
        setFeedback({
          type: 'error',
          message: `Unable to load programs. ${getErrorMessage(error)}`,
        });
      });
    }
  }, [tab, programs.length, refreshPrograms]);

  useEffect(() => {
    if (tab !== 'templates') {
      return;
    }
    if (!selectedProgramId) {
      setTemplates([]);
      return;
    }

    refreshTemplates(selectedProgramId).catch(error => {
      setFeedback({
        type: 'error',
        message: `Unable to load templates. ${getErrorMessage(error)}`,
      });
    });
  }, [tab, selectedProgramId, refreshTemplates]);

  const handleProgramAction = async (program: Program, action: ProgramAction) => {
    const actionKey = `${action}:${program.id}`;
    const actionMap: Record<ProgramAction, (id: string) => Promise<unknown>> = {
      publish: publishProgram,
      deprecate: deprecateProgram,
      archive: archiveProgram,
      restore: restoreProgram,
    };

    setPendingAction(actionKey);
    setFeedback(null);

    try {
      await actionMap[action](program.id);
      await refreshPrograms();
      setFeedback({ type: 'success', message: successMessages[action] });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: `Unable to ${action} ${program.name}. ${getErrorMessage(error)}`,
      });
    } finally {
      setPendingAction(prev => (prev === actionKey ? null : prev));
    }
  };

  const isTemplatesView = tab === 'templates';

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Programs &amp; Templates</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Publish, template, and assign onboarding experiences for your teammates.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <nav className="flex flex-wrap gap-2">
            <a href="/admin/user-manager" className="btn btn-outline">
              Users
            </a>
            <a href="/admin/role-manager.html" className="btn btn-outline">
              Roles &amp; Programs
            </a>
            <a
              href="/programs"
              className={`btn rounded-full ${
                isTemplatesView ? 'btn-outline' : 'btn-primary'
              }`}
            >
              Programs
            </a>
            <a
              href="/programs?tab=templates"
              className={`btn rounded-full ${
                isTemplatesView ? 'btn-primary' : 'btn-outline'
              }`}
            >
              Templates
            </a>
          </nav>
          <a href="/" className="text-sm text-[var(--brand-primary)] underline">
            ← Back to Orientation
          </a>
        </div>
      </header>

      <div className="flex gap-2">
        {(['programs', 'templates', 'assignments'] as TabKey[])
          .filter(t => (t === 'assignments' ? can(currentUser, 'assignToUser', 'program') : true))
          .map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`btn rounded-full ${tab === t ? 'btn-primary' : 'btn-outline'}`}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
      </div>

      {feedback && (
        <div
          className={`panel border-l-4 p-4 text-sm ${
            feedback.type === 'success'
              ? 'border-green-500 text-green-700'
              : 'border-red-500 text-red-700'
          }`}
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </div>
      )}

      {tab === 'programs' && (
        <section className="space-y-4">
          <div className="panel flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <input className="form-field md:w-64" placeholder="Search programs" />
            {can(currentUser, 'create', 'program') && (
              <button type="button" className="btn btn-primary self-start md:self-auto">
                New Program
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {programs.map(program => {
              const actionKeyBase = (action: ProgramAction) => `${action}:${program.id}`;
              return (
                <div key={program.id} className="panel space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{program.name}</h3>
                      <p className="text-sm text-[var(--text-muted)]">v{program.version}</p>
                    </div>
                    <span className="badge bg-[var(--surface-alt)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      {program.status}
                    </span>
                  </div>
                  <p className="text-sm">Owner: {program.owner}</p>
                  <p className="text-sm">Assigned: {program.assignedCount}</p>
                  <p className="text-sm">Updated: {program.updatedAt}</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {can(currentUser, 'update', 'program') && (
                      <button type="button" className="btn btn-outline text-sm">
                        Edit
                      </button>
                    )}
                    {program.status === 'draft' && can(currentUser, 'publish', 'program') && (
                      <button
                        type="button"
                        className="btn btn-primary text-sm"
                        onClick={() => handleProgramAction(program, 'publish')}
                        disabled={pendingAction === actionKeyBase('publish')}
                      >
                        {pendingAction === actionKeyBase('publish') ? 'Publishing…' : 'Publish'}
                      </button>
                    )}
                    {program.status === 'published' && can(currentUser, 'deprecate', 'program') && (
                      <button
                        type="button"
                        className="btn btn-outline text-sm"
                        onClick={() => handleProgramAction(program, 'deprecate')}
                        disabled={pendingAction === actionKeyBase('deprecate')}
                      >
                        {pendingAction === actionKeyBase('deprecate') ? 'Deprecating…' : 'Deprecate'}
                      </button>
                    )}
                    {program.status !== 'archived' && can(currentUser, 'archive', 'program') && (
                      <button
                        type="button"
                        className="btn btn-outline text-sm"
                        onClick={() => handleProgramAction(program, 'archive')}
                        disabled={pendingAction === actionKeyBase('archive')}
                      >
                        {pendingAction === actionKeyBase('archive') ? 'Archiving…' : 'Archive'}
                      </button>
                    )}
                    {program.status === 'archived' && can(currentUser, 'restore', 'program') && (
                      <button
                        type="button"
                        className="btn btn-primary text-sm"
                        onClick={() => handleProgramAction(program, 'restore')}
                        disabled={pendingAction === actionKeyBase('restore')}
                      >
                        {pendingAction === actionKeyBase('restore') ? 'Restoring…' : 'Restore'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === 'templates' && (
        <section className="space-y-4">
          <div className="panel flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <input className="form-field md:w-64" placeholder="Search templates" />
              {programs.length > 0 ? (
                <div className="flex flex-col text-sm">
                  <label htmlFor="template-program-filter" className="text-[var(--text-muted)]">
                    Program
                  </label>
                  <select
                    id="template-program-filter"
                    className="form-field md:w-64"
                    value={selectedProgramId ?? ''}
                    onChange={event => setSelectedProgramId(event.target.value || null)}
                  >
                    {programs.map(program => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-sm text-[var(--text-muted)]">
                  Create a program to manage templates.
                </span>
              )}
            </div>
            {can(currentUser, 'create', 'template') && (
              <button
                type="button"
                className="btn btn-primary self-start md:self-auto"
                disabled={!selectedProgramId}
              >
                New Template
              </button>
            )}
          </div>
          {templates.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {templates.map(template => (
                <div key={template.id} className="panel space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{template.name}</h3>
                      <p className="text-sm text-[var(--text-muted)]">{template.category}</p>
                    </div>
                    {template.status && (
                      <span className="badge bg-[var(--surface-alt)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                        {template.status}
                      </span>
                    )}
                  </div>
                  <p className="text-sm">Updated: {template.updatedAt || '--'}</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {can(currentUser, 'update', 'template') && (
                      <button type="button" className="btn btn-outline text-sm">
                        Edit
                      </button>
                    )}
                    {can(currentUser, 'delete', 'template') && (
                      <button type="button" className="btn btn-outline text-sm">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel p-4 text-sm text-[var(--text-muted)]">
              {programs.length === 0
                ? 'Create a program to view its templates.'
                : `No templates for ${selectedProgram?.name ?? 'this program'} yet.`}
            </div>
          )}
        </section>
      )}

      {tab === 'assignments' && (
        <section className="panel p-4">
          <p className="text-[var(--text-muted)]">
            Bulk assignment UI goes here. Managers/Admins can assign programs to users.
          </p>
        </section>
      )}
    </div>
  );
}
