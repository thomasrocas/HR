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
  updatedAt?: string;
  status?: 'draft' | 'published' | 'deprecated';
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

export const deleteProgram = (id: string) =>
  apiFetch(`/api/programs/${id}`, { method: 'DELETE' });

export const restoreProgram = (id: string) =>
  apiFetch(`/api/programs/${id}/restore`, { method: 'POST' });

export const cloneProgram = (id: string) =>
  apiFetch<Program>(`/api/programs/${id}/clone`, { method: 'POST' });

export const getTemplates = (params: { query?: string; category?: string }) =>
  apiFetch<{ data: Template[] }>(`/api/templates?${new URLSearchParams(params as any)}`);

export const createTemplate = (payload: Partial<Template>) =>
  apiFetch<Template>('/api/templates', { method: 'POST', body: JSON.stringify(payload) });

export const patchTemplate = (id: string, payload: Partial<Template>) =>
  apiFetch<Template>(`/api/templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteTemplate = (programId: string, templateId: string) =>
  apiFetch(`/api/programs/${programId}/templates/${templateId}`, { method: 'DELETE' });

export const restoreTemplate = (programId: string, templateId: string) =>
  apiFetch(`/api/programs/${programId}/templates/${templateId}/restore`, { method: 'POST' });

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
  switch (true) {
    case url.startsWith('/api/users?'):
      return { data: u, meta: { total: u.length, page: 1 } } as any;
    case url === '/api/users':
      return { ...opts?.body && JSON.parse(opts.body.toString()), id: 'u-new' } as any;
    case url.startsWith('/api/programs?'):
      return { data: p, meta: { total: p.length, page: 1 } } as any;
    case /^\/api\/programs\/[^/]+\/publish$/.test(url) && opts?.method === 'POST':
      return { published: true } as any;
    case /^\/api\/programs\/[^/]+\/deprecate$/.test(url) && opts?.method === 'POST':
      return { deprecated: true } as any;
    case /^\/api\/programs\/[^/]+\/archive$/.test(url) && opts?.method === 'POST':
      return { archived: true } as any;
    case /^\/api\/programs\/[^/]+$/.test(url) && opts?.method === 'DELETE':
      return { deleted: true } as any;
    case /^\/api\/programs\/[^/]+\/restore$/.test(url) && opts?.method === 'POST':
      return { restored: true } as any;
    case url.startsWith('/api/templates?'):
      return { data: seed.templates } as any;
    case url === '/api/templates' && opts?.method === 'POST':
      return { ...opts?.body && JSON.parse(opts.body.toString()), id: 'tmpl-new' } as any;
    case /^\/api\/templates\/[^/]+$/.test(url) && opts?.method === 'PATCH':
      return { ...opts?.body && JSON.parse(opts.body.toString()), id: url.split('/').at(-1) } as any;
    case /^\/api\/programs\/[^/]+\/templates\/[^/]+$/.test(url) && opts?.method === 'DELETE':
      return { deleted: true } as any;
    case /^\/api\/programs\/[^/]+\/templates\/[^/]+\/restore$/.test(url) && opts?.method === 'POST':
      return { restored: true } as any;
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
      id: 't1',
      name: 'Engineer Onboarding',
      category: 'Engineering',
      updatedAt: '2024-05-15',
      status: 'published',
    },
    {
      id: 't2',
      name: 'Retail Associate Training',
      category: 'Operations',
      updatedAt: '2024-04-20',
      status: 'draft',
    },
  ] as Template[],
  audit: [
    { id: 'a1', action: 'create', at: '2024-05-10', actor: 'alice@example.com' },
    { id: 'a2', action: 'deactivate', at: '2024-06-01', actor: 'admin@example.com' },
  ],
};
