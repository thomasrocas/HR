import {
  DISCIPLINE_TYPE_OPTIONS,
  DELIVERY_TYPE_OPTIONS,
  DEPARTMENT_OPTIONS,
  ORGANIZATION_OPTIONS,
  SUB_UNIT_OPTIONS,
} from '../../shared/field-options.js';

const API = window.location.origin;
const TEMPLATE_API = `${API}/api/templates`;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = new Error(`${options.method || 'GET'} ${url} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

function createStatusBadge(status) {
  const normalized = (status || '').toLowerCase();
  const badgeClass = {
    published: 'badge badge-published',
    draft: 'badge badge-draft',
    deprecated: 'badge badge-deprecated',
    archived: 'badge badge-archived',
    active: 'badge badge-published',
  }[normalized] || 'badge badge-draft';
  const label = normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '—';
  return `<span class="${badgeClass}">${label}</span>`;
}

function formatDate(dateLike) {
  if (!dateLike) return '—';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return dateLike;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateLike) {
  if (!dateLike) return '—';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) {
    if (typeof dateLike === 'string') return dateLike;
    return '—';
  }
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const HTML_ESCAPE_LOOKUP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const HTML_ESCAPE_REGEXP = /[&<>"']/g;

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(HTML_ESCAPE_REGEXP, match => HTML_ESCAPE_LOOKUP[match] || match);
}

function populateSelectOptions(selectElement, options) {
  if (!(selectElement instanceof HTMLSelectElement) || !Array.isArray(options)) {
    return;
  }
  const existingValues = new Set(Array.from(selectElement.options, option => option.value));
  options.forEach(optionValue => {
    if (!optionValue || existingValues.has(optionValue)) {
      return;
    }
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    selectElement.appendChild(option);
    existingValues.add(optionValue);
  });
}

function ensureSelectValue(selectElement, value) {
  if (!(selectElement instanceof HTMLSelectElement)) {
    return;
  }
  if (value === null || value === undefined || value === '') {
    selectElement.value = '';
    return;
  }
  const stringValue = String(value);
  const hasOption = Array.from(selectElement.options).some(option => option.value === stringValue);
  if (!hasOption) {
    const option = document.createElement('option');
    option.value = stringValue;
    option.textContent = stringValue;
    selectElement.appendChild(option);
  }
  selectElement.value = stringValue;
}

let toastContainerElement = null;

function ensureToastStyles() {
  if (document.getElementById('toastStyles')) return;
  const style = document.createElement('style');
  style.id = 'toastStyles';
  style.textContent = `
.toast-stack {
  position: fixed;
  top: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 70;
}

.toast {
  min-width: 220px;
  max-width: min(320px, 90vw);
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background-color: var(--surface);
  color: var(--ink);
  box-shadow: 0 20px 45px -20px rgba(15, 23, 42, 0.35);
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast[data-state="visible"] {
  opacity: 1;
  transform: translateY(0);
}

.toast-success {
  border-color: rgba(34, 197, 94, 0.35);
  background-color: rgba(34, 197, 94, 0.15);
  color: #166534;
}

.toast-error {
  border-color: rgba(248, 113, 113, 0.35);
  background-color: rgba(248, 113, 113, 0.18);
  color: #b91c1c;
}

.toast-info {
  border-color: rgba(59, 130, 246, 0.35);
  background-color: rgba(59, 130, 246, 0.15);
  color: #1d4ed8;
}
  `;
  document.head.appendChild(style);
}

function ensureToastContainer() {
  if (toastContainerElement && document.body.contains(toastContainerElement)) {
    return toastContainerElement;
  }
  ensureToastStyles();
  const container = document.createElement('div');
  container.className = 'toast-stack';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('role', 'status');
  document.body.appendChild(container);
  toastContainerElement = container;
  return container;
}

function showToast(message, { type = 'info', duration = 5000 } = {}) {
  if (!message) return;
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  const normalizedType = ['success', 'error', 'info'].includes(type) ? type : 'info';
  toast.className = `toast toast-${normalizedType}`;
  toast.textContent = message;
  container.appendChild(toast);

  const hide = () => {
    toast.dataset.state = 'hidden';
  };

  const remove = () => {
    if (!toast.isConnected) return;
    toast.removeEventListener('transitionend', removeOnTransitionEnd);
    if (toast.parentElement) {
      toast.parentElement.removeChild(toast);
    }
  };

  const removeOnTransitionEnd = event => {
    if (event.target !== toast || event.propertyName !== 'opacity') return;
    remove();
  };

  toast.addEventListener('click', hide);
  toast.addEventListener('transitionend', removeOnTransitionEnd);

  requestAnimationFrame(() => {
    toast.dataset.state = 'visible';
  });

  setTimeout(hide, Math.max(1000, duration));
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableBoolean(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'required', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'optional', 'n'].includes(normalized)) return false;
  }
  return null;
}

function normalizeId(value) {
  if (value === undefined || value === null) return null;
  return String(value);
}

function isValidHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function getProgramId(program) {
  return normalizeId(program?.id ?? program?.programId ?? program?.program_id);
}

function getTemplateId(template) {
  return normalizeId(template?.id ?? template?.templateId ?? template?.template_id ?? template?.template?.id);
}

function getTemplateProgramId(template) {
  const candidates = [
    template?.program_id,
    template?.programId,
    template?.program?.id,
    template?.program?.programId,
    template?.program?.program_id,
    template?.template?.program_id,
    template?.template?.programId,
    template?.template?.program?.id,
    template?.template?.program?.programId,
    template?.template?.program?.program_id,
    template?.link?.program_id,
    template?.link?.programId,
    template?.link?.program?.id,
    template?.link?.program?.programId,
    template?.link?.program?.program_id,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeId(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function getTemplateLinkId(template) {
  const candidates = [
    template?.link_id,
    template?.linkId,
    template?.link?.id,
  ];
  for (const candidate of candidates) {
    const parsed = toNullableNumber(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function getTemplateName(template) {
  const value = [
    template?.label,
    template?.name,
    template?.title,
    template?.template?.name,
    template?.template?.title,
    template?.template?.label,
  ].find(entry => entry !== null && entry !== undefined && entry !== '');
  return value || '';
}

function getTemplateCategory(template) {
  const value = [
    template?.category,
    template?.type,
    template?.template_category,
    template?.template?.category,
    template?.template?.type,
  ].find(entry => entry !== null && entry !== undefined && entry !== '');
  return value || '';
}

function getTemplateDisciplineType(template) {
  const value = [
    template?.discipline_type,
    template?.disciplineType,
    template?.discipline,
    template?.template?.discipline_type,
    template?.template?.disciplineType,
    template?.template?.discipline,
  ].find(entry => entry !== null && entry !== undefined && entry !== '');
  return value || '';
}

function getTemplateDeliveryType(template) {
  const value = [
    template?.type_delivery,
    template?.typeDelivery,
    template?.delivery_type,
    template?.deliveryType,
    template?.template?.type_delivery,
    template?.template?.typeDelivery,
    template?.template?.delivery_type,
    template?.template?.deliveryType,
  ].find(entry => entry !== null && entry !== undefined && entry !== '');
  return value || '';
}

function getTemplateDepartment(template) {
  const value = [
    template?.department,
    template?.dept,
    template?.template?.department,
    template?.template?.dept,
  ].find(entry => entry !== null && entry !== undefined && entry !== '');
  return value || '';
}

function getTemplateOrganization(template) {
  const value = [
    template?.organization,
    template?.org,
    template?.program?.organization,
    template?.program?.org,
    template?.template?.organization,
    template?.template?.org,
    template?.template?.program?.organization,
    template?.template?.program?.org,
    template?.link?.organization,
    template?.link?.org,
  ].find(entry => entry !== null && entry !== undefined && entry !== '');
  return value ? String(value) : '';
}

function getTemplateSubUnit(template) {
  const value = [
    template?.sub_unit,
    template?.subUnit,
    template?.subunit,
    template?.program?.sub_unit,
    template?.program?.subUnit,
    template?.program?.subunit,
    template?.template?.sub_unit,
    template?.template?.subUnit,
    template?.template?.subunit,
    template?.template?.program?.sub_unit,
    template?.template?.program?.subUnit,
    template?.link?.sub_unit,
    template?.link?.subUnit,
    template?.link?.subunit,
  ].find(entry => entry !== null && entry !== undefined && entry !== '');
  return value ? String(value) : '';
}

function getTemplateStatus(template) {
  if (!template) return '';
  const archivedAt = template?.deleted_at ?? template?.deletedAt ?? null;
  if (archivedAt) return 'archived';
  return template?.status ?? template?.state ?? template?.lifecycle ?? template?.template?.status ?? 'draft';
}

function normalizeTemplateStatusValue(status) {
  if (status === null || status === undefined) return '';
  const normalized = String(status).trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'active') return 'published';
  return normalized;
}

function isPublishedTemplateStatus(status) {
  return normalizeTemplateStatusValue(status) === 'published';
}

function isPublishedTemplate(template) {
  return isPublishedTemplateStatus(getTemplateStatus(template));
}

function isTemplateArchived(template) {
  return normalizeTemplateStatusValue(getTemplateStatus(template)) === 'archived';
}

function getTemplateStatusLabel(template) {
  const normalized = normalizeTemplateStatusValue(getTemplateStatus(template));
  if (!normalized) return '—';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getTemplateDescription(template) {
  const value = [
    template?.description,
    template?.summary,
    template?.notes,
    template?.template?.description,
    template?.template?.summary,
    template?.template?.notes,
  ].find(entry => entry !== null && entry !== undefined && entry !== '');
  return value || '';
}

function getTemplateNotes(template) {
  const value = [
    template?.notes,
    template?.description,
    template?.summary,
    template?.template?.notes,
    template?.template?.description,
    template?.template?.summary,
    template?.link?.notes,
  ].find(entry => entry !== null && entry !== undefined && entry !== '');
  return value ? String(value) : '';
}

function getTemplateUpdatedAt(template) {
  return template?.updated_at
    ?? template?.updatedAt
    ?? template?.created_at
    ?? template?.createdAt
    ?? template?.template?.updated_at
    ?? template?.template?.updatedAt
    ?? template?.template?.created_at
    ?? template?.template?.createdAt
    ?? null;
}

function getTemplateWeekNumber(template) {
  const candidates = [
    template?.week_number,
    template?.weekNumber,
    template?.week,
    template?.template?.week_number,
    template?.template?.weekNumber,
    template?.template?.week,
  ];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const parsed = toNullableNumber(candidate);
    if (parsed !== null) return parsed;
    return String(candidate);
  }
  return null;
}

function getTemplateExternalLink(template) {
  const value = [
    template?.external_link,
    template?.externalLink,
    template?.hyperlink,
    template?.link?.external_link,
    template?.link?.externalLink,
    template?.link?.hyperlink,
    template?.url,
    template?.link_url,
    template?.linkUrl,
    template?.link?.url,
    template?.link?.link_url,
    template?.link?.linkUrl,
    template?.template?.external_link,
    template?.template?.externalLink,
    template?.template?.hyperlink,
  ].find(entry => entry !== null && entry !== undefined && entry !== '');
  if (!value) return '';
  const stringValue = String(value);
  if (isValidHttpUrl(stringValue)) {
    return stringValue;
  }
  return stringValue;
}

function getTemplateSortValue(template, fallback = 0) {
  const rawValue = template?.sort_order
    ?? template?.sortOrder
    ?? template?.order
    ?? template?.position
    ?? template?.index
    ?? null;
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return fallback;
  }
  const asNumber = typeof rawValue === 'string' ? Number(rawValue) : rawValue;
  return Number.isFinite(asNumber) ? asNumber : fallback;
}

function normalizeTemplateAssociation(raw, index = 0) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const normalized = { ...source };
  const nestedTemplate = source.template && typeof source.template === 'object' ? source.template : null;
  const linkMeta = source.link && typeof source.link === 'object' ? source.link : null;
  if (linkMeta && (typeof normalized.link !== 'object' || normalized.link === null)) {
    normalized.link = { ...linkMeta };
  }
  const templateId = getTemplateId(source) || (nestedTemplate ? getTemplateId(nestedTemplate) : null);
  if (templateId && !normalized.templateId) {
    normalized.templateId = templateId;
  }
  if (!normalized.id && templateId) {
    normalized.id = templateId;
  }
  const linkId = source.link_id ?? source.linkId ?? linkMeta?.id ?? null;
  if (linkId && !normalized.link_id) {
    normalized.link_id = linkId;
  }
  if (linkId && !normalized.linkId) {
    normalized.linkId = linkId;
  }

  const weekSource = source.week_number
    ?? linkMeta?.week_number
    ?? source.weekNumber
    ?? source.week
    ?? (nestedTemplate ? nestedTemplate.week_number ?? nestedTemplate.weekNumber ?? nestedTemplate.week : null);
  const weekNumber = toNullableNumber(weekSource);
  normalized.week_number = weekNumber;
  normalized.weekNumber = weekNumber;

  const dueOffsetSource = source.due_offset_days
    ?? linkMeta?.due_offset_days
    ?? source.dueOffsetDays
    ?? source.due_in_days
    ?? source.dueOffset
    ?? (nestedTemplate ? nestedTemplate.due_offset_days : null);
  const dueOffsetDays = toNullableNumber(dueOffsetSource);
  normalized.due_offset_days = dueOffsetDays;
  normalized.dueOffsetDays = dueOffsetDays;

  const requiredSource = source.required
    ?? linkMeta?.required
    ?? source.is_required
    ?? source.isRequired
    ?? (nestedTemplate ? nestedTemplate.required : null);
  const required = toNullableBoolean(requiredSource);
  normalized.required = required;

  const visibilitySource = source.visibility
    ?? linkMeta?.visibility
    ?? source.visible_to
    ?? source.visibleTo
    ?? source.audience
    ?? (nestedTemplate ? nestedTemplate.visibility : null);
  const visibility = visibilitySource === null || visibilitySource === undefined || visibilitySource === ''
    ? null
    : String(visibilitySource);
  normalized.visibility = visibility;

  const visibleSource = source.visible ?? linkMeta?.visible;
  const visible = visibleSource === null || visibleSource === undefined ? null : toNullableBoolean(visibleSource);
  normalized.visible = visible;

  const notesSource = source.notes
    ?? linkMeta?.notes
    ?? (nestedTemplate ? nestedTemplate.notes : null)
    ?? source.description
    ?? source.summary
    ?? '';
  normalized.notes = notesSource === null || notesSource === undefined ? '' : String(notesSource);

  const organizationSource = source.organization
    ?? source.org
    ?? linkMeta?.organization
    ?? (nestedTemplate ? nestedTemplate.organization : null)
    ?? null;
  normalized.organization = organizationSource === null || organizationSource === undefined
    ? ''
    : String(organizationSource);
  normalized.org = normalized.organization;

  const subUnitSource = source.sub_unit
    ?? source.subUnit
    ?? source.subunit
    ?? linkMeta?.sub_unit
    ?? (nestedTemplate ? nestedTemplate.sub_unit ?? nestedTemplate.subUnit : null)
    ?? null;
  normalized.sub_unit = subUnitSource === null || subUnitSource === undefined
    ? ''
    : String(subUnitSource);
  normalized.subUnit = normalized.sub_unit;

  const disciplineTypeSource = source.discipline_type
    ?? source.disciplineType
    ?? source.discipline
    ?? linkMeta?.discipline_type
    ?? (nestedTemplate
      ? nestedTemplate.discipline_type
        ?? nestedTemplate.disciplineType
        ?? nestedTemplate.discipline
      : null)
    ?? null;
  const disciplineTypeValue = disciplineTypeSource === null || disciplineTypeSource === undefined
    ? ''
    : String(disciplineTypeSource);
  normalized.discipline_type = disciplineTypeValue;
  normalized.disciplineType = disciplineTypeValue;
  if (normalized.discipline === undefined) {
    normalized.discipline = disciplineTypeValue;
  }

  const deliveryTypeSource = source.type_delivery
    ?? source.typeDelivery
    ?? source.delivery_type
    ?? source.deliveryType
    ?? linkMeta?.type_delivery
    ?? linkMeta?.delivery_type
    ?? (nestedTemplate
      ? nestedTemplate.type_delivery
        ?? nestedTemplate.typeDelivery
        ?? nestedTemplate.delivery_type
        ?? nestedTemplate.deliveryType
      : null)
    ?? null;
  const deliveryTypeValue = deliveryTypeSource === null || deliveryTypeSource === undefined
    ? ''
    : String(deliveryTypeSource);
  normalized.type_delivery = deliveryTypeValue;
  normalized.typeDelivery = deliveryTypeValue;
  normalized.delivery_type = deliveryTypeValue;

  const departmentSource = source.department
    ?? source.dept
    ?? linkMeta?.department
    ?? (nestedTemplate ? nestedTemplate.department ?? nestedTemplate.dept : null)
    ?? null;
  const departmentValue = departmentSource === null || departmentSource === undefined
    ? ''
    : String(departmentSource);
  normalized.department = departmentValue;
  if (normalized.dept === undefined) {
    normalized.dept = departmentValue;
  }

  const externalLinkSource = source.external_link
    ?? source.externalLink
    ?? source.hyperlink
    ?? linkMeta?.external_link
    ?? linkMeta?.externalLink
    ?? linkMeta?.hyperlink
    ?? source.url
    ?? linkMeta?.url
    ?? source.link_url
    ?? source.linkUrl
    ?? linkMeta?.link_url
    ?? linkMeta?.linkUrl
    ?? null;
  const externalLinkValue = externalLinkSource === null || externalLinkSource === undefined
    ? ''
    : String(externalLinkSource);
  normalized.external_link = externalLinkValue;
  normalized.externalLink = externalLinkValue;
  normalized.hyperlink = externalLinkValue;
  if (externalLinkValue && typeof normalized.link === 'object' && normalized.link !== null) {
    normalized.link.hyperlink = externalLinkValue;
    if (!Object.prototype.hasOwnProperty.call(normalized.link, 'external_link')) {
      normalized.link.external_link = externalLinkValue;
    }
  }

  const linkCreatedAtSource = source.link_created_at
    ?? source.linkCreatedAt
    ?? linkMeta?.created_at
    ?? linkMeta?.createdAt
    ?? null;
  if (linkCreatedAtSource !== null && linkCreatedAtSource !== undefined) {
    normalized.link_created_at = linkCreatedAtSource;
    normalized.linkCreatedAt = linkCreatedAtSource;
    if (typeof normalized.link !== 'object' || normalized.link === null) {
      normalized.link = { created_at: linkCreatedAtSource };
    } else if (normalized.link && typeof normalized.link === 'object') {
      if (normalized.link.created_at === undefined && normalized.link.createdAt === undefined) {
        normalized.link.created_at = linkCreatedAtSource;
      }
    }
  }

  const sortSource = source.sort_order
    ?? linkMeta?.sort_order
    ?? source.sortOrder
    ?? source.order
    ?? source.position
    ?? source.index
    ?? (nestedTemplate ? nestedTemplate.sort_order : null);
  const sortValue = toNullableNumber(sortSource);
  const fallbackSort = index + 1;
  normalized.sort_order = typeof sortValue === 'number' && Number.isFinite(sortValue) ? sortValue : fallbackSort;
  normalized.sortOrder = normalized.sort_order;

  if (!normalized.created_by && (source.created_by || linkMeta?.created_by)) {
    normalized.created_by = source.created_by ?? linkMeta?.created_by ?? null;
  }
  if (!normalized.updated_by && (source.updated_by || linkMeta?.updated_by)) {
    normalized.updated_by = source.updated_by ?? linkMeta?.updated_by ?? null;
  }
  if (!normalized.updated_at && (source.updated_at || linkMeta?.updated_at)) {
    normalized.updated_at = source.updated_at ?? linkMeta?.updated_at ?? null;
  }

  return normalized;
}

function getProgramTitle(program) {
  return program?.title ?? program?.name ?? '';
}

function getProgramCreatedAt(program) {
  return program?.created_at ?? program?.createdAt ?? program?.updated_at ?? program?.updatedAt ?? null;
}

function getProgramTotalWeeks(program) {
  const raw = program?.total_weeks ?? program?.totalWeeks ?? null;
  if (raw === null || raw === undefined || raw === '') return null;
  const asNumber = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(asNumber) ? asNumber : null;
}

function getProgramDescription(program) {
  return program?.description ?? '';
}

function getProgramArchivedAt(program) {
  return program?.deleted_at ?? program?.deletedAt ?? null;
}

function isProgramArchived(program) {
  return Boolean(getProgramArchivedAt(program));
}

function getProgramLifecycle(program) {
  if (!program) return '';
  const archivedAt = getProgramArchivedAt(program);
  if (archivedAt) return 'archived';
  return program?.status ?? program?.lifecycle ?? program?.state ?? 'active';
}

const PROGRAM_SORT_ACCESSORS = {
  title: getProgramTitle,
  lifecycle: getProgramLifecycle,
  weeks: getProgramTotalWeeks,
  description: getProgramDescription,
  createdAt: getProgramCreatedAt,
  archivedAt: getProgramArchivedAt,
};

const TEMPLATE_SORT_ACCESSORS = {
  week: getTemplateWeekNumber,
  name: getTemplateName,
  auditInserted: getTemplateAuditSortValue,
  status: template => normalizeTemplateStatusValue(getTemplateStatus(template)),
  updatedAt: getTemplateUpdatedAt,
};

const DEFAULT_PROGRAM_PAGE_SIZE = 10;
const DEFAULT_TEMPLATE_PAGE_SIZE = 10;

function parseCell(record, key, type = 'string', accessors = PROGRAM_SORT_ACCESSORS) {
  const accessor = accessors?.[key];
  const raw = typeof accessor === 'function' ? accessor(record) : record?.[key];
  if (type === 'number') {
    const numeric = toNullableNumber(raw);
    return { value: numeric ?? 0, empty: numeric === null };
  }
  if (type === 'date') {
    if (!raw) return { value: 0, empty: true };
    const timestamp = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
    if (Number.isNaN(timestamp)) return { value: 0, empty: true };
    return { value: timestamp, empty: false };
  }
  const normalized = raw === null || raw === undefined ? '' : String(raw).trim();
  return { value: normalized.toLowerCase(), empty: normalized === '' };
}

function compareBy(a, b, key, direction = 'asc', type = 'string', accessors = PROGRAM_SORT_ACCESSORS) {
  const parsedA = parseCell(a, key, type, accessors);
  const parsedB = parseCell(b, key, type, accessors);
  if (parsedA.empty && parsedB.empty) return 0;
  if (parsedA.empty) return 1;
  if (parsedB.empty) return -1;

  let result = 0;
  if (type === 'string') {
    result = parsedA.value.localeCompare(parsedB.value);
  } else {
    const valueA = parsedA.value;
    const valueB = parsedB.value;
    if (valueA < valueB) result = -1;
    else if (valueA > valueB) result = 1;
  }

  if (direction === 'desc') {
    result *= -1;
  }
  return result;
}

function isElementVisible(element) {
  if (!element) return false;
  if (element.hidden) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  if (element.offsetParent === null && style.position !== 'fixed') {
    return false;
  }
  return true;
}

const htmlToTextContainer = document.createElement('div');

function toPlainText(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (!stringValue.includes('<')) return stringValue;
  htmlToTextContainer.innerHTML = stringValue;
  const text = htmlToTextContainer.textContent || '';
  htmlToTextContainer.textContent = '';
  return text;
}

function escapeCsvCell(value) {
  const text = toPlainText(value).replace(/\r?\n/g, '\n');
  if (text === '') return '';
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function getProgramLifecycleLabel(program) {
  const lifecycle = getProgramLifecycle(program);
  if (!lifecycle) return '—';
  return lifecycle.charAt(0).toUpperCase() + lifecycle.slice(1);
}

const PROGRAM_CSV_ACCESSORS = {
  title: program => getProgramTitle(program) || '—',
  lifecycle: program => getProgramLifecycleLabel(program),
  weeks: program => {
    const totalWeeks = getProgramTotalWeeks(program);
    return Number.isFinite(totalWeeks) ? String(totalWeeks) : '—';
  },
  description: program => {
    const description = getProgramDescription(program);
    return description ? description : '—';
  },
  createdAt: program => formatDate(getProgramCreatedAt(program)),
  archivedAt: program => formatDate(getProgramArchivedAt(program)),
};

const TEMPLATE_EXPORT_FIELDS = [
  'template_id',
  'program_id',
  'week_number',
  'label',
  'status',
  'organization',
  'sub_unit',
  'department',
  'discipline_type',
  'type_delivery',
  'external_link',
  'notes',
];

const TEMPLATE_CSV_ACCESSORS = {
  template_id: template => getTemplateId(template) || '',
  program_id: (template, fallbackProgramId) => getTemplateProgramId(template) || (normalizeId(fallbackProgramId) || ''),
  week_number: template => {
    const weekNumber = getTemplateWeekNumber(template);
    if (weekNumber === null || weekNumber === undefined || weekNumber === '') return '';
    return String(weekNumber);
  },
  label: template => getTemplateName(template) || '',
  status: template => normalizeTemplateStatusValue(getTemplateStatus(template)) || '',
  organization: template => getTemplateOrganization(template),
  sub_unit: template => getTemplateSubUnit(template),
  department: template => getTemplateDepartment(template) || '',
  discipline_type: template => getTemplateDisciplineType(template) || '',
  type_delivery: template => getTemplateDeliveryType(template) || '',
  external_link: template => getTemplateExternalLink(template),
  notes: template => getTemplateNotes(template),
};

function toCSV() {
  if (!programTable) return '';
  const headerCells = Array.from(programTable.querySelectorAll('thead th')).filter(isElementVisible);
  if (!headerCells.length) return '';
  const headerLabels = headerCells.map(cell => {
    const clone = cell.cloneNode(true);
    const redundantElements = clone.querySelectorAll('input, [data-sort-indicator]');
    redundantElements.forEach(el => el.remove());
    const label = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    return label;
  });
  const headerKeys = headerCells.map(cell => cell.dataset.key || null);
  const rows = [headerLabels.map(escapeCsvCell).join(',')];
  const programsToExport = getFilteredSortedPrograms();
  programsToExport.forEach(program => {
    const cells = headerKeys.map(key => {
      if (!key) return '';
      const accessor = PROGRAM_CSV_ACCESSORS[key];
      const rawValue = typeof accessor === 'function' ? accessor(program) : program?.[key];
      if (rawValue === null || rawValue === undefined) return '';
      return rawValue;
    });
    rows.push(cells.map(escapeCsvCell).join(','));
  });
  return `\uFEFF${rows.join('\r\n')}`;
}

function templatesToCSV() {
  if (!templateTable) return '';
  const rows = [TEMPLATE_EXPORT_FIELDS.map(escapeCsvCell).join(',')];
  const templatesToExport = getFilteredSortedTemplates();
  templatesToExport.forEach(template => {
    ensureTemplateAudit(template);
    const cells = TEMPLATE_EXPORT_FIELDS.map(key => {
      const accessor = TEMPLATE_CSV_ACCESSORS[key];
      const rawValue = typeof accessor === 'function' ? accessor(template, selectedProgramId) : template?.[key];
      if (rawValue === null || rawValue === undefined) return '';
      return String(rawValue);
    });
    rows.push(cells.map(escapeCsvCell).join(','));
  });
  return `\uFEFF${rows.join('\r\n')}`;
}

function readFileAsText(file) {
  if (!(file instanceof File)) return Promise.reject(new Error('A valid file must be selected.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Unable to read the selected file.'));
    reader.readAsText(file);
  });
}

function stripBom(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/^\uFEFF/, '');
}

function parseCsvRows(text) {
  const input = stripBom(text);
  const rows = [];
  let current = '';
  let insideQuotes = false;
  const pushCell = () => {
    rows[rows.length - 1].push(current);
    current = '';
  };
  const ensureRow = () => {
    if (!rows.length) {
      rows.push([]);
    } else if (rows[rows.length - 1]) {
      // no-op
    }
  };
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (insideQuotes && input[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }
    if (!insideQuotes && (char === '\n' || char === '\r')) {
      ensureRow();
      pushCell();
      if (char === '\r' && input[index + 1] === '\n') {
        index += 1;
      }
      rows.push([]);
      continue;
    }
    if (!insideQuotes && char === ',') {
      ensureRow();
      pushCell();
      continue;
    }
    current += char;
  }
  if (!rows.length) {
    rows.push([]);
  }
  pushCell();
  return rows
    .filter(row => row.length)
    .map(row => row.map(cell => (cell ?? '').toString()));
}

function parseTemplateImportCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map(header => (header || '').trim()).map(header => header || null);
  if (!headers.some(Boolean)) return [];
  const records = [];
  dataRows.forEach(cells => {
    const isEmptyRow = cells.every(cell => (cell || '').trim() === '');
    if (isEmptyRow) return;
    const record = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = cells[index] ?? '';
    });
    if (Object.keys(record).length) {
      records.push(record);
    }
  });
  return records;
}

function extractTemplatesFromImportPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const candidateKeys = ['templates', 'data', 'items', 'results', 'rows', 'records'];
  for (const key of candidateKeys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function parseTemplateImportJson(text) {
  if (!text) return [];
  try {
    const parsed = JSON.parse(stripBom(text));
    const extracted = extractTemplatesFromImportPayload(parsed);
    if (extracted.length) {
      return extracted;
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return [parsed];
    }
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse template import JSON.', error);
    return [];
  }
}

const TEMPLATE_IMPORT_IGNORED_KEYS = new Set([
  'id',
  'template_id',
  'templateid',
  'audit_inserted',
  'audit_updated',
  'created_at',
  'updated_at',
  'deleted_at',
  'archived_at',
  'archived',
  'inserted_by',
]);

function normalizeTemplateImportRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const normalized = {};
  const assignString = (value) => {
    if (value === null || value === undefined) return '';
    return typeof value === 'string' ? value.trim() : String(value).trim();
  };
  let hasValue = false;
  Object.entries(record).forEach(([key, value]) => {
    if (!key) return;
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const stringValue = assignString(value);
    const isEmpty = stringValue === '';
    switch (normalizedKey) {
      case 'week':
      case 'week_number':
        if (!isEmpty) {
          const weekNumber = toNullableNumber(stringValue);
          if (weekNumber !== null) {
            normalized.week_number = weekNumber;
            hasValue = true;
          }
        }
        break;
      case 'sort':
      case 'sort_order':
      case 'order':
        if (!isEmpty) {
          const sortOrder = toNullableNumber(stringValue);
          if (sortOrder !== null) {
            normalized.sort_order = sortOrder;
            hasValue = true;
          }
        }
        break;
      case 'name':
      case 'label':
      case 'title':
        if (!isEmpty) {
          normalized.label = stringValue;
          hasValue = true;
        }
        break;
      case 'notes':
      case 'description':
      case 'details':
        if (!isEmpty) {
          normalized.notes = stringValue;
          hasValue = true;
        }
        break;
      case 'organization':
      case 'org':
        if (!isEmpty) {
          normalized.organization = stringValue;
          hasValue = true;
        }
        break;
      case 'sub_unit':
      case 'subunit':
      case 'sub_unit_name':
        if (!isEmpty) {
          normalized.sub_unit = stringValue;
          hasValue = true;
        }
        break;
      case 'discipline':
      case 'discipline_type':
      case 'disciplinetype':
        if (!isEmpty) {
          normalized.discipline_type = stringValue;
          hasValue = true;
        }
        break;
      case 'delivery_type':
      case 'type_delivery':
      case 'deliverytype':
      case 'typedelivery':
        if (!isEmpty) {
          normalized.type_delivery = stringValue;
          hasValue = true;
        }
        break;
      case 'department':
      case 'dept':
        if (!isEmpty) {
          normalized.department = stringValue;
          hasValue = true;
        }
        break;
      case 'external_link':
      case 'hyperlink':
      case 'link':
      case 'url':
        if (!isEmpty) {
          normalized.external_link = stringValue;
          normalized.hyperlink = stringValue;
          hasValue = true;
        }
        break;
      case 'status':
        if (!isEmpty) {
          normalized.status = stringValue.toLowerCase();
          hasValue = true;
        }
        break;
      default:
        if (!isEmpty && !normalized[normalizedKey] && !TEMPLATE_IMPORT_IGNORED_KEYS.has(normalizedKey)) {
          normalized[normalizedKey] = stringValue;
          hasValue = true;
        }
        break;
    }
  });
  if (!hasValue) return null;
  if (normalized.notes === '') delete normalized.notes;
  if (normalized.organization === '') delete normalized.organization;
  if (normalized.sub_unit === '') delete normalized.sub_unit;
  if (normalized.discipline_type === '') delete normalized.discipline_type;
  if (normalized.type_delivery === '') delete normalized.type_delivery;
  if (normalized.department === '') delete normalized.department;
  if (normalized.external_link === '') delete normalized.external_link;
  if (normalized.hyperlink === '') delete normalized.hyperlink;
  if (normalized.status === '') delete normalized.status;
  return normalized;
}

async function readErrorMessageFromResponse(response) {
  if (!response) return '';
  try {
    const data = await response.clone().json();
    if (data) {
      if (typeof data === 'string') return data;
      if (typeof data === 'object') {
        const message = data.message || data.error || data.detail || data.title;
        if (message) {
          return typeof message === 'string' ? message : JSON.stringify(message);
        }
      }
    }
  } catch (error) {
    // ignore JSON parse errors
  }
  try {
    const text = await response.text();
    return text;
  } catch (error) {
    return '';
  }
}

async function tryImportTemplatesBulk(records) {
  const importUrl = `${TEMPLATE_API}/import`;
  const res = await fetch(importUrl, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templates: records }),
  }).catch(error => {
    const networkError = new Error(error?.message || 'Failed to reach the template import service.');
    networkError.cause = error;
    networkError.fallback = true;
    throw networkError;
  });
  if (!res) {
    return { fallback: true };
  }
  if (res.ok) {
    return { success: records.length, failure: 0 };
  }
  if ([404, 405, 501].includes(res.status)) {
    const unsupportedError = new Error('Bulk template import is not available on this server.');
    unsupportedError.status = res.status;
    unsupportedError.fallback = true;
    throw unsupportedError;
  }
  const message = await readErrorMessageFromResponse(res);
  const error = new Error(message || `Template import failed (${res.status}).`);
  error.status = res.status;
  throw error;
}

async function importTemplatesSequentially(records) {
  const total = records.length;
  let success = 0;
  let failure = 0;
  const errors = [];
  for (let index = 0; index < total; index += 1) {
    const record = records[index];
    if (templateMessage) {
      templateMessage.textContent = `Importing templates (${index + 1}/${total})…`;
    }
    try {
      const res = await fetch(TEMPLATE_API, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      if (res.ok) {
        success += 1;
      } else {
        failure += 1;
        const message = await readErrorMessageFromResponse(res);
        if (message) {
          errors.push(message);
        }
      }
    } catch (error) {
      console.error('Template import request failed.', error);
      failure += 1;
      if (error?.message) {
        errors.push(error.message);
      }
    }
  }
  return { success, failure, errors };
}

async function handleTemplateImportFile(file) {
  if (!CAN_MANAGE_TEMPLATES) {
    showToast('You do not have permission to import templates.', { type: 'error' });
    return;
  }
  if (!file) return;
  const fileName = file.name || 'selected file';
  try {
    templateMessage.textContent = `Reading ${fileName}…`;
    const fileText = await readFileAsText(file);
    const extension = (fileName.split('.').pop() || '').toLowerCase();
    let rawRecords = [];
    if (extension === 'json') {
      rawRecords = parseTemplateImportJson(fileText);
    } else if (extension === 'csv') {
      rawRecords = parseTemplateImportCsv(fileText);
    } else {
      rawRecords = parseTemplateImportJson(fileText);
      if (!rawRecords.length) {
        rawRecords = parseTemplateImportCsv(fileText);
      }
    }
    const normalizedRecords = rawRecords
      .map(normalizeTemplateImportRecord)
      .filter(Boolean);
    if (!normalizedRecords.length) {
      showToast('No templates were found in the selected file.', { type: 'error' });
      templateMessage.textContent = 'No templates were imported. Please verify the file contents and try again.';
      return;
    }
    const total = normalizedRecords.length;
    templateMessage.textContent = `Importing ${total} template${total === 1 ? '' : 's'}…`;
    showToast(`Importing ${total} template${total === 1 ? '' : 's'}…`, { type: 'info' });
    let success = 0;
    let failure = 0;
    let errors = [];
    try {
      const bulkResult = await tryImportTemplatesBulk(normalizedRecords);
      if (bulkResult?.success || bulkResult?.failure === 0) {
        success = bulkResult.success || 0;
        failure = bulkResult.failure || 0;
      }
    } catch (error) {
      if (error?.fallback) {
        const sequentialResult = await importTemplatesSequentially(normalizedRecords);
        success = sequentialResult.success;
        failure = sequentialResult.failure;
        errors = sequentialResult.errors;
      } else {
        throw error;
      }
    }
    if (success > 0 && failure === 0) {
      showToast(`Successfully imported ${success} template${success === 1 ? '' : 's'}.`, { type: 'success' });
      await loadTemplates({ preserveSelection: false });
      templateMessage.textContent = `Import complete — ${success} template${success === 1 ? '' : 's'} added.`;
      return;
    }
    if (success > 0 && failure > 0) {
      const summary = `Import complete — ${success} succeeded, ${failure} failed.`;
      showToast(summary, { type: 'error' });
      await loadTemplates({ preserveSelection: false });
      templateMessage.textContent = summary;
      if (errors.length) {
        showToast(errors[0], { type: 'error' });
      }
      return;
    }
    if (failure > 0) {
      const summary = failure === total
        ? 'Template import failed. All records were rejected.'
        : `Template import failed for ${failure} record${failure === 1 ? '' : 's'}.`;
      templateMessage.textContent = summary;
      showToast(summary, { type: 'error' });
      if (errors.length) {
        showToast(errors[0], { type: 'error' });
      }
      return;
    }
    templateMessage.textContent = 'No templates were imported.';
  } catch (error) {
    console.error('Template import failed.', error);
    const message = error?.message || 'Template import failed. Please try again.';
    templateMessage.textContent = message;
    showToast(message, { type: 'error' });
  } finally {
    if (inputImportTemplates) {
      inputImportTemplates.value = '';
    }
  }
}

const meResponse = await fetch(`${API}/me`, { credentials: 'include' });
if (!meResponse.ok) {
  window.location.href = '/';
  throw new Error('Unauthorized');
}
const me = await meResponse.json();
const roles = Array.isArray(me?.roles) ? me.roles : [];
const IS_ADMIN = roles.includes('admin');
const IS_MANAGER = roles.includes('manager');
const CAN_MANAGE_PROGRAMS = IS_ADMIN || IS_MANAGER;
const CAN_MANAGE_TEMPLATES = IS_ADMIN || IS_MANAGER;
const ADMIN_ONLY_PROGRAM_ACTIONS = new Set(['archive', 'restore']);

const programTable = document.getElementById('programTable');
const programTableHead = programTable ? programTable.querySelector('thead') : null;
const programHeaderCells = programTableHead ? Array.from(programTableHead.querySelectorAll('th[data-key]')) : [];
const programTableBody = document.getElementById('programTableBody');
const templateTable = document.getElementById('templateTable');
const templateTableHead = templateTable ? templateTable.querySelector('thead') : null;
const templateHeaderCells = templateTableHead ? Array.from(templateTableHead.querySelectorAll('th[data-key]')) : [];
const templateTableBody = document.getElementById('templateTableBody');
const hideArchivedCheckbox = document.getElementById('hideArchived');
const programSearchInput = document.getElementById('programSearch');
const templateSearchInput = document.getElementById('templateSearch');
const programMessage = document.getElementById('programMessage');
const templateMessage = document.getElementById('templateMessage');
const programSelectionSummary = document.getElementById('programSelectionSummary');
const templateSelectionSummary = document.getElementById('templateSelectionSummary');
const programSelectAll = document.getElementById('programSelectAll');
const templateSelectAll = document.getElementById('templateSelectAll');
const programActionHint = document.getElementById('programActionHint');
const templateActionHint = document.getElementById('templateActionHint');
const programActionsContainer = document.getElementById('programActions');
const templateActionsContainer = document.getElementById('templateActions');
const templateHideArchivedCheckbox = document.getElementById('tmplHideArchived');
const btnRefreshPrograms = document.getElementById('btnRefreshPrograms');
const btnRefreshTemplates = document.getElementById('btnRefreshTemplates');
const btnNewProgram = document.getElementById('btnNewProgram');
const btnEditProgram = document.getElementById('btnEditProgram');
const btnExportProgramsCsv = document.getElementById('exportCsv');
const btnExportTemplatesCsv = document.getElementById('tmplExportCsv');
const btnNewTemplate = document.getElementById('btnNewTemplate');
const btnEditTemplate = document.getElementById('btnEditTemplate');
const btnImportTemplates = document.getElementById('btnImportTemplates');
const inputImportTemplates = document.getElementById('inputImportTemplates');
const programModal = document.getElementById('programModal');
const programModalTitle = document.getElementById('programModalTitle');
const programForm = document.getElementById('programForm');
const programFormTitleInput = document.getElementById('programFormTitle');
const programFormWeeksInput = document.getElementById('programFormWeeks');
const programFormDescriptionInput = document.getElementById('programFormDescription');
const programFormMessage = document.getElementById('programFormMessage');
const programFormSubmit = document.getElementById('programFormSubmit');
const programModalArchiveTrigger = document.getElementById('programModalArchiveTrigger');
const programModalDeleteTrigger = document.getElementById('programModalDeleteTrigger');
const archiveProgramModal = document.getElementById('archiveProgramModal');
const archiveProgramModalDescription = document.getElementById('archiveProgramModalDescription');
const archiveProgramModalMessage = document.getElementById('archiveProgramModalMessage');
const confirmArchiveProgramButton = document.getElementById('confirmArchiveProgram');
const deleteProgramModal = document.getElementById('deleteProgramModal');
const deleteProgramModalDescription = document.getElementById('deleteProgramModalDescription');
const deleteProgramModalMessage = document.getElementById('deleteProgramModalMessage');
const confirmDeleteProgramButton = document.getElementById('confirmDeleteProgram');
const templateModal = document.getElementById('templateModal');
const templateModalTitle = document.getElementById('templateModalTitle');
const templateForm = document.getElementById('templateForm');
const templateFormWeekInput = document.getElementById('templateFormWeek');
const templateFormSortInput = document.getElementById('templateFormSort');
const templateFormLabelInput = document.getElementById('templateFormLabel');
const templateFormOrganizationInput = document.getElementById('templateFormOrganization');
const templateFormSubUnitInput = document.getElementById('templateFormSubUnit');
const templateFormDisciplineTypeInput = document.getElementById('templateFormDisciplineType');
const templateFormDeliveryTypeInput = document.getElementById('templateFormDeliveryType');
const templateFormDepartmentInput = document.getElementById('templateFormDepartment');
const templateFormNotesInput = document.getElementById('templateFormNotes');
const templateFormExternalLinkInput = document.getElementById('templateFormExternalLink');
const templateFormExternalLinkError = document.getElementById('templateFormExternalLinkError');
const templateFormExternalLinkPreview = document.getElementById('templateFormExternalLinkPreview');
const templateFormMessage = document.getElementById('templateFormMessage');
const templateFormSubmit = document.getElementById('templateFormSubmit');
const templateModalDeleteTrigger = document.getElementById('templateModalDeleteTrigger');
const deleteTemplateModal = document.getElementById('deleteTemplateModal');
const deleteTemplateModalDescription = document.getElementById('deleteTemplateModalDescription');
const deleteTemplateModalMessage = document.getElementById('deleteTemplateModalMessage');
const confirmDeleteTemplateButton = document.getElementById('confirmDeleteTemplate');
const programTemplatePanel = document.getElementById('programTemplatePanel');
const programTemplatePanelTitle = document.getElementById('programTemplatePanelTitle');
const programTemplatePanelDescription = document.getElementById('programTemplatePanelDescription');
const programTemplatePanelMessage = document.getElementById('programTemplatePanelMessage');
const programTemplatePanelEmpty = document.getElementById('programTemplatePanelEmpty');
const programTemplateList = document.getElementById('programTemplateList');
const templateAttachInput = document.getElementById('programTemplateAttachInput');
const btnAttachTags = document.getElementById('btnPanelAttachTemplate');
const templateVisibilityOptions = document.getElementById('templateVisibilityOptions');
const programPageSizeSelect = document.getElementById('programPageSize');
const programPager = document.getElementById('pager');
const programPagerLabel = document.getElementById('programPagerLabel');
const programPagerPrev = document.getElementById('programPagerPrev');
const programPagerNext = document.getElementById('programPagerNext');
const templatePageSizeSelect = document.getElementById('tmplPageSize');
const templatePager = document.getElementById('tmplPager');
const templatePagerLabel = document.getElementById('tmplPagerLabel');
const templatePagerPrev = document.getElementById('tmplPagerPrev');
const templatePagerNext = document.getElementById('tmplPagerNext');

populateSelectOptions(templateFormOrganizationInput, ORGANIZATION_OPTIONS);
populateSelectOptions(templateFormSubUnitInput, SUB_UNIT_OPTIONS);
populateSelectOptions(templateFormDisciplineTypeInput, DISCIPLINE_TYPE_OPTIONS);
populateSelectOptions(templateFormDeliveryTypeInput, DELIVERY_TYPE_OPTIONS);
populateSelectOptions(templateFormDepartmentInput, DEPARTMENT_OPTIONS);

if (!programTableBody || !templateTableBody || !programActionsContainer || !templateActionsContainer) {
  throw new Error('Program & Template Manager: required DOM nodes are missing.');
}

let programs = [];
let programSortKey = null;
let programSortDirection = 'asc';
let programPageSize = DEFAULT_PROGRAM_PAGE_SIZE;
let programCurrentPage = 1;
let hideArchivedPrograms = false;
let currentProgramPageItems = [];
let lastProgramPagination = {
  totalItems: 0,
  totalPages: 0,
  currentPage: 1,
  pageSize: DEFAULT_PROGRAM_PAGE_SIZE,
  isAll: false,
};
let templates = [];
let globalTemplates = [];
let templateLibrary = [];
let templateSortKey = null;
let templateSortDirection = 'asc';
let templatePageSize = DEFAULT_TEMPLATE_PAGE_SIZE;
let templateCurrentPage = 1;
let hideArchivedTemplates = false;
let currentTemplatePageItems = [];
let lastTemplatePagination = {
  totalItems: 0,
  totalPages: 0,
  currentPage: 1,
  pageSize: DEFAULT_TEMPLATE_PAGE_SIZE,
  isAll: false,
};
const templateLibraryIndex = new Map();
const selectedProgramIds = new Set();
const selectedTemplateIds = new Set();
let selectedProgramId = null;
let selectedTemplateId = null;
let lastLoadedTemplateProgramId = null;
const modalStack = [];
let programModalMode = 'create';
let programModalProgramId = null;
let archiveTargetProgramId = null;
let deleteTargetProgramId = null;
let templateModalMode = 'create';
let templateModalTemplateId = null;
let deleteTargetTemplateId = null;
let isPersistingTemplateOrder = false;
let isPersistingMetadataUpdates = false;
let metadataInFlightPromise = null;
let reorderInFlightPromise = null;
let metadataSaveTimeout = null;
let reorderSaveTimeout = null;
const METADATA_SAVE_DELAY_MS = 600;
const REORDER_SAVE_DELAY_MS = 400;
const ATTACH_SAVE_DELAY_MS = 600;
const pendingMetadataState = {
  programId: null,
  updates: new Map(),
  savingMessage: 'Saving changes…',
  successMessage: 'Changes saved.',
  reload: false,
};
const pendingReorderState = {
  programId: null,
  order: null,
  revert: null,
  savingMessage: 'Saving order…',
  successMessage: 'Order updated.',
};
let tagifyInstance = null;
let suppressTagifyEventsFlag = false;
const pendingAttach = new Set();
const pendingAttachState = new Map();
let pendingAttachProgramId = null;
let attachSaveTimeout = null;
let attachInFlightPromise = null;

const TEMPLATE_AUDIT_TABLE_NAME = 'program_task_templates';
const templateAuditState = new Map();
let templateAuditRenderScheduled = false;

function scheduleTemplateAuditRender() {
  if (templateAuditRenderScheduled) return;
  templateAuditRenderScheduled = true;
  Promise.resolve().then(() => {
    templateAuditRenderScheduled = false;
    try {
      renderTemplates();
    } catch (error) {
      console.error(error);
    }
  });
}

function normalizeAuditAction(action) {
  if (action === null || action === undefined) return '';
  return String(action).trim().toLowerCase();
}

function extractAuditEntriesFromPayload(payload, templateId = null) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const directKeys = ['entries', 'data', 'results', 'items', 'logs', 'audit', 'records', 'rows', 'events'];
  for (const key of directKeys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  if (payload.audit && typeof payload.audit === 'object') {
    const nested = extractAuditEntriesFromPayload(payload.audit, templateId);
    if (nested.length) return nested;
  }

  const keyedCollections = ['byId', 'recordsById', 'logsById', 'itemsById', 'dataById'];
  for (const key of keyedCollections) {
    const bucket = payload[key];
    if (bucket && typeof bucket === 'object') {
      const nested = extractAuditEntriesFromPayload(bucket, templateId);
      if (nested.length) return nested;
    }
  }

  if (templateId !== null && templateId !== undefined) {
    const normalizedId = String(templateId);
    if (Array.isArray(payload[normalizedId])) {
      return payload[normalizedId];
    }
    for (const [key, value] of Object.entries(payload)) {
      if (key === normalizedId && Array.isArray(value)) return value;
    }
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function extractAuditActor(entry) {
  const candidates = [
    entry?.actor,
    entry?.user,
    entry?.user_name,
    entry?.username,
    entry?.userEmail,
    entry?.user_email,
    entry?.changed_by,
    entry?.changedBy,
    entry?.performed_by,
    entry?.performedBy,
    entry?.created_by,
    entry?.createdBy,
    entry?.owner,
    entry?.email,
    entry?.name,
  ];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    if (typeof candidate === 'object') {
      const nested = candidate.name
        ?? candidate.full_name
        ?? candidate.fullName
        ?? candidate.displayName
        ?? candidate.email
        ?? candidate.username
        ?? candidate.id
        ?? null;
      if (nested !== null && nested !== undefined && nested !== '') {
        return nested;
      }
      continue;
    }
    return candidate;
  }
  return null;
}

function extractAuditTimestamp(entry) {
  const candidates = [
    entry?.changed_at,
    entry?.changedAt,
    entry?.created_at,
    entry?.createdAt,
    entry?.occurred_at,
    entry?.occurredAt,
    entry?.logged_at,
    entry?.loggedAt,
    entry?.at,
    entry?.time,
    entry?.timestamp,
    entry?.date,
    entry?.datetime,
  ];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    return candidate;
  }
  return null;
}

function normalizeAuditRecord(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const actor = extractAuditActor(entry);
  const timestamp = extractAuditTimestamp(entry);
  const action = normalizeAuditAction(entry?.action ?? entry?.operation ?? entry?.event ?? entry?.type ?? entry?.verb);
  return {
    actor: actor === null || actor === undefined ? null : String(actor),
    timestamp,
    action,
    raw: entry,
  };
}

function findInsertAuditCandidate(entries) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const enriched = entries
    .map(entry => {
      const normalized = normalizeAuditRecord(entry);
      if (!normalized) return null;
      let timestampValue = null;
      if (normalized.timestamp !== null && normalized.timestamp !== undefined && normalized.timestamp !== '') {
        const date = new Date(normalized.timestamp);
        if (!Number.isNaN(date.getTime())) {
          timestampValue = date.getTime();
        }
      }
      return {
        entry,
        normalized,
        timestampValue,
      };
    })
    .filter(Boolean);
  if (!enriched.length) return null;
  const insertEntries = enriched.filter(item => {
    const action = item.normalized.action;
    return action === 'insert' || action === 'create' || action === 'created' || action === 'add';
  });
  const pool = insertEntries.length ? insertEntries : enriched;
  pool.sort((a, b) => {
    const aTime = a.timestampValue ?? Number.POSITIVE_INFINITY;
    const bTime = b.timestampValue ?? Number.POSITIVE_INFINITY;
    if (aTime === bTime) return 0;
    return aTime < bTime ? -1 : 1;
  });
  return pool[0] || null;
}

function createTemplateAuditInfo({ actor, timestamp, raw, source = 'audit' }) {
  const actorLabel = actor === null || actor === undefined ? null : String(actor).trim() || null;
  let timestampIso = null;
  let timestampValue = null;
  let timestampLabel = null;
  if (timestamp !== null && timestamp !== undefined && timestamp !== '') {
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) {
      timestampValue = date.getTime();
      timestampIso = date.toISOString();
      timestampLabel = formatDateTime(date);
    } else if (typeof timestamp === 'string') {
      timestampLabel = timestamp;
    } else {
      timestampLabel = String(timestamp);
    }
  }
  const displayParts = [];
  if (actorLabel) displayParts.push(actorLabel);
  if (timestampLabel) displayParts.push(timestampLabel);
  const display = displayParts.length ? displayParts.join(' — ') : '—';
  const searchParts = [];
  if (actorLabel) searchParts.push(actorLabel);
  if (timestampLabel) searchParts.push(timestampLabel);
  if (timestampIso) searchParts.push(timestampIso);
  return {
    actor: actorLabel,
    timestamp: timestampIso ?? (timestamp !== null && timestamp !== undefined ? String(timestamp) : null),
    timestampValue,
    display,
    searchText: searchParts.join(' ').trim(),
    source,
    raw,
  };
}

function applyTemplateAuditData(templateId, info, records) {
  if (!templateId) return;
  const applyToTemplate = template => {
    if (!template || typeof template !== 'object') return;
    if (getTemplateId(template) !== templateId) return;
    if (info) {
      template.__auditInsert = info;
    }
    if (Array.isArray(records)) {
      template.__auditRecords = records;
    }
  };
  const collections = [globalTemplates, templates, templateLibrary];
  collections.forEach(collection => {
    if (!Array.isArray(collection)) return;
    collection.forEach(applyToTemplate);
  });
  if (templateLibraryIndex && typeof templateLibraryIndex.get === 'function' && templateLibraryIndex.has(templateId)) {
    const entry = templateLibraryIndex.get(templateId);
    if (entry && typeof entry === 'object') {
      if (info) entry.__auditInsert = info;
      if (Array.isArray(records)) entry.__auditRecords = records;
      templateLibraryIndex.set(templateId, entry);
    }
  }
}

function hydrateTemplatesWithAudit(list) {
  if (!Array.isArray(list)) return;
  list.forEach(template => {
    const templateId = getTemplateId(template);
    if (!templateId) return;
    const state = templateAuditState.get(templateId);
    if (state?.status === 'ready') {
      applyTemplateAuditData(templateId, state.info || null, state.records || null);
    }
  });
}

function hydrateTemplateLibraryIndex() {
  if (!templateLibraryIndex || typeof templateLibraryIndex.forEach !== 'function') return;
  templateLibraryIndex.forEach((value, key) => {
    const state = templateAuditState.get(key);
    if (state?.status === 'ready' && value && typeof value === 'object') {
      if (state.info) value.__auditInsert = state.info;
      if (Array.isArray(state.records)) value.__auditRecords = state.records;
      templateLibraryIndex.set(key, value);
    }
  });
}

async function fetchTemplateAuditRecords(templateId) {
  if (!templateId) {
    return { records: [], info: null };
  }
  const params = new URLSearchParams();
  params.set('table', TEMPLATE_AUDIT_TABLE_NAME);
  params.set('table_name', TEMPLATE_AUDIT_TABLE_NAME);
  params.set('tableName', TEMPLATE_AUDIT_TABLE_NAME);
  params.set('recordId', templateId);
  params.set('record_id', templateId);
  params.set('entityId', templateId);
  params.set('entity_id', templateId);
  params.set('limit', '20');
  params.set('order', 'asc');
  params.set('sort', 'asc');
  params.set('action', 'INSERT');
  params.set('operation', 'INSERT');
  const url = `${API}/api/audit?${params.toString()}`;
  const payload = await fetchJson(url);
  const records = extractAuditEntriesFromPayload(payload, templateId);
  const candidate = findInsertAuditCandidate(records);
  const info = candidate
    ? createTemplateAuditInfo({
      actor: candidate.normalized.actor,
      timestamp: candidate.normalized.timestamp,
      raw: candidate.entry,
      source: 'audit',
    })
    : null;
  return { records, info };
}

function extractTemplateAuditFromTemplate(template) {
  if (!template || typeof template !== 'object') return null;
  if (template.__auditInsert) {
    return {
      info: template.__auditInsert,
      records: Array.isArray(template.__auditRecords) ? template.__auditRecords : null,
    };
  }

  const auditPayload = template.audit
    ?? template.audit_log
    ?? template.auditLog
    ?? template.auditRecords
    ?? template.audit_entries
    ?? null;
  if (auditPayload) {
    const entries = extractAuditEntriesFromPayload(auditPayload, getTemplateId(template));
    if (entries.length) {
      const candidate = findInsertAuditCandidate(entries);
      if (candidate) {
        return {
          info: createTemplateAuditInfo({
            actor: candidate.normalized.actor,
            timestamp: candidate.normalized.timestamp,
            raw: candidate.entry,
            source: 'template',
          }),
          records: entries,
        };
      }
    }
  }

  const actorCandidates = [
    template.inserted_by,
    template.insertedBy,
    template.created_by,
    template.createdBy,
    template.created_by_name,
    template.createdByName,
    template.creator,
    template.owner,
  ];
  let actor = null;
  for (const candidate of actorCandidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    if (typeof candidate === 'object') {
      const nested = candidate.name
        ?? candidate.full_name
        ?? candidate.fullName
        ?? candidate.displayName
        ?? candidate.email
        ?? candidate.username
        ?? candidate.id
        ?? null;
      if (nested !== null && nested !== undefined && nested !== '') {
        actor = nested;
        break;
      }
      continue;
    }
    actor = candidate;
    break;
  }

  const timestampCandidates = [
    template.inserted_at,
    template.insertedAt,
    template.created_at,
    template.createdAt,
    template.created_date,
    template.createdDate,
  ];
  let timestamp = null;
  for (const candidate of timestampCandidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    timestamp = candidate;
    break;
  }

  if (actor || timestamp) {
    return {
      info: createTemplateAuditInfo({ actor, timestamp, raw: null, source: 'template' }),
      records: null,
    };
  }

  return null;
}

function ensureTemplateAudit(template) {
  if (!template || typeof template !== 'object') return null;
  const templateId = getTemplateId(template);
  if (!templateId) return null;
  const existing = templateAuditState.get(templateId);
  if (existing) {
    if (existing.status === 'ready' || existing.status === 'loading') {
      return existing;
    }
    if (existing.status === 'error') {
      return existing;
    }
  }

  const inline = extractTemplateAuditFromTemplate(template);
  if (inline && inline.info) {
    const readyState = {
      status: 'ready',
      info: inline.info,
      records: Array.isArray(inline.records) ? inline.records : null,
    };
    templateAuditState.set(templateId, readyState);
    applyTemplateAuditData(templateId, readyState.info, readyState.records);
    return readyState;
  }

  const loadingState = { status: 'loading', info: null, records: null };
  const promise = (async () => {
    try {
      const result = await fetchTemplateAuditRecords(templateId);
      const readyState = {
        status: 'ready',
        info: result.info || null,
        records: Array.isArray(result.records) ? result.records : null,
      };
      templateAuditState.set(templateId, readyState);
      applyTemplateAuditData(templateId, readyState.info, readyState.records);
    } catch (error) {
      console.error('Failed to load template audit', error);
      templateAuditState.set(templateId, { status: 'error', info: null, records: null, error });
    } finally {
      scheduleTemplateAuditRender();
    }
  })();
  loadingState.promise = promise;
  templateAuditState.set(templateId, loadingState);
  return loadingState;
}

function getTemplateAuditInfo(template) {
  if (!template || typeof template !== 'object') return null;
  if (template.__auditInsert) return template.__auditInsert;
  const templateId = getTemplateId(template);
  if (!templateId) return null;
  const state = templateAuditState.get(templateId);
  if (state?.status === 'ready') {
    return state.info || null;
  }
  return null;
}

function getTemplateAuditSearchText(template) {
  const info = getTemplateAuditInfo(template);
  if (!info) return '';
  return info.searchText || '';
}

function getTemplateAuditDisplay(template) {
  const info = getTemplateAuditInfo(template);
  if (!info) return '—';
  return info.display || '—';
}

function getTemplateAuditSortValue(template) {
  const info = getTemplateAuditInfo(template);
  if (!info) return null;
  return Number.isFinite(info.timestampValue) ? info.timestampValue : null;
}

if (!CAN_MANAGE_PROGRAMS) {
  programActionHint.textContent = 'You have read-only access. Only admins or managers can change program lifecycles.';
  if (programSelectAll) programSelectAll.disabled = true;
  if (btnNewProgram) {
    btnNewProgram.disabled = true;
    btnNewProgram.title = 'Only admins or managers can create programs.';
  }
  if (btnEditProgram) {
    btnEditProgram.disabled = true;
    btnEditProgram.title = 'Only admins or managers can edit programs.';
  }
  if (programModalArchiveTrigger) {
    programModalArchiveTrigger.disabled = true;
    programModalArchiveTrigger.classList.add('hidden');
  }
  if (programModalDeleteTrigger) {
    programModalDeleteTrigger.disabled = true;
    programModalDeleteTrigger.classList.add('hidden');
  }
  if (confirmArchiveProgramButton) confirmArchiveProgramButton.disabled = true;
  if (confirmDeleteProgramButton) confirmDeleteProgramButton.disabled = true;
} else {
  if (btnNewProgram) {
    btnNewProgram.disabled = false;
    btnNewProgram.title = '';
  }
  if (confirmArchiveProgramButton) confirmArchiveProgramButton.disabled = false;
  if (confirmDeleteProgramButton) confirmDeleteProgramButton.disabled = false;
}
if (!CAN_MANAGE_TEMPLATES) {
  templateActionHint.textContent = 'You have read-only access. Only admins or managers can change template statuses or import templates.';
  if (templateSelectAll) templateSelectAll.disabled = true;
  if (btnNewTemplate) {
    btnNewTemplate.disabled = true;
    btnNewTemplate.title = 'Only admins or managers can create templates.';
  }
  if (btnEditTemplate) {
    btnEditTemplate.disabled = true;
    btnEditTemplate.title = 'Only admins or managers can edit templates.';
    btnEditTemplate.removeAttribute('data-template-id');
  }
  if (btnImportTemplates) {
    btnImportTemplates.disabled = true;
    btnImportTemplates.title = 'Only admins or managers can import templates.';
  }
  if (inputImportTemplates) {
    inputImportTemplates.disabled = true;
  }
  if (templateModalDeleteTrigger) {
    templateModalDeleteTrigger.disabled = true;
    templateModalDeleteTrigger.classList.add('hidden');
  }
  if (confirmDeleteTemplateButton) confirmDeleteTemplateButton.disabled = true;
} else {
  if (btnNewTemplate) {
    btnNewTemplate.disabled = false;
    btnNewTemplate.title = selectedProgramId ? '' : 'Select a program to add templates.';
  }
  if (btnEditTemplate) {
    btnEditTemplate.disabled = true;
    btnEditTemplate.title = 'Select a template to edit.';
  }
  if (btnImportTemplates) {
    btnImportTemplates.disabled = false;
    btnImportTemplates.title = '';
  }
  if (inputImportTemplates) {
    inputImportTemplates.disabled = false;
  }
  if (confirmDeleteTemplateButton) confirmDeleteTemplateButton.disabled = false;
}

updateProgramEditorButtons(programs);
updateTemplateEditorButtons(globalTemplates);
updatePanelAddButtonState();
updateProgramSortIndicators();
updateTemplateSortIndicators();

function getSortedPrograms(source = programs) {
  const list = Array.isArray(source) ? source.slice() : [];
  if (!programSortKey) return list;
  const header = programHeaderCells.find(cell => cell.dataset.key === programSortKey);
  const type = header?.dataset.type || 'string';
  return list
    .map((program, index) => ({ program, index }))
    .sort((a, b) => {
      const diff = compareBy(
        a.program,
        b.program,
        programSortKey,
        programSortDirection,
        type,
        PROGRAM_SORT_ACCESSORS,
      );
      if (diff !== 0) return diff;
      return a.index - b.index;
    })
    .map(entry => entry.program);
}

function getFilteredPrograms(source = programs) {
  let list = Array.isArray(source) ? source.slice() : [];
  if (hideArchivedPrograms) {
    list = list.filter(program => !isProgramArchived(program));
  }
  const term = (programSearchInput?.value || '').trim().toLowerCase();
  if (!term) return list;
  return list.filter(p => {
    const values = [
      getProgramTitle(p),
      getProgramLifecycle(p),
      getProgramDescription(p),
      getProgramId(p),
    ];
    const totalWeeks = getProgramTotalWeeks(p);
    if (Number.isFinite(totalWeeks)) values.push(String(totalWeeks));
    const createdAt = getProgramCreatedAt(p);
    if (createdAt) values.push(String(createdAt));
    const archivedAt = getProgramArchivedAt(p);
    if (archivedAt) values.push(String(archivedAt));
    return values
      .filter(value => value !== null && value !== undefined && value !== '')
      .some(value => value.toString().toLowerCase().includes(term));
  });
}

function getFilteredSortedPrograms() {
  const filtered = getFilteredPrograms();
  return getSortedPrograms(filtered);
}

function getSortedTemplates(source = globalTemplates) {
  const list = Array.isArray(source) ? source.slice() : [];
  if (!templateSortKey) return list;
  const header = templateHeaderCells.find(cell => cell.dataset.key === templateSortKey);
  const type = header?.dataset.type || 'string';
  return list
    .map((template, index) => ({ template, index }))
    .sort((a, b) => {
      const diff = compareBy(
        a.template,
        b.template,
        templateSortKey,
        templateSortDirection,
        type,
        TEMPLATE_SORT_ACCESSORS,
      );
      if (diff !== 0) return diff;
      return a.index - b.index;
    })
    .map(entry => entry.template);
}

function parsePageSize(value, fallback = DEFAULT_PROGRAM_PAGE_SIZE) {
  const defaultSize = fallback === null || fallback === undefined ? DEFAULT_PROGRAM_PAGE_SIZE : fallback;
  if (value === null || value === undefined || value === '') {
    return defaultSize;
  }
  if (value === 'all') return Infinity;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultSize;
}

function paginate(data, page = 1, size = DEFAULT_PROGRAM_PAGE_SIZE) {
  const list = Array.isArray(data) ? data : [];
  const totalItems = list.length;
  const useAll = size === Infinity;
  const normalizedSize = useAll ? (totalItems === 0 ? 1 : totalItems) : Math.max(1, Math.trunc(size));
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / normalizedSize);
  const hasPages = totalPages > 0;
  const currentPage = hasPages ? Math.min(Math.max(1, page), totalPages) : 1;
  const startIndex = !hasPages ? 0 : useAll ? 0 : (currentPage - 1) * normalizedSize;
  const endIndex = useAll ? totalItems : startIndex + normalizedSize;
  const items = hasPages ? list.slice(startIndex, endIndex) : [];
  return {
    items,
    totalItems,
    totalPages,
    currentPage,
    pageSize: useAll ? totalItems : normalizedSize,
    isAll: useAll,
  };
}

function getVisiblePrograms() {
  return Array.isArray(currentProgramPageItems) ? currentProgramPageItems.slice() : [];
}

function getVisibleTemplates() {
  return Array.isArray(currentTemplatePageItems) ? currentTemplatePageItems.slice() : [];
}

function getFilteredTemplates(source = globalTemplates) {
  let list = Array.isArray(source) ? source.slice() : [];
  if (hideArchivedTemplates) {
    list = list.filter(template => !isTemplateArchived(template));
  }
  const term = (templateSearchInput?.value || '').trim().toLowerCase();
  if (!term) return list;
  return list.filter(t => {
    const values = [
      getTemplateName(t),
      getTemplateStatus(t),
      getTemplateCategory(t),
      getTemplateDescription(t),
      getTemplateId(t),
    ];
    const auditSearch = getTemplateAuditSearchText(t);
    if (auditSearch) values.push(auditSearch);
    const weekNumber = getTemplateWeekNumber(t);
    if (weekNumber !== null && weekNumber !== undefined && weekNumber !== '') {
      values.push(String(weekNumber));
    }
    const updatedAt = getTemplateUpdatedAt(t);
    if (updatedAt) values.push(String(updatedAt));
    return values
      .filter(value => value !== null && value !== undefined && value !== '')
      .some(value => value.toString().toLowerCase().includes(term));
  });
}

function getFilteredSortedTemplates() {
  const filtered = getFilteredTemplates();
  return getSortedTemplates(filtered);
}

function syncProgramSelection() {
  const validIds = new Set(programs.map(getProgramId).filter(Boolean));
  let shouldResetActive = false;
  for (const id of Array.from(selectedProgramIds)) {
    if (!validIds.has(id)) {
      if (selectedProgramId === id) shouldResetActive = true;
      selectedProgramIds.delete(id);
      continue;
    }
    if (hideArchivedPrograms) {
      const program = getProgramById(id);
      if (program && isProgramArchived(program)) {
        if (selectedProgramId === id) shouldResetActive = true;
        selectedProgramIds.delete(id);
      }
    }
  }
  if (selectedProgramId) {
    if (!validIds.has(selectedProgramId)) {
      shouldResetActive = true;
    } else if (hideArchivedPrograms) {
      const activeProgram = getProgramById(selectedProgramId);
      if (activeProgram && isProgramArchived(activeProgram)) {
        shouldResetActive = true;
      }
    }
  }
  if (shouldResetActive) {
    selectedProgramId = null;
  }
  if (!selectedProgramId && selectedProgramIds.size) {
    const { value } = selectedProgramIds.values().next();
    selectedProgramId = value || null;
  }
}

function syncTemplateSelection() {
  const validIds = new Set();
  globalTemplates.forEach(template => {
    const id = getTemplateId(template);
    if (id) validIds.add(id);
  });
  templates.forEach(template => {
    const id = getTemplateId(template);
    if (id) validIds.add(id);
  });
  let shouldResetActive = false;
  for (const id of Array.from(selectedTemplateIds)) {
    const template = getTemplateById(id);
    const isValid = validIds.has(id);
    const isHidden = hideArchivedTemplates && template && isTemplateArchived(template);
    if (!isValid || isHidden) {
      if (selectedTemplateId === id) {
        shouldResetActive = true;
      }
      selectedTemplateIds.delete(id);
    }
  }
  if (selectedTemplateId) {
    const template = getTemplateById(selectedTemplateId);
    const isValid = template ? validIds.has(selectedTemplateId) : false;
    const isHidden = hideArchivedTemplates && template && isTemplateArchived(template);
    if (!isValid || isHidden) {
      shouldResetActive = true;
    }
  }
  if (shouldResetActive) {
    selectedTemplateId = null;
  }
  if (!selectedTemplateId && selectedTemplateIds.size) {
    const nextSelected = selectedTemplateIds.values().next();
    selectedTemplateId = nextSelected.done ? null : nextSelected.value;
  }
}

function getProgramById(id) {
  if (!id) return null;
  return programs.find(program => getProgramId(program) === id) || null;
}

function getPrimaryProgramId(displayedPrograms = getFilteredSortedPrograms()) {
  if (selectedProgramIds.size > 1) return null;
  if (selectedProgramIds.size === 1) {
    const { value } = selectedProgramIds.values().next();
    if (value) return value;
  }
  if (!selectedProgramId) return null;
  const filteredSorted = getFilteredSortedPrograms();
  const pools = [];
  if (Array.isArray(displayedPrograms) && displayedPrograms.length) {
    pools.push(displayedPrograms);
  }
  if (filteredSorted.length) {
    pools.push(filteredSorted);
  }
  const exists = pools.some(pool => pool.some(program => getProgramId(program) === selectedProgramId));
  return exists ? selectedProgramId : null;
}

function updateProgramEditorButtons(displayedPrograms = programs) {
  if (!btnEditProgram) return;
  if (!CAN_MANAGE_PROGRAMS) {
    btnEditProgram.disabled = true;
    btnEditProgram.title = 'Only admins or managers can edit programs.';
    btnEditProgram.removeAttribute('data-program-id');
    return;
  }
  const targetId = getPrimaryProgramId(displayedPrograms);
  if (!targetId) {
    btnEditProgram.disabled = true;
    btnEditProgram.title = selectedProgramIds.size > 1
      ? 'Select a single program to edit.'
      : 'Select a program to edit.';
    btnEditProgram.removeAttribute('data-program-id');
    return;
  }
  btnEditProgram.disabled = false;
  btnEditProgram.title = '';
  btnEditProgram.dataset.programId = targetId;
}

function getTemplateById(id) {
  if (!id) return null;
  const assigned = templates.find(template => getTemplateId(template) === id);
  if (assigned) return assigned;
  return globalTemplates.find(template => getTemplateId(template) === id) || null;
}

function getPrimaryTemplateId(displayedTemplates = getFilteredSortedTemplates()) {
  if (selectedTemplateIds.size > 1) return null;
  if (selectedTemplateIds.size === 1) {
    const { value } = selectedTemplateIds.values().next();
    if (value) return value;
  }
  if (!selectedTemplateId) return null;
  const pools = [];
  if (Array.isArray(displayedTemplates) && displayedTemplates.length) {
    pools.push(displayedTemplates);
  }
  const filteredSorted = getFilteredSortedTemplates();
  if (filteredSorted.length) {
    pools.push(filteredSorted);
  }
  if (templates.length) {
    pools.push(templates);
  }
  const exists = pools.some(pool => pool.some(template => getTemplateId(template) === selectedTemplateId));
  return exists ? selectedTemplateId : null;
}

function updateTemplateEditorButtons(displayedTemplates = globalTemplates) {
  if (btnNewTemplate) {
    if (!CAN_MANAGE_TEMPLATES) {
      btnNewTemplate.disabled = true;
      btnNewTemplate.title = 'Only admins or managers can create templates.';
    } else {
      btnNewTemplate.disabled = false;
      btnNewTemplate.title = '';
    }
  }
  if (!btnEditTemplate) return;
  if (!CAN_MANAGE_TEMPLATES) {
    btnEditTemplate.disabled = true;
    btnEditTemplate.title = 'Only admins or managers can edit templates.';
    btnEditTemplate.removeAttribute('data-template-id');
    return;
  }
  const targetId = getPrimaryTemplateId(displayedTemplates);
  if (!targetId) {
    btnEditTemplate.disabled = true;
    btnEditTemplate.title = selectedTemplateIds.size > 1
      ? 'Select a single template to edit.'
      : 'Select a template to edit.';
    btnEditTemplate.removeAttribute('data-template-id');
    return;
  }
  btnEditTemplate.disabled = false;
  btnEditTemplate.title = '';
  btnEditTemplate.dataset.templateId = targetId;
}

function openModal(modal) {
  if (!modal || modal.classList.contains('is-open')) return;
  modal.classList.add('is-open');
  modal.removeAttribute('hidden');
  modalStack.push(modal);
  document.body.classList.add('modal-open');
}

function closeModal(modal) {
  if (!modal || !modal.classList.contains('is-open')) return;
  modal.classList.remove('is-open');
  modal.setAttribute('hidden', 'hidden');
  const index = modalStack.lastIndexOf(modal);
  if (index >= 0) modalStack.splice(index, 1);
  if (!modalStack.length) {
    document.body.classList.remove('modal-open');
  }
}

function closeTopModal() {
  if (!modalStack.length) return;
  const modal = modalStack[modalStack.length - 1];
  if (modal === programModal) {
    closeProgramModal();
  } else if (modal === archiveProgramModal) {
    closeArchiveProgramModal();
  } else if (modal === deleteProgramModal) {
    closeDeleteProgramModal();
  } else if (modal === templateModal) {
    closeTemplateModal();
  } else if (modal === deleteTemplateModal) {
    closeDeleteTemplateModal();
  } else {
    closeModal(modal);
  }
}

function setModalMessage(element, text, isError = false) {
  if (!element) return;
  if (!text) {
    element.textContent = '';
    element.classList.add('hidden');
    element.classList.remove('text-red-600');
    if (!element.classList.contains('text-slate-500')) {
      element.classList.add('text-slate-500');
    }
    return;
  }
  element.textContent = text;
  element.classList.remove('hidden');
  if (isError) {
    element.classList.add('text-red-600');
    element.classList.remove('text-slate-500');
  } else {
    element.classList.add('text-slate-500');
    element.classList.remove('text-red-600');
  }
}

function upsertProgram(program, { makeActive = false } = {}) {
  if (!program) return;
  const id = getProgramId(program);
  if (!id) return;
  const index = programs.findIndex(existing => getProgramId(existing) === id);
  if (index >= 0) {
    programs[index] = { ...programs[index], ...program };
  } else {
    programs = [program, ...programs];
  }
  if (makeActive) {
    selectedProgramIds.clear();
    selectedProgramIds.add(id);
    selectedProgramId = id;
  }
}

function removeProgramFromList(programId) {
  if (!programId) return;
  const index = programs.findIndex(program => getProgramId(program) === programId);
  if (index >= 0) {
    programs.splice(index, 1);
  }
  selectedProgramIds.delete(programId);
  if (selectedProgramId === programId) {
    const fallback = programs.map(getProgramId).find(Boolean) || null;
    selectedProgramId = fallback;
  }
}

function setProgramFormMessage(text, isError = false) {
  setModalMessage(programFormMessage, text, isError);
}

function resetProgramForm() {
  if (programForm) {
    programForm.reset();
  }
  setProgramFormMessage('');
}

function setTemplateFormMessage(text, isError = false) {
  setModalMessage(templateFormMessage, text, isError);
}

const EXTERNAL_LINK_ERROR_MESSAGE = 'Enter a valid URL that starts with http:// or https://.';

function setTemplateFormExternalLinkError(message = '') {
  if (!templateFormExternalLinkError) return;
  templateFormExternalLinkError.textContent = message;
  templateFormExternalLinkError.classList.toggle('hidden', !message);
}

function updateTemplateFormExternalLinkPreview(value, isValid) {
  if (!templateFormExternalLinkPreview) return;
  const hasValue = Boolean(value);
  const shouldEnable = hasValue && isValid;
  if (shouldEnable) {
    templateFormExternalLinkPreview.href = value;
    templateFormExternalLinkPreview.classList.remove('pointer-events-none', 'opacity-50');
    templateFormExternalLinkPreview.removeAttribute('aria-disabled');
    templateFormExternalLinkPreview.removeAttribute('tabindex');
  } else {
    templateFormExternalLinkPreview.href = '#';
    templateFormExternalLinkPreview.classList.add('pointer-events-none', 'opacity-50');
    templateFormExternalLinkPreview.setAttribute('aria-disabled', 'true');
    templateFormExternalLinkPreview.setAttribute('tabindex', '-1');
  }
}

function updateTemplateFormExternalLinkState(rawValue) {
  const value = typeof rawValue === 'string' ? rawValue : '';
  const trimmed = value.trim();
  const hasValue = trimmed !== '';
  const isValid = !hasValue || isValidHttpUrl(trimmed);
  if (!isValid) {
    setTemplateFormExternalLinkError(EXTERNAL_LINK_ERROR_MESSAGE);
  } else {
    setTemplateFormExternalLinkError('');
  }
  updateTemplateFormExternalLinkPreview(trimmed, isValid);
  return { value: trimmed, isValid, hasValue };
}

function setTemplatePanelMessage(text, isError = false) {
  setModalMessage(programTemplatePanelMessage, text, isError);
}

function updatePanelAddButtonState() {
  const hasProgram = Boolean(selectedProgramId);
  const canManage = CAN_MANAGE_TEMPLATES && hasProgram;

  if (templateAttachInput) {
    const placeholder = !CAN_MANAGE_TEMPLATES
      ? 'Read-only access — attachments disabled.'
      : hasProgram
        ? 'Search templates to attach…'
        : 'Select a program to attach templates.';
    templateAttachInput.setAttribute('placeholder', placeholder);
    templateAttachInput.disabled = !canManage;
    if (tagifyInstance) {
      tagifyInstance.setReadonly(!canManage);
    }
  }

  if (btnAttachTags) {
    if (!CAN_MANAGE_TEMPLATES) {
      btnAttachTags.disabled = true;
      btnAttachTags.title = 'Only admins or managers can attach templates.';
    } else if (!hasProgram) {
      btnAttachTags.disabled = true;
      btnAttachTags.title = 'Select a program to attach templates.';
    } else {
      btnAttachTags.disabled = pendingAttach.size === 0;
      btnAttachTags.title = pendingAttach.size === 0 ? 'Select templates to attach first.' : '';
    }
  }
}

function ensurePanelReadOnlyHint() {
  if (CAN_MANAGE_TEMPLATES) return;
  if (!selectedProgramId) return;
  if (!programTemplatePanelMessage) return;
  const current = (programTemplatePanelMessage.textContent || '').trim();
  if (!current) {
    setTemplatePanelMessage('Read-only mode — assignments are view only for your role.');
  }
}

function withTagifySuppressed(callback) {
  if (typeof callback !== 'function') return;
  const previous = suppressTagifyEventsFlag;
  suppressTagifyEventsFlag = true;
  try {
    callback();
  } finally {
    suppressTagifyEventsFlag = previous;
  }
}

function destroyTagifyInstance(options = {}) {
  const { preservePending = false } = options;
  let shouldPreservePending = false;
  if (typeof preservePending === 'function') {
    try {
      shouldPreservePending = Boolean(preservePending());
    } catch (error) {
      console.error(error);
      shouldPreservePending = false;
    }
  } else {
    shouldPreservePending = Boolean(preservePending);
  }
  if (tagifyInstance && typeof tagifyInstance.destroy === 'function') {
    try {
      tagifyInstance.destroy();
    } catch (error) {
      console.error(error);
    }
  }
  tagifyInstance = null;
  suppressTagifyEventsFlag = false;
  if (!shouldPreservePending) {
    pendingAttach.clear();
    pendingAttachState.clear();
    pendingAttachProgramId = null;
    if (attachSaveTimeout) {
      clearTimeout(attachSaveTimeout);
      attachSaveTimeout = null;
    }
    if (templateAttachInput) {
      templateAttachInput.value = '';
    }
  }
  updatePanelAddButtonState();
}

function hasPendingAttachForProgram(programId) {
  const normalizedProgramId = normalizeId(programId);
  if (!normalizedProgramId || !pendingAttach.size) {
    return false;
  }
  const fallbackProgramId = normalizeId(pendingAttachProgramId);
  if (fallbackProgramId && fallbackProgramId === normalizedProgramId) {
    return true;
  }
  for (const id of pendingAttach) {
    const normalizedId = normalizeId(id);
    const state = pendingAttachState.get(normalizedId) || pendingAttachState.get(id);
    const stateProgramId = normalizeId(state?.programId);
    if (!stateProgramId && !fallbackProgramId) {
      return true;
    }
    if (stateProgramId === normalizedProgramId) {
      return true;
    }
  }
  return false;
}

function getTagifyOptionFromTemplate(template, { isAssigned = false } = {}) {
  const templateId = getTemplateId(template);
  if (!templateId) return null;
  const name = getTemplateName(template) || `Template ${templateId}`;
  const status = getTemplateStatus(template) || '';
  const option = {
    value: templateId,
    name,
    label: name,
    status,
    isAssigned,
  };
  if (template && typeof template === 'object') {
    option.template = template;
  }
  return option;
}

function initTagifyForProgram(programId, options = {}) {
  const { preservePending = false } = options;
  const normalizedProgramId = normalizeId(programId);
  const evaluatePreservePending = () => {
    let shouldPreserve = false;
    if (typeof preservePending === 'function') {
      try {
        shouldPreserve = Boolean(preservePending());
      } catch (error) {
        console.error(error);
        shouldPreserve = false;
      }
    } else {
      shouldPreserve = Boolean(preservePending);
    }
    if (!shouldPreserve && normalizedProgramId) {
      shouldPreserve = hasPendingAttachForProgram(normalizedProgramId);
    }
    return shouldPreserve;
  };

  destroyTagifyInstance({ preservePending: () => evaluatePreservePending() });

  const shouldRestorePending = evaluatePreservePending();

  if (!templateAttachInput) {
    updatePanelAddButtonState();
    return;
  }
  updatePanelAddButtonState();
  if (!programId) {
    return;
  }
  const TagifyConstructor = window?.Tagify;
  if (typeof TagifyConstructor !== 'function') {
    console.warn('Tagify library is not available.');
    return;
  }

  const assignedTags = templates
    .map(template => getTagifyOptionFromTemplate(template, { isAssigned: true }))
    .filter(Boolean);
  const assignedIds = new Set(assignedTags.map(tag => tag.value).filter(Boolean));
  const availableTags = (Array.isArray(templateLibrary) ? templateLibrary : [])
    .map(template => getTagifyOptionFromTemplate(template))
    .filter(option => option && isPublishedTemplateStatus(option.status) && !assignedIds.has(option.value));

  tagifyInstance = new TagifyConstructor(templateAttachInput, {
    enforceWhitelist: true,
    skipInvalid: true,
    dropdown: {
      enabled: 0,
      maxItems: 20,
      closeOnSelect: false,
      searchKeys: ['name', 'label', 'value'],
    },
    whitelist: availableTags,
    templates: {
      tag(tagData) {
        const label = escapeHtml(tagData?.name || tagData?.label || tagData?.value || '');
        const status = tagData?.status ? createStatusBadge(tagData.status) : '';
        return `
          <tag title="${label}"
               contenteditable="false"
               spellcheck="false"
               class="tagify__tag">
            <x title="" class="tagify__tag__removeBtn" role="button" aria-label="remove tag"></x>
            <div class="tagify__tag-text-wrapper flex items-center gap-2">
              <span class="tagify__tag-text">${label}</span>
              ${status ? `<span class="shrink-0">${status}</span>` : ''}
            </div>
          </tag>
        `;
      },
      dropdownItem(tagData) {
        const label = escapeHtml(tagData?.name || tagData?.label || tagData?.value || '');
        const status = tagData?.status ? createStatusBadge(tagData.status) : '';
        return `
          <div ${this.getAttributes(tagData)}
               class="tagify__dropdown__item flex items-center justify-between gap-2">
            <span class="truncate">${label}</span>
            ${status ? `<span class="shrink-0">${status}</span>` : ''}
          </div>
        `;
      },
    },
  });

  withTagifySuppressed(() => {
    if (!tagifyInstance) return;
    const settings = tagifyInstance.settings || {};
    const previousEnforce = Object.prototype.hasOwnProperty.call(settings, 'enforceWhitelist')
      ? settings.enforceWhitelist
      : undefined;
    try {
      if (typeof previousEnforce !== 'undefined') {
        settings.enforceWhitelist = false;
      }
      if (assignedTags.length) {
        tagifyInstance.addTags(assignedTags);
      }
      if (shouldRestorePending && pendingAttach.size && hasPendingAttachForProgram(normalizedProgramId)) {
        const pendingTags = [];
        const assignedSet = new Set((tagifyInstance.value || []).map(item => normalizeId(item?.value ?? item?.id)).filter(Boolean));
        for (const id of pendingAttach) {
          const normalizedId = normalizeId(id);
          if (!normalizedId || assignedSet.has(normalizedId)) continue;
          const state = pendingAttachState.get(normalizedId) || pendingAttachState.get(id);
          const stateProgramId = normalizeId(state?.programId) || normalizeId(pendingAttachProgramId);
          if (stateProgramId && stateProgramId !== normalizedProgramId) {
            continue;
          }
          const tagData = state?.tagData
            || getTagifyOptionFromTemplate(state?.templateData)
            || getTagifyOptionFromTemplate(templateLibraryIndex.get(normalizedId))
            || { value: normalizedId };
          pendingTags.push(tagData);
        }
        if (pendingTags.length) {
          tagifyInstance.addTags(pendingTags);
        }
      }
    } finally {
      if (typeof previousEnforce !== 'undefined') {
        settings.enforceWhitelist = previousEnforce;
      }
    }
  });
  tagifyInstance.on('add', handleTagifyAdd);
  tagifyInstance.on('remove', handleTagifyRemove);
  updatePanelAddButtonState();
}

function schedulePendingTemplateAttachments({ immediate = false } = {}) {
  if (!pendingAttach.size && !immediate) {
    return;
  }
  if (attachSaveTimeout) {
    clearTimeout(attachSaveTimeout);
    attachSaveTimeout = null;
  }
  if (immediate) {
    flushPendingTemplateAttachments({ immediate: true }).catch(error => {
      console.error(error);
    });
    return;
  }
  attachSaveTimeout = setTimeout(() => {
    attachSaveTimeout = null;
    flushPendingTemplateAttachments({ immediate: true }).catch(error => {
      console.error(error);
    });
  }, ATTACH_SAVE_DELAY_MS);
}

async function flushPendingTemplateAttachments({ immediate = false } = {}) {
  if (attachInFlightPromise) {
    try {
      await attachInFlightPromise;
    } catch (error) {
      console.error(error);
    }
  }
  if (!pendingAttach.size) {
    if (immediate && attachSaveTimeout) {
      clearTimeout(attachSaveTimeout);
      attachSaveTimeout = null;
    }
    return false;
  }
  const targetProgramId = pendingAttachProgramId || selectedProgramId;
  if (!targetProgramId) {
    pendingAttach.clear();
    pendingAttachState.clear();
    pendingAttachProgramId = null;
    if (attachSaveTimeout) {
      clearTimeout(attachSaveTimeout);
      attachSaveTimeout = null;
    }
    return false;
  }
  if (!immediate && attachSaveTimeout) {
    return false;
  }
  if (immediate && attachSaveTimeout) {
    clearTimeout(attachSaveTimeout);
    attachSaveTimeout = null;
  }

  const programId = targetProgramId;
  const entries = [];
  const processedIds = [];
  for (const rawId of pendingAttach) {
    const normalizedId = normalizeId(rawId);
    const id = normalizedId || rawId;
    const state = pendingAttachState.get(id) || pendingAttachState.get(rawId);
    const entryProgramId = state?.programId || programId;
    if (entryProgramId && entryProgramId !== programId) {
      continue;
    }
    entries.push({ id, state });
    processedIds.push(id);
  }
  processedIds.forEach(id => {
    if (id !== null && id !== undefined) {
      pendingAttach.delete(id);
      pendingAttachState.delete(id);
    }
  });
  if (!pendingAttach.size) {
    pendingAttachProgramId = null;
  } else {
    const nextPending = pendingAttach.values().next();
    if (!nextPending.done) {
      const nextId = normalizeId(nextPending.value);
      const nextState = pendingAttachState.get(nextId) || pendingAttachState.get(nextPending.value);
      if (nextState?.programId) {
        pendingAttachProgramId = nextState.programId;
      } else if (pendingAttachProgramId === programId) {
        pendingAttachProgramId = null;
      }
    } else {
      pendingAttachProgramId = null;
    }
  }
  if (!entries.length) {
    updatePanelAddButtonState();
    return false;
  }

  const perform = (async () => {
    try {
      const attachedStillSelected = selectedProgramId === programId;
      if (attachedStillSelected) {
        setTemplatePanelMessage('Attaching templates…');
      }
      let attachedDelta = 0;
      let attachedCount = 0;
      let alreadyAttachedCount = 0;
      let failureCount = 0;
      for (const { id, state } of entries) {
        const basePayload = state?.payload && typeof state.payload === 'object' ? state.payload : {};
        const payload = { template_id: id, ...basePayload };
        try {
          const result = await fetchJson(`${API}/api/programs/${encodeURIComponent(programId)}/templates`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const alreadyAttached = Boolean(result?.alreadyAttached);
          if (alreadyAttached) {
            alreadyAttachedCount += 1;
          } else {
            attachedCount += 1;
            attachedDelta += 1;
          }
          if (result?.template) {
            applyTemplateMetadataToCaches(result.template);
          }
        } catch (error) {
          failureCount += 1;
          console.error(error);
          pendingAttach.add(id);
          const nextState = state ? { ...state, programId } : { programId };
          pendingAttachState.set(id, nextState);
          pendingAttachProgramId = programId;
          if (typeof state?.revert === 'function') {
            try {
              state.revert();
            } catch (revertError) {
              console.error(revertError);
            }
          }
          if (tagifyInstance && state?.tagData) {
            withTagifySuppressed(() => {
              tagifyInstance.addTags([state.tagData]);
            });
          }
        }
      }

      if (attachedDelta) {
        const updated = updateCachedProgramTemplateCount(programId, { delta: attachedDelta });
        if (updated) {
          renderPrograms();
        }
      }

      const hasSuccess = attachedCount > 0 || alreadyAttachedCount > 0;

      if (attachedStillSelected) {
        if (failureCount && !hasSuccess) {
          setTemplatePanelMessage('Unable to attach templates. Please try again.', true);
        } else if (failureCount && hasSuccess) {
          setTemplatePanelMessage('Some templates could not be attached. Please try again.', true);
        } else {
          let successMessage = 'Templates attached.';
          if (!attachedCount && alreadyAttachedCount) {
            successMessage = alreadyAttachedCount === 1
              ? 'Template was already attached.'
              : 'Templates were already attached.';
          } else if (attachedCount && alreadyAttachedCount) {
            successMessage = 'Templates attached. Some were already linked.';
          }
          setTemplatePanelMessage(successMessage);
          setTimeout(() => {
            if (programTemplatePanelMessage && programTemplatePanelMessage.textContent === successMessage) {
              setTemplatePanelMessage('');
            }
          }, 2500);
        }
        if (hasSuccess) {
          if (tagifyInstance) {
            withTagifySuppressed(() => {
              tagifyInstance.removeAllTags?.();
              tagifyInstance.dropdown?.hide?.();
            });
          }
          updatePanelAddButtonState();
        }
      }

      if (hasSuccess && attachedStillSelected) {
        await loadProgramTemplateAssignments({
          preserveSelection: true,
          skipAttachWaitFor: perform,
        });
      }

      if (failureCount) {
        return false;
      }
      pendingAttach.clear();
      pendingAttachState.clear();
      pendingAttachProgramId = null;
      if (attachSaveTimeout) {
        clearTimeout(attachSaveTimeout);
        attachSaveTimeout = null;
      }
      return true;
    } catch (error) {
      console.error(error);
      entries.forEach(({ id, state }) => {
        pendingAttach.add(id);
        const nextState = state ? { ...state, programId } : { programId };
        pendingAttachState.set(id, nextState);
        if (typeof state?.revert === 'function') {
          try {
            state.revert();
          } catch (revertError) {
            console.error(revertError);
          }
        }
        if (tagifyInstance && state?.tagData) {
          withTagifySuppressed(() => {
            tagifyInstance.addTags([state.tagData]);
          });
        }
      });
      pendingAttachProgramId = programId;
      if (selectedProgramId === programId) {
        const message = error.status === 403
          ? 'You do not have permission to attach templates.'
          : 'Unable to attach templates. Please try again.';
        setTemplatePanelMessage(message, true);
        renderTemplates();
      }
      return false;
    } finally {
      attachInFlightPromise = null;
      updatePanelAddButtonState();
    }
  })();

  attachInFlightPromise = perform;
  return perform;
}

function applyTemplateMetadataToCaches(templateData) {
  if (!templateData || typeof templateData !== 'object') return;
  const templateId = getTemplateId(templateData);
  if (!templateId) return;

  if (templateData.__auditInsert && !templateAuditState.has(templateId)) {
    templateAuditState.set(templateId, {
      status: 'ready',
      info: templateData.__auditInsert,
      records: Array.isArray(templateData.__auditRecords) ? templateData.__auditRecords : null,
    });
  }
  const existingAuditState = templateAuditState.get(templateId);
  if (existingAuditState?.status === 'ready') {
    applyTemplateAuditData(templateId, existingAuditState.info || null, existingAuditState.records || null);
  }

  const assignmentIndex = templates.findIndex(template => getTemplateId(template) === templateId);
  const isAssigned = assignmentIndex >= 0;
  const normalizedStatus = normalizeTemplateStatusValue(getTemplateStatus(templateData));
  const isPublished = normalizedStatus === 'published';
  const shouldExposeInLibrary = isPublished && !isAssigned;

  const mergeIntoCollection = (collection, { allowInsert = true } = {}) => {
    if (!Array.isArray(collection)) return;
    const index = collection.findIndex(item => getTemplateId(item) === templateId);
    if (index >= 0) {
      const existing = collection[index] && typeof collection[index] === 'object' ? collection[index] : {};
      collection[index] = { ...existing, ...templateData };
    } else if (allowInsert) {
      collection.push({ ...templateData });
    }
  };

  mergeIntoCollection(globalTemplates);

  if (Array.isArray(templateLibrary)) {
    const libraryIndex = templateLibrary.findIndex(item => getTemplateId(item) === templateId);
    if (libraryIndex >= 0) {
      if (!shouldExposeInLibrary) {
        templateLibrary.splice(libraryIndex, 1);
      } else {
        const existing = templateLibrary[libraryIndex] && typeof templateLibrary[libraryIndex] === 'object'
          ? templateLibrary[libraryIndex]
          : {};
        templateLibrary[libraryIndex] = { ...existing, ...templateData };
      }
    } else if (shouldExposeInLibrary) {
      templateLibrary.push({ ...templateData });
    }
  }

  if (shouldExposeInLibrary || isAssigned) {
    const existingLibraryEntry = templateLibraryIndex.get(templateId);
    if (existingLibraryEntry && typeof existingLibraryEntry === 'object') {
      templateLibraryIndex.set(templateId, { ...existingLibraryEntry, ...templateData });
    } else {
      templateLibraryIndex.set(templateId, { ...templateData });
    }
  } else {
    templateLibraryIndex.delete(templateId);
  }

  if (assignmentIndex >= 0) {
    const existingAssignment = templates[assignmentIndex];
    const mergedAssignment = {
      ...existingAssignment,
      template: { ...(existingAssignment?.template || {}), ...templateData },
      template_id: templateId,
    };
    templates[assignmentIndex] = normalizeTemplateAssociation(mergedAssignment, assignmentIndex);
  }

  if (tagifyInstance) {
    const assignedOption = getTagifyOptionFromTemplate(templateData, { isAssigned: true });
    const availableOption = shouldExposeInLibrary ? getTagifyOptionFromTemplate(templateData) : null;
    const removeFromAvailable = !shouldExposeInLibrary;

    const updateTagCollection = (collection, option, { remove = false } = {}) => {
      if (!Array.isArray(collection)) return;
      const idx = collection.findIndex(item => normalizeId(item?.value ?? item?.id) === templateId);
      if (idx >= 0) {
        if (remove) {
          collection.splice(idx, 1);
          return;
        }
        if (!option) return;
        const existing = collection[idx] && typeof collection[idx] === 'object' ? collection[idx] : {};
        collection[idx] = { ...existing, ...option };
      } else if (!remove && option) {
        collection.push({ ...option });
      }
    };

    updateTagCollection(tagifyInstance.value, assignedOption);
    if (tagifyInstance.settings && typeof tagifyInstance.settings === 'object') {
      updateTagCollection(tagifyInstance.settings.whitelist, availableOption, { remove: removeFromAvailable });
    }
    if (Array.isArray(tagifyInstance.whitelist)) {
      updateTagCollection(tagifyInstance.whitelist, availableOption, { remove: removeFromAvailable });
    }
  }
}

function updateCachedProgramTemplateCount(programId, { delta = 0, total = null } = {}) {
  if (!programId) return false;
  const program = getProgramById(programId);
  if (!program) return false;

  const toFiniteNumber = value => {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const normalizedTotal = toFiniteNumber(total);
  const hasTotal = normalizedTotal !== null;
  const normalizedDelta = toFiniteNumber(delta);
  const deltaValue = normalizedDelta !== null ? normalizedDelta : 0;

  const candidateKeys = [
    'template_count',
    'templates_count',
    'templateCount',
    'templatesCount',
    'template_assignments_count',
    'templateAssignmentsCount',
    'assignments_count',
    'assignmentsCount',
  ];
  const candidateTargets = [program, program?.meta, program?.stats];
  let updated = false;

  const applyToTarget = (target, key) => {
    if (!target || typeof target !== 'object') return false;
    if (hasTotal) {
      if (target[key] !== normalizedTotal) {
        target[key] = normalizedTotal;
        return true;
      }
      return false;
    }
    if (!(key in target)) return false;
    const current = toFiniteNumber(target[key]) ?? 0;
    const nextValue = Math.max(0, current + deltaValue);
    if (target[key] !== nextValue) {
      target[key] = nextValue;
      return true;
    }
    return false;
  };

  candidateTargets.forEach(target => {
    candidateKeys.forEach(key => {
      if (hasTotal || (target && Object.prototype.hasOwnProperty.call(target, key))) {
        if (applyToTarget(target, key)) {
          updated = true;
        }
      }
    });
  });

  if (!updated && hasTotal) {
    if (program.template_assignments_count !== normalizedTotal) {
      program.template_assignments_count = normalizedTotal;
      updated = true;
    }
  } else if (!updated && deltaValue) {
    const current = toFiniteNumber(program.template_assignments_count) ?? 0;
    const nextValue = Math.max(0, current + deltaValue);
    if (program.template_assignments_count !== nextValue) {
      program.template_assignments_count = nextValue;
      updated = true;
    }
  }

  return updated;
}

function extractAssignmentTotalFromResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const toFiniteNumber = value => {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const directSources = [payload, payload.meta, payload.stats, payload.counts, payload.pagination];
  const candidateKeys = [
    'total',
    'count',
    'template_count',
    'templates_count',
    'templateCount',
    'templatesCount',
    'assignments_count',
    'assignmentsCount',
  ];

  for (const source of directSources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    for (const key of candidateKeys) {
      if (key in source) {
        const numeric = toFiniteNumber(source[key]);
        if (numeric !== null) {
          return numeric;
        }
      }
    }
  }

  const nestedKeys = ['data', 'assignments', 'results', 'items', 'templates', 'records', 'rows'];
  for (const key of nestedKeys) {
    const value = payload[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const nestedTotal = extractAssignmentTotalFromResponse(value);
    if (nestedTotal !== null) {
      return nestedTotal;
    }
  }

  return null;
}

function handleTagifyAdd(event) {
  if (suppressTagifyEventsFlag) return;
  const data = event?.detail?.data || {};
  const templateId = normalizeId(data?.value ?? data?.id);
  if (!templateId) return;

  if (!CAN_MANAGE_TEMPLATES) {
    ensurePanelReadOnlyHint();
    if (tagifyInstance) {
      withTagifySuppressed(() => {
        if (typeof tagifyInstance.removeTags === 'function') {
          tagifyInstance.removeTags(templateId, true);
        } else if (event?.detail?.tag && typeof tagifyInstance.removeTag === 'function') {
          tagifyInstance.removeTag(event.detail.tag, true);
        }
      });
    }
    return;
  }
  if (!selectedProgramId) {
    setTemplatePanelMessage('Select a program before attaching templates.', true);
    if (tagifyInstance) {
      withTagifySuppressed(() => {
        if (typeof tagifyInstance.removeTags === 'function') {
          tagifyInstance.removeTags(templateId, true);
        } else if (event?.detail?.tag && typeof tagifyInstance.removeTag === 'function') {
          tagifyInstance.removeTag(event.detail.tag, true);
        }
      });
    }
    return;
  }
  if (pendingAttach.has(templateId)) {
    updatePanelAddButtonState();
    return;
  }

  const previousSelection = new Set(selectedTemplateIds);
  const previousPrimary = selectedTemplateId;
  let templateData = templateLibraryIndex.get(templateId)
    || getTemplateById(templateId)
    || data?.template
    || data?.templateRef
    || null;
  if (!templateData) {
    templateData = {
      id: templateId,
      name: data?.name || data?.label || data?.text || templateId,
      status: data?.status || 'draft',
    };
  }
  if (templateData && !templateLibraryIndex.has(templateId)) {
    templateLibraryIndex.set(templateId, templateData);
  }
  const alreadyExists = templates.some(template => getTemplateId(template) === templateId);
  if (!alreadyExists) {
    const optimisticTemplate = normalizeTemplateAssociation({ template: templateData, template_id: templateId }, templates.length);
    templates.push(optimisticTemplate);
  }
  renderTemplates();

  const revert = () => {
    templates = templates.filter(template => getTemplateId(template) !== templateId);
    selectedTemplateIds.clear();
    previousSelection.forEach(id => selectedTemplateIds.add(id));
    selectedTemplateId = previousPrimary;
    renderTemplates();
  };

  const queueWasEmpty = pendingAttach.size === 0;
  pendingAttach.add(templateId);
  pendingAttachState.set(templateId, {
    revert,
    tagData: { ...data },
    templateData,
    payload: {},
    programId: selectedProgramId || null,
  });
  if (queueWasEmpty) {
    pendingAttachProgramId = selectedProgramId || null;
  }
  updatePanelAddButtonState();
  schedulePendingTemplateAttachments();
}

function requestTemplateDetachment(templateId, options = {}) {
  const { tagData = null, removeTagifyTag = false } = options;
  if (!templateId) return false;

  const resolvedTagData = (() => {
    if (tagData && typeof tagData === 'object') {
      const copy = { ...tagData };
      if (!copy.value && copy.id) {
        copy.value = copy.id;
      }
      if (!copy.id && copy.value) {
        copy.id = copy.value;
      }
      if (!copy.value) {
        copy.value = templateId;
      }
      if (!copy.id) {
        copy.id = templateId;
      }
      return copy;
    }
    const template = getTemplateById(templateId);
    if (template) {
      const option = getTagifyOptionFromTemplate(template, { isAssigned: true });
      if (option) {
        return option;
      }
    }
    return { value: templateId, id: templateId };
  })();

  const reAddTag = () => {
    if (!tagifyInstance || !resolvedTagData) return;
    withTagifySuppressed(() => {
      tagifyInstance.addTags([resolvedTagData]);
    });
  };

  if (removeTagifyTag && tagifyInstance) {
    withTagifySuppressed(() => {
      if (typeof tagifyInstance.removeTags === 'function') {
        tagifyInstance.removeTags(templateId, true);
      } else if (typeof tagifyInstance.removeTag === 'function') {
        const tagElm = typeof tagifyInstance.getTagElmByValue === 'function'
          ? tagifyInstance.getTagElmByValue(templateId)
          : null;
        if (tagElm) {
          tagifyInstance.removeTag(tagElm, true);
        }
      }
    });
  }

  if (pendingAttach.has(templateId)) {
    const state = pendingAttachState.get(templateId);
    pendingAttach.delete(templateId);
    pendingAttachState.delete(templateId);
    if (!pendingAttach.size) {
      pendingAttachProgramId = null;
    }
    if (state?.revert) {
      try {
        state.revert();
      } catch (error) {
        console.error(error);
      }
    }
    updatePanelAddButtonState();
    return true;
  }

  if (!CAN_MANAGE_TEMPLATES) {
    ensurePanelReadOnlyHint();
    reAddTag();
    return false;
  }
  if (!selectedProgramId) {
    setTemplatePanelMessage('Select a program before removing templates.', true);
    reAddTag();
    return false;
  }

  const index = templates.findIndex(template => getTemplateId(template) === templateId);
  if (index < 0) {
    updatePanelAddButtonState();
    return false;
  }

  const targetTemplate = templates[index];

  const previousSelection = new Set(selectedTemplateIds);
  const previousPrimary = selectedTemplateId;
  const [removedTemplate] = templates.splice(index, 1);
  selectedTemplateIds.delete(templateId);
  if (selectedTemplateId === templateId) {
    selectedTemplateId = null;
  }
  renderTemplates();

  const revert = () => {
    templates.splice(index, 0, removedTemplate);
    selectedTemplateIds.clear();
    previousSelection.forEach(id => selectedTemplateIds.add(id));
    selectedTemplateId = previousPrimary;
    renderTemplates();
  };

  detachTemplateAssociation(templateId, { revert, tagData: resolvedTagData });
  return true;
}

function handleTagifyRemove(event) {
  if (suppressTagifyEventsFlag) return;
  const data = event?.detail?.data || {};
  const templateId = normalizeId(data?.value ?? data?.id);
  if (!templateId) return;

  requestTemplateDetachment(templateId, { tagData: { ...data } });
}

async function detachTemplateAssociation(templateId, { revert, tagData } = {}) {
  if (!templateId || !selectedProgramId) {
    if (typeof revert === 'function') revert();
    if (tagifyInstance && tagData) {
      withTagifySuppressed(() => {
        tagifyInstance.addTags([tagData]);
      });
    }
    updatePanelAddButtonState();
    return;
  }

  const programId = selectedProgramId;
  setTemplatePanelMessage('Removing template…');
  let deleteWasNoOp = false;
  let detachResult = { wasAttached: false };
  try {
    try {
      detachResult = await fetchJson(`${API}/api/programs/${encodeURIComponent(programId)}/templates/${encodeURIComponent(templateId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      if (error.status === 404) {
        deleteWasNoOp = true;
      } else {
        throw error;
      }
    }
    const wasAttached = Boolean(detachResult?.wasAttached);
    if (wasAttached) {
      const updated = updateCachedProgramTemplateCount(programId, { delta: -1 });
      if (updated) {
        renderPrograms();
      }
    }
    if (deleteWasNoOp || !wasAttached) {
      setTemplatePanelMessage('Template was already removed.');
    } else {
      setTemplatePanelMessage('Template removed.');
    }
    setTimeout(() => {
      const successMessage = deleteWasNoOp || !wasAttached ? 'Template was already removed.' : 'Template removed.';
      if (programTemplatePanelMessage && programTemplatePanelMessage.textContent === successMessage) {
        setTemplatePanelMessage('');
      }
    }, 2500);
    await loadProgramTemplateAssignments({ preserveSelection: true });
  } catch (error) {
    console.error(error);
    if (typeof revert === 'function') {
      try {
        revert();
      } catch (revertError) {
        console.error(revertError);
      }
    }
    if (tagifyInstance && tagData) {
      withTagifySuppressed(() => {
        tagifyInstance.addTags([tagData]);
      });
    }
    if (error.status === 403) {
      setTemplatePanelMessage('You do not have permission to remove templates from this program.', true);
    } else {
      setTemplatePanelMessage('Unable to remove this template. Please try again.', true);
    }
  } finally {
    updatePanelAddButtonState();
  }
}

function resetPendingMetadataState() {
  pendingMetadataState.programId = null;
  pendingMetadataState.updates = new Map();
  pendingMetadataState.savingMessage = 'Saving changes…';
  pendingMetadataState.successMessage = 'Changes saved.';
  pendingMetadataState.reload = false;
}

function buildAssociationUpdatePayload(updates) {
  const payload = {};
  if (!updates || typeof updates !== 'object') return payload;
  if ('notes' in updates) {
    const value = updates.notes;
    if (value === null) {
      payload.notes = null;
    } else {
      const trimmed = String(value);
      payload.notes = trimmed.trim() === '' ? null : trimmed;
    }
  }
  if ('hyperlink' in updates) {
    const value = updates.hyperlink;
    if (value === null || value === undefined) {
      payload.hyperlink = null;
    } else {
      const trimmed = String(value).trim();
      payload.hyperlink = trimmed === '' ? null : trimmed;
    }
  }
  if ('sortOrder' in updates) {
    const value = updates.sortOrder;
    if (value === null || value === undefined || value === '') {
      payload.sort_order = null;
    } else {
      const asNumber = typeof value === 'number' ? value : Number(value);
      payload.sort_order = Number.isFinite(asNumber) ? asNumber : null;
    }
  }
  return payload;
}

function scheduleMetadataSave() {
  if (metadataSaveTimeout) {
    clearTimeout(metadataSaveTimeout);
  }
  metadataSaveTimeout = setTimeout(() => {
    metadataSaveTimeout = null;
    flushPendingMetadataUpdates({ immediate: true }).catch(error => {
      console.error(error);
    });
  }, METADATA_SAVE_DELAY_MS);
}

async function flushPendingMetadataUpdates({ immediate = false } = {}) {
  if (metadataInFlightPromise) {
    try {
      await metadataInFlightPromise;
    } catch (error) {
      console.error(error);
    }
  }
  if (!pendingMetadataState.updates.size || !pendingMetadataState.programId) {
    if (immediate && metadataSaveTimeout) {
      clearTimeout(metadataSaveTimeout);
      metadataSaveTimeout = null;
    }
    return false;
  }
  if (!immediate && metadataSaveTimeout) {
    return false;
  }
  if (immediate && metadataSaveTimeout) {
    clearTimeout(metadataSaveTimeout);
    metadataSaveTimeout = null;
  }

  const programId = pendingMetadataState.programId;
  const savingMessage = pendingMetadataState.savingMessage;
  const successMessage = pendingMetadataState.successMessage;
  const shouldReload = pendingMetadataState.reload;
  const entries = Array.from(pendingMetadataState.updates.entries());
  resetPendingMetadataState();

  const batch = [];
  const revertFns = [];
  entries.forEach(([templateId, entry]) => {
    if (!templateId) return;
    const payload = entry?.payload || {};
    const payloadKeys = Object.keys(payload).filter(key => payload[key] !== undefined);
    if (!payloadKeys.length) return;
    const formatted = { template_id: templateId };
    payloadKeys.forEach(key => {
      formatted[key] = payload[key];
    });
    batch.push(formatted);
    if (typeof entry?.revert === 'function') {
      revertFns.push(entry.revert);
    }
  });

  if (!batch.length) {
    return false;
  }

  const performSave = (async () => {
    isPersistingMetadataUpdates = true;
    if (selectedProgramId === programId) {
      setTemplatePanelMessage(savingMessage);
    }
    let success = false;
    let updatedCount = 0;
    try {
      for (const entry of batch) {
        const templateId = entry?.template_id;
        if (!templateId) continue;
        const payload = { ...entry };
        delete payload.template_id;
        const response = await fetchJson(`${API}/api/programs/${encodeURIComponent(programId)}/templates/${encodeURIComponent(templateId)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (response?.template) {
          applyTemplateMetadataToCaches(response.template);
        }
        if (response?.updated) {
          updatedCount += 1;
        }
      }
      success = true;
      if (selectedProgramId === programId) {
        const messageToShow = updatedCount === 0 ? 'No changes were applied.' : successMessage;
        if (shouldReload) {
          await loadProgramTemplateAssignments({ preserveSelection: true });
        }
        setTemplatePanelMessage(messageToShow);
        setTimeout(() => {
          if (programTemplatePanelMessage && programTemplatePanelMessage.textContent === messageToShow) {
            setTemplatePanelMessage('');
          }
        }, 2500);
      }
    } catch (error) {
      console.error(error);
      revertFns.forEach(fn => {
        try {
          fn();
        } catch (revertError) {
          console.error(revertError);
        }
      });
      if (selectedProgramId === programId) {
        await loadProgramTemplateAssignments({ preserveSelection: true }).catch(() => {});
        if (error.status === 403) {
          setTemplatePanelMessage('You do not have permission to edit template assignments.', true);
        } else {
          setTemplatePanelMessage('Unable to save template changes. Please try again.', true);
        }
      }
    } finally {
      isPersistingMetadataUpdates = false;
      metadataInFlightPromise = null;
      if (pendingMetadataState.updates.size) {
        scheduleMetadataSave();
      }
    }
    return success;
  })();

  metadataInFlightPromise = performSave;
  return performSave;
}

function resetPendingReorderState() {
  pendingReorderState.programId = null;
  pendingReorderState.order = null;
  pendingReorderState.revert = null;
  pendingReorderState.savingMessage = 'Saving order…';
  pendingReorderState.successMessage = 'Order updated.';
}

function scheduleReorderSave() {
  if (reorderSaveTimeout) {
    clearTimeout(reorderSaveTimeout);
  }
  reorderSaveTimeout = setTimeout(() => {
    reorderSaveTimeout = null;
    flushPendingTemplateOrder({ immediate: true }).catch(error => {
      console.error(error);
    });
  }, REORDER_SAVE_DELAY_MS);
}

function sanitizeLinkOrder(order) {
  if (!Array.isArray(order)) {
    return [];
  }
  const sanitized = [];
  for (const entry of order) {
    const parsed = toNullableNumber(entry);
    if (parsed !== null) {
      sanitized.push(parsed);
    }
  }
  return sanitized;
}

function createOrderRevert(previousOrder) {
  if (!Array.isArray(previousOrder) || !previousOrder.length) {
    return null;
  }
  const orderEntries = [];
  previousOrder.forEach((id, index) => {
    if (id === null || id === undefined || id === '') {
      return;
    }
    orderEntries.push([id, index]);
  });
  const orderMap = new Map(orderEntries);
  const getOrderKey = template => {
    const linkId = getTemplateLinkId(template);
    if (linkId !== null) {
      return linkId;
    }
    return getTemplateId(template) ?? null;
  };
  return () => {
    templates.sort((a, b) => {
      const aKey = getOrderKey(a);
      const bKey = getOrderKey(b);
      const aIndex = (aKey !== null && aKey !== undefined && aKey !== '' && orderMap.has(aKey))
        ? orderMap.get(aKey)
        : Number.MAX_SAFE_INTEGER;
      const bIndex = (bKey !== null && bKey !== undefined && bKey !== '' && orderMap.has(bKey))
        ? orderMap.get(bKey)
        : Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
    templates.forEach((template, index) => {
      template.sort_order = index + 1;
      template.sortOrder = index + 1;
    });
    renderTemplates();
  };
}

function queueTemplateOrderSave(previousOrder = null) {
  if (!CAN_MANAGE_TEMPLATES) {
    ensurePanelReadOnlyHint();
    return;
  }
  if (!selectedProgramId) {
    setTemplatePanelMessage('Select a program before reordering templates.', true);
    return;
  }
  const programId = selectedProgramId;
  const currentOrder = sanitizeLinkOrder(templates.map(getTemplateLinkId));
  if (!currentOrder.length) {
    return;
  }
  const previousLinkOrder = Array.isArray(previousOrder) ? sanitizeLinkOrder(previousOrder) : null;
  if (Array.isArray(previousLinkOrder) && previousLinkOrder.length === currentOrder.length) {
    const unchanged = previousLinkOrder.every((id, index) => id === currentOrder[index]);
    if (unchanged) {
      return;
    }
  }
  pendingReorderState.programId = programId;
  pendingReorderState.order = [...currentOrder];
  pendingReorderState.revert = createOrderRevert(previousOrder);
  pendingReorderState.savingMessage = 'Saving order…';
  pendingReorderState.successMessage = 'Order updated.';
  if (selectedProgramId === programId) {
    setTemplatePanelMessage('Saving order…');
  }
  scheduleReorderSave();
}

async function flushPendingTemplateOrder({ immediate = false } = {}) {
  if (reorderInFlightPromise) {
    try {
      await reorderInFlightPromise;
    } catch (error) {
      console.error(error);
    }
  }
  if (!pendingReorderState.order || !pendingReorderState.programId) {
    if (immediate && reorderSaveTimeout) {
      clearTimeout(reorderSaveTimeout);
      reorderSaveTimeout = null;
    }
    return false;
  }
  if (!immediate && reorderSaveTimeout) {
    return false;
  }
  if (immediate && reorderSaveTimeout) {
    clearTimeout(reorderSaveTimeout);
    reorderSaveTimeout = null;
  }

  const programId = pendingReorderState.programId;
  const order = Array.isArray(pendingReorderState.order) ? [...pendingReorderState.order] : null;
  const revert = pendingReorderState.revert;
  const savingMessage = pendingReorderState.savingMessage;
  const successMessage = pendingReorderState.successMessage;
  resetPendingReorderState();

  if (!order || !order.length || !programId) {
    return false;
  }
  const filteredOrder = sanitizeLinkOrder(order);
  if (!filteredOrder.length) {
    return false;
  }

  const performSave = (async () => {
    isPersistingTemplateOrder = true;
    if (selectedProgramId === programId) {
      setTemplatePanelMessage(savingMessage);
    }
    let success = false;
    try {
      const response = await fetchJson(`${API}/programs/${encodeURIComponent(programId)}/templates/reorder`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: filteredOrder }),
      });
      const updatedCount = Number(response?.updated ?? 0);
      success = true;
      if (selectedProgramId === programId) {
        if (updatedCount > 0) {
          await loadProgramTemplateAssignments({ preserveSelection: true });
        }
        const messageToShow = updatedCount === 0 ? 'Order already up to date.' : successMessage;
        setTemplatePanelMessage(messageToShow);
        setTimeout(() => {
          if (programTemplatePanelMessage && programTemplatePanelMessage.textContent === messageToShow) {
            setTemplatePanelMessage('');
          }
        }, 2500);
      }
    } catch (error) {
      console.error(error);
      if (typeof revert === 'function') {
        try {
          revert();
        } catch (revertError) {
          console.error(revertError);
        }
      }
      if (selectedProgramId === programId) {
        await loadProgramTemplateAssignments({ preserveSelection: true }).catch(() => {});
        if (error.status === 403) {
          setTemplatePanelMessage('You do not have permission to reorder templates.', true);
        } else {
          setTemplatePanelMessage('Unable to save the new order. Please try again.', true);
        }
      }
    } finally {
      isPersistingTemplateOrder = false;
      reorderInFlightPromise = null;
      if (pendingReorderState.order && pendingReorderState.programId) {
        scheduleReorderSave();
      }
    }
    return success;
  })();

  reorderInFlightPromise = performSave;
  return performSave;
}

async function flushPendingTemplateAssociationChanges() {
  await flushPendingMetadataUpdates({ immediate: true });
  await flushPendingTemplateOrder({ immediate: true });
  await flushPendingTemplateAttachments({ immediate: true });
}

function resetTemplateForm() {
  if (templateForm) {
    templateForm.reset();
  }
  if (templateFormWeekInput) {
    templateFormWeekInput.value = '1';
  }
  if (templateFormSortInput) {
    templateFormSortInput.value = '1';
  }
  if (templateFormLabelInput) {
    templateFormLabelInput.value = '';
  }
  if (templateFormOrganizationInput) {
    templateFormOrganizationInput.value = '';
  }
  if (templateFormSubUnitInput) {
    templateFormSubUnitInput.value = '';
  }
  if (templateFormDisciplineTypeInput) {
    templateFormDisciplineTypeInput.value = '';
  }
  if (templateFormDeliveryTypeInput) {
    templateFormDeliveryTypeInput.value = '';
  }
  if (templateFormDepartmentInput) {
    templateFormDepartmentInput.value = '';
  }
  if (templateFormNotesInput) {
    templateFormNotesInput.value = '';
  }
  if (templateFormExternalLinkInput) {
    templateFormExternalLinkInput.value = '';
  }
  updateTemplateFormExternalLinkState('');
  setTemplateFormMessage('');
}

function closeProgramModal() {
  programModalMode = 'create';
  programModalProgramId = null;
  resetProgramForm();
  if (programModalArchiveTrigger) {
    programModalArchiveTrigger.classList.add('hidden');
  }
  if (programModalDeleteTrigger) {
    programModalDeleteTrigger.classList.add('hidden');
  }
  closeModal(programModal);
}

function openProgramModal(mode = 'create', programId = null) {
  if (!CAN_MANAGE_PROGRAMS) {
    programMessage.textContent = 'You do not have permission to manage programs.';
    return;
  }
  const normalizedMode = mode === 'edit' ? 'edit' : 'create';
  const isEdit = normalizedMode === 'edit';
  const targetId = isEdit ? programId || getPrimaryProgramId() : null;
  if (isEdit && !targetId) {
    programMessage.textContent = 'Select a program to edit first.';
    return;
  }
  programModalMode = normalizedMode;
  programModalProgramId = isEdit ? targetId : null;
  if (programForm) {
    programForm.reset();
  }
  const isDangerVisible = isEdit && CAN_MANAGE_PROGRAMS;
  if (programModalArchiveTrigger) {
    programModalArchiveTrigger.classList.toggle('hidden', !isDangerVisible);
    programModalArchiveTrigger.disabled = !isDangerVisible;
    if (!isDangerVisible) {
      programModalArchiveTrigger.title = '';
    }
  }
  if (programModalDeleteTrigger) {
    programModalDeleteTrigger.classList.toggle('hidden', !isDangerVisible);
    programModalDeleteTrigger.disabled = !isDangerVisible;
  }
  if (isEdit) {
    const program = getProgramById(targetId);
    if (!program) {
      programMessage.textContent = 'Unable to locate the selected program.';
      return;
    }
    if (programModalTitle) programModalTitle.textContent = 'Edit Program';
    if (programFormSubmit) programFormSubmit.textContent = 'Save Changes';
    if (programFormTitleInput) programFormTitleInput.value = getProgramTitle(program) || '';
    if (programFormWeeksInput) {
      const weeks = getProgramTotalWeeks(program);
      programFormWeeksInput.value = Number.isFinite(weeks) ? String(weeks) : '';
    }
    if (programFormDescriptionInput) {
      programFormDescriptionInput.value = getProgramDescription(program) || '';
    }
    if (programModalArchiveTrigger) {
      const archivedAt = getProgramArchivedAt(program);
      programModalArchiveTrigger.disabled = Boolean(archivedAt);
      programModalArchiveTrigger.title = archivedAt ? 'This program is already archived.' : '';
    }
  } else {
    if (programModalTitle) programModalTitle.textContent = 'New Program';
    if (programFormSubmit) programFormSubmit.textContent = 'Create Program';
  }
  setProgramFormMessage('');
  openModal(programModal);
  if (programFormTitleInput) {
    requestAnimationFrame(() => {
      programFormTitleInput.focus();
      if (isEdit) {
        programFormTitleInput.select?.();
      }
    });
  }
}

function closeTemplateModal() {
  templateModalMode = 'create';
  templateModalTemplateId = null;
  resetTemplateForm();
  if (templateModalDeleteTrigger) {
    templateModalDeleteTrigger.classList.add('hidden');
    if (CAN_MANAGE_TEMPLATES) {
      templateModalDeleteTrigger.disabled = false;
    }
  }
  closeModal(templateModal);
}

function openTemplateModal(mode = 'create', templateId = null) {
  if (!CAN_MANAGE_TEMPLATES) {
    templateMessage.textContent = 'You do not have permission to manage templates.';
    return;
  }
  const normalizedMode = mode === 'edit' ? 'edit' : 'create';
  const isEdit = normalizedMode === 'edit';
  const targetId = isEdit ? templateId || getPrimaryTemplateId() : null;
  if (isEdit && !targetId) {
    templateMessage.textContent = 'Select a template to edit first.';
    return;
  }
  const template = isEdit ? getTemplateById(targetId) : null;
  if (isEdit && !template) {
    templateMessage.textContent = 'Unable to locate the selected template.';
    return;
  }
  templateModalMode = normalizedMode;
  templateModalTemplateId = isEdit ? targetId : null;
  resetTemplateForm();
  const templateStatus = template ? getTemplateStatus(template) : '';
  const isTemplateArchived = (templateStatus || '').toLowerCase() === 'archived';
  const isDeleteVisible = isEdit && CAN_MANAGE_TEMPLATES && !isTemplateArchived && Boolean(selectedProgramId);
  if (templateModalDeleteTrigger) {
    templateModalDeleteTrigger.classList.toggle('hidden', !isDeleteVisible);
    templateModalDeleteTrigger.disabled = !isDeleteVisible;
    templateModalDeleteTrigger.title = isTemplateArchived ? 'Archived templates cannot be deleted.' : '';
  }
  if (isEdit) {
    if (templateModalTitle) templateModalTitle.textContent = 'Edit Template';
    if (templateFormSubmit) templateFormSubmit.textContent = 'Save Changes';
    if (templateFormWeekInput) {
      const weekNumber = getTemplateWeekNumber(template);
      templateFormWeekInput.value = weekNumber !== null && weekNumber !== undefined && weekNumber !== ''
        ? String(weekNumber)
        : '1';
    }
    if (templateFormSortInput) {
      const sortValue = getTemplateSortValue(template, 1);
      templateFormSortInput.value = Number.isFinite(sortValue) ? String(sortValue) : '1';
    }
    if (templateFormLabelInput) {
      templateFormLabelInput.value = getTemplateName(template) || '';
    }
    if (templateFormOrganizationInput) {
      const organization = template?.organization ?? template?.org ?? '';
      ensureSelectValue(templateFormOrganizationInput, organization);
    }
    if (templateFormSubUnitInput) {
      const subUnit = template?.sub_unit ?? template?.subUnit ?? '';
      ensureSelectValue(templateFormSubUnitInput, subUnit);
    }
    if (templateFormDisciplineTypeInput) {
      const disciplineType = template?.discipline_type
        ?? template?.disciplineType
        ?? template?.discipline
        ?? template?.template?.discipline_type
        ?? template?.template?.disciplineType
        ?? template?.template?.discipline
        ?? '';
      ensureSelectValue(templateFormDisciplineTypeInput, disciplineType);
    }
    if (templateFormDeliveryTypeInput) {
      const deliveryType = template?.type_delivery
        ?? template?.typeDelivery
        ?? template?.delivery_type
        ?? template?.deliveryType
        ?? template?.template?.type_delivery
        ?? template?.template?.typeDelivery
        ?? template?.template?.delivery_type
        ?? template?.template?.deliveryType
        ?? '';
      ensureSelectValue(templateFormDeliveryTypeInput, deliveryType);
    }
    if (templateFormDepartmentInput) {
      const department = template?.department
        ?? template?.dept
        ?? template?.template?.department
        ?? template?.template?.dept
        ?? '';
      ensureSelectValue(templateFormDepartmentInput, department);
    }
    if (templateFormNotesInput) {
      const notes = template?.notes ?? '';
      templateFormNotesInput.value = notes;
    }
    if (templateFormExternalLinkInput) {
      const hyperlink = template?.external_link
        ?? template?.externalLink
        ?? template?.hyperlink
        ?? template?.link?.external_link
        ?? template?.link?.hyperlink
        ?? template?.url
        ?? '';
      templateFormExternalLinkInput.value = hyperlink || '';
      updateTemplateFormExternalLinkState(hyperlink || '');
    } else {
      updateTemplateFormExternalLinkState('');
    }
  } else {
    if (templateModalTitle) templateModalTitle.textContent = 'New Template';
    if (templateFormSubmit) templateFormSubmit.textContent = 'Create Template';
    if (templateFormSortInput) {
      const sortValues = globalTemplates.map(item => getTemplateSortValue(item, 0));
      const maxSort = sortValues.length ? Math.max(...sortValues) : 0;
      templateFormSortInput.value = String(maxSort + 1);
    }
    updateTemplateFormExternalLinkState(templateFormExternalLinkInput ? templateFormExternalLinkInput.value : '');
  }
  setTemplateFormMessage('');
  openModal(templateModal);
  if (templateFormWeekInput) {
    requestAnimationFrame(() => {
      templateFormWeekInput.focus();
      if (isEdit) {
        templateFormWeekInput.select?.();
      }
    });
  }
}

async function submitProgramForm(event) {
  event.preventDefault();
  if (!CAN_MANAGE_PROGRAMS) {
    setProgramFormMessage('You do not have permission to manage programs.', true);
    return;
  }
  const isEdit = programModalMode === 'edit';
  const targetId = isEdit ? programModalProgramId : null;
  if (isEdit && !targetId) {
    setProgramFormMessage('Select a program to edit first.', true);
    return;
  }
  const initialSubmitLabel = programFormSubmit ? programFormSubmit.textContent : '';
  if (programFormSubmit) {
    programFormSubmit.disabled = true;
  }
  const title = (programFormTitleInput?.value || '').trim();
  if (!title) {
    setProgramFormMessage('Program title is required.', true);
    if (programFormSubmit) {
      programFormSubmit.disabled = false;
      programFormSubmit.textContent = initialSubmitLabel;
    }
    programFormTitleInput?.focus();
    return;
  }
  const weeksValue = programFormWeeksInput?.value || '';
  let totalWeeks = null;
  if (weeksValue !== '') {
    const parsed = Number(weeksValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setProgramFormMessage('Total weeks must be a positive number.', true);
      if (programFormSubmit) {
        programFormSubmit.disabled = false;
        programFormSubmit.textContent = initialSubmitLabel;
      }
      programFormWeeksInput?.focus();
      return;
    }
    totalWeeks = parsed;
  }
  const descriptionValue = (programFormDescriptionInput?.value || '').trim();
  const payload = {
    title,
    total_weeks: totalWeeks === null ? null : totalWeeks,
    description: descriptionValue ? descriptionValue : null,
  };
  const encodedId = targetId ? encodeURIComponent(targetId) : null;
  const url = isEdit && encodedId ? `${API}/programs/${encodedId}` : `${API}/programs`;
  const method = isEdit ? 'PATCH' : 'POST';
  if (programFormSubmit) {
    programFormSubmit.textContent = isEdit ? 'Saving…' : 'Creating…';
  }
  setProgramFormMessage(isEdit ? 'Saving changes…' : 'Creating program…');
  try {
    const result = await fetchJson(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const makeActive = !isEdit;
    if (result && typeof result === 'object') {
      upsertProgram(result, { makeActive });
    }
    renderPrograms();
    if (makeActive) {
      await loadProgramTemplateAssignments();
    } else if (result && getProgramId(result) === selectedProgramId) {
      await loadProgramTemplateAssignments();
    }
    closeProgramModal();
    programMessage.textContent = isEdit
      ? 'Program updated successfully.'
      : 'Program created successfully.';
  } catch (error) {
    console.error(error);
    if (error.status === 403) {
      setProgramFormMessage('You do not have permission to save programs.', true);
    } else if (error.status === 400) {
      setProgramFormMessage('Please review the form inputs and try again.', true);
    } else {
      setProgramFormMessage('Unable to save the program. Please try again.', true);
    }
  } finally {
    if (programFormSubmit) {
      programFormSubmit.disabled = false;
      programFormSubmit.textContent = initialSubmitLabel || (programModalMode === 'edit' ? 'Save Changes' : 'Create Program');
    }
  }
}

async function submitTemplateForm(event) {
  event.preventDefault();
  if (!CAN_MANAGE_TEMPLATES) {
    setTemplateFormMessage('You do not have permission to manage templates.', true);
    return;
  }
  const isEdit = templateModalMode === 'edit';
  const targetId = isEdit ? templateModalTemplateId : null;
  if (isEdit && !targetId) {
    setTemplateFormMessage('Select a template to edit first.', true);
    return;
  }
  const initialSubmitLabel = templateFormSubmit ? templateFormSubmit.textContent : '';
  if (templateFormSubmit) {
    templateFormSubmit.disabled = true;
  }
  const fallbackSubmitLabel = isEdit ? 'Save Changes' : 'Create Template';
  const weekRawValue = templateFormWeekInput?.value ?? '';
  const weekNumber = Number(weekRawValue);
  if (weekRawValue === '' || !Number.isFinite(weekNumber) || weekNumber <= 0) {
    setTemplateFormMessage('Week number must be a positive number.', true);
    if (templateFormSubmit) {
      templateFormSubmit.disabled = false;
      templateFormSubmit.textContent = initialSubmitLabel || fallbackSubmitLabel;
    }
    templateFormWeekInput?.focus();
    templateFormWeekInput?.select?.();
    return;
  }
  const labelValue = (templateFormLabelInput?.value || '').trim();
  if (!labelValue) {
    setTemplateFormMessage('Label is required.', true);
    if (templateFormSubmit) {
      templateFormSubmit.disabled = false;
      templateFormSubmit.textContent = initialSubmitLabel || fallbackSubmitLabel;
    }
    templateFormLabelInput?.focus();
    return;
  }
  const organizationValue = templateFormOrganizationInput?.value ?? '';
  const subUnitValue = templateFormSubUnitInput?.value ?? '';
  const disciplineTypeValue = templateFormDisciplineTypeInput?.value ?? '';
  const deliveryTypeValue = templateFormDeliveryTypeInput?.value ?? '';
  const departmentValue = templateFormDepartmentInput?.value ?? '';
  const sortRawValue = templateFormSortInput?.value ?? '';
  let sortNumber = null;
  if (sortRawValue !== '') {
    const parsedSort = Number(sortRawValue);
    if (!Number.isFinite(parsedSort) || parsedSort <= 0) {
      setTemplateFormMessage('Sort order must be a positive number.', true);
      if (templateFormSubmit) {
        templateFormSubmit.disabled = false;
        templateFormSubmit.textContent = initialSubmitLabel || fallbackSubmitLabel;
      }
      templateFormSortInput?.focus();
      templateFormSortInput?.select?.();
      return;
    }
    sortNumber = parsedSort;
  }
  const notesRawValue = templateFormNotesInput?.value ?? '';
  const notesValue = notesRawValue.trim();
  const externalLinkRawValue = templateFormExternalLinkInput?.value ?? '';
  const { value: externalLinkValue, isValid: externalLinkIsValid } = updateTemplateFormExternalLinkState(externalLinkRawValue);
  if (!externalLinkIsValid) {
    setTemplateFormMessage('Enter a valid external link URL before saving.', true);
    if (templateFormSubmit) {
      templateFormSubmit.disabled = false;
      templateFormSubmit.textContent = initialSubmitLabel || fallbackSubmitLabel;
    }
    templateFormExternalLinkInput?.focus();
    return;
  }
  if (templateFormExternalLinkInput) {
    templateFormExternalLinkInput.value = externalLinkValue;
  }
  const hasExternalLink = externalLinkValue !== '';
  const payload = {
    week_number: weekNumber,
    label: labelValue,
    notes: notesValue ? notesValue : null,
    sort_order: sortNumber ?? null,
  };
  payload.organization = organizationValue ? organizationValue : null;
  payload.sub_unit = subUnitValue ? subUnitValue : null;
  payload.discipline_type = disciplineTypeValue ? disciplineTypeValue : null;
  payload.type_delivery = deliveryTypeValue ? deliveryTypeValue : null;
  payload.department = departmentValue ? departmentValue : null;
  const externalLinkPayload = hasExternalLink ? externalLinkValue : null;
  payload.external_link = externalLinkPayload;
  payload.hyperlink = externalLinkPayload;
  const encodedTemplateId = targetId ? encodeURIComponent(targetId) : null;
  const url = isEdit && encodedTemplateId
    ? `${TEMPLATE_API}/${encodedTemplateId}`
    : TEMPLATE_API;
  const method = isEdit ? 'PATCH' : 'POST';
  if (templateFormSubmit) {
    templateFormSubmit.textContent = isEdit ? 'Saving…' : 'Creating…';
  }
  setTemplateFormMessage(isEdit ? 'Saving changes…' : 'Creating template…');
  try {
    const result = await fetchJson(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const resultId = result && typeof result === 'object' ? getTemplateId(result) : null;
    closeTemplateModal();
    const idToSelect = resultId || targetId || null;
    if (idToSelect) {
      await loadTemplates({ focusTemplateId: idToSelect, preserveSelection: true });
    } else {
      await loadTemplates({ preserveSelection: true });
    }
    if (selectedProgramId) {
      await loadProgramTemplateAssignments({ preserveSelection: true });
    }
    templateMessage.textContent = isEdit
      ? 'Template updated successfully.'
      : 'Template created successfully.';
  } catch (error) {
    console.error(error);
    if (error.status === 403) {
      setTemplateFormMessage('You do not have permission to save templates.', true);
    } else if (error.status === 400) {
      setTemplateFormMessage('Please review the template details and try again.', true);
    } else {
      setTemplateFormMessage('Unable to save this template. Please try again.', true);
    }
  } finally {
    if (templateFormSubmit) {
      templateFormSubmit.disabled = false;
      templateFormSubmit.textContent = initialSubmitLabel || fallbackSubmitLabel;
    }
  }
}

function openArchiveProgramModal(programId) {
  if (!CAN_MANAGE_PROGRAMS) return;
  const target = getProgramById(programId);
  const title = getProgramTitle(target) || 'this program';
  if (archiveProgramModalDescription) {
    archiveProgramModalDescription.textContent = `Archive “${title}”? Archived programs can be restored later.`;
  }
  setModalMessage(archiveProgramModalMessage, '');
  archiveTargetProgramId = programId;
  openModal(archiveProgramModal);
}

async function archiveProgram(programId) {
  if (!programId) return;
  const encoded = encodeURIComponent(programId);
  let archivedResponse = null;
  try {
    archivedResponse = await fetchJson(`${API}/programs/${encoded}/archive`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    if (error.status === 404 || error.status === 405 || error.status === 501) {
      archivedResponse = await fetchJson(`${API}/programs/${encoded}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } else {
      throw error;
    }
  }
  if (archivedResponse && typeof archivedResponse === 'object' && getProgramId(archivedResponse)) {
    upsertProgram(archivedResponse);
  } else {
    const index = programs.findIndex(program => getProgramId(program) === programId);
    if (index >= 0) {
      const timestamp = new Date().toISOString();
      const existing = programs[index];
      programs[index] = { ...existing, deleted_at: existing?.deleted_at ?? timestamp, deletedAt: existing?.deletedAt ?? timestamp };
    }
  }
  selectedProgramIds.delete(programId);
  renderPrograms();
  if (selectedProgramId === programId) {
    lastLoadedTemplateProgramId = null;
    await loadProgramTemplateAssignments();
  }
}

async function confirmArchiveProgram() {
  if (!CAN_MANAGE_PROGRAMS) return;
  if (!archiveTargetProgramId) return;
  const targetId = archiveTargetProgramId;
  const originalLabel = confirmArchiveProgramButton ? confirmArchiveProgramButton.textContent : '';
  if (confirmArchiveProgramButton) {
    confirmArchiveProgramButton.disabled = true;
    confirmArchiveProgramButton.textContent = 'Archiving…';
  }
  setModalMessage(archiveProgramModalMessage, 'Archiving program…');
  try {
    await archiveProgram(targetId);
    setModalMessage(archiveProgramModalMessage, '');
    closeArchiveProgramModal();
    if (programModal && programModal.classList.contains('is-open')) {
      closeProgramModal();
    }
    programMessage.textContent = 'Program archived successfully.';
  } catch (error) {
    console.error(error);
    if (error.status === 403) {
      setModalMessage(archiveProgramModalMessage, 'You do not have permission to archive this program.', true);
    } else {
      setModalMessage(archiveProgramModalMessage, 'Unable to archive this program. Please try again.', true);
    }
  } finally {
    if (confirmArchiveProgramButton) {
      confirmArchiveProgramButton.disabled = false;
      confirmArchiveProgramButton.textContent = originalLabel || 'Archive Program';
    }
  }
}

function openDeleteProgramModal(programId) {
  if (!CAN_MANAGE_PROGRAMS) return;
  const target = getProgramById(programId);
  const title = getProgramTitle(target) || 'this program';
  if (deleteProgramModalDescription) {
    deleteProgramModalDescription.textContent = `Delete “${title}”? This action cannot be undone.`;
  }
  setModalMessage(deleteProgramModalMessage, '');
  deleteTargetProgramId = programId;
  openModal(deleteProgramModal);
}

async function deleteProgram(programId) {
  if (!programId) return;
  const encoded = encodeURIComponent(programId);
  await fetchJson(`${API}/programs/${encoded}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const wasActive = selectedProgramId === programId;
  removeProgramFromList(programId);
  renderPrograms();
  if (wasActive) {
    lastLoadedTemplateProgramId = null;
    await loadProgramTemplateAssignments();
  }
}

async function confirmDeleteProgram() {
  if (!CAN_MANAGE_PROGRAMS) return;
  if (!deleteTargetProgramId) return;
  const targetId = deleteTargetProgramId;
  const originalLabel = confirmDeleteProgramButton ? confirmDeleteProgramButton.textContent : '';
  if (confirmDeleteProgramButton) {
    confirmDeleteProgramButton.disabled = true;
    confirmDeleteProgramButton.textContent = 'Deleting…';
  }
  setModalMessage(deleteProgramModalMessage, 'Deleting program…');
  try {
    await deleteProgram(targetId);
    setModalMessage(deleteProgramModalMessage, '');
    closeDeleteProgramModal();
    if (programModal && programModal.classList.contains('is-open')) {
      closeProgramModal();
    }
    programMessage.textContent = 'Program deleted successfully.';
  } catch (error) {
    console.error(error);
    if (error.status === 403) {
      setModalMessage(deleteProgramModalMessage, 'You do not have permission to delete this program.', true);
    } else {
      setModalMessage(deleteProgramModalMessage, 'Unable to delete this program. Please try again.', true);
    }
  } finally {
    if (confirmDeleteProgramButton) {
      confirmDeleteProgramButton.disabled = false;
      confirmDeleteProgramButton.textContent = originalLabel || 'Delete Program';
    }
  }
}

function closeArchiveProgramModal() {
  archiveTargetProgramId = null;
  setModalMessage(archiveProgramModalMessage, '');
  closeModal(archiveProgramModal);
}

function closeDeleteProgramModal() {
  deleteTargetProgramId = null;
  setModalMessage(deleteProgramModalMessage, '');
  closeModal(deleteProgramModal);
}

function openDeleteTemplateModal(templateId) {
  if (!CAN_MANAGE_TEMPLATES) return;
  if (!selectedProgramId) {
    templateMessage.textContent = 'Select a program before deleting templates.';
    return;
  }
  const template = getTemplateById(templateId);
  if (!template) {
    templateMessage.textContent = 'Unable to locate the selected template.';
    return;
  }
  deleteTargetTemplateId = templateId;
  const status = getTemplateStatus(template);
  const normalizedStatus = (status || '').toLowerCase();
  const isArchived = normalizedStatus === 'archived';
  if (deleteTemplateModalDescription) {
    const name = getTemplateName(template) || 'this template';
    deleteTemplateModalDescription.textContent = isArchived
      ? `“${name}” has already been archived.`
      : `This will permanently delete “${name}”.`;
  }
  if (confirmDeleteTemplateButton) {
    confirmDeleteTemplateButton.disabled = isArchived;
    confirmDeleteTemplateButton.title = isArchived ? 'Archived templates cannot be deleted.' : '';
    confirmDeleteTemplateButton.setAttribute('aria-disabled', isArchived ? 'true' : 'false');
  }
  if (isArchived) {
    setModalMessage(deleteTemplateModalMessage, 'This template has already been archived and cannot be deleted again.');
  } else {
    setModalMessage(deleteTemplateModalMessage, '');
  }
  openModal(deleteTemplateModal);
}

function closeDeleteTemplateModal() {
  deleteTargetTemplateId = null;
  if (deleteTemplateModalDescription) {
    deleteTemplateModalDescription.textContent = 'This action cannot be undone.';
  }
  setModalMessage(deleteTemplateModalMessage, '');
  if (confirmDeleteTemplateButton) {
    confirmDeleteTemplateButton.disabled = false;
    confirmDeleteTemplateButton.title = '';
    confirmDeleteTemplateButton.setAttribute('aria-disabled', 'false');
  }
  closeModal(deleteTemplateModal);
}

async function confirmDeleteTemplate() {
  if (!CAN_MANAGE_TEMPLATES) return;
  if (!selectedProgramId) {
    templateMessage.textContent = 'Select a program before deleting templates.';
    return;
  }
  if (!deleteTargetTemplateId) return;
  const targetId = deleteTargetTemplateId;
  const template = getTemplateById(targetId);
  const templateStatus = template ? getTemplateStatus(template) : '';
  const isArchived = (templateStatus || '').toLowerCase() === 'archived';
  if (isArchived) {
    setModalMessage(deleteTemplateModalMessage, 'This template has already been archived and cannot be deleted again.');
    return;
  }
  await flushPendingTemplateAssociationChanges();
  const originalLabel = confirmDeleteTemplateButton ? confirmDeleteTemplateButton.textContent : '';
  if (confirmDeleteTemplateButton) {
    confirmDeleteTemplateButton.disabled = true;
    confirmDeleteTemplateButton.textContent = 'Deleting…';
    confirmDeleteTemplateButton.setAttribute('aria-disabled', 'true');
  }
  setModalMessage(deleteTemplateModalMessage, 'Deleting template…');
  let deleteWasNoOp = false;
  try {
    try {
      await fetchJson(`${API}/programs/${encodeURIComponent(selectedProgramId)}/templates/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch (error) {
      if (error.status === 404) {
        deleteWasNoOp = true;
      } else {
        throw error;
      }
    }
    selectedTemplateIds.delete(targetId);
    if (selectedTemplateId === targetId) {
      selectedTemplateId = null;
    }
    setModalMessage(deleteTemplateModalMessage, '');
    closeDeleteTemplateModal();
    if (templateModal && templateModal.classList.contains('is-open')) {
      closeTemplateModal();
    }
    await loadProgramTemplateAssignments({ preserveSelection: true });
    templateMessage.textContent = deleteWasNoOp
      ? 'Template was already removed.'
      : 'Template deleted successfully.';
  } catch (error) {
    console.error(error);
    if (error.status === 403) {
      setModalMessage(deleteTemplateModalMessage, 'You do not have permission to delete this template.', true);
    } else {
      setModalMessage(deleteTemplateModalMessage, 'Unable to delete this template. Please try again.', true);
    }
  } finally {
    if (confirmDeleteTemplateButton) {
      confirmDeleteTemplateButton.disabled = false;
      confirmDeleteTemplateButton.textContent = originalLabel || 'Delete Template';
      confirmDeleteTemplateButton.setAttribute('aria-disabled', 'false');
    }
  }
}

function updateProgramActionsState(displayedPrograms) {
  const hasSelection = selectedProgramIds.size > 0;
  programActionsContainer.querySelectorAll('button[data-program-action]').forEach(btn => {
    const action = btn.dataset.programAction;
    if (!CAN_MANAGE_PROGRAMS) {
      btn.disabled = true;
      btn.title = 'Only admins or managers can perform this action.';
      return;
    }
    if (ADMIN_ONLY_PROGRAM_ACTIONS.has(action) && !IS_ADMIN) {
      const actionLabel = action ? `${action.charAt(0).toUpperCase()}${action.slice(1)}` : 'perform this';
      btn.disabled = true;
      btn.title = `Only admins can ${actionLabel.toLowerCase()} programs.`;
      return;
    }
    btn.disabled = !hasSelection;
    btn.title = hasSelection ? '' : 'Select at least one program.';
  });
  if (programSelectAll) {
    const selectableIds = displayedPrograms.map(getProgramId).filter(Boolean);
    const countDisplayed = selectableIds.length;
    const allSelected = countDisplayed > 0 && selectableIds.every(id => selectedProgramIds.has(id));
    const someSelected = selectableIds.some(id => selectedProgramIds.has(id));
    programSelectAll.disabled = !CAN_MANAGE_PROGRAMS || countDisplayed === 0;
    programSelectAll.checked = allSelected;
    programSelectAll.indeterminate = !allSelected && someSelected;
  }
  updateProgramEditorButtons(displayedPrograms);
}

function updateTemplateActionsState(displayedTemplates) {
  const hasSelection = selectedTemplateIds.size > 0;
  templateActionsContainer.querySelectorAll('button[data-template-action]').forEach(btn => {
    if (!CAN_MANAGE_TEMPLATES) {
      btn.disabled = true;
      btn.title = 'Only admins or managers can perform this action.';
      return;
    }
    btn.disabled = !hasSelection;
    btn.title = hasSelection ? '' : 'Select at least one template.';
  });
  if (templateSelectAll) {
    const selectableIds = displayedTemplates.map(getTemplateId).filter(Boolean);
    const countDisplayed = selectableIds.length;
    const allSelected = countDisplayed > 0 && selectableIds.every(id => selectedTemplateIds.has(id));
    const someSelected = selectableIds.some(id => selectedTemplateIds.has(id));
    templateSelectAll.disabled = !CAN_MANAGE_TEMPLATES || countDisplayed === 0;
    templateSelectAll.checked = allSelected;
    templateSelectAll.indeterminate = !allSelected && someSelected;
  }
  updateTemplateEditorButtons(displayedTemplates);
}

function updateProgramSelectionSummary() {
  if (!CAN_MANAGE_PROGRAMS) {
    programSelectionSummary.textContent = 'Read-only mode — program actions are disabled for your role.';
    return;
  }
  const count = selectedProgramIds.size;
  programSelectionSummary.textContent = count
    ? `${count} program${count > 1 ? 's' : ''} selected.`
    : 'No programs selected.';
}

function updateTemplateSelectionSummary() {
  if (!CAN_MANAGE_TEMPLATES) {
    templateSelectionSummary.textContent = 'Read-only mode — template actions are disabled for your role.';
    return;
  }
  const count = selectedTemplateIds.size;
  templateSelectionSummary.textContent = count
    ? `${count} template${count > 1 ? 's' : ''} selected.`
    : 'No templates selected.';
}

function updateProgramSortIndicators() {
  if (!programHeaderCells.length) return;
  programHeaderCells.forEach(cell => {
    const key = cell.dataset.key;
    const isActive = Boolean(programSortKey) && key === programSortKey;
    const indicator = cell.querySelector('[data-sort-indicator]');
    if (indicator) {
      indicator.dataset.state = isActive ? 'active' : 'inactive';
      if (isActive) {
        indicator.dataset.direction = programSortDirection === 'desc' ? 'desc' : 'asc';
      } else {
        delete indicator.dataset.direction;
      }
    }
    cell.setAttribute('aria-sort', isActive
      ? (programSortDirection === 'desc' ? 'descending' : 'ascending')
      : 'none');
  });
}

function updateTemplateSortIndicators() {
  if (!templateHeaderCells.length) return;
  templateHeaderCells.forEach(cell => {
    const key = cell.dataset.key;
    const isActive = Boolean(templateSortKey) && key === templateSortKey;
    const indicator = cell.querySelector('[data-sort-indicator]');
    if (indicator) {
      indicator.dataset.state = isActive ? 'active' : 'inactive';
      if (isActive) {
        indicator.dataset.direction = templateSortDirection === 'desc' ? 'desc' : 'asc';
      } else {
        delete indicator.dataset.direction;
      }
    }
    cell.setAttribute('aria-sort', isActive
      ? (templateSortDirection === 'desc' ? 'descending' : 'ascending')
      : 'none');
  });
}

function updateProgramPager(pagination) {
  if (!programPager) return;
  const totalPages = pagination?.totalPages ?? 0;
  const currentPage = pagination?.currentPage ?? 1;
  const displayCurrent = totalPages > 0 ? currentPage : 0;
  const label = totalPages > 0
    ? `Page ${displayCurrent} of ${totalPages}`
    : 'Page 0 of 0';
  if (programPagerLabel) {
    programPagerLabel.textContent = label;
  }
  const disablePrev = totalPages <= 1 || displayCurrent <= 1;
  const disableNext = totalPages === 0 || displayCurrent >= totalPages;
  if (programPagerPrev) {
    programPagerPrev.disabled = disablePrev;
    programPagerPrev.setAttribute('aria-disabled', disablePrev ? 'true' : 'false');
  }
  if (programPagerNext) {
    programPagerNext.disabled = disableNext;
    programPagerNext.setAttribute('aria-disabled', disableNext ? 'true' : 'false');
  }
  programPager.setAttribute('data-total-items', String(pagination?.totalItems ?? 0));
}

function updateTemplatePager(pagination) {
  if (!templatePager) return;
  const totalPages = pagination?.totalPages ?? 0;
  const currentPage = pagination?.currentPage ?? 1;
  const displayCurrent = totalPages > 0 ? currentPage : 0;
  const label = totalPages > 0
    ? `Page ${displayCurrent} of ${totalPages}`
    : 'Page 0 of 0';
  if (templatePagerLabel) {
    templatePagerLabel.textContent = label;
  }
  const disablePrev = totalPages <= 1 || displayCurrent <= 1;
  const disableNext = totalPages === 0 || displayCurrent >= totalPages;
  if (templatePagerPrev) {
    templatePagerPrev.disabled = disablePrev;
    templatePagerPrev.setAttribute('aria-disabled', disablePrev ? 'true' : 'false');
  }
  if (templatePagerNext) {
    templatePagerNext.disabled = disableNext;
    templatePagerNext.setAttribute('aria-disabled', disableNext ? 'true' : 'false');
  }
  templatePager.setAttribute('data-total-items', String(pagination?.totalItems ?? 0));
}

function renderPrograms() {
  const previousActiveProgramId = selectedProgramId;
  syncProgramSelection();
  updateProgramSortIndicators();
  const filtered = getFilteredPrograms();
  const sorted = getSortedPrograms(filtered);
  const pagination = paginate(sorted, programCurrentPage, programPageSize);
  programCurrentPage = pagination.currentPage;
  currentProgramPageItems = pagination.items;
  lastProgramPagination = {
    totalItems: pagination.totalItems,
    totalPages: pagination.totalPages,
    currentPage: pagination.currentPage,
    pageSize: pagination.pageSize,
    isAll: pagination.isAll,
  };
  const displayed = currentProgramPageItems;
  if (!displayed.length) {
    programTableBody.innerHTML = '<tr class="empty-row"><td colspan="7">No programs found.</td></tr>';
  } else {
    programTableBody.innerHTML = displayed.map(program => {
      const programId = getProgramId(program);
      const disabledAttr = CAN_MANAGE_PROGRAMS ? '' : 'disabled';
      const checkedAttr = programId && selectedProgramIds.has(programId) ? 'checked' : '';
      const archivedAt = getProgramArchivedAt(program);
      const rowAttrs = [
        `data-program-id="${programId ?? ''}"`,
        `data-archived="${archivedAt ? 'true' : 'false'}"`,
      ];
      if (programId && selectedProgramId === programId) {
        rowAttrs.push('data-active-program="true"');
      }
      const title = getProgramTitle(program) || '—';
      const lifecycle = getProgramLifecycle(program);
      const totalWeeks = getProgramTotalWeeks(program);
      const createdAt = getProgramCreatedAt(program);
      const description = getProgramDescription(program) || '—';
      return `
        <tr ${rowAttrs.join(' ')}>
          <td><input type="checkbox" data-program-id="${programId ?? ''}" ${checkedAttr} ${disabledAttr} class="rounded border-slate-300"></td>
          <td class="font-medium">${title}</td>
          <td>${createStatusBadge(lifecycle)}</td>
          <td>${Number.isFinite(totalWeeks) ? totalWeeks : '—'}</td>
          <td>${description}</td>
          <td>${formatDate(createdAt)}</td>
          <td class="text-right">${formatDate(archivedAt)}</td>
        </tr>
      `;
    }).join('');
  }
  updateProgramSelectionSummary();
  updateProgramActionsState(displayed);
  updateActiveProgramIndicators();
  updateProgramPager(pagination);
  if (selectedProgramId !== previousActiveProgramId) {
    renderTemplateAssignmentsPanel();
  }
}

function updateActiveProgramIndicators() {
  if (!programTableBody) return;
  const rows = programTableBody.querySelectorAll('tr[data-program-id]');
  rows.forEach(row => {
    const rowId = row.getAttribute('data-program-id');
    if (rowId && rowId === selectedProgramId) {
      row.setAttribute('data-active-program', 'true');
    } else {
      row.removeAttribute('data-active-program');
    }
  });
}

function renderTemplates() {
  syncTemplateSelection();
  updateTemplateSortIndicators();
  const filtered = getFilteredTemplates();
  const sorted = getSortedTemplates(filtered);
  const pagination = paginate(sorted, templateCurrentPage, templatePageSize);
  templateCurrentPage = pagination.currentPage;
  currentTemplatePageItems = pagination.items;
  lastTemplatePagination = {
    totalItems: pagination.totalItems,
    totalPages: pagination.totalPages,
    currentPage: pagination.currentPage,
    pageSize: pagination.pageSize,
    isAll: pagination.isAll,
  };
  const displayed = currentTemplatePageItems;
  if (!displayed.length) {
    templateTableBody.innerHTML = '<tr class="empty-row"><td colspan="7">No templates found.</td></tr>';
  } else {
    templateTableBody.innerHTML = displayed.map(template => {
      const templateId = getTemplateId(template);
      const disabledAttr = CAN_MANAGE_TEMPLATES ? '' : 'disabled';
      const checkedAttr = templateId && selectedTemplateIds.has(templateId) ? 'checked' : '';
      const name = getTemplateName(template) || '—';
      const status = getTemplateStatus(template);
      const isArchived = normalizeTemplateStatusValue(status) === 'archived';
      const updatedAt = getTemplateUpdatedAt(template);
      const weekNumber = getTemplateWeekNumber(template);
      ensureTemplateAudit(template);
      const auditDisplay = getTemplateAuditDisplay(template) || '—';
      const auditSortValue = getTemplateAuditSortValue(template);
      const auditSortAttr = auditSortValue !== null ? ` data-sort-value="${auditSortValue}"` : '';
      let actionHtml = '';
      if (isArchived && templateId) {
        const restoreAttrs = [];
        if (!CAN_MANAGE_TEMPLATES) {
          restoreAttrs.push('disabled');
          restoreAttrs.push('title="Only admins or managers can restore templates."');
        }
        const datasetName = escapeHtml(name);
        restoreAttrs.push('data-template-restore="true"');
        restoreAttrs.push(`data-template-id="${templateId}"`);
        restoreAttrs.push(`data-template-name="${datasetName}"`);
        actionHtml = `<button type="button" class="btn btn-outline text-xs" ${restoreAttrs.join(' ')}>Restore</button>`;
      }
      return `
        <tr data-template-id="${templateId ?? ''}">
          <td><input type="checkbox" data-template-id="${templateId ?? ''}" ${checkedAttr} ${disabledAttr} class="rounded border-slate-300"></td>
          <td>${weekNumber ?? '—'}</td>
          <td class="font-medium">${name}</td>
          <td${auditSortAttr}>${escapeHtml(auditDisplay)}</td>
          <td>${createStatusBadge(status)}</td>
          <td>${formatDate(updatedAt)}</td>
          <td class="text-right">${actionHtml}</td>
        </tr>
      `;
    }).join('');
  }
  updateTemplateSelectionSummary();
  updateTemplateActionsState(displayed);
  updateTemplatePager(pagination);
  renderTemplateAssignmentsPanel();
}

function renderTemplateAssignmentsPanel() {
  if (!programTemplatePanel) return;
  updatePanelAddButtonState();
  const hasErrorMessage = programTemplatePanelMessage?.classList?.contains('text-red-600');
  if (!selectedProgramId) {
    programTemplatePanel.classList.add('hidden');
    if (programTemplatePanelDescription) {
      programTemplatePanelDescription.textContent = 'Select a program to manage template assignments.';
    }
    if (programTemplatePanelList) {
      programTemplatePanelList.innerHTML = '';
    }
    if (programTemplatePanelEmpty) {
      programTemplatePanelEmpty.classList.add('hidden');
    }
    if (!hasErrorMessage) {
      setTemplatePanelMessage('');
    }
    return;
  }

  programTemplatePanel.classList.remove('hidden');
  const program = getProgramById(selectedProgramId);
  const programTitle = getProgramTitle(program) || 'this program';
  if (programTemplatePanelTitle) {
    programTemplatePanelTitle.textContent = `Templates for ${programTitle}`;
  }
  if (programTemplatePanelDescription) {
    programTemplatePanelDescription.textContent = 'Update the hyperlink and notes for each assignment.';
  }

  const ordered = templates.slice().sort((a, b) => getTemplateSortValue(a) - getTemplateSortValue(b));
  if (programTemplateList) {
    if (!ordered.length) {
      programTemplateList.innerHTML = '';
    } else {
      const total = ordered.length;
      programTemplateList.innerHTML = ordered.map((template, index) => createTemplateAssignmentListItem(template, index, total)).join('');
    }
  }

  if (programTemplatePanelEmpty) {
    programTemplatePanelEmpty.classList.toggle('hidden', Boolean(ordered.length));
  }

  if (!ordered.length) {
    if (!hasErrorMessage) {
      if (CAN_MANAGE_TEMPLATES) {
        setTemplatePanelMessage('Use the search above to attach templates to this program.');
      } else {
        ensurePanelReadOnlyHint();
      }
    }
  } else if (!hasErrorMessage && !programTemplatePanelMessage?.textContent?.trim()) {
    if (CAN_MANAGE_TEMPLATES) {
      setTemplatePanelMessage('');
    } else {
      ensurePanelReadOnlyHint();
    }
  }
}

function createTemplateAssignmentListItem(template, index, total) {
  const templateId = getTemplateId(template) || '';
  const name = escapeHtml(getTemplateName(template) || 'Untitled template');
  const weekNumber = getTemplateWeekNumber(template);
  const status = getTemplateStatus(template);
  const normalizedStatus = (status || '').toLowerCase();
  const isArchived = normalizedStatus === 'archived';
  const notesValue = template?.notes ?? '';
  const hyperlinkValue = template?.hyperlink ?? '';
  const disableControls = !CAN_MANAGE_TEMPLATES;
  const disableUp = disableControls || index === 0;
  const disableDown = disableControls || index === total - 1;
  const disableRemove = disableControls;
  const removeButtonTitle = disableRemove
    ? 'Only admins or managers can remove templates.'
    : 'Remove template';
  const statusBadgeHtml = status ? createStatusBadge(status) : '';
  const createdAtRaw = template?.created_at
    ?? template?.createdAt
    ?? template?.link?.created_at
    ?? template?.link?.createdAt
    ?? template?.template?.created_at
    ?? template?.template?.createdAt
    ?? null;
  const createdAtText = escapeHtml(formatDate(createdAtRaw));
  const createdByRaw = template?.created_by
    ?? template?.createdBy
    ?? template?.created_by_name
    ?? template?.createdByName
    ?? template?.creator
    ?? template?.link?.created_by
    ?? template?.link?.createdBy
    ?? template?.link?.created_by_name
    ?? template?.link?.createdByName
    ?? template?.template?.created_by
    ?? template?.template?.createdBy
    ?? template?.template?.created_by_name
    ?? template?.template?.createdByName
    ?? null;
  const createdByText = (() => {
    if (createdByRaw === null || createdByRaw === undefined) return '—';
    if (typeof createdByRaw === 'string') return createdByRaw;
    if (typeof createdByRaw === 'object') {
      const name = createdByRaw.name
        ?? createdByRaw.full_name
        ?? createdByRaw.fullName
        ?? createdByRaw.displayName
        ?? createdByRaw.email
        ?? null;
      if (name !== null && name !== undefined && name !== '') {
        return String(name);
      }
    }
    return String(createdByRaw);
  })();
  const createdByEscaped = escapeHtml(createdByText || '—');
  const metaHtml = `
    <div class="space-y-1 text-xs text-slate-500">
      ${statusBadgeHtml ? `<div>${statusBadgeHtml}</div>` : ''}
      <p>Created ${createdAtText} by ${createdByEscaped}</p>
    </div>
  `;
  const nameLineHtml = (() => {
    if (weekNumber !== null && weekNumber !== undefined && weekNumber !== '') {
      const weekLabel = escapeHtml(String(weekNumber));
      return `
        <div class="flex items-center gap-2 min-w-0">
          <span class="badge bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200" aria-label="Week ${weekLabel}">
            <span aria-hidden="true">Week ${weekLabel}</span>
          </span>
          <p class="font-medium truncate min-w-0 flex-1" title="${name}">${name}</p>
        </div>
      `;
    }
    return `<p class="font-medium truncate" title="${name}">${name}</p>`;
  })();
  const notesEscaped = escapeHtml(notesValue);
  const isActive = selectedTemplateId && templateId && selectedTemplateId === templateId;
  const itemClasses = ['rounded-xl', 'border', 'border-slate-200', 'bg-white', 'p-4', 'space-y-4'];
  if (isActive) {
    itemClasses.push('ring-2', 'ring-sky-200');
  }
  const dragHandleClasses = disableControls
    ? 'inline-flex h-7 w-7 items-center justify-center rounded text-slate-300 select-none'
    : 'inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-400 select-none cursor-move';
  const dragHandleHtml = `<span class="${dragHandleClasses}" data-assignment-handle title="Drag to reorder" aria-hidden="true">☰</span>`;

  return `
    <li class="${itemClasses.join(' ')}" data-template-id="${templateId}" data-order-index="${index}">
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-1 min-w-0">
          ${nameLineHtml}
          ${metaHtml}
        </div>
        <div class="flex items-center gap-1">
          ${dragHandleHtml}
          <button type="button" class="btn btn-outline text-xs" data-assignment-action="move-up" ${disableUp ? 'disabled' : ''} aria-label="Move template up" title="Move up">↑</button>
          <button type="button" class="btn btn-outline text-xs" data-assignment-action="move-down" ${disableDown ? 'disabled' : ''} aria-label="Move template down" title="Move down">↓</button>
          <button type="button" class="btn btn-danger-outline text-xs" data-assignment-action="remove" ${disableRemove ? 'disabled' : ''} aria-label="Remove template from program" title="${removeButtonTitle}">Remove</button>
        </div>
      </div>
      <label class="space-y-1 block">
        <span class="label-text">Hyperlink</span>
        <input type="url" class="input" data-association-field="hyperlink" placeholder="https://example.com" value="${escapeHtml(hyperlinkValue)}" ${disableControls ? 'disabled' : ''}>
      </label>
      <label class="space-y-1 block">
        <span class="label-text">Notes</span>
        <textarea class="textarea" data-association-field="notes" rows="3" ${disableControls ? 'disabled' : ''}>${notesEscaped}</textarea>
      </label>
    </li>
  `;
}

async function handleAssociationFieldChange(templateId, field, element) {
  if (!CAN_MANAGE_TEMPLATES) {
    ensurePanelReadOnlyHint();
    return;
  }
  if (!selectedProgramId) {
    setTemplatePanelMessage('Select a program before editing template assignments.', true);
    return;
  }
  if (field !== 'notes' && field !== 'hyperlink') {
    return;
  }
  const template = getTemplateById(templateId);
  if (!template) return;

  const previousValue = field === 'notes'
    ? (template?.notes ?? '')
    : (template?.hyperlink ?? '');

  let nextValue;
  if (field === 'notes') {
    const raw = element.value;
    nextValue = raw && raw.trim() !== '' ? raw : '';
  } else {
    const raw = element.value.trim();
    if (raw === '') {
      nextValue = null;
    } else {
      let parsed;
      try {
        parsed = new URL(raw);
      } catch (error) {
        setTemplatePanelMessage('Enter a valid hyperlink URL (including http:// or https://).', true);
        element.value = previousValue || '';
        return;
      }
      if (!parsed?.protocol || !/^https?:$/i.test(parsed.protocol)) {
        setTemplatePanelMessage('Enter a valid hyperlink URL (including http:// or https://).', true);
        element.value = previousValue || '';
        return;
      }
      nextValue = raw;
    }
  }

  const previousComparable = previousValue || '';
  const nextComparable = (nextValue || '');
  if (previousComparable === nextComparable) {
    return;
  }

  if (field === 'notes') {
    template.notes = nextValue || '';
  } else {
    template.hyperlink = nextValue === null ? '' : String(nextValue);
  }

  const updates = { [field]: nextValue };

  const revert = () => {
    if (field === 'notes') {
      template.notes = previousValue ?? '';
      element.value = previousValue ?? '';
    } else {
      template.hyperlink = previousValue || '';
      element.value = previousValue || '';
    }
  };

  await persistTemplateAssociationUpdates(templateId, updates, { revert });
}

async function persistTemplateAssociationUpdates(templateId, updates, { revert, reload = true, savingMessage = 'Saving changes…', successMessage = 'Changes saved.' } = {}) {
  if (!CAN_MANAGE_TEMPLATES) {
    ensurePanelReadOnlyHint();
    return false;
  }
  if (!selectedProgramId) {
    setTemplatePanelMessage('Select a program before editing template assignments.', true);
    if (typeof revert === 'function') revert();
    return false;
  }
  if (!updates || typeof updates !== 'object') {
    return true;
  }
  const payload = buildAssociationUpdatePayload(updates);
  if (!Object.keys(payload).length) {
    return true;
  }
  const programId = selectedProgramId;
  if (pendingMetadataState.programId && pendingMetadataState.programId !== programId && pendingMetadataState.updates.size) {
    await flushPendingMetadataUpdates({ immediate: true });
  }
  pendingMetadataState.programId = programId;
  pendingMetadataState.savingMessage = savingMessage;
  pendingMetadataState.successMessage = successMessage;
  pendingMetadataState.reload = pendingMetadataState.reload || reload;
  const existing = pendingMetadataState.updates.get(templateId) || { payload: {}, revert: null };
  existing.payload = { ...existing.payload, ...payload };
  if (typeof revert === 'function' && !existing.revert) {
    existing.revert = revert;
  }
  pendingMetadataState.updates.set(templateId, existing);
  if (selectedProgramId === programId) {
    setTemplatePanelMessage(savingMessage);
  }
  scheduleMetadataSave();
  return true;
}

function moveTemplateAssociation(templateId, direction) {
  if (!CAN_MANAGE_TEMPLATES) {
    ensurePanelReadOnlyHint();
    return;
  }
  const index = templates.findIndex(item => getTemplateId(item) === templateId);
  if (index < 0) return;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= templates.length) return;
  const previousOrder = templates.map(template => {
    const linkId = getTemplateLinkId(template);
    return linkId !== null ? linkId : getTemplateId(template);
  });
  const [moved] = templates.splice(index, 1);
  templates.splice(targetIndex, 0, moved);
  templates.forEach((template, idx) => {
    template.sort_order = idx + 1;
    template.sortOrder = idx + 1;
  });
  renderTemplates();
  queueTemplateOrderSave(previousOrder);
}

async function loadPrograms() {
  try {
    programMessage.textContent = 'Loading programs…';
    const data = await fetchJson(`${API}/programs?include_deleted=true`);
    if (Array.isArray(data?.data)) {
      programs = data.data;
    } else if (Array.isArray(data)) {
      programs = data;
    } else {
      programs = [];
    }
    const validIds = programs.map(getProgramId).filter(Boolean);
    if (selectedProgramId && !validIds.includes(selectedProgramId)) {
      selectedProgramId = null;
    }
    if (!selectedProgramId && validIds.length) {
      selectedProgramId = validIds[0];
    }
    selectedProgramIds.clear();
    programCurrentPage = 1;
    renderPrograms();
    programMessage.textContent = '';
  } catch (error) {
    console.error(error);
    programs = [];
    selectedProgramIds.clear();
    selectedProgramId = null;
    lastLoadedTemplateProgramId = null;
    programCurrentPage = 1;
    renderPrograms();
    if (error.status === 403) {
      programMessage.textContent = 'You do not have permission to load programs.';
    } else {
      programMessage.textContent = 'Unable to load programs. Please try again later.';
    }
  }
}

async function loadTemplates(options = {}) {
  const {
    focusTemplateId = null,
    preserveSelection = false,
    query = null,
    status = null,
  } = options;

  try {
    templateMessage.textContent = 'Loading templates…';
    const params = new URLSearchParams();
    if (query) {
      params.set('q', query);
    }
    if (status) {
      params.set('status', status);
    }
    params.set('include_deleted', 'true');
    const search = params.toString();
    const url = search ? `${TEMPLATE_API}?${search}` : TEMPLATE_API;
    const data = await fetchJson(url);
    let fetched = [];
    if (Array.isArray(data?.data)) {
      fetched = data.data;
    } else if (Array.isArray(data?.results)) {
      fetched = data.results;
    } else if (Array.isArray(data?.items)) {
      fetched = data.items;
    } else if (Array.isArray(data)) {
      fetched = data;
    } else if (Array.isArray(data?.templates)) {
      fetched = data.templates;
    }
    globalTemplates = Array.isArray(fetched) ? fetched : [];
    if (typeof hydrateTemplatesWithAudit === 'function') {
      hydrateTemplatesWithAudit(globalTemplates);
    }

    if (preserveSelection) {
      const validIds = new Set(globalTemplates.map(getTemplateId).filter(Boolean));
      for (const id of Array.from(selectedTemplateIds)) {
        if (!validIds.has(id)) {
          selectedTemplateIds.delete(id);
        }
      }
      if (selectedTemplateId && !validIds.has(selectedTemplateId)) {
        selectedTemplateId = null;
      }
    } else {
      selectedTemplateIds.clear();
      selectedTemplateId = null;
    }

    if (focusTemplateId) {
      const exists = globalTemplates.some(template => getTemplateId(template) === focusTemplateId);
      if (exists) {
        selectedTemplateIds.clear();
        selectedTemplateIds.add(focusTemplateId);
        selectedTemplateId = focusTemplateId;
      }
    }

    templateCurrentPage = 1;
    renderTemplates();
    templateMessage.textContent = '';
  } catch (error) {
    console.error(error);
    globalTemplates = [];
    if (!preserveSelection) {
      selectedTemplateIds.clear();
      selectedTemplateId = null;
    }
    templateCurrentPage = 1;
    renderTemplates();
    if (error.status === 403) {
      templateMessage.textContent = 'You do not have permission to load templates.';
    } else {
      templateMessage.textContent = 'Unable to load templates. Please try again later.';
    }
  }
}

function extractAssignmentsFromResponse(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  if (Array.isArray(payload.assignments)) {
    return payload.assignments;
  }
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  if (Array.isArray(payload.results)) {
    return payload.results;
  }
  const nestedData = payload.data;
  if (nestedData && typeof nestedData === 'object') {
    const nested = extractAssignmentsFromResponse(nestedData);
    if (nested.length) {
      return nested;
    }
  }
  const nestedTemplates = payload.templates;
  if (nestedTemplates && typeof nestedTemplates === 'object' && !Array.isArray(nestedTemplates)) {
    const nested = extractAssignmentsFromResponse(nestedTemplates);
    if (nested.length) {
      return nested;
    }
  }
  if (Array.isArray(payload.templates)
    && !Array.isArray(payload.available_templates)
    && !Array.isArray(payload.availableTemplates)) {
    return payload.templates;
  }
  if (Array.isArray(payload.records)) {
    return payload.records;
  }
  if (Array.isArray(payload.rows)) {
    return payload.rows;
  }
  return [];
}

function extractTemplateLibraryFromResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const directKeys = ['available_templates', 'availableTemplates', 'available', 'library'];
  for (const key of directKeys) {
    if (!(key in payload)) continue;
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === 'object') {
      const nested = extractTemplateLibraryFromResponse(value);
      if (nested.length) {
        return nested;
      }
    }
  }
  if (Array.isArray(payload.templates)) {
    if (Array.isArray(payload.assignments)
      || Array.isArray(payload.items)
      || Array.isArray(payload.results)) {
      return payload.templates;
    }
  }
  const nestedTemplates = payload.templates;
  if (nestedTemplates && typeof nestedTemplates === 'object' && !Array.isArray(nestedTemplates)) {
    const nested = extractTemplateLibraryFromResponse(nestedTemplates);
    if (nested.length) {
      return nested;
    }
  }
  const nestedData = payload.data;
  if (nestedData && typeof nestedData === 'object') {
    const nested = extractTemplateLibraryFromResponse(nestedData);
    if (nested.length) {
      return nested;
    }
  }
  return [];
}

async function loadProgramTemplateAssignments(options = {}) {
  const {
    focusTemplateId = null,
    preserveSelection = false,
    skipAttachWaitFor = null,
  } = options;
  if (attachInFlightPromise && attachInFlightPromise !== skipAttachWaitFor) {
    try {
      await attachInFlightPromise;
    } catch (error) {
      console.error(error);
    }
  }
  const activeProgramId = selectedProgramId;
  if (!activeProgramId) {
    templates = [];
    templateLibrary = [];
    templateLibraryIndex.clear();
    selectedTemplateIds.clear();
    selectedTemplateId = null;
    lastLoadedTemplateProgramId = null;
    destroyTagifyInstance();
    renderTemplates();
    setTemplatePanelMessage('');
    updatePanelAddButtonState();
    return;
  }
  try {
    if (!preserveSelection || activeProgramId !== lastLoadedTemplateProgramId) {
      if (activeProgramId !== lastLoadedTemplateProgramId) {
        selectedTemplateIds.clear();
        selectedTemplateId = null;
      }
    }
    const encodedProgramId = encodeURIComponent(activeProgramId);
    const data = await fetchJson(`${API}/programs/${encodedProgramId}/templates?include_deleted=true`);
    const fetchedTemplates = extractAssignmentsFromResponse(data);
    const assignedTemplateIds = new Set(fetchedTemplates.map(getTemplateId).filter(Boolean));
    let fetchedLibrary = Array.isArray(data) ? [] : extractTemplateLibraryFromResponse(data);
    if (fetchedLibrary === fetchedTemplates) {
      fetchedLibrary = Array.isArray(fetchedLibrary) ? [...fetchedLibrary] : [];
    }
    let resolvedLibrary = Array.isArray(fetchedLibrary) ? fetchedLibrary : [];
    const filterAvailableTemplates = template => {
      const id = getTemplateId(template);
      if (!id || assignedTemplateIds.has(id)) {
        return false;
      }
      return isPublishedTemplate(template);
    };
    let availableTemplates = resolvedLibrary.filter(filterAvailableTemplates);
    if (!availableTemplates.length) {
      const fallbackTemplates = Array.isArray(globalTemplates) && globalTemplates.length
        ? globalTemplates.filter(filterAvailableTemplates)
        : [];
      if (fallbackTemplates.length) {
        availableTemplates = fallbackTemplates;
      }
    }
    templateLibrary = availableTemplates;
    if (typeof hydrateTemplatesWithAudit === 'function') {
      hydrateTemplatesWithAudit(templateLibrary);
    }
    templateLibraryIndex.clear();
    templateLibrary.forEach(template => {
      const id = getTemplateId(template);
      if (id) {
        templateLibraryIndex.set(id, template);
      }
    });
    if (typeof hydrateTemplateLibraryIndex === 'function') {
      hydrateTemplateLibraryIndex();
    }
    const normalized = fetchedTemplates.map((item, index) => normalizeTemplateAssociation(item, index));
    normalized.sort((a, b) => getTemplateSortValue(a) - getTemplateSortValue(b));
    templates = normalized;
    if (typeof hydrateTemplatesWithAudit === 'function') {
      hydrateTemplatesWithAudit(templates);
    }
    lastLoadedTemplateProgramId = activeProgramId;
    templates.forEach(template => {
      const id = getTemplateId(template);
      if (id && !templateLibraryIndex.has(id)) {
        templateLibraryIndex.set(id, template);
      }
    });
    if (typeof hydrateTemplateLibraryIndex === 'function') {
      hydrateTemplateLibraryIndex();
    }

    const responseTotal = extractAssignmentTotalFromResponse(data);
    const resolvedTotal = Number.isFinite(responseTotal) ? responseTotal : templates.length;
    const countUpdated = updateCachedProgramTemplateCount(activeProgramId, { total: resolvedTotal });
    if (countUpdated) {
      renderPrograms();
    }

    if (preserveSelection) {
      const validIds = new Set(templates.map(getTemplateId).filter(Boolean));
      for (const id of Array.from(selectedTemplateIds)) {
        if (!validIds.has(id)) {
          selectedTemplateIds.delete(id);
        }
      }
      if (selectedTemplateId && !validIds.has(selectedTemplateId)) {
        selectedTemplateId = null;
      }
    } else {
      selectedTemplateIds.clear();
      selectedTemplateId = null;
    }

    if (focusTemplateId) {
      const exists = templates.some(template => getTemplateId(template) === focusTemplateId);
      if (exists) {
        selectedTemplateIds.clear();
        selectedTemplateIds.add(focusTemplateId);
        selectedTemplateId = focusTemplateId;
      }
    }

      renderTemplates();
      setTemplatePanelMessage('');
      initTagifyForProgram(activeProgramId, {
        preservePending: () => hasPendingAttachForProgram(activeProgramId),
      });
  } catch (error) {
    console.error(error);
    templates = [];
    templateLibrary = [];
    templateLibraryIndex.clear();
    if (!preserveSelection) {
      selectedTemplateIds.clear();
      selectedTemplateId = null;
    }
    lastLoadedTemplateProgramId = null;
    destroyTagifyInstance();
    renderTemplates();
    if (error.status === 403) {
      setTemplatePanelMessage('You do not have permission to view assignments for this program.', true);
    } else {
      setTemplatePanelMessage('Unable to load template assignments right now. Please try again.', true);
    }
  }
}

function getProgramActionRequest(action, id) {
  const encoded = encodeURIComponent(id);
  switch (action) {
    case 'publish':
      return { url: `${API}/programs/${encoded}/publish`, options: { method: 'POST', credentials: 'include' } };
    case 'deprecate':
      return { url: `${API}/programs/${encoded}/deprecate`, options: { method: 'POST', credentials: 'include' } };
    case 'archive':
      return { url: `${API}/programs/${encoded}/archive`, options: { method: 'POST', credentials: 'include' } };
    case 'restore':
      return { url: `${API}/programs/${encoded}/restore`, options: { method: 'POST', credentials: 'include' } };
    default:
      return null;
  }
}

const programActionLabels = {
  publish: 'Publish',
  deprecate: 'Deprecate',
  archive: 'Archive',
  restore: 'Restore',
};

async function handleProgramAction(action) {
  if (!CAN_MANAGE_PROGRAMS) return;
  if (ADMIN_ONLY_PROGRAM_ACTIONS.has(action) && !IS_ADMIN) return;
  if (!selectedProgramIds.size) {
    programMessage.textContent = 'Select at least one program first.';
    return;
  }
  await flushPendingTemplateAssociationChanges();
  const label = programActionLabels[action] || 'Update';
  programMessage.textContent = `${label} in progress…`;
  const ids = Array.from(selectedProgramIds);
  let success = 0;
  let failure = 0;
  for (const id of ids) {
    const request = getProgramActionRequest(action, id);
    if (!request) continue;
    try {
      const res = await fetch(request.url, request.options);
      if (res.ok) {
        success += 1;
      } else {
        failure += 1;
      }
    } catch (error) {
      console.error(error);
      failure += 1;
    }
  }
  await loadPrograms();
  await loadTemplates({ preserveSelection: true });
  if (selectedProgramId) {
    await loadProgramTemplateAssignments({ preserveSelection: true }).catch(() => {});
  }
  programMessage.textContent = `${label} complete — ${success} succeeded, ${failure} failed.`;
}

const templateActionLabels = {
  publish: 'Publish',
  draft: 'Mark draft',
  deprecate: 'Deprecate',
};

function getTemplatePayload(action) {
  switch (action) {
    case 'publish':
      return { status: 'published' };
    case 'draft':
      return { status: 'draft' };
    case 'deprecate':
      return { status: 'deprecated' };
    default:
      return null;
  }
}

async function handleTemplateAction(action) {
  if (!CAN_MANAGE_TEMPLATES) return;
  if (!selectedTemplateIds.size) {
    templateMessage.textContent = 'Select at least one template first.';
    return;
  }
  const payload = getTemplatePayload(action);
  if (!payload) return;
  await flushPendingTemplateAssociationChanges();
  const label = templateActionLabels[action] || 'Update';
  templateMessage.textContent = `${label} in progress…`;
  const ids = Array.from(selectedTemplateIds);
  let success = 0;
  let failure = 0;
  for (const id of ids) {
    try {
      const res = await fetch(`${TEMPLATE_API}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        success += 1;
      } else {
        failure += 1;
      }
    } catch (error) {
      console.error(error);
      failure += 1;
    }
  }
  await loadTemplates({ preserveSelection: true });
  if (selectedProgramId) {
    await loadProgramTemplateAssignments({ preserveSelection: true }).catch(() => {});
  }
  const existingIds = new Set(globalTemplates.map(getTemplateId).filter(Boolean));
  const survivingIds = ids.filter(id => existingIds.has(id));
  selectedTemplateIds.clear();
  if (survivingIds.length) {
    survivingIds.forEach(id => selectedTemplateIds.add(id));
    selectedTemplateId = survivingIds.length === 1 ? survivingIds[0] : null;
  } else {
    selectedTemplateId = null;
  }
  renderTemplates();
  templateMessage.textContent = `${label} complete — ${success} succeeded, ${failure} failed.`;
}

function mergeRestoredTemplate(existing, updates) {
  const baseExisting = existing && typeof existing === 'object' ? existing : {};
  const baseUpdates = updates && typeof updates === 'object' ? updates : null;
  const merged = baseUpdates ? { ...baseExisting, ...baseUpdates } : { ...baseExisting };
  if (baseUpdates?.template && typeof baseUpdates.template === 'object') {
    merged.template = {
      ...(baseExisting.template && typeof baseExisting.template === 'object' ? baseExisting.template : {}),
      ...baseUpdates.template,
    };
  } else if (baseExisting.template && typeof baseExisting.template === 'object') {
    merged.template = { ...baseExisting.template };
  }
  if (merged.template && typeof merged.template === 'object') {
    delete merged.template.deleted_at;
    delete merged.template.deletedAt;
  }
  delete merged.deleted_at;
  delete merged.deletedAt;
  return merged;
}

function applyRestoredTemplateUpdate(templateId, updates) {
  if (!templateId) return null;
  let mergedTemplate = null;
  const applyToCollection = collection => {
    if (!Array.isArray(collection)) return;
    const index = collection.findIndex(item => getTemplateId(item) === templateId);
    if (index >= 0) {
      const next = mergeRestoredTemplate(collection[index], updates);
      collection[index] = next;
      if (!mergedTemplate) {
        mergedTemplate = next;
      }
    }
  };

  applyToCollection(globalTemplates);
  applyToCollection(templates);
  applyToCollection(templateLibrary);

  if (templateLibraryIndex instanceof Map && templateLibraryIndex.has(templateId)) {
    const existing = templateLibraryIndex.get(templateId);
    const next = mergeRestoredTemplate(existing, updates);
    templateLibraryIndex.set(templateId, next);
    if (!mergedTemplate) {
      mergedTemplate = next;
    }
  }

  if (!mergedTemplate && updates && typeof updates === 'object') {
    mergedTemplate = mergeRestoredTemplate(updates, null);
    if (Array.isArray(globalTemplates)) {
      globalTemplates.push(mergedTemplate);
    } else {
      globalTemplates = [mergedTemplate];
    }
  }

  if (mergedTemplate) {
    if (templateLibraryIndex instanceof Map && !templateLibraryIndex.has(templateId)) {
      templateLibraryIndex.set(templateId, mergedTemplate);
    }
    hydrateTemplatesWithAudit([mergedTemplate]);
  }

  return mergedTemplate;
}

async function restoreTemplateById(templateId) {
  if (!templateId) {
    throw new Error('Template ID is required to restore.');
  }
  const encodedId = encodeURIComponent(templateId);
  await fetchJson(`${TEMPLATE_API}/${encodedId}/restore`, { method: 'POST' });
  let updatedTemplate = null;
  try {
    updatedTemplate = await fetchJson(`${TEMPLATE_API}/${encodedId}?include_deleted=true`);
  } catch (error) {
    console.error('Failed to fetch restored template details', error);
  }
  const merged = applyRestoredTemplateUpdate(templateId, updatedTemplate);
  renderTemplates();
  return merged;
}

programTableBody.addEventListener('change', async event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const id = target.getAttribute('data-program-id');
  if (!id) return;
  if (!CAN_MANAGE_PROGRAMS) {
    target.checked = false;
    return;
  }
  const previousActiveId = selectedProgramId;
  const nextSelectedIds = new Set(selectedProgramIds);
  if (target.checked) {
    nextSelectedIds.add(id);
  } else {
    nextSelectedIds.delete(id);
  }
  let nextActiveId = previousActiveId;
  if (target.checked) {
    nextActiveId = id;
  } else if (previousActiveId === id) {
    const nextSelected = nextSelectedIds.values().next();
    if (!nextSelected.done) {
      nextActiveId = nextSelected.value;
    } else {
      const fallback = programs.map(getProgramId).find(Boolean) || null;
      nextActiveId = fallback;
    }
  }
  if (nextActiveId !== previousActiveId) {
    await flushPendingTemplateAssociationChanges();
  }
  selectedProgramIds.clear();
  nextSelectedIds.forEach(value => selectedProgramIds.add(value));
  selectedProgramId = nextActiveId;
  updateProgramSelectionSummary();
  const displayed = getVisiblePrograms();
  updateProgramActionsState(displayed);
  if (selectedProgramId !== previousActiveId) {
    updateActiveProgramIndicators();
    loadProgramTemplateAssignments();
  }
});

programTableBody.addEventListener('click', async event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest('input[type="checkbox"]')) return;
  const row = target.closest('tr[data-program-id]');
  if (!row) return;
  const id = row.getAttribute('data-program-id');
  if (!id || selectedProgramId === id) return;
  await flushPendingTemplateAssociationChanges();
  selectedProgramId = id;
  updateActiveProgramIndicators();
  loadProgramTemplateAssignments();
});

templateTableBody.addEventListener('change', event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const id = target.getAttribute('data-template-id');
  if (!id) return;
  if (!CAN_MANAGE_TEMPLATES) {
    target.checked = false;
    return;
  }
  if (target.checked) {
    selectedTemplateIds.add(id);
    selectedTemplateId = id;
  } else {
    selectedTemplateIds.delete(id);
    if (selectedTemplateId === id) {
      const nextSelected = selectedTemplateIds.values().next();
      if (!nextSelected.done) {
        selectedTemplateId = nextSelected.value;
      } else {
        selectedTemplateId = null;
      }
    }
  }
  updateTemplateSelectionSummary();
  const displayed = getVisibleTemplates();
  updateTemplateActionsState(displayed);
});

templateTableBody.addEventListener('click', async event => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;
  const button = target.closest('button[data-template-restore]');
  if (!button || !templateTableBody.contains(button)) return;
  event.preventDefault();
  if (button.disabled) return;
  const templateId = button.getAttribute('data-template-id');
  if (!templateId) return;
  const templateName = (button.getAttribute('data-template-name') || '').trim();
  const previousText = button.textContent || 'Restore';
  const wasDisabled = button.hasAttribute('disabled');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Restoring…';
  try {
    await restoreTemplateById(templateId);
    const label = templateName ? `“${templateName}”` : 'Template';
    showToast(`${label} restored.`, { type: 'success' });
  } catch (error) {
    console.error('Failed to restore template', error);
    const status = error?.status;
    let message = 'Unable to restore template. Please try again.';
    if (status === 403) {
      message = 'You do not have permission to restore templates.';
    } else if (status === 404) {
      message = 'Template could not be restored. It may already be active or removed.';
    }
    showToast(message, { type: 'error' });
  } finally {
    if (button.isConnected) {
      if (!wasDisabled && CAN_MANAGE_TEMPLATES) {
        button.disabled = false;
      }
      if (CAN_MANAGE_TEMPLATES) {
        button.removeAttribute('title');
      } else {
        button.title = 'Only admins or managers can restore templates.';
        button.disabled = true;
      }
      button.textContent = previousText;
      button.removeAttribute('aria-busy');
    }
  }
});

if (programSearchInput) {
  programSearchInput.addEventListener('input', () => {
    programCurrentPage = 1;
    renderPrograms();
  });
}

if (hideArchivedCheckbox) {
  hideArchivedPrograms = hideArchivedCheckbox.checked;
  hideArchivedCheckbox.addEventListener('change', () => {
    hideArchivedPrograms = hideArchivedCheckbox.checked;
    programCurrentPage = 1;
    renderPrograms();
  });
}

if (templateHideArchivedCheckbox) {
  hideArchivedTemplates = templateHideArchivedCheckbox.checked;
  templateHideArchivedCheckbox.addEventListener('change', () => {
    hideArchivedTemplates = templateHideArchivedCheckbox.checked;
    templateCurrentPage = 1;
    renderTemplates();
  });
}

if (programPageSizeSelect) {
  programPageSize = parsePageSize(programPageSizeSelect.value || DEFAULT_PROGRAM_PAGE_SIZE);
  programPageSizeSelect.value = programPageSize === Infinity
    ? 'all'
    : String(programPageSize);
  programPageSizeSelect.addEventListener('change', () => {
    programPageSize = parsePageSize(programPageSizeSelect.value);
    programCurrentPage = 1;
    renderPrograms();
  });
}

if (templatePageSizeSelect) {
  templatePageSize = parsePageSize(templatePageSizeSelect.value || DEFAULT_TEMPLATE_PAGE_SIZE, DEFAULT_TEMPLATE_PAGE_SIZE);
  templatePageSizeSelect.value = templatePageSize === Infinity
    ? 'all'
    : String(templatePageSize);
  templatePageSizeSelect.addEventListener('change', () => {
    templatePageSize = parsePageSize(templatePageSizeSelect.value, DEFAULT_TEMPLATE_PAGE_SIZE);
    templateCurrentPage = 1;
    renderTemplates();
  });
}

if (programPagerPrev) {
  programPagerPrev.addEventListener('click', () => {
    if (programPagerPrev.disabled) return;
    if (lastProgramPagination.totalPages <= 1 || lastProgramPagination.currentPage <= 1) return;
    programCurrentPage = Math.max(1, lastProgramPagination.currentPage - 1);
    renderPrograms();
  });
}

if (programPagerNext) {
  programPagerNext.addEventListener('click', () => {
    if (programPagerNext.disabled) return;
    if (lastProgramPagination.totalPages === 0 || lastProgramPagination.currentPage >= lastProgramPagination.totalPages) return;
    programCurrentPage = Math.max(1, lastProgramPagination.currentPage + 1);
    renderPrograms();
  });
}

if (templatePagerPrev) {
  templatePagerPrev.addEventListener('click', () => {
    if (templatePagerPrev.disabled) return;
    if (lastTemplatePagination.totalPages <= 1 || lastTemplatePagination.currentPage <= 1) return;
    templateCurrentPage = Math.max(1, lastTemplatePagination.currentPage - 1);
    renderTemplates();
  });
}

if (templatePagerNext) {
  templatePagerNext.addEventListener('click', () => {
    if (templatePagerNext.disabled) return;
    if (lastTemplatePagination.totalPages === 0 || lastTemplatePagination.currentPage >= lastTemplatePagination.totalPages) return;
    templateCurrentPage = Math.max(1, lastTemplatePagination.currentPage + 1);
    renderTemplates();
  });
}

if (templateSearchInput) {
  templateSearchInput.addEventListener('input', () => {
    templateCurrentPage = 1;
    renderTemplates();
  });
}

if (programSelectAll) {
  programSelectAll.addEventListener('change', () => {
    if (!CAN_MANAGE_PROGRAMS) {
      programSelectAll.checked = false;
      return;
    }
    const previousActiveId = selectedProgramId;
    const displayed = getVisiblePrograms();
    if (programSelectAll.checked) {
      displayed.forEach(p => {
        const programId = getProgramId(p);
        if (programId) selectedProgramIds.add(programId);
      });
      const firstDisplayed = displayed.map(getProgramId).find(Boolean) || null;
      if (firstDisplayed) {
        selectedProgramId = firstDisplayed;
      }
    } else {
      displayed.forEach(p => {
        const programId = getProgramId(p);
        if (programId) selectedProgramIds.delete(programId);
      });
      if (!selectedProgramIds.size) {
        const fallback = programs.map(getProgramId).find(Boolean) || null;
        selectedProgramId = fallback;
      } else if (!selectedProgramIds.has(selectedProgramId)) {
        const nextSelected = selectedProgramIds.values().next();
        if (!nextSelected.done) {
          selectedProgramId = nextSelected.value;
        }
      }
    }
    renderPrograms();
    if (selectedProgramId !== previousActiveId) {
      loadProgramTemplateAssignments();
    }
  });
}

if (templateSelectAll) {
  templateSelectAll.addEventListener('change', () => {
    if (!CAN_MANAGE_TEMPLATES) {
      templateSelectAll.checked = false;
      return;
    }
    const displayed = getVisibleTemplates();
    if (templateSelectAll.checked) {
      displayed.forEach(t => {
        const templateId = getTemplateId(t);
        if (templateId) selectedTemplateIds.add(templateId);
      });
      const firstDisplayed = displayed.map(getTemplateId).find(Boolean) || null;
      if (firstDisplayed) {
        selectedTemplateId = firstDisplayed;
      } else if (!selectedTemplateId && selectedTemplateIds.size) {
        const nextSelected = selectedTemplateIds.values().next();
        selectedTemplateId = nextSelected.done ? null : nextSelected.value;
      }
    } else {
      displayed.forEach(t => {
        const templateId = getTemplateId(t);
        if (templateId) selectedTemplateIds.delete(templateId);
      });
      if (!selectedTemplateIds.size) {
        selectedTemplateId = null;
      } else if (!selectedTemplateIds.has(selectedTemplateId)) {
        const nextSelected = selectedTemplateIds.values().next();
        selectedTemplateId = nextSelected.done ? null : nextSelected.value;
      }
    }
    renderTemplates();
  });
}

if (programTemplateList) {
  programTemplateList.addEventListener('change', event => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const field = target.getAttribute('data-association-field');
    if (!field) return;
    const item = target.closest('li[data-template-id]');
    if (!item) return;
    const templateId = item.getAttribute('data-template-id');
    if (!templateId) return;
    handleAssociationFieldChange(templateId, field, target);
  });

  programTemplateList.addEventListener('click', event => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const actionBtn = target.closest('[data-assignment-action]');
    if (actionBtn) {
      event.preventDefault();
      const isDisabled = actionBtn.hasAttribute('disabled') || actionBtn.getAttribute('aria-disabled') === 'true';
      if (isDisabled) {
        return;
      }
      const action = actionBtn.getAttribute('data-assignment-action');
      const item = actionBtn.closest('li[data-template-id]');
      if (!action || !item) return;
      const templateId = item.getAttribute('data-template-id');
      if (!templateId) return;
      if (action === 'move-up') {
        moveTemplateAssociation(templateId, 'up');
      } else if (action === 'move-down') {
        moveTemplateAssociation(templateId, 'down');
      } else if (action === 'remove') {
        const template = getTemplateById(templateId);
        const tagData = template
          ? getTagifyOptionFromTemplate(template, { isAssigned: true })
          : null;
        requestTemplateDetachment(templateId, {
          tagData: tagData ? { ...tagData } : { value: templateId, id: templateId },
          removeTagifyTag: true,
        });
      }
      return;
    }
    const item = target.closest('li[data-template-id]');
    if (!item) return;
    const templateId = item.getAttribute('data-template-id');
    if (!templateId) return;
    selectedTemplateIds.clear();
    selectedTemplateIds.add(templateId);
    selectedTemplateId = templateId;
    renderTemplates();
  });
}

const modalElements = [programModal, archiveProgramModal, deleteProgramModal, templateModal, deleteTemplateModal].filter(Boolean);
modalElements.forEach(modal => {
  modal.addEventListener('mousedown', event => {
    if (event.target === modal) {
      if (modal === programModal) {
        closeProgramModal();
      } else if (modal === archiveProgramModal) {
        closeArchiveProgramModal();
      } else if (modal === deleteProgramModal) {
        closeDeleteProgramModal();
      } else if (modal === templateModal) {
        closeTemplateModal();
      } else if (modal === deleteTemplateModal) {
        closeDeleteTemplateModal();
      } else {
        closeModal(modal);
      }
    }
  });
});

document.querySelectorAll('[data-modal-close]').forEach(btn => {
  btn.addEventListener('click', event => {
    event.preventDefault();
    const targetId = btn.getAttribute('data-modal-close');
    const modal = targetId ? document.getElementById(targetId) : btn.closest('.modal-overlay');
    if (modal === programModal) {
      closeProgramModal();
    } else if (modal === archiveProgramModal) {
      closeArchiveProgramModal();
    } else if (modal === deleteProgramModal) {
      closeDeleteProgramModal();
    } else if (modal === templateModal) {
      closeTemplateModal();
    } else if (modal === deleteTemplateModal) {
      closeDeleteTemplateModal();
    } else if (modal) {
      closeModal(modal);
    }
  });
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' || event.key === 'Esc') {
    closeTopModal();
  }
});

if (btnNewProgram) {
  btnNewProgram.addEventListener('click', () => {
    openProgramModal('create');
  });
}

if (btnEditProgram) {
  btnEditProgram.addEventListener('click', () => {
    if (!CAN_MANAGE_PROGRAMS) return;
    const targetId = btnEditProgram.dataset.programId || getPrimaryProgramId();
    if (!targetId) {
      programMessage.textContent = 'Select a program to edit first.';
      return;
    }
    openProgramModal('edit', targetId);
  });
}

if (programForm) {
  programForm.addEventListener('submit', submitProgramForm);
}

if (btnNewTemplate) {
  btnNewTemplate.addEventListener('click', () => {
    openTemplateModal('create');
  });
}

if (btnEditTemplate) {
  btnEditTemplate.addEventListener('click', () => {
    if (!CAN_MANAGE_TEMPLATES) return;
    const targetId = btnEditTemplate.dataset.templateId || getPrimaryTemplateId();
    if (!targetId) {
      templateMessage.textContent = 'Select a template to edit first.';
      return;
    }
    openTemplateModal('edit', targetId);
  });
}

if (templateForm) {
  templateForm.addEventListener('submit', submitTemplateForm);
}

if (templateFormExternalLinkInput) {
  templateFormExternalLinkInput.addEventListener('input', event => {
    const target = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : null;
    if (!target) return;
    updateTemplateFormExternalLinkState(target.value);
  });
  templateFormExternalLinkInput.addEventListener('blur', event => {
    const target = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : null;
    if (!target) return;
    const trimmed = target.value.trim();
    target.value = trimmed;
    updateTemplateFormExternalLinkState(trimmed);
  });
}

if (btnAttachTags) {
  btnAttachTags.addEventListener('click', event => {
    event.preventDefault();
    if (btnAttachTags.disabled) return;
    schedulePendingTemplateAttachments({ immediate: true });
  });
}

if (programModalArchiveTrigger) {
  programModalArchiveTrigger.addEventListener('click', () => {
    if (programModalArchiveTrigger.disabled) return;
    if (programModalProgramId) {
      openArchiveProgramModal(programModalProgramId);
    }
  });
}

if (programModalDeleteTrigger) {
  programModalDeleteTrigger.addEventListener('click', () => {
    if (programModalDeleteTrigger.disabled) return;
    if (programModalProgramId) {
      openDeleteProgramModal(programModalProgramId);
    }
  });
}

if (templateModalDeleteTrigger) {
  templateModalDeleteTrigger.addEventListener('click', () => {
    if (templateModalDeleteTrigger.disabled) return;
    if (templateModalTemplateId) {
      openDeleteTemplateModal(templateModalTemplateId);
    }
  });
}

if (confirmArchiveProgramButton) {
  confirmArchiveProgramButton.addEventListener('click', confirmArchiveProgram);
}

if (confirmDeleteProgramButton) {
  confirmDeleteProgramButton.addEventListener('click', confirmDeleteProgram);
}

if (confirmDeleteTemplateButton) {
  confirmDeleteTemplateButton.addEventListener('click', confirmDeleteTemplate);
}

programActionsContainer.addEventListener('click', event => {
  const btn = event.target instanceof HTMLElement ? event.target.closest('button[data-program-action]') : null;
  if (!btn) return;
  const action = btn.dataset.programAction;
  if (!action) return;
  handleProgramAction(action);
});

if (programTableHead) {
  programTableHead.addEventListener('click', event => {
    const cell = event.target instanceof HTMLElement ? event.target.closest('th[data-key]') : null;
    if (!cell || !programTableHead.contains(cell)) return;
    const key = cell.dataset.key;
    if (!key) return;
    const isSameKey = programSortKey === key;
    programSortKey = key;
    programSortDirection = isSameKey && programSortDirection === 'asc' ? 'desc' : 'asc';
    programCurrentPage = 1;
    renderPrograms();
  });
}

if (templateTableHead) {
  templateTableHead.addEventListener('click', event => {
    const cell = event.target instanceof HTMLElement ? event.target.closest('th[data-key]') : null;
    if (!cell || !templateTableHead.contains(cell)) return;
    const key = cell.dataset.key;
    if (!key) return;
    const isSameKey = templateSortKey === key;
    templateSortKey = key;
    templateSortDirection = isSameKey && templateSortDirection === 'asc' ? 'desc' : 'asc';
    templateCurrentPage = 1;
    renderTemplates();
  });
}

templateActionsContainer.addEventListener('click', event => {
  const btn = event.target instanceof HTMLElement ? event.target.closest('button[data-template-action]') : null;
  if (!btn) return;
  const action = btn.dataset.templateAction;
  if (!action) return;
  handleTemplateAction(action);
});

if (btnExportProgramsCsv) {
  btnExportProgramsCsv.addEventListener('click', () => {
    const csv = toCSV();
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', 'programs.csv');
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  });
}

if (btnExportTemplatesCsv) {
  btnExportTemplatesCsv.addEventListener('click', () => {
    const csv = templatesToCSV();
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', 'templates.csv');
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  });
}

if (btnImportTemplates && inputImportTemplates) {
  btnImportTemplates.addEventListener('click', () => {
    if (!CAN_MANAGE_TEMPLATES) return;
    if (inputImportTemplates.disabled) return;
    inputImportTemplates.click();
  });
  inputImportTemplates.addEventListener('change', event => {
    const target = event.target;
    const files = target?.files;
    const file = files && files.length ? files[0] : null;
    if (file) {
      handleTemplateImportFile(file);
    }
  });
}

if (btnRefreshPrograms) {
  btnRefreshPrograms.addEventListener('click', async () => {
    await flushPendingTemplateAssociationChanges();
    loadPrograms()
      .then(() => loadProgramTemplateAssignments())
      .catch(() => {});
  });
}

if (btnRefreshTemplates) {
  btnRefreshTemplates.addEventListener('click', async () => {
    await flushPendingTemplateAssociationChanges();
    loadTemplates({ preserveSelection: true });
  });
}

await loadPrograms();
await loadTemplates();
await loadProgramTemplateAssignments();
