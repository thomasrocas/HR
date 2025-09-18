import React, { useState, useEffect, useCallback } from 'react';
import {
  getPrograms,
  publishProgram,
  deprecateProgram,
  archiveProgram,
  restoreProgram,
  getProgramTemplates,
  searchTemplates,
  attachTemplateToProgram,
  detachTemplateFromProgram,
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
  const [availableTemplates, setAvailableTemplates] = useState<Template[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingTemplateAction, setPendingTemplateAction] = useState<string | null>(null);
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
        setIsLoadingTemplates(false);
        return [] as Template[];
      }
      setIsLoadingTemplates(true);
      try {
        const response = await getProgramTemplates(targetProgramId);
        setTemplates(response.data);
        return response.data;
      } finally {
        setIsLoadingTemplates(false);
      }
    },
    [selectedProgramId],
  );

  const refreshAvailableTemplates = useCallback(
    async (programId?: string, queryOverride?: string) => {
      const targetProgramId = programId ?? selectedProgramId;
      if (!targetProgramId) {
        setAvailableTemplates([]);
        setIsLoadingAvailable(false);
        return [] as Template[];
      }
      setIsLoadingAvailable(true);
      try {
        const response = await searchTemplates({
          query: queryOverride ?? templateSearch,
          programId: targetProgramId,
        });
        const attachable = response.data.filter(template => template.programId !== targetProgramId);
        setAvailableTemplates(attachable);
        return attachable;
      } finally {
        setIsLoadingAvailable(false);
      }
    },
    [selectedProgramId, templateSearch],
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
      setIsLoadingTemplates(false);
      return;
    }

    refreshTemplates(selectedProgramId).catch(error => {
      setFeedback({
        type: 'error',
        message: `Unable to load templates. ${getErrorMessage(error)}`,
      });
    });
  }, [tab, selectedProgramId, refreshTemplates]);

  useEffect(() => {
    if (tab !== 'templates') {
      return;
    }
    if (!selectedProgramId) {
      setAvailableTemplates([]);
      setIsLoadingAvailable(false);
      return;
    }

    refreshAvailableTemplates(selectedProgramId, templateSearch).catch(error => {
      setFeedback({
        type: 'error',
        message: `Unable to load available templates. ${getErrorMessage(error)}`,
      });
    });
  }, [tab, selectedProgramId, templateSearch, refreshAvailableTemplates]);

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

  const templateActionKey = (action: 'attach' | 'detach', templateId: string) =>
    `${action}:${templateId}`;

  const handleAttachTemplate = async (template: Template) => {
    if (!selectedProgramId) {
      return;
    }
    const actionKey = templateActionKey('attach', template.id);
    setPendingTemplateAction(actionKey);
    setFeedback(null);
    try {
      const result = await attachTemplateToProgram(selectedProgramId, template.id);
      await refreshTemplates(selectedProgramId);
      await refreshAvailableTemplates(selectedProgramId);
      setFeedback({
        type: 'success',
        message: `${result.name} attached to ${selectedProgram?.name ?? 'the program'}.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: `Unable to attach ${template.name}. ${getErrorMessage(error)}`,
      });
    } finally {
      setPendingTemplateAction(prev => (prev === actionKey ? null : prev));
    }
  };

  const handleDetachTemplate = async (template: Template) => {
    if (!selectedProgramId) {
      return;
    }
    const actionKey = templateActionKey('detach', template.id);
    setPendingTemplateAction(actionKey);
    setFeedback(null);
    try {
      await detachTemplateFromProgram(selectedProgramId, template.id);
      await refreshTemplates(selectedProgramId);
      await refreshAvailableTemplates(selectedProgramId);
      setFeedback({
        type: 'success',
        message: `${template.name} detached from ${selectedProgram?.name ?? 'the program'}.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: `Unable to detach ${template.name}. ${getErrorMessage(error)}`,
      });
    } finally {
      setPendingTemplateAction(prev => (prev === actionKey ? null : prev));
    }
  };

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
            <a href="/admin/user-manager" className="btn btn-outline text-sm">
              Users
            </a>
            <a href="/admin/role-manager.html" className="btn btn-outline text-sm">
              Roles &amp; Programs
            </a>
            <a
              href="/admin/program-template-manager.html"
              className="btn btn-primary text-sm"
            >
              Program Templates
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
              <input
                className="form-field md:w-64"
                placeholder="Search templates"
                value={templateSearch}
                onChange={event => setTemplateSearch(event.target.value)}
              />
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
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3" data-testid="attached-templates-section">
              <h2 className="text-lg font-semibold">Attached templates</h2>
              {isLoadingTemplates ? (
                <div className="panel p-4 text-sm text-[var(--text-muted)]" data-testid="attached-loading">
                  Loading templates…
                </div>
              ) : templates.length > 0 ? (
                <div className="grid gap-4" data-testid="attached-templates">
                  {templates.map(template => {
                    const detachActionKey = templateActionKey('detach', template.id);
                    return (
                      <div
                        key={template.id}
                        className="panel space-y-3 p-4"
                        data-testid="attached-template-card"
                      >
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
                          {can(currentUser, 'update', 'template') && (
                            <button
                              type="button"
                              className="btn btn-outline text-sm"
                              onClick={() => handleDetachTemplate(template)}
                              disabled={pendingTemplateAction === detachActionKey}
                            >
                              {pendingTemplateAction === detachActionKey ? 'Detaching…' : 'Detach'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="panel p-4 text-sm text-[var(--text-muted)]" data-testid="attached-empty">
                  {programs.length === 0
                    ? 'Create a program to view its templates.'
                    : `No templates for ${selectedProgram?.name ?? 'this program'} yet.`}
                </div>
              )}
            </section>
            <section className="space-y-3" data-testid="available-templates-section">
              <h2 className="text-lg font-semibold">Available templates</h2>
              {isLoadingAvailable ? (
                <div className="panel p-4 text-sm text-[var(--text-muted)]" data-testid="available-loading">
                  Searching templates…
                </div>
              ) : availableTemplates.length > 0 ? (
                <div className="grid gap-4" data-testid="available-templates">
                  {availableTemplates.map(template => {
                    const attachActionKey = templateActionKey('attach', template.id);
                    return (
                      <div
                        key={template.id}
                        className="panel space-y-3 p-4"
                        data-testid="available-template-card"
                      >
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
                          {can(currentUser, 'update', 'template') ? (
                            <button
                              type="button"
                              className="btn btn-primary text-sm"
                              onClick={() => handleAttachTemplate(template)}
                              disabled={!selectedProgramId || pendingTemplateAction === attachActionKey}
                            >
                              {pendingTemplateAction === attachActionKey ? 'Attaching…' : 'Attach'}
                            </button>
                          ) : (
                            <span className="text-sm text-[var(--text-muted)]">
                              You do not have permission to attach templates.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="panel p-4 text-sm text-[var(--text-muted)]" data-testid="available-empty">
                  {!selectedProgramId
                    ? 'Select a program to browse attachable templates.'
                    : templateSearch
                        ? 'No templates match your search.'
                        : 'No templates available to attach.'}
                </div>
              )}
            </section>
          </div>
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
