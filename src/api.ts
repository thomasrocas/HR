/**
 * Minimal fetch wrapper with optional mock mode.
 * Replace `useMock` with environment flag when integrating.
 */
import { User } from './rbac';

export interface Program {
  id: string;
  name: string;
  version: string;
  status: 'draft' | 'published' | 'deprecated' | 'archived';
  owner: string;
  updatedAt: string;
  assignedCount: number;
}

export interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  updatedAt: string;
  usageCount: number;
}

const useMock = true;

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  if (!useMock) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }
  return mockFetch<T>(url, opts); // fallthrough to mock
}

/* -------------------------- Users -------------------------- */
export const getUsers = (params: {
  query?: string;
  role?: string;
  status?: string;
  page?: number;
}) =>
  apiFetch<{ data: User[]; meta: { total: number; page: number } }>(
    `/api/users?${new URLSearchParams(params as any)}`,
  );

export const createUser = (payload: Partial<User>) =>
  apiFetch<User>('/api/users', { method: 'POST', body: JSON.stringify(payload) });

export const updateUser = (id: string, payload: Partial<User>) =>
  apiFetch<User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const updateUserRoles = (id: string, roles: string[]) =>
  apiFetch<User>(`/api/users/${id}/roles`, { method: 'POST', body: JSON.stringify({ roles }) });

