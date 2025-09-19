'use strict';

const TEMPLATE_STATUSES = new Set(['draft', 'published', 'deprecated']);

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const toNumber = value => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  const asNumber = Number(value);
  return Number.isNaN(asNumber) ? null : asNumber;
};

const toTemplateId = value => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  return typeof value === 'number' ? value : String(value);
};

const normalizeLimit = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(numeric), MAX_LIMIT);
};

const normalizeOffset = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.floor(numeric);
};

const toBoolean = value => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 't', 'yes', 'y', '1', 'required'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', '0', 'optional'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const serializeTemplateRow = row => ({
  template_id: toTemplateId(row.template_id),
  week_number: toNumber(row.week_number),
  label: row.label ?? null,
  notes: row.notes ?? null,
  due_offset_days: toNumber(row.due_offset_days),
  required: toBoolean(row.required),
  visibility: row.visibility ?? null,
  sort_order: toNumber(row.sort_order),
  status: row.status ?? null,
  deleted_at: row.deleted_at ?? null,
});

function createTemplatesDao(pool) {
  const runQuery = (db, text, params) => db.query(text, params);

  const withDb = (options = {}) => ({
    db: options.db ?? pool,
    limit: normalizeLimit(options.limit ?? DEFAULT_LIMIT),
    offset: normalizeOffset(options.offset ?? 0),
    includeDeleted: Boolean(options.includeDeleted),
    status: options.status,
    search: options.search,
  });

  const buildStatusFilter = (status, params) => {
    if (!status) return '';
    if (typeof status !== 'string') return '';
    const normalized = status.trim().toLowerCase();
    if (!TEMPLATE_STATUSES.has(normalized)) return '';
    params.push(normalized);
    return ` and t.status = $${params.length}`;
  };

  const buildSearchFilter = (search, params) => {
    if (!search || typeof search !== 'string') return '';
    const normalized = search.trim();
    if (!normalized) return '';
    params.push(`%${normalized.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
    return ` and (t.label ilike $${params.length} or t.notes ilike $${params.length})`;
  };

  async function list(options = {}) {
    const { db, limit, offset, includeDeleted, status, search } = withDb(options);
    const params = [];
    let where = 'where 1=1';
    if (!includeDeleted) {
      where += ' and t.deleted_at is null';
    }
    where += buildStatusFilter(status, params);
    where += buildSearchFilter(search, params);
    const filterParams = params.slice();
    params.push(limit);
    params.push(offset);
    const sql = `
      select t.template_id,
             t.week_number,
             t.label,
             t.notes,
             t.due_offset_days,
             t.required,
             t.visibility,
             t.sort_order,
             t.status,
             t.deleted_at
        from public.program_task_templates t
       ${where}
       order by t.week_number nulls last,
                t.sort_order nulls last,
                t.template_id
       limit $${params.length - 1}
      offset $${params.length}
    `;
    const { rows } = await runQuery(db, sql, params);
    const countSql = `
      select count(*) as total
        from public.program_task_templates t
       ${where}
    `;
    const { rows: countRows } = await runQuery(db, countSql, filterParams);
    const total = Number(countRows[0]?.total || 0);
    return {
      data: rows.map(serializeTemplateRow),
      meta: {
        total,
        limit,
        offset,
      },
    };
  }

  async function getById(options = {}) {
    const { id, includeDeleted = false, db = pool } = options;
    if (id === undefined || id === null) return null;
    const params = [id];
    let where = 'where t.template_id = $1';
    if (!includeDeleted) {
      where += ' and t.deleted_at is null';
    }
    const sql = `
      select t.template_id,
             t.week_number,
             t.label,
             t.notes,
             t.due_offset_days,
             t.required,
             t.visibility,
             t.sort_order,
             t.status,
             t.deleted_at
        from public.program_task_templates t
       ${where}
       limit 1
    `;
    const { rows } = await runQuery(db, sql, params);
    if (!rows.length) return null;
    return serializeTemplateRow(rows[0]);
  }

  async function create(options = {}) {
    const {
      db = pool,
      week_number = null,
      label,
      notes = null,
      due_offset_days = null,
      required = null,
      visibility = null,
      sort_order = null,
      status = 'draft',
    } = options;
    const sql = `
      insert into public.program_task_templates
        (week_number, label, notes, due_offset_days, required, visibility, sort_order, status)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      returning template_id, week_number, label, notes, due_offset_days, required, visibility, sort_order, status, deleted_at
    `;
    const params = [
      week_number,
      label,
      notes,
      due_offset_days,
      required,
      visibility,
      sort_order,
      status,
    ];
    const { rows } = await runQuery(db, sql, params);
    return serializeTemplateRow(rows[0]);
  }

  async function update(options = {}) {
    const { id, patch = {}, db = pool } = options;
    if (!id) return null;
    const fields = [];
    const values = [];
    for (const key of ['week_number', 'label', 'notes', 'due_offset_days', 'required', 'visibility', 'sort_order', 'status']) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        values.push(patch[key]);
        fields.push(`${key} = $${values.length}`);
      }
    }
    if (!fields.length) {
      return getById({ id, includeDeleted: true, db });
    }
    values.push(id);
    const sql = `
      update public.program_task_templates
         set ${fields.join(', ')}
       where template_id = $${values.length}
       returning template_id, week_number, label, notes, due_offset_days, required, visibility, sort_order, status, deleted_at
    `;
    const { rows } = await runQuery(db, sql, values);
    if (!rows.length) return null;
    return serializeTemplateRow(rows[0]);
  }

  async function softDelete(options = {}) {
    const { id, db = pool } = options;
    if (!id) return null;
    const sql = `
      update public.program_task_templates
         set deleted_at = coalesce(deleted_at, now())
       where template_id = $1
         and deleted_at is null
       returning template_id, week_number, label, notes, due_offset_days, required, visibility, sort_order, status, deleted_at
    `;
    const { rows } = await runQuery(db, sql, [id]);
    if (!rows.length) return null;
    return serializeTemplateRow(rows[0]);
  }

  async function restore(options = {}) {
    const { id, db = pool } = options;
    if (!id) return null;
    const sql = `
      update public.program_task_templates
         set deleted_at = null
       where template_id = $1
         and deleted_at is not null
       returning template_id, week_number, label, notes, due_offset_days, required, visibility, sort_order, status, deleted_at
    `;
    const { rows } = await runQuery(db, sql, [id]);
    if (!rows.length) return null;
    return serializeTemplateRow(rows[0]);
  }

  return {
    list,
    getById,
    create,
    update,
    softDelete,
    restore,
  };
}

module.exports = {
  createTemplatesDao,
  TEMPLATE_STATUSES,
  serializeTemplateRow,
};
