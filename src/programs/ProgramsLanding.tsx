import React, { useState, useEffect, useCallback } from 'react';
import {
  getPrograms,
  publishProgram,
  deprecateProgram,
  archiveProgram,
  restoreProgram,
  getProgramTemplates,
  deleteTemplate,
  restoreTemplate,
  Program,
  Template,
} from '../api';
import { ORGANIZATION_OPTIONS, SUB_UNIT_OPTIONS } from '../../shared/field-options.js';
import { can, User } from '../rbac';

type TabKey = 'programs' | 'templates' | 'assignments';
type FeedbackState = { type: 'success' | 'error'; message: string } | null;
type ProgramAction = 'publish' | 'deprecate' | 'archive' | 'restore';
type TemplateAction = 'delete' | 'restore';

const successMessages: Record<ProgramAction, string> = {
  publish: 'Program published successfully.',
  deprecate: 'Program deprecated successfully.',
  archive: 'Program archived successfully.',
  restore: 'Program restored successfully.',
};

const templateSuccessMessages: Record<TemplateAction, string> = {
  delete: 'Template deleted successfully.',
  restore: 'Template restored successfully.',
};

const templateFailureVerbs: Record<TemplateAction, string> = {
  delete: 'delete',
  restore: 'restore',
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
  const [searchQuery, setSearchQuery] = useState('');
  const [organizationFilter, setOrganizationFilter] = useState('');
  const [subUnitFilter, setSubUnitFilter] = useState('');
  const [templateOrganizationFilter, setTemplateOrganizationFilter] = useState('');
  const [templateSubUnitFilter, setTemplateSubUnitFilter] = useState('');

  const selectedProgram = selectedProgramId
    ? programs.find(program => program.id === selectedProgramId) ?? null
    : null;

  const refreshPrograms = useCallback(async () => {
    const response = await getPrograms({
      query: searchQuery,
      organization: organizationFilter || undefined,
      subUnit: subUnitFilter || undefined,
    });
    setPrograms(response.data);
    setSelectedProgramId(prev => {
      if (prev && response.data.some(program => program.id === prev)) {
        return prev;
      }
      return response.data[0]?.id ?? null;
    });
    return response.data;
  }, [organizationFilter, searchQuery, subUnitFilter]);

  const refreshTemplates = useCallback(
    async (programId?: string) => {
      const targetProgramId = programId ?? selectedProgramId;
      if (!targetProgramId) {
        setTemplates([]);
        return [] as Template[];
      }
      const organization = templateOrganizationFilter || undefined;
      const subUnit = templateSubUnitFilter || undefined;
      const response = await getProgramTemplates(targetProgramId, {
        includeDeleted: true,
        organization,
        subUnit,
      });
      let filtered = response.data;
      if (organization) {
        filtered = filtered.filter(template => (template.organization ?? '') === organization);
      }
      if (subUnit) {
        filtered = filtered.filter(template => (template.subUnit ?? '') === subUnit);
      }
      setTemplates(filtered);
      return response.data;
    },
    [selectedProgramId, templateOrganizationFilter, templateSubUnitFilter],
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

      if (action === 'publish' && selectedProgramId === program.id) {
        const templatesForProgram = await refreshTemplates(program.id);
        const archivedTemplates = templatesForProgram.filter(template => template.deletedAt);
        if (archivedTemplates.length > 0) {
          await Promise.all(
            archivedTemplates.map(template => restoreTemplate(program.id, template.id)),
          );
          await refreshTemplates(program.id);
        }
      }

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

  const templateActionKey = (action: TemplateAction, templateId: string) =>
    `template-${action}:${templateId}`;

  const handleTemplateAction = async (template: Template, action: TemplateAction) => {
    if (!selectedProgramId) {
      return;
    }
    const actionKey = templateActionKey(action, template.id);
    setPendingAction(actionKey);
    setFeedback(null);

    try {
      if (action === 'delete') {
        await deleteTemplate(selectedProgramId, template.id);
      } else {
        await restoreTemplate(selectedProgramId, template.id);
      }
      await refreshTemplates(selectedProgramId);
      setFeedback({ type: 'success', message: templateSuccessMessages[action] });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: `Unable to ${templateFailureVerbs[action]} ${template.name}. ${getErrorMessage(error)}`,
      });
    } finally {
      setPendingAction(prev => (prev === actionKey ? null : prev));
    }
  };

  const activeTemplates = templates.filter(template => !template.deletedAt);
  const archivedTemplates = templates.filter(template => !!template.deletedAt);
  const hasActiveTemplates = activeTemplates.length > 0;
  const hasArchivedTemplates = archivedTemplates.length > 0;
  const hasTemplateFilters =
    templateOrganizationFilter.trim().length > 0 || templateSubUnitFilter.trim().length > 0;

  const templateEmptyMessage = (() => {
    if (programs.length === 0) {
      return 'Create a program to manage templates.';
    }
    if (hasTemplateFilters) {
      return `No templates match the selected filters for ${selectedProgram?.name ?? 'this program'}.`;
    }
    if (!hasActiveTemplates && hasArchivedTemplates) {
      return `All templates for ${selectedProgram?.name ?? 'this program'} are archived. Restore one to make it active.`;
    }
    return `No templates for ${selectedProgram?.name ?? 'this program'} yet.`;
  })();

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
            <div className="grid w-full gap-3 md:max-w-3xl md:grid-cols-3">
              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor="program-search" className="text-[var(--text-muted)]">
                  Search
                </label>
                <input
                  id="program-search"
                  className="form-field"
                  placeholder="Search programs"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  onBlur={event => setSearchQuery(event.target.value.trim())}
                />
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor="program-organization" className="text-[var(--text-muted)]">
                  Organization
                </label>
                <select
                  id="program-organization"
                  className="form-field"
                  value={organizationFilter}
                  onChange={event => setOrganizationFilter(event.target.value)}
                >
                  <option value="">All organizations</option>
                  {ORGANIZATION_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor="program-sub-unit" className="text-[var(--text-muted)]">
                  Sub-unit
                </label>
                <select
                  id="program-sub-unit"
                  className="form-field"
                  value={subUnitFilter}
                  onChange={event => setSubUnitFilter(event.target.value)}
                >
                  <option value="">All sub-units</option>
                  {SUB_UNIT_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
                  <p className="text-sm">
                    Organization: {program.organization ?? '—'}
                  </p>
                  <p className="text-sm">
                    Sub-unit: {program.subUnit ?? '—'}
                  </p>
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
          <div className="panel space-y-4 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              {programs.length > 0 ? (
                <div className="flex flex-col text-sm md:flex-row md:items-center md:gap-3">
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
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor="template-organization-filter" className="text-[var(--text-muted)]">
                  Organization
                </label>
                <select
                  id="template-organization-filter"
                  className="form-field"
                  value={templateOrganizationFilter}
                  onChange={event => setTemplateOrganizationFilter(event.target.value)}
                  disabled={!selectedProgramId}
                >
                  <option value="">All organizations</option>
                  {ORGANIZATION_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor="template-sub-unit-filter" className="text-[var(--text-muted)]">
                  Sub-unit
                </label>
                <select
                  id="template-sub-unit-filter"
                  className="form-field"
                  value={templateSubUnitFilter}
                  onChange={event => setTemplateSubUnitFilter(event.target.value)}
                  disabled={!selectedProgramId}
                >
                  <option value="">All sub-units</option>
                  {SUB_UNIT_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {hasActiveTemplates ? (
            <div className="grid gap-4 md:grid-cols-3">
              {activeTemplates.map(template => (
                <div key={template.id} className="panel space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{template.name}</h3>
                      <p className="text-sm text-[var(--text-muted)]">{template.category}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {template.status && (
                        <span className="badge bg-[var(--surface-alt)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                          {template.status}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm">
                    Organization: {template.organization ?? '—'}
                  </p>
                  <p className="text-sm">Sub-unit: {template.subUnit ?? '—'}</p>
                  <p className="text-sm">Updated: {template.updatedAt || '--'}</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {can(currentUser, 'update', 'template') && (
                      <button type="button" className="btn btn-outline text-sm">
                        Edit
                      </button>
                    )}
                    {can(currentUser, 'delete', 'template') && (
                      <button
                        type="button"
                        className="btn btn-outline text-sm"
                        onClick={() => handleTemplateAction(template, 'delete')}
                        disabled={pendingAction === templateActionKey('delete', template.id)}
                      >
                        {pendingAction === templateActionKey('delete', template.id) ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel p-4 text-sm text-[var(--text-muted)]">{templateEmptyMessage}</div>
          )}

          {hasArchivedTemplates && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Archived Templates
              </h3>
              <div className="grid gap-4 md:grid-cols-3">
                {archivedTemplates.map(template => (
                  <div key={template.id} className="panel space-y-3 p-4 opacity-80">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{template.name}</h3>
                        <p className="text-sm text-[var(--text-muted)]">{template.category}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {template.status && (
                          <span className="badge bg-[var(--surface-alt)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                            {template.status}
                          </span>
                        )}
                        <span className="badge bg-[var(--surface-alt)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                          Archived
                        </span>
                      </div>
                    </div>
                    <p className="text-sm">
                      Organization: {template.organization ?? '—'}
                    </p>
                    <p className="text-sm">Sub-unit: {template.subUnit ?? '—'}</p>
                    <p className="text-sm">Archived: {template.deletedAt || '--'}</p>
                    <div className="flex flex-wrap gap-2 pt-2">
                      {can(currentUser, 'delete', 'template') && (
                        <button
                          type="button"
                          className="btn btn-primary text-sm"
                          onClick={() => handleTemplateAction(template, 'restore')}
                          disabled={pendingAction === templateActionKey('restore', template.id)}
                        >
                          {pendingAction === templateActionKey('restore', template.id) ? 'Restoring…' : 'Restore'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
