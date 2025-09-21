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
  deletedAt?: string | null;
}

type UserListResponse = { data: User[]; meta: { total: number; page: number } };
type ProgramListResponse = { data: Program[]; meta: { total: number; page: number } };
type TemplateListResponse = { data: Template[] };

type GlobalWithEnv = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

const globalEnv =
  typeof globalThis !== 'undefined'
    ? ((globalThis as GlobalWithEnv).process?.env ?? undefined)
    : undefined;

const parseBooleanFlag = (value: string | undefined, fallback: boolean) => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
};

const useMock = parseBooleanFlag(globalEnv?.USE_MOCK, true);

class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const tryParseJson = (value: string) => {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return undefined;
  }
};

const toDateString = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

const USER_STATUSES = new Set<User['status']>(['active', 'pending', 'suspended', 'archived']);
const PROGRAM_STATUSES = new Set<Program['status']>(['draft', 'published', 'deprecated', 'archived']);
const TEMPLATE_STATUS_SET = new Set<NonNullable<Template['status']>>(['draft', 'published', 'deprecated']);

const normalizeRoles = (value: unknown): User['roles'] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<User['roles'][number]>();
  for (const role of value) {
    if (typeof role !== 'string') continue;
    const normalized = role.toLowerCase() as User['roles'][number];
    if (normalized === 'admin' || normalized === 'manager' || normalized === 'viewer' || normalized === 'trainee') {
      seen.add(normalized);
    }
  }
  return Array.from(seen);
};

const normalizeUser = (raw: any): User => {
  if (!raw || typeof raw !== 'object') {
    return { id: '', name: '', email: '', roles: [], status: 'active' };
  }

  const idCandidate = raw.id ?? raw.user_id ?? raw.uid ?? '';
  const emailCandidate = raw.email ?? raw.username ?? raw.user_email ?? '';
  const rawName = raw.name ?? raw.full_name ?? raw.display_name ?? raw.username ?? raw.email ?? '';
  const statusCandidate = typeof raw.status === 'string' ? raw.status.toLowerCase() : '';
  const status: User['status'] = USER_STATUSES.has(statusCandidate as User['status'])
    ? (statusCandidate as User['status'])
    : 'active';
  const roles = normalizeRoles(raw.roles ?? raw.role_keys ?? raw.role ?? []);
  const fallbackName =
    rawName && String(rawName).trim().length
      ? String(rawName)
      : typeof emailCandidate === 'string' && emailCandidate.includes('@')
        ? String(emailCandidate).split('@')[0]
        : '';

  return {
    id: String(idCandidate ?? ''),
    name: fallbackName,
    email: String(emailCandidate ?? ''),
    roles,
    status,
  };
};

const normalizeUsersResult = (payload: unknown): UserListResponse => {
  if (Array.isArray(payload)) {
    const data = payload.map(normalizeUser);
    return { data, meta: { total: data.length, page: 1 } };
  }
  if (payload && typeof payload === 'object') {
    const dataCandidate = (payload as { data?: unknown }).data;
    const metaCandidate = (payload as { meta?: { total?: number; page?: number } }).meta;
    if (Array.isArray(dataCandidate)) {
      const data = dataCandidate.map(normalizeUser);
      return {
        data,
        meta: {
          total: typeof metaCandidate?.total === 'number' ? metaCandidate.total : data.length,
          page: typeof metaCandidate?.page === 'number' ? metaCandidate.page : 1,
        },
      };
    }
  }
  return { data: [], meta: { total: 0, page: 1 } };
};

const normalizeProgram = (raw: any): Program => {
  if (!raw || typeof raw !== 'object') {
    return {
      id: '',
      name: '',
      version: '1.0',
      status: 'draft',
      owner: '',
      updatedAt: '',
      assignedCount: 0,
    };
  }

  const idCandidate = raw.id ?? raw.program_id ?? raw.slug ?? '';
  const nameCandidate = raw.name ?? raw.title ?? '';
  const versionCandidate = raw.version ?? raw.total_weeks ?? raw.release ?? '1.0';
  const statusCandidate = typeof raw.status === 'string' ? raw.status.toLowerCase() : '';
  let status: Program['status'];
  if (PROGRAM_STATUSES.has(statusCandidate as Program['status'])) {
    status = statusCandidate as Program['status'];
  } else if (raw.deleted_at || raw.deletedAt) {
    status = 'archived';
  } else {
    status = 'published';
  }
  const ownerCandidate = raw.owner ?? raw.created_by ?? raw.createdBy ?? '';
  const updatedCandidate = (
    raw.updatedAt ??
    raw.updated_at ??
    raw.updated ??
    raw.modified_at ??
    raw.created_at ??
    raw.createdAt ??
    null
  );
  const assignedCandidate = raw.assignedCount ?? raw.assigned_count ?? raw.assignment_count ?? 0;
  const assignedCount = (
    typeof assignedCandidate === 'number'
      ? assignedCandidate
      : Number.isFinite(Number(assignedCandidate))
        ? Number(assignedCandidate)
        : 0
  );

  return {
    id: String(idCandidate ?? ''),
    name:
      nameCandidate && String(nameCandidate).trim().length
        ? String(nameCandidate)
        : `Program ${String(idCandidate ?? '')}`,
    version:
      versionCandidate === undefined || versionCandidate === null || versionCandidate === ''
        ? '1.0'
        : String(versionCandidate),
    status,
    owner: ownerCandidate ? String(ownerCandidate) : '',
    updatedAt: toDateString(updatedCandidate),
    assignedCount,
  };
};

