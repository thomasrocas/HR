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
  programId: string;
  name: string;
  category: string;
  updatedAt?: string;
  status?: 'draft' | 'published' | 'deprecated';
}

const useMock = true;

const PROGRAMS_BASE = '/programs';
const programTemplatesBase = (programId: string) => `${PROGRAMS_BASE}/${programId}/templates`;

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
type ProgramListResponse = { data: Program[]; meta: { total: number; page: number } };
type TemplateListResponse = { data: Template[] };

export const getPrograms = async (
  params: { status?: string; query?: string; page?: number; includeDeleted?: boolean } = {},
) => {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.query) search.set('query', params.query);
  if (typeof params.page === 'number') search.set('page', String(params.page));
  if (params.includeDeleted) search.set('include_deleted', 'true');

  const query = search.toString();
  const result = await apiFetch<Program[] | ProgramListResponse>(
    `${PROGRAMS_BASE}${query ? `?${query}` : ''}`,
  );

  if (Array.isArray(result)) {
    return { data: result, meta: { total: result.length, page: 1 } };
  }

  return result;
};

export const createProgram = (payload: Partial<Program>) =>
  apiFetch<Program>(PROGRAMS_BASE, { method: 'POST', body: JSON.stringify(payload) });

export const patchProgram = (id: string, payload: Partial<Program>) =>
  apiFetch<Program>(`${PROGRAMS_BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const publishProgram = (id: string) =>
  apiFetch(`/api/programs/${id}/publish`, { method: 'POST' });

export const deprecateProgram = (id: string) =>
  apiFetch(`/api/programs/${id}/deprecate`, { method: 'POST' });

export const archiveProgram = (id: string) =>
  apiFetch(`/api/programs/${id}/archive`, { method: 'POST' });

export const deleteProgram = (id: string) =>
  apiFetch(`${PROGRAMS_BASE}/${id}`, { method: 'DELETE' });

export const restoreProgram = (id: string) =>
  apiFetch(`${PROGRAMS_BASE}/${id}/restore`, { method: 'POST' });

export const cloneProgram = (id: string) =>
  apiFetch<Program>(`/api/programs/${id}/clone`, { method: 'POST' });

export const getProgramTemplates = async (
  programId: string,
  params: { includeDeleted?: boolean } = {},
) => {
  const search = new URLSearchParams();
  if (params.includeDeleted) search.set('include_deleted', 'true');
  const query = search.toString();
  const result = await apiFetch<Template[] | TemplateListResponse>(
    `${programTemplatesBase(programId)}${query ? `?${query}` : ''}`,
  );

  if (Array.isArray(result)) {
    return { data: result };
  }

  return result;
};

export const createTemplate = (programId: string, payload: Partial<Template>) =>
  apiFetch<Template>(programTemplatesBase(programId), {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const patchTemplate = (
  programId: string,
  templateId: string,
  payload: Partial<Template>,
) =>
  apiFetch<Template>(`${programTemplatesBase(programId)}/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deleteTemplate = (programId: string, templateId: string) =>
  apiFetch(`${programTemplatesBase(programId)}/${templateId}`, { method: 'DELETE' });

export const restoreTemplate = (programId: string, templateId: string) =>
  apiFetch(`${programTemplatesBase(programId)}/${templateId}/restore`, { method: 'POST' });

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
  const method = (opts?.method || 'GET').toUpperCase();
  switch (true) {
    case url.startsWith('/api/users?'):
      return { data: u, meta: { total: u.length, page: 1 } } as any;
    case url === '/api/users' && method === 'POST':
      return { ...opts?.body && JSON.parse(opts.body.toString()), id: 'u-new' } as any;
    case (url === PROGRAMS_BASE || url.startsWith(`${PROGRAMS_BASE}?`)) && method === 'GET':
      return { data: p, meta: { total: p.length, page: 1 } } as any;
    case url === PROGRAMS_BASE && method === 'POST':
      return { ...opts?.body && JSON.parse(opts.body.toString()), id: 'p-new' } as any;
    case /^\/programs\/[^/]+$/.test(url) && method === 'PATCH':
      return {
        ...opts?.body && JSON.parse(opts.body.toString()),
        id: url.split('/').at(-1),
      } as any;
    case /^\/programs\/[^/]+$/.test(url) && method === 'DELETE':
      return { deleted: true } as any;
    case /^\/programs\/[^/]+\/restore$/.test(url) && method === 'POST':
      return { restored: true } as any;
    case /^\/programs\/[^/]+\/templates(?:\?.*)?$/.test(url) && method === 'GET': {
      const programId = url.split('/')[2]?.split('?')[0];
      return {
        data: seed.templates.filter(t => t.programId === programId),
      } as any;
    }
    case /^\/programs\/[^/]+\/templates$/.test(url) && method === 'POST':
      return {
        ...opts?.body && JSON.parse(opts.body.toString()),
        id: 'tmpl-new',
        programId: url.split('/')[2],
      } as any;
    case /^\/programs\/[^/]+\/templates\/[^/]+$/.test(url) && method === 'PATCH':
      return {
        ...opts?.body && JSON.parse(opts.body.toString()),
        id: url.split('/').at(-1),
        programId: url.split('/')[2],
      } as any;
    case /^\/programs\/[^/]+\/templates\/[^/]+$/.test(url) && method === 'DELETE':
      return { deleted: true } as any;
    case /^\/programs\/[^/]+\/templates\/[^/]+\/restore$/.test(url) && method === 'POST':
      return { restored: true } as any;
    case url.startsWith('/api/programs?'):
      return { data: p, meta: { total: p.length, page: 1 } } as any;
    case /^\/api\/programs\/[^/]+\/publish$/.test(url) && method === 'POST':
      return { published: true } as any;
    case /^\/api\/programs\/[^/]+\/deprecate$/.test(url) && method === 'POST':
      return { deprecated: true } as any;
    case /^\/api\/programs\/[^/]+\/archive$/.test(url) && method === 'POST':
      return { archived: true } as any;
    case /^\/api\/programs\/[^/]+$/.test(url) && method === 'DELETE':
      return { deleted: true } as any;
    case /^\/api\/programs\/[^/]+\/restore$/.test(url) && method === 'POST':
      return { restored: true } as any;
    case url.startsWith('/api/templates?'):
      return { data: seed.templates } as any;
    case url === '/api/templates' && method === 'POST':
      return { ...opts?.body && JSON.parse(opts.body.toString()), id: 'tmpl-new' } as any;
    case /^\/api\/templates\/[^/]+$/.test(url) && method === 'PATCH':
      return { ...opts?.body && JSON.parse(opts.body.toString()), id: url.split('/').at(-1) } as any;
    case /^\/api\/programs\/[^/]+\/templates\/[^/]+$/.test(url) && method === 'DELETE':
      return { deleted: true } as any;
    case /^\/api\/programs\/[^/]+\/templates\/[^/]+\/restore$/.test(url) && method === 'POST':
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
      programId: 'p1',
      name: 'Engineer Onboarding',
      category: 'Engineering',
      updatedAt: '2024-05-15',
      status: 'published',
    },
    {
      id: 't2',
      programId: 'p2',
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
