'use strict';

const { TEMPLATE_STATUSES, serializeTemplateRow } = require('./templates');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

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

function createProgramTemplateLinksDao(pool) {
  const runQuery = (db, text, params) => db.query(text, params);

  const buildStatusFilter = (status, params) => {
    if (!status || typeof status !== 'string') return '';
    const normalized = status.trim().toLowerCase();
    if (!TEMPLATE_STATUSES.has(normalized)) return '';
    params.push(normalized);
    return ` and t.status = $${params.length}`;
  };

  async function listTemplatesForProgram(options = {}) {
    const {
      programId,
      db = pool,
      limit = DEFAULT_LIMIT,
      offset = 0,
      includeDeleted = false,
      status,
    } = options;
    if (!programId) {
      return { data: [], meta: { total: 0, limit: normalizeLimit(limit), offset: normalizeOffset(offset) } };
    }
    const normalizedLimit = normalizeLimit(limit);
    const normalizedOffset = normalizeOffset(offset);
    const params = [programId];
    let where = 'where l.program_id = $1';
    if (!includeDeleted) {
      where += ' and t.deleted_at is null';
    }
    where += buildStatusFilter(status, params);
    const filterParams = params.slice();
    params.push(normalizedLimit);
    params.push(normalizedOffset);
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
             t.deleted_at,
             l.program_id,
             l.created_at
        from public.program_template_links l
        join public.program_task_templates t
          on t.template_id = l.template_id
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
        from public.program_template_links l
        join public.program_task_templates t on t.template_id = l.template_id
       ${where}
    `;
    const { rows: countRows } = await runQuery(db, countSql, filterParams);
    const total = Number(countRows[0]?.total || 0);
    return {
      data: rows.map(row => ({
        ...serializeTemplateRow(row),
        program_id: row.program_id,
        linked_at: row.created_at ?? null,
      })),
      meta: {
        total,
        limit: normalizedLimit,
        offset: normalizedOffset,
      },
    };
  }

  async function listProgramsForTemplate(options = {}) {
    const {
      templateId,
      db = pool,
      limit = DEFAULT_LIMIT,
      offset = 0,
    } = options;
    if (!templateId) {
      return { data: [], meta: { total: 0, limit: normalizeLimit(limit), offset: normalizeOffset(offset) } };
    }
    const normalizedLimit = normalizeLimit(limit);
    const normalizedOffset = normalizeOffset(offset);
    const params = [templateId];
    const filterParams = params.slice();
    params.push(normalizedLimit);
    params.push(normalizedOffset);
    const sql = `
      select p.program_id,
             p.title,
             p.deleted_at,
             l.created_at
        from public.program_template_links l
        join public.programs p on p.program_id = l.program_id
       where l.template_id = $1
       order by p.title nulls last, p.program_id
       limit $${params.length - 1}
      offset $${params.length}
    `;
    const { rows } = await runQuery(db, sql, params);
    const countSql = `
      select count(*) as total
        from public.program_template_links l
       where l.template_id = $1
    `;
    const { rows: countRows } = await runQuery(db, countSql, filterParams);
    const total = Number(countRows[0]?.total || 0);
    return {
      data: rows.map(row => ({
        program_id: row.program_id,
        title: row.title ?? null,
        deleted_at: row.deleted_at ?? null,
        linked_at: row.created_at ?? null,
      })),
      meta: {
        total,
        limit: normalizedLimit,
        offset: normalizedOffset,
      },
    };
  }

  async function attach(options = {}) {
    const { programId, templateId, db = pool } = options;
    if (!programId || !templateId) {
      return { attached: false, alreadyAttached: false };
    }
    const sql = `
      insert into public.program_template_links (template_id, program_id)
      values ($1, $2)
      on conflict do nothing
      returning created_at
    `;
    const { rowCount, rows } = await runQuery(db, sql, [templateId, programId]);
    return {
      attached: true,
      alreadyAttached: rowCount === 0,
      linked_at: rows[0]?.created_at ?? null,
    };
  }

  async function detach(options = {}) {
    const { programId, templateId, db = pool } = options;
    if (!programId || !templateId) {
      return { detached: false, wasAttached: false };
    }
    const sql = `
      delete from public.program_template_links
       where template_id = $1
         and program_id = $2
    `;
    const { rowCount } = await runQuery(db, sql, [templateId, programId]);
    return {
      detached: true,
      wasAttached: rowCount > 0,
    };
  }

  async function isLinked(options = {}) {
    const { programId, templateId, db = pool } = options;
    if (!programId || !templateId) return false;
    const sql = `
      select 1
        from public.program_template_links
       where template_id = $1
         and program_id = $2
       limit 1
    `;
    const { rowCount } = await runQuery(db, sql, [templateId, programId]);
    return rowCount > 0;
  }

  return {
    listTemplatesForProgram,
    listProgramsForTemplate,
    attach,
    detach,
    isLinked,
  };
}

module.exports = {
  createProgramTemplateLinksDao,
};