const normalizeProgramList = (payload: unknown): ProgramListResponse => {
  if (Array.isArray(payload)) {
    const data = payload.map(normalizeProgram);
    return { data, meta: { total: data.length, page: 1 } };
  }
  if (payload && typeof payload === 'object') {
    const dataCandidate = (payload as { data?: unknown }).data;
    const metaCandidate = (payload as { meta?: { total?: number; page?: number } }).meta;
    if (Array.isArray(dataCandidate)) {
      const data = dataCandidate.map(normalizeProgram);
      return {
        data,
        meta: {
          total: typeof metaCandidate?.total === 'number' ? metaCandidate.total : data.length,
          page: typeof metaCandidate?.page === 'number' ? metaCandidate.page : 1,
        },
      };
    }
  }
  return { data: [], meta: { total: 0, page: 1 } };
};

const normalizeTemplate = (raw: any): Template => {
  if (!raw || typeof raw !== 'object') {
    return { id: '', programId: '', name: '', category: 'General' };
  }

  const idCandidate = raw.id ?? raw.template_id ?? raw.uid ?? '';
  const programCandidate = raw.programId ?? raw.program_id ?? '';
  const nameCandidate = raw.name ?? raw.label ?? '';
  const categoryCandidate = raw.category ?? raw.notes ?? '';
  const statusCandidate = typeof raw.status === 'string' ? raw.status.toLowerCase() : '';
  const normalizedStatus = TEMPLATE_STATUS_SET.has(statusCandidate as NonNullable<Template['status']>)
    ? (statusCandidate as Template['status'])
    : undefined;
  const updatedCandidate = raw.updatedAt ?? raw.updated_at ?? raw.updated ?? raw.modified_at ?? null;

  const template: Template = {
    id: String(idCandidate ?? ''),
    programId: String(programCandidate ?? ''),
    name:
      nameCandidate && String(nameCandidate).trim().length
        ? String(nameCandidate)
        : `Template ${String(idCandidate ?? '')}`,
    category: String(categoryCandidate ?? 'General'),
  };
  const parsedDate = toDateString(updatedCandidate);
  if (parsedDate) {
    template.updatedAt = parsedDate;
  }
  if (normalizedStatus) {
    template.status = normalizedStatus;
  }
  const deletedCandidate = raw.deletedAt ?? raw.deleted_at;
  if (deletedCandidate !== undefined) {
    if (deletedCandidate === null) {
      template.deletedAt = null;
    } else {
      const parsedDeleted = toDateString(deletedCandidate);
      template.deletedAt = parsedDeleted || String(deletedCandidate);
    }
  }
  return template;
};

const normalizeTemplateList = (payload: unknown): TemplateListResponse => {
  if (Array.isArray(payload)) {
    return { data: payload.map(normalizeTemplate) };
  }
  if (payload && typeof payload === 'object') {
    const dataCandidate = (payload as { data?: unknown }).data;
    if (Array.isArray(dataCandidate)) {
      return { data: dataCandidate.map(normalizeTemplate) };
    }
  }
  return { data: [] };
};

const buildProgramWritePayload = (payload: Partial<Program>): Record<string, unknown> => {
  const { id: _id, updatedAt: _updatedAt, assignedCount: _assignedCount, ...rest } = payload;
  const body: Record<string, unknown> = { ...rest };
  if (payload.name && !body.title) {
    body.title = payload.name;
  }
  if (payload.version && !body.total_weeks) {
    const numeric = Number(payload.version);
    if (!Number.isNaN(numeric)) {
      body.total_weeks = numeric;
    }
  }
  return body;
};

const buildTemplateWritePayload = (payload: Partial<Template>): Record<string, unknown> => {
  const { id: _id, programId: _programId, updatedAt: _updatedAt, deletedAt: _deletedAt, ...rest } = payload;
  const body: Record<string, unknown> = { ...rest };
  if (payload.name && !body.label) {
    body.label = payload.name;
  }
  if (payload.category && !body.notes) {
    body.notes = payload.category;
  }
  if (payload.status) {
    const normalized = payload.status.toLowerCase() as Template['status'];
    if (TEMPLATE_STATUS_SET.has(normalized as NonNullable<Template['status']>)) {
      body.status = normalized;
    }
  }
  return body;
};

