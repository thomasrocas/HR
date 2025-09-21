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

function getProgramId(program) {
  return normalizeId(program?.id ?? program?.programId ?? program?.program_id);
}

function getTemplateId(template) {
  return normalizeId(template?.id ?? template?.templateId ?? template?.template_id ?? template?.template?.id);
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

  const hyperlinkSource = source.hyperlink
    ?? linkMeta?.hyperlink
    ?? source.url
    ?? linkMeta?.url
    ?? source.link_url
    ?? source.linkUrl
    ?? linkMeta?.link_url
    ?? linkMeta?.linkUrl
    ?? null;
  const hyperlinkValue = hyperlinkSource === null || hyperlinkSource === undefined
    ? ''
    : String(hyperlinkSource);
  normalized.hyperlink = hyperlinkValue;
  if (hyperlinkValue && typeof normalized.link === 'object' && normalized.link !== null) {
    normalized.link.hyperlink = hyperlinkValue;
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

function getProgramLifecycle(program) {
  if (!program) return '';
  const archivedAt = getProgramArchivedAt(program);
  if (archivedAt) return 'archived';
  return program?.status ?? program?.lifecycle ?? program?.state ?? 'active';
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

const programTableBody = document.getElementById('programTableBody');
const templateTableBody = document.getElementById('templateTableBody');
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
const btnRefreshPrograms = document.getElementById('btnRefreshPrograms');
const btnRefreshTemplates = document.getElementById('btnRefreshTemplates');
const btnNewProgram = document.getElementById('btnNewProgram');
const btnEditProgram = document.getElementById('btnEditProgram');
const btnNewTemplate = document.getElementById('btnNewTemplate');
const btnEditTemplate = document.getElementById('btnEditTemplate');
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
const templateFormNotesInput = document.getElementById('templateFormNotes');
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

if (!programTableBody || !templateTableBody || !programActionsContainer || !templateActionsContainer) {
  throw new Error('Program & Template Manager: required DOM nodes are missing.');
}

let programs = [];
let templates = [];
let globalTemplates = [];
let templateLibrary = [];
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
  templateActionHint.textContent = 'You have read-only access. Only admins or managers can change template statuses.';
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
  if (confirmDeleteTemplateButton) confirmDeleteTemplateButton.disabled = false;
}

updateProgramEditorButtons(programs);
updateTemplateEditorButtons(globalTemplates);
updatePanelAddButtonState();

function getFilteredPrograms() {
  const term = (programSearchInput?.value || '').trim().toLowerCase();
  if (!term) return [...programs];
  return programs.filter(p => {
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

function getFilteredTemplates() {
  const term = (templateSearchInput?.value || '').trim().toLowerCase();
  if (!term) return [...globalTemplates];
  return globalTemplates.filter(t => {
    const values = [
      getTemplateName(t),
      getTemplateStatus(t),
      getTemplateCategory(t),
      getTemplateDescription(t),
      getTemplateId(t),
    ];
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

function syncProgramSelection() {
  const validIds = new Set(programs.map(getProgramId).filter(Boolean));
  for (const id of Array.from(selectedProgramIds)) {
    if (!validIds.has(id)) selectedProgramIds.delete(id);
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
  for (const id of Array.from(selectedTemplateIds)) {
    if (!validIds.has(id)) selectedTemplateIds.delete(id);
  }
  if (selectedTemplateId && !validIds.has(selectedTemplateId)) {
    const nextSelected = selectedTemplateIds.values().next();
    selectedTemplateId = nextSelected.done ? null : nextSelected.value;
  }
}

function getProgramById(id) {
  if (!id) return null;
  return programs.find(program => getProgramId(program) === id) || null;
}

function getPrimaryProgramId(displayedPrograms = getFilteredPrograms()) {
  if (selectedProgramIds.size > 1) return null;
  if (selectedProgramIds.size === 1) {
    const { value } = selectedProgramIds.values().next();
    if (value) return value;
  }
  if (!selectedProgramId) return null;
  const pool = Array.isArray(displayedPrograms) && displayedPrograms.length ? displayedPrograms : programs;
  const exists = pool.some(program => getProgramId(program) === selectedProgramId);
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

function getPrimaryTemplateId(displayedTemplates = getFilteredTemplates()) {
  if (selectedTemplateIds.size > 1) return null;
  if (selectedTemplateIds.size === 1) {
    const { value } = selectedTemplateIds.values().next();
    if (value) return value;
  }
  if (!selectedTemplateId) return null;
  const pool = Array.isArray(displayedTemplates) && displayedTemplates.length ? displayedTemplates : templates;
  const exists = pool.some(template => getTemplateId(template) === selectedTemplateId);
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
  const status = getTemplateStatus(targetTemplate);
  const normalizedStatus = (status || '').toLowerCase();
  if (normalizedStatus === 'archived') {
    setTemplatePanelMessage('Archived templates cannot be removed.', true);
    reAddTag();
    updatePanelAddButtonState();
    return false;
  }

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
  if (templateFormNotesInput) {
    templateFormNotesInput.value = '';
  }
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
    if (templateFormNotesInput) {
      const notes = template?.notes ?? '';
      templateFormNotesInput.value = notes;
    }
  } else {
    if (templateModalTitle) templateModalTitle.textContent = 'New Template';
    if (templateFormSubmit) templateFormSubmit.textContent = 'Create Template';
    if (templateFormSortInput) {
      const sortValues = globalTemplates.map(item => getTemplateSortValue(item, 0));
      const maxSort = sortValues.length ? Math.max(...sortValues) : 0;
      templateFormSortInput.value = String(maxSort + 1);
    }
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
  const payload = {
    week_number: weekNumber,
    label: labelValue,
    notes: notesValue ? notesValue : null,
    sort_order: sortNumber ?? null,
  };
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
      btn.disabled = true;
      btn.title = 'Only admins can archive or restore programs.';
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

function renderPrograms() {
  syncProgramSelection();
  const displayed = getFilteredPrograms();
  if (!displayed.length) {
    programTableBody.innerHTML = '<tr class="empty-row"><td colspan="7">No programs found.</td></tr>';
  } else {
    programTableBody.innerHTML = displayed.map(program => {
      const programId = getProgramId(program);
      const disabledAttr = CAN_MANAGE_PROGRAMS ? '' : 'disabled';
      const checkedAttr = programId && selectedProgramIds.has(programId) ? 'checked' : '';
      const rowAttrs = [`data-program-id="${programId ?? ''}"`];
      if (programId && selectedProgramId === programId) {
        rowAttrs.push('data-active-program="true"');
      }
      const title = getProgramTitle(program) || '—';
      const lifecycle = getProgramLifecycle(program);
      const totalWeeks = getProgramTotalWeeks(program);
      const createdAt = getProgramCreatedAt(program);
      const archivedAt = getProgramArchivedAt(program);
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
  const displayed = getFilteredTemplates();
  if (!displayed.length) {
    templateTableBody.innerHTML = '<tr class="empty-row"><td colspan="6">No templates found.</td></tr>';
  } else {
    templateTableBody.innerHTML = displayed.map(template => {
      const templateId = getTemplateId(template);
      const disabledAttr = CAN_MANAGE_TEMPLATES ? '' : 'disabled';
      const checkedAttr = templateId && selectedTemplateIds.has(templateId) ? 'checked' : '';
      const name = getTemplateName(template) || '—';
      const category = getTemplateCategory(template) || '—';
      const status = getTemplateStatus(template);
      const updatedAt = getTemplateUpdatedAt(template);
      const weekNumber = getTemplateWeekNumber(template);
      return `
        <tr data-template-id="${templateId ?? ''}">
          <td><input type="checkbox" data-template-id="${templateId ?? ''}" ${checkedAttr} ${disabledAttr} class="rounded border-slate-300"></td>
          <td>${weekNumber ?? '—'}</td>
          <td class="font-medium">${name}</td>
          <td>${category}</td>
          <td>${createStatusBadge(status)}</td>
          <td>${formatDate(updatedAt)}</td>
        </tr>
      `;
    }).join('');
  }
  updateTemplateSelectionSummary();
  updateTemplateActionsState(displayed);
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
  const disableRemove = disableControls || isArchived;
  const removeButtonTitle = disableRemove
    ? (isArchived
      ? 'Archived templates cannot be removed.'
      : 'Only admins or managers can remove templates.')
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
    renderPrograms();
    programMessage.textContent = '';
  } catch (error) {
    console.error(error);
    programs = [];
    selectedProgramIds.clear();
    selectedProgramId = null;
    lastLoadedTemplateProgramId = null;
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

    renderTemplates();
    templateMessage.textContent = '';
  } catch (error) {
    console.error(error);
    globalTemplates = [];
    if (!preserveSelection) {
      selectedTemplateIds.clear();
      selectedTemplateId = null;
    }
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
    templateLibraryIndex.clear();
    templateLibrary.forEach(template => {
      const id = getTemplateId(template);
      if (id) {
        templateLibraryIndex.set(id, template);
      }
    });
    const normalized = fetchedTemplates.map((item, index) => normalizeTemplateAssociation(item, index));
    normalized.sort((a, b) => getTemplateSortValue(a) - getTemplateSortValue(b));
    templates = normalized;
    lastLoadedTemplateProgramId = activeProgramId;
    templates.forEach(template => {
      const id = getTemplateId(template);
      if (id && !templateLibraryIndex.has(id)) {
        templateLibraryIndex.set(id, template);
      }
    });

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
  const displayed = getFilteredPrograms();
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
  const displayed = getFilteredTemplates();
  updateTemplateActionsState(displayed);
});

if (programSearchInput) {
  programSearchInput.addEventListener('input', () => {
    renderPrograms();
  });
}

if (templateSearchInput) {
  templateSearchInput.addEventListener('input', () => {
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
    const displayed = getFilteredPrograms();
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
    const displayed = getFilteredTemplates();
    if (templateSelectAll.checked) {
      displayed.forEach(t => {
        const templateId = getTemplateId(t);
        if (templateId) selectedTemplateIds.add(templateId);
      });
      const firstDisplayed = displayed.map(getTemplateId).find(Boolean) || null;
      selectedTemplateId = firstDisplayed;
    } else {
      displayed.forEach(t => {
        const templateId = getTemplateId(t);
        if (templateId) selectedTemplateIds.delete(templateId);
      });
      selectedTemplateId = null;
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

templateActionsContainer.addEventListener('click', event => {
  const btn = event.target instanceof HTMLElement ? event.target.closest('button[data-template-action]') : null;
  if (!btn) return;
  const action = btn.dataset.templateAction;
  if (!action) return;
  handleTemplateAction(action);
});

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