export const assignPrograms = (
  id: string,
  payload: { programId: string; startDate: string; dueDate: string; notes?: string },
) =>
  apiFetch(`/api/users/${id}/programs`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const deactivateUser = (id: string, reason: string) =>
  apiFetch(`/api/users/${id}/deactivate`, { method: 'POST', body: JSON.stringify({ reason }) });

export const reactivateUser = (id: string) =>
  apiFetch(`/api/users/${id}/reactivate`, { method: 'POST' });

export const archiveUser = (id: string) =>
  apiFetch(`/api/users/${id}/archive`, { method: 'POST' });

export const getAuditLog = (userId: string) =>
  apiFetch<{ id: string; action: string; at: string; actor: string }[]>(
    `/api/audit?userId=${userId}`,
  );

/* ------------------- Programs & Templates ------------------- */
export const getPrograms = (params: { status?: string; query?: string; page?: number }) =>
  apiFetch<{ data: Program[]; meta: { total: number; page: number } }>(
    `/api/programs?${new URLSearchParams(params as any)}`,
  );

export const createProgram = (payload: Partial<Program>) =>
  apiFetch<Program>('/api/programs', { method: 'POST', body: JSON.stringify(payload) });

export const patchProgram = (id: string, payload: Partial<Program>) =>
  apiFetch<Program>(`/api/programs/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const publishProgram = (id: string) =>
  apiFetch(`/api/programs/${id}/publish`, { method: 'POST' });

export const deprecateProgram = (id: string) =>
  apiFetch(`/api/programs/${id}/deprecate`, { method: 'POST' });

export const archiveProgram = (id: string) =>
  apiFetch(`/api/programs/${id}/archive`, { method: 'POST' });

export const cloneProgram = (id: string) =>
  apiFetch<Program>(`/api/programs/${id}/clone`, { method: 'POST' });

export const getTemplates = (params: { query?: string; category?: string }) =>
  apiFetch<{ data: Template[] }>(`/api/templates?${new URLSearchParams(params as any)}`);

export const createTemplate = (payload: Partial<Template>) =>
  apiFetch<Template>('/api/templates', { method: 'POST', body: JSON.stringify(payload) });

export const patchTemplate = (id: string, payload: Partial<Template>) =>
  apiFetch<Template>(`/api/templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const archiveTemplate = (id: string) =>
  apiFetch<Template>(`/api/templates/${id}/archive`, { method: 'POST' });

export const bulkAssign = (
  assignments: { userId: string; programId: string; startDate: string; dueDate: string }[],
) =>
  apiFetch('/api/assignments', {
    method: 'POST',
    body: JSON.stringify(assignments),
  });

/* ------------------------ Mock layer ------------------------ */
async function mockFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  await new Promise(r => setTimeout(r, 300)); // simulate latency
  const u = seed.users;
  const p = seed.programs;
  const t = seed.templates;
  switch (true) {
    case url.startsWith('/api/users?'):
      return { data: u, meta: { total: u.length, page: 1 } } as any;
    case url === '/api/users':
      return { ...opts?.body && JSON.parse(opts.body.toString()), id: 'u-new' } as any;
    case url.startsWith('/api/programs?'):
      return { data: p, meta: { total: p.length, page: 1 } } as any;
    case url.startsWith('/api/templates?'): {
      const searchParams = url.includes('?')
        ? new URLSearchParams(url.split('?')[1])
        : new URLSearchParams();
      const query = (searchParams.get('query') ?? '').toLowerCase();
      const category = searchParams.get('category') ?? '';
      let data = [...t];
      if (query) {
        data = data.filter(template =>
          `${template.name} ${template.description}`.toLowerCase().includes(query),
        );
      }
      if (category) {
        data = data.filter(template => template.category === category);
      }
      return { data } as any;
    }
    case url === '/api/templates' && opts?.method === 'POST': {
      const payload = opts?.body ? JSON.parse(opts.body.toString()) : {};
      const now = new Date().toISOString().split('T')[0];
      const newTemplate: Template = {
        id: `tpl-${Math.random().toString(36).slice(2, 8)}`,
        name: payload.name ?? 'Untitled Template',
        category: payload.category ?? 'General',
        description: payload.description ?? '',
        status: payload.status ?? 'draft',
        updatedAt: now,
        usageCount: 0,
      };
      t.push(newTemplate);
      return newTemplate as any;
    }
    case /^\/api\/templates\/[^/]+$/.test(url) && opts?.method === 'PATCH': {
      const id = url.split('/')[3];
      const payload = opts?.body ? JSON.parse(opts.body.toString()) : {};
      const template = t.find(item => item.id === id);
      if (!template) {
        throw new Error('Template not found');
      }
      Object.assign(template, payload, { updatedAt: new Date().toISOString().split('T')[0] });
      return template as any;
    }
    case /^\/api\/templates\/[^/]+\/archive$/.test(url) && opts?.method === 'POST': {
      const id = url.split('/')[3];
      const template = t.find(item => item.id === id);
      if (!template) {
        throw new Error('Template not found');
      }
      template.status = 'archived';
      template.updatedAt = new Date().toISOString().split('T')[0];
      return template as any;
    }
    case url.startsWith('/api/audit'):
      return seed.audit as any;
    default:
      return {} as any;
  }
}

/* ----------------------- Seed objects ----------------------- */
export const seed = {
  users: [
    {
      id: '1',
      name: 'Alice Admin',
      email: 'alice@example.com',
      roles: ['admin'],
      status: 'active',
    },
    {
      id: '2',
      name: 'Mark Manager',
      email: 'mark@example.com',
      roles: ['manager'],
      status: 'active',
    },
    {
      id: '3',
      name: 'Tina Trainee',
      email: 'tina@example.com',
      roles: ['trainee'],
      status: 'pending',
    },
    {
      id: '4',
      name: 'Victor Viewer',
      email: 'victor@example.com',
      roles: ['viewer'],
      status: 'suspended',
    },
  ] as User[],
  programs: [
    {
      id: 'p1',
      name: 'Onboarding',
      version: '1.0',
      status: 'published',
      owner: 'Alice Admin',
      updatedAt: '2024-05-01',
      assignedCount: 3,
    },
    {
      id: 'p2',
      name: 'Advanced Training',
      version: '0.2',
      status: 'draft',
      owner: 'Mark Manager',
      updatedAt: '2024-04-10',
      assignedCount: 1,
    },
  ] as Program[],
  templates: [
    {
      id: 'tpl-1',
      name: 'New Hire Orientation Checklist',
      category: 'Onboarding',
      description: 'Step-by-step onboarding checklist for new employees.',
      status: 'published',
      updatedAt: '2024-05-12',
      usageCount: 18,
    },
    {
      id: 'tpl-2',
      name: 'Manager Coaching Plan',
      category: 'Development',
      description: 'Guided coaching plan for newly promoted managers.',
      status: 'draft',
      updatedAt: '2024-04-02',
      usageCount: 5,
    },
    {
      id: 'tpl-3',
      name: 'Security Refresher',
      category: 'Compliance',
      description: 'Annual security awareness and policy refresh template.',
      status: 'published',
      updatedAt: '2024-03-18',
      usageCount: 24,
    },
  ] as Template[],
  audit: [
    { id: 'a1', action: 'create', at: '2024-05-10', actor: 'alice@example.com' },
    { id: 'a2', action: 'deactivate', at: '2024-06-01', actor: 'admin@example.com' },
  ],
};
