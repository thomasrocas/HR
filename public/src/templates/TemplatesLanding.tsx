import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  archiveTemplate,
  createTemplate,
  getTemplates,
  patchTemplate,
  Template,
} from '../api';
import { can, User } from '../rbac';

type TemplateFormMode = 'create' | 'edit';

type TemplateFormState = {
  id?: string;
  name: string;
  category: string;
  description: string;
  status: Template['status'];
};

export default function TemplatesLanding({ currentUser }: { currentUser: User }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [isFormOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<TemplateFormMode>('create');
  const [formState, setFormState] = useState<TemplateFormState>({
    name: '',
    category: '',
    description: '',
    status: 'draft',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadTemplates = useCallback(
    async (search: string, category: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await getTemplates({
          query: search || undefined,
          category: category || undefined,
        });
        setTemplates(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load templates');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const initialFetch = useRef(true);
  useEffect(() => {
    if (initialFetch.current) {
      initialFetch.current = false;
      void loadTemplates(query, categoryFilter);
      return;
    }
    const timer = setTimeout(() => {
      void loadTemplates(query, categoryFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, categoryFilter, loadTemplates]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    templates.forEach(template => categories.add(template.category));
    if (categoryFilter && !categories.has(categoryFilter)) {
      categories.add(categoryFilter);
    }
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [templates, categoryFilter]);

  const openCreateForm = () => {
    setFormMode('create');
    setFormState({
      name: '',
      category: categoryFilter || '',
      description: '',
      status: 'draft',
    });
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (template: Template) => {
    setFormMode('edit');
    setFormState({
      id: template.id,
      name: template.name,
      category: template.category,
      description: template.description,
      status: template.status,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setFormError(null);
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!formState.name.trim() || !formState.category.trim()) {
      setFormError('Name and category are required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formState.name.trim(),
        category: formState.category.trim(),
        description: formState.description.trim(),
        status:
          formMode === 'create' && formState.status === 'archived'
            ? 'draft'
            : formState.status,
      };
      const successMessage = formMode === 'create' ? 'Template created.' : 'Template updated.';
      if (formMode === 'create') {
        await createTemplate(payload);
      } else if (formState.id) {
        await patchTemplate(formState.id, payload);
      }
      setFormOpen(false);
      await loadTemplates(query, categoryFilter);
      setStatusMessage(successMessage);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save template.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (template: Template) => {
    if (template.status === 'archived') return;
    if (typeof window !== 'undefined' && !window.confirm(`Archive "${template.name}"?`)) {
      return;
    }
    try {
      await archiveTemplate(template.id);
      await loadTemplates(query, categoryFilter);
      setStatusMessage(`Archived "${template.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive template');
    }
  };

  const isFormValid = formState.name.trim() !== '' && formState.category.trim() !== '';

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Standardize onboarding and training flows by creating reusable templates.
        </p>
      </header>

      {statusMessage && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="border rounded-md px-3 py-2 text-sm"
            placeholder="Search templates"
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label="Search templates"
          />
          <select
            className="border rounded-md px-2 py-2 text-sm"
            value={categoryFilter}
            onChange={event => setCategoryFilter(event.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categoryOptions.map(category => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {can(currentUser, 'create', 'template') && (
            <button
              type="button"
              onClick={openCreateForm}
              className="ml-auto bg-[var(--brand-primary)] text-white px-4 py-2 rounded-md"
            >
              New Template
            </button>
          )}
        </div>

        {loading ? (
          <div className="card p-6 text-center text-[var(--text-muted)]">Loading templates…</div>
        ) : templates.length === 0 ? (
          <div className="card p-6 text-center text-[var(--text-muted)]">
            No templates match your filters.{' '}
            {can(currentUser, 'create', 'template') ? 'Create one to get started.' : ''}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map(template => (
              <article key={template.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{template.name}</h3>
                    <p className="text-sm text-[var(--text-muted)]">{template.category}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                      template.status === 'archived'
                        ? 'bg-[var(--surface-alt)] text-[var(--text-muted)]'
                        : 'bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]'
                    }`}
                  >
                    {template.status}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  {template.description || 'No description provided.'}
                </p>
                <dl className="flex gap-6 text-xs text-[var(--text-muted)]">
                  <div>
                    <dt className="font-medium uppercase tracking-wide">Updated</dt>
                    <dd className="mt-1 text-[var(--text-primary)]">{template.updatedAt}</dd>
                  </div>
                  <div>
                    <dt className="font-medium uppercase tracking-wide">Usage</dt>
                    <dd className="mt-1 text-[var(--text-primary)]">{template.usageCount}</dd>
                  </div>
                </dl>
                <div className="flex gap-3 text-sm">
                  {can(currentUser, 'update', 'template') && (
                    <button type="button" className="underline" onClick={() => openEditForm(template)}>
                      Edit
                    </button>
                  )}
                  {template.status !== 'archived' && can(currentUser, 'archive', 'template') && (
                    <button type="button" className="underline" onClick={() => handleArchive(template)}>
                      Archive
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {isFormOpen && (
        <div
          className="fixed inset-0 z-20 flex justify-end bg-black/30"
          role="dialog"
          aria-modal="true"
          onClick={closeForm}
        >
          <div
            className="h-full w-full max-w-md bg-white p-6 shadow-xl"
            onClick={event => event.stopPropagation()}
          >
            <form className="h-full overflow-y-auto space-y-4" onSubmit={handleFormSubmit}>
              <header className="space-y-1">
                <h2 className="text-lg font-semibold">
                  {formMode === 'create' ? 'Create template' : 'Edit template'}
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {formMode === 'create'
                    ? 'Define the reusable steps and assets for a new template.'
                    : 'Update template details to keep content accurate.'}
                </p>
              </header>

              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <label className="block space-y-1 text-sm">
                <span className="font-medium">Template name</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.name}
                  onChange={event => setFormState(prev => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="font-medium">Category</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.category}
                  onChange={event => setFormState(prev => ({ ...prev, category: event.target.value }))}
                  list="template-categories"
                  required
                />
                <datalist id="template-categories">
                  {categoryOptions.map(category => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </label>

              <label className="block space-y-1 text-sm">
                <span className="font-medium">Description</span>
                <textarea
                  className="w-full rounded-md border px-3 py-2"
                  rows={4}
                  value={formState.description}
                  onChange={event => setFormState(prev => ({ ...prev, description: event.target.value }))}
                />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="font-medium">Status</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.status}
                  onChange={event =>
                    setFormState(prev => ({ ...prev, status: event.target.value as Template['status'] }))
                  }
                  disabled={formMode === 'edit' && formState.status === 'archived'}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  {formState.status === 'archived' && <option value="archived">Archived</option>}
                </select>
              </label>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  className="px-3 py-2 text-sm"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={!isFormValid || saving}
                >
                  {saving ? 'Saving…' : formMode === 'create' ? 'Create template' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}