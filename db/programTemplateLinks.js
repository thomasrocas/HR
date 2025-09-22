'use strict';

const { TEMPLATE_STATUSES, serializeTemplateRow } = require('./templates');

const LINK_WRITABLE_COLUMNS = new Set([
  'week_number',
  'sort_order',
  'due_offset_days',
  'required',
  'visibility',
  'visible',
  'notes',
  'created_by',
  'updated_by',
]);

const toNullableBoolean = value => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 't', 'yes', 'y', '1'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', '0'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const toNullableString = value => {
  if (value === null || value === undefined) return null;
  return String(value);
};

const formatTemplateLinkRow = row => {
  const template = serializeTemplateRow(row);
  return {
    ...template,
    program_id: row.program_id ?? null,
    linked_at: row.created_at ?? null,
    link_id: row.link_id ?? row.id ?? null,
    visible: toNullableBoolean(row.visible),
    created_by: toNullableString(row.created_by ?? null),
    updated_by: toNullableString(row.updated_by ?? null),
    updated_at: row.updated_at ?? null,
  };
};

const pickLinkColumns = (payload = {}) => {
  const selected = {};
  for (const key of Object.keys(payload || {})) {
    if (!LINK_WRITABLE_COLUMNS.has(key)) continue;
    selected[key] = payload[key];
  }
  return selected;
};

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

  const mapLinkedTemplateRow = row => ({
    ...serializeTemplateRow(row),
    program_id: row.program_id ?? null,
    linked_at: row.created_at ?? null,
  });

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
      organization,
      subUnit,
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
    if (typeof organization === 'string') {
      const trimmed = organization.trim();
      if (trimmed) {
        params.push(trimmed.toLowerCase());
        where += ` and lower(coalesce(t.organization, '')) = $${params.length}`;
      }
    }
    if (typeof subUnit === 'string') {
      const trimmed = subUnit.trim();
      if (trimmed) {
        params.push(trimmed.toLowerCase());
        where += ` and lower(coalesce(t.sub_unit, '')) = $${params.length}`;
      }
    }
    const filterParams = params.slice();
    params.push(normalizedLimit);
    params.push(normalizedOffset);
    const sql = `
      select t.template_id,
             t.label,
             t.status,
             t.deleted_at,
             t.external_link as external_link,
             t.organization,
             t.sub_unit,
             l.program_id,
             l.id as link_id,
             l.created_at,
             l.updated_at,
             coalesce(l.week_number, t.week_number) as week_number,
             coalesce(l.notes, t.notes) as notes,
             coalesce(l.due_offset_days, t.due_offset_days) as due_offset_days,
             coalesce(l.required, t.required) as required,
             coalesce(l.visibility, t.visibility) as visibility,
             coalesce(l.sort_order, t.sort_order) as sort_order,
             l.visible,
             l.created_by,
             l.updated_by
        from public.program_template_links l
        join public.program_task_templates t
          on t.template_id = l.template_id
       ${where}
       order by coalesce(l.week_number, t.week_number) nulls last,
                coalesce(l.sort_order, t.sort_order) nulls last,
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

      data: rows.map(mapLinkedTemplateRow),

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
             l.id as link_id,
             l.created_at,
             l.updated_at,
             l.week_number,
             l.sort_order,
             l.visible
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
        link_id: row.link_id ?? null,
        updated_at: row.updated_at ?? null,
        week_number: row.week_number ?? null,
        sort_order: row.sort_order ?? null,
        visible: toNullableBoolean(row.visible),
      })),
      meta: {
        total,
        limit: normalizedLimit,
        offset: normalizedOffset,
      },
    };
  }

  async function getLinkedTemplate(options = {}) {
    const { programId, templateId, includeDeleted = false, db = pool } = options;
    if (!programId || !templateId) return null;
    const params = [templateId, programId];
    let where = 'where t.template_id = $1 and l.program_id = $2';
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
             t.deleted_at,
             t.external_link as external_link,
             l.program_id,
             l.created_at
        from public.program_task_templates t
        join public.program_template_links l on l.template_id = t.template_id
       ${where}
       limit 1
    `;
    const { rows } = await runQuery(db, sql, params);
    if (!rows.length) return null;
    return mapLinkedTemplateRow(rows[0]);
  }

  async function getTemplateForProgram(options = {}) {
    const { programId, templateId, includeDeleted = false, db = pool } = options;
    if (!programId || !templateId) return null;
    const params = [programId, templateId];
    let where = 'where l.program_id = $1 and t.template_id = $2';
    if (!includeDeleted) {
      where += ' and t.deleted_at is null';
    }
    const sql = `
      select t.template_id,
             t.label,
             t.status,
             t.deleted_at,
             t.external_link as external_link,
             l.program_id,
             l.id as link_id,
             l.created_at,
             l.updated_at,
             coalesce(l.week_number, t.week_number) as week_number,
             coalesce(l.notes, t.notes) as notes,
             coalesce(l.due_offset_days, t.due_offset_days) as due_offset_days,
             coalesce(l.required, t.required) as required,
             coalesce(l.visibility, t.visibility) as visibility,
             coalesce(l.sort_order, t.sort_order) as sort_order,
             l.visible,
             l.created_by,
             l.updated_by
        from public.program_template_links l
        join public.program_task_templates t on t.template_id = l.template_id
       ${where}
       limit 1
    `;
    const { rows } = await runQuery(db, sql, params);
    if (!rows.length) return null;
    return formatTemplateLinkRow(rows[0]);
  }

  async function attach(options = {}) {
    const { programId, templateId, db = pool, link = {} } = options;
    if (!programId || !templateId) {
      return { attached: false, alreadyAttached: false };
    }
    const existingSql = `
      select created_at
        from public.program_template_links
       where program_id = $1
         and template_id = $2
       limit 1
    `;
    const { rowCount: existingCount, rows: existingRows } = await runQuery(db, existingSql, [programId, templateId]);
    if (existingCount > 0) {
      return {
        attached: true,
        alreadyAttached: true,
        linked_at: existingRows[0]?.created_at ?? null,
        link: null,
      };
    }
    const linkFields = pickLinkColumns(link);
    const columns = ['template_id', 'program_id'];
    const values = ['$1', '$2'];
    const params = [templateId, programId];
    Object.entries(linkFields).forEach(([key, value]) => {
      if (value === undefined) return;
      columns.push(key);
      params.push(value);
      values.push(`$${params.length}`);
    });
    columns.push('id');
    values.push('gen_random_uuid()');
    const sql = `
      insert into public.program_template_links (${columns.join(', ')})
      values (${values.join(', ')})
      on conflict (program_id, template_id) do nothing
      returning id, template_id, program_id, week_number, sort_order, due_offset_days,
                required, visibility, visible, notes, created_by, updated_by, created_at, updated_at
    `;
    const { rowCount, rows } = await runQuery(db, sql, params);
    return {
      attached: true,
      alreadyAttached: rowCount === 0,
      linked_at: rows[0]?.created_at ?? null,
      link: rows[0] ?? null,
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


  async function updateMetadata(options = {}) {
    const { programId, templateId, patch = {}, db = pool } = options;
    if (!programId || !templateId) {
      return { updated: false, template: null };
    }
    const fields = Object.keys(patch).filter(key => patch[key] !== undefined);
    if (!fields.length) {
      return { updated: false, template: null };
    }
    const existing = await getLinkedTemplate({ programId, templateId, includeDeleted: false, db });
    if (!existing) {
      return { updated: false, template: null };
    }
    const values = [];
    const assignments = fields.map(field => {
      values.push(patch[field]);
      return `${field} = $${values.length}`;
    });
    values.push(templateId);
    const templateParamIndex = values.length;
    const sql = `
      update public.program_task_templates
         set ${assignments.join(', ')}
       where template_id = $${templateParamIndex}
         and deleted_at is null
    `;
    const { rowCount } = await runQuery(db, sql, values);
    if (!rowCount) {
      return { updated: false, template: null };
    }
    const template = await getLinkedTemplate({ programId, templateId, includeDeleted: true, db });
    return { updated: true, template };

  }

  async function updateLink(options = {}) {
    const { programId, templateId, patch = {}, db = pool } = options;
    if (!programId || !templateId) {
      return { updated: false, link: null };
    }
    const linkPatch = pickLinkColumns(patch);
    if (!Object.keys(linkPatch).length) {
      return { updated: false, link: null };
    }
    const assignments = [];
    const params = [];
    Object.entries(linkPatch).forEach(([key, value]) => {
      assignments.push(`${key} = $${params.length + 1}`);
      params.push(value);
    });
    assignments.push('updated_at = now()');
    params.push(programId);
    params.push(templateId);
    const sql = `
      update public.program_template_links
         set ${assignments.join(', ')}
       where program_id = $${params.length - 1}
         and template_id = $${params.length}
    `;
    const { rowCount } = await runQuery(db, sql, params);
    if (!rowCount) {
      return { updated: false, link: null };
    }
    const link = await getTemplateForProgram({ programId, templateId, includeDeleted: true, db });
    return { updated: true, link };
  }

  return {
    listTemplatesForProgram,
    listProgramsForTemplate,
    getLinkedTemplate,
    getTemplateForProgram,
    attach,
    detach,
    isLinked,

    updateMetadata,
    updateLink,

  };
}

module.exports = {
  createProgramTemplateLinksDao,
};