const attemptRequests = async <T>(requests: { url: string; init?: RequestInit }[]): Promise<T> => {
  let lastError: unknown;
  for (const { url, init } of requests) {
    try {
      return await apiFetch<T>(url, init);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Request failed');
};

const PROGRAMS_BASE = '/programs';
const programTemplatesBase = (programId: string) => `${PROGRAMS_BASE}/${programId}/templates`;

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  if (!useMock) {
    const headers = new Headers(opts.headers ?? {});
    if (!headers.has('Content-Type') && opts.body && !(opts.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const init: RequestInit = {
      ...opts,
      headers,
      credentials: opts.credentials ?? 'include',
    };

    const response = await fetch(url, init);
    const rawBody = await response.text();

    if (!response.ok) {
      const parsed = tryParseJson(rawBody);
      const message =
        (parsed && typeof parsed === 'object' && typeof (parsed as { error?: string }).error === 'string'
          ? (parsed as { error: string }).error
          : '') ||
        rawBody ||
        response.statusText ||
        `Request to ${url} failed with status ${response.status}`;
      throw new ApiError(message, response.status, parsed ?? rawBody);
    }

    if (!rawBody) {
      return undefined as T;
    }

    const parsed = tryParseJson(rawBody);
    return (parsed ?? (rawBody as unknown)) as T;
  }

  return mockFetch<T>(url, opts);
}

/* -------------------------- Users -------------------------- */
export const getUsers = async (
  params: {
    query?: string;
    role?: string;
    status?: string;
    page?: number;
  } = {},
): Promise<UserListResponse> => {
  const search = new URLSearchParams();
  if (params.query) search.set('query', params.query);
  if (params.role) search.set('role', params.role);
  if (params.status) search.set('status', params.status);
  if (typeof params.page === 'number') search.set('page', String(params.page));
  const query = search.toString();
  const base = useMock ? '/api/users' : '/rbac/users';
  const endpoint = `${base}${query ? `?${query}` : ''}`;
  const raw = await apiFetch<unknown>(endpoint);
  return normalizeUsersResult(raw);
};

export const createUser = async (payload: Partial<User>): Promise<User> => {
  const raw = await apiFetch<unknown>('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return normalizeUser(raw);
};

export const updateUser = async (id: string, payload: Partial<User>): Promise<User> => {
  const raw = await apiFetch<unknown>(`/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return normalizeUser(raw);
};

export const updateUserRoles = async (id: string, roles: string[]): Promise<User> => {
  const requests = useMock
    ? [{ url: `/api/users/${id}/roles`, init: { method: 'POST', body: JSON.stringify({ roles }) } }]
    : [
        { url: `/rbac/users/${id}/roles`, init: { method: 'PATCH', body: JSON.stringify({ roles }) } },
        { url: `/api/users/${id}/roles`, init: { method: 'POST', body: JSON.stringify({ roles }) } },
      ];
  try {
    const raw = await attemptRequests<unknown>(requests);
    if (raw && typeof raw === 'object' && 'id' in (raw as Record<string, unknown>)) {
      return normalizeUser(raw);
    }
    return normalizeUser({ id, roles });
  } catch (error) {
    return normalizeUser({ id, roles });
  }
};

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
export const getPrograms = async (
  params: { status?: string; query?: string; page?: number; includeDeleted?: boolean } = {},
): Promise<ProgramListResponse> => {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.query) search.set('query', params.query);
  if (typeof params.page === 'number') search.set('page', String(params.page));
  if (params.includeDeleted) search.set('include_deleted', 'true');

  const query = search.toString();
  const raw = await apiFetch<unknown>(`${PROGRAMS_BASE}${query ? `?${query}` : ''}`);
  return normalizeProgramList(raw);
};

export const createProgram = async (payload: Partial<Program>): Promise<Program> => {
  const raw = await apiFetch<unknown>(PROGRAMS_BASE, {
    method: 'POST',
    body: JSON.stringify(buildProgramWritePayload(payload)),
  });
  return normalizeProgram(raw);
};

export const patchProgram = async (id: string, payload: Partial<Program>): Promise<Program> => {
  const raw = await apiFetch<unknown>(`${PROGRAMS_BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(buildProgramWritePayload(payload)),
  });
  return normalizeProgram(raw);
};

export const publishProgram = (id: string) =>
  attemptRequests<unknown>(
    useMock
      ? [{ url: `/api/programs/${id}/publish`, init: { method: 'POST' } }]
      : [
          { url: `/api/programs/${id}/publish`, init: { method: 'POST' } },
          { url: `${PROGRAMS_BASE}/${id}/publish`, init: { method: 'POST' } },
        ],
  );

export const deprecateProgram = (id: string) =>
  attemptRequests<unknown>(
    useMock
      ? [{ url: `/api/programs/${id}/deprecate`, init: { method: 'POST' } }]
      : [
          { url: `/api/programs/${id}/deprecate`, init: { method: 'POST' } },
          { url: `${PROGRAMS_BASE}/${id}/deprecate`, init: { method: 'POST' } },
        ],
  );

export const archiveProgram = (id: string) =>
  attemptRequests<unknown>(
    useMock
      ? [
          { url: `/api/programs/${id}/archive`, init: { method: 'POST' } },
          { url: `${PROGRAMS_BASE}/${id}`, init: { method: 'DELETE' } },
        ]
      : [
          { url: `${PROGRAMS_BASE}/${id}`, init: { method: 'DELETE' } },
          { url: `/api/programs/${id}/archive`, init: { method: 'POST' } },
        ],
  );

export const deleteProgram = (id: string) =>
  attemptRequests<unknown>([
    { url: `${PROGRAMS_BASE}/${id}`, init: { method: 'DELETE' } },
  ]);

export const restoreProgram = (id: string) =>
  attemptRequests<unknown>(
    useMock
      ? [{ url: `/api/programs/${id}/restore`, init: { method: 'POST' } }]
      : [
          { url: `${PROGRAMS_BASE}/${id}/restore`, init: { method: 'POST' } },
          { url: `/api/programs/${id}/restore`, init: { method: 'POST' } },
        ],
  );

export const cloneProgram = (id: string) =>
  attemptRequests<Program>(
    useMock
      ? [{ url: `/api/programs/${id}/clone`, init: { method: 'POST' } }]
      : [
          { url: `/api/programs/${id}/clone`, init: { method: 'POST' } },
          { url: `${PROGRAMS_BASE}/${id}/clone`, init: { method: 'POST' } },
        ],
  ).then(normalizeProgram);

export const getProgramTemplates = async (
  programId: string,
  params: { includeDeleted?: boolean } = {},
): Promise<TemplateListResponse> => {
  const search = new URLSearchParams();
  if (params.includeDeleted) search.set('include_deleted', 'true');
  const query = search.toString();
  const raw = await apiFetch<unknown>(
    `${programTemplatesBase(programId)}${query ? `?${query}` : ''}`,
  );
  return normalizeTemplateList(raw);
};

export const createTemplate = async (programId: string, payload: Partial<Template>): Promise<Template> => {
  const raw = await apiFetch<unknown>(programTemplatesBase(programId), {
    method: 'POST',
    body: JSON.stringify(buildTemplateWritePayload(payload)),
  });
  return normalizeTemplate(raw);
};

export const patchTemplate = async (
  programId: string,
  templateId: string,
  payload: Partial<Template>,
): Promise<Template> => {
  const raw = await apiFetch<unknown>(`${programTemplatesBase(programId)}/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify(buildTemplateWritePayload(payload)),
  });
  return normalizeTemplate(raw);
};

export const deleteTemplate = (programId: string, templateId: string) =>
  apiFetch(`${programTemplatesBase(programId)}/${templateId}`, { method: 'DELETE' });

export const restoreTemplate = (programId: string, templateId: string) =>
  attemptRequests<unknown>(
    useMock
      ? [{ url: `/programs/${programId}/templates/${templateId}/restore`, init: { method: 'POST' } }]
      : [
          { url: `${programTemplatesBase(programId)}/${templateId}/restore`, init: { method: 'POST' } },
          { url: `/api/programs/${programId}/templates/${templateId}/restore`, init: { method: 'POST' } },
        ],
  );

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
    case /^\/programs\/[^/]+\/templates$/.test(url) && method === 'POST': {
      const programId = url.split('/')[2];
      const payload = (opts?.body && JSON.parse(opts.body.toString())) || {};
      const requestedStatus = typeof payload.status === 'string' ? payload.status.toLowerCase() : 'draft';
      const status = ['draft', 'published', 'deprecated'].includes(requestedStatus)
        ? requestedStatus
        : 'draft';
      return {
        ...payload,
        id: 'tmpl-new',
        programId,
        status,
      } as any;
    }
    case /^\/programs\/[^/]+\/templates\/[^/]+$/.test(url) && method === 'PATCH': {
      const programId = url.split('/')[2];
      const payload = (opts?.body && JSON.parse(opts.body.toString())) || {};
      if (payload.status) {
        payload.status = String(payload.status).toLowerCase();
      }
      return {
        ...payload,
        id: url.split('/').at(-1),
        programId,
      } as any;
    }
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
