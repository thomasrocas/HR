const API = window.location.origin;

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

function getTemplateName(template) {
  const value = [
    template?.name,
    template?.title,
    template?.label,
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
  const templateId = getTemplateId(source) || (nestedTemplate ? getTemplateId(nestedTemplate) : null);
  if (templateId && !normalized.templateId) {
    normalized.templateId = templateId;
  }
  if (!normalized.id && templateId) {
    normalized.id = templateId;
  }

  const dueOffsetSource = source.due_offset_days
    ?? source.dueOffsetDays
    ?? source.due_in_days
    ?? source.dueOffset
    ?? null;
  const dueOffsetDays = toNullableNumber(dueOffsetSource);
  normalized.due_offset_days = dueOffsetDays;
  normalized.dueOffsetDays = dueOffsetDays;

  const requiredSource = source.required
    ?? source.is_required
    ?? source.isRequired
    ?? (nestedTemplate ? nestedTemplate.required : null);
  const required = toNullableBoolean(requiredSource);
  normalized.required = required;

  const visibilitySource = source.visibility
    ?? source.visible_to
    ?? source.visibleTo
    ?? source.audience
    ?? (nestedTemplate ? nestedTemplate.visibility : null);
  const visibility = visibilitySource === null || visibilitySource === undefined || visibilitySource === ''
    ? null
    : String(visibilitySource);
  normalized.visibility = visibility;

  const notesSource = source.notes
    ?? (nestedTemplate ? nestedTemplate.notes : null)
    ?? source.description
    ?? source.summary
    ?? '';
  normalized.notes = notesSource === null || notesSource === undefined ? '' : String(notesSource);

  const sortSource = source.sort_order
    ?? source.sortOrder
    ?? source.order
    ?? source.position
    ?? source.index
    ?? (nestedTemplate ? nestedTemplate.sort_order : null);
  const sortValue = toNullableNumber(sortSource);
  const fallbackSort = index + 1;
  normalized.sort_order = typeof sortValue === 'number' && Number.isFinite(sortValue) ? sortValue : fallbackSort;
  normalized.sortOrder = normalized.sort_order;

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
const templateFormNameInput = document.getElementById('templateFormName');
const templateFormCategoryInput = document.getElementById('templateFormCategory');
const templateFormStatusSelect = document.getElementById('templateFormStatus');
const templateFormDescriptionInput = document.getElementById('templateFormDescription');
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
const btnPanelAddTemplate = document.getElementById('btnPanelAddTemplate');
const templateVisibilityOptions = document.getElementById('templateVisibilityOptions');

if (!programTableBody || !templateTableBody || !programActionsContainer || !templateActionsContainer) {
  throw new Error('Program & Template Manager: required DOM nodes are missing.');
}

let programs = [];
let templates = [];
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
updateTemplateEditorButtons(templates);
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
  if (!term) return [...templates];
  return templates.filter(t => {
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
  const validIds = new Set(templates.map(getTemplateId).filter(Boolean));
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
  return templates.find(template => getTemplateId(template) === id) || null;
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

function updateTemplateEditorButtons(displayedTemplates = templates) {
  if (btnNewTemplate) {
    if (!CAN_MANAGE_TEMPLATES) {
      btnNewTemplate.disabled = true;
      btnNewTemplate.title = 'Only admins or managers can create templates.';
    } else if (!selectedProgramId) {
      btnNewTemplate.disabled = true;
      btnNewTemplate.title = 'Select a program to add templates.';
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
  if (!btnPanelAddTemplate) return;
  if (!CAN_MANAGE_TEMPLATES) {
    btnPanelAddTemplate.disabled = true;
    btnPanelAddTemplate.title = 'Only admins or managers can add templates.';
    return;
  }
  if (!selectedProgramId) {
    btnPanelAddTemplate.disabled = true;
    btnPanelAddTemplate.title = 'Select a program to add templates.';
  } else {
    btnPanelAddTemplate.disabled = false;
    btnPanelAddTemplate.title = '';
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
  if ('dueOffsetDays' in updates) {
    const value = updates.dueOffsetDays;
    if (value === null || value === undefined || value === '') {
      payload.due_offset_days = null;
    } else {
      const asNumber = typeof value === 'number' ? value : Number(value);
      payload.due_offset_days = Number.isFinite(asNumber) ? asNumber : null;
    }
  }
  if ('required' in updates) {
    const value = updates.required;
    if (value === null || value === undefined) {
      payload.required = null;
    } else if (typeof value === 'boolean') {
      payload.required = value;
    } else if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'required', 'y'].includes(normalized)) {
        payload.required = true;
      } else if (['false', '0', 'no', 'optional', 'n'].includes(normalized)) {
        payload.required = false;
      } else {
        payload.required = Boolean(normalized);
      }
    } else {
      payload.required = Boolean(value);
    }
  }
  if ('visibility' in updates) {
    const value = updates.visibility;
    payload.visibility = value === null || value === undefined || value === ''
      ? null
      : String(value);
  }
  if ('notes' in updates) {
    const value = updates.notes;
    if (value === null) {
      payload.notes = null;
    } else {
      const trimmed = String(value);
      payload.notes = trimmed.trim() === '' ? null : trimmed;
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
    try {
      await fetchJson(`${API}/programs/${encodeURIComponent(programId)}/templates/metadata`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: batch }),
      });
      success = true;
      if (selectedProgramId === programId) {
        if (shouldReload) {
          await loadTemplates({ preserveSelection: true });
        }
        setTemplatePanelMessage(successMessage);
        setTimeout(() => {
          if (programTemplatePanelMessage && programTemplatePanelMessage.textContent === successMessage) {
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
        await loadTemplates({ preserveSelection: true }).catch(() => {});
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

function createOrderRevert(previousOrder) {
  if (!Array.isArray(previousOrder) || !previousOrder.length) {
    return null;
  }
  const orderMap = new Map(previousOrder.filter(Boolean).map((id, index) => [id, index]));
  return () => {
    templates.sort((a, b) => {
      const aId = getTemplateId(a);
      const bId = getTemplateId(b);
      return (orderMap.get(aId) ?? 0) - (orderMap.get(bId) ?? 0);
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
  const currentOrder = templates.map(getTemplateId).filter(Boolean);
  if (!currentOrder.length) {
    return;
  }
  if (Array.isArray(previousOrder) && previousOrder.length === currentOrder.length) {
    const unchanged = previousOrder.every((id, index) => id === currentOrder[index]);
    if (unchanged) {
      return;
    }
  }
  pendingReorderState.programId = programId;
  pendingReorderState.order = currentOrder;
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
  const filteredOrder = order.filter(id => id !== null && id !== undefined && id !== '');
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
      await fetchJson(`${API}/programs/${encodeURIComponent(programId)}/templates/reorder`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: filteredOrder }),
      });
      success = true;
      if (selectedProgramId === programId) {
        await loadTemplates({ preserveSelection: true });
        setTemplatePanelMessage(successMessage);
        setTimeout(() => {
          if (programTemplatePanelMessage && programTemplatePanelMessage.textContent === successMessage) {
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
        await loadTemplates({ preserveSelection: true }).catch(() => {});
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
}

function resetTemplateForm() {
  if (templateForm) {
    templateForm.reset();
  }
  if (templateFormStatusSelect) {
    const defaultStatus = 'draft';
    templateFormStatusSelect.value = defaultStatus;
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
  if (!selectedProgramId) {
    templateMessage.textContent = 'Select a program before managing templates.';
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
  const isDeleteVisible = isEdit && CAN_MANAGE_TEMPLATES;
  if (templateModalDeleteTrigger) {
    templateModalDeleteTrigger.classList.toggle('hidden', !isDeleteVisible);
    templateModalDeleteTrigger.disabled = !isDeleteVisible;
  }
  if (isEdit) {
    if (templateModalTitle) templateModalTitle.textContent = 'Edit Template';
    if (templateFormSubmit) templateFormSubmit.textContent = 'Save Changes';
    if (templateFormNameInput) templateFormNameInput.value = getTemplateName(template) || '';
    if (templateFormCategoryInput) templateFormCategoryInput.value = getTemplateCategory(template) || '';
    if (templateFormStatusSelect) {
      const status = (getTemplateStatus(template) || 'draft').toString().toLowerCase();
      const allowedStatuses = new Set(['draft', 'published', 'deprecated', 'archived']);
      templateFormStatusSelect.value = allowedStatuses.has(status) ? status : 'draft';
    }
    if (templateFormDescriptionInput) {
      templateFormDescriptionInput.value = getTemplateDescription(template) || '';
    }
  } else {
    if (templateModalTitle) templateModalTitle.textContent = 'New Template';
    if (templateFormSubmit) templateFormSubmit.textContent = 'Create Template';
  }
  setTemplateFormMessage('');
  openModal(templateModal);
  if (templateFormNameInput) {
    requestAnimationFrame(() => {
      templateFormNameInput.focus();
      if (isEdit) {
        templateFormNameInput.select?.();
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
      await loadTemplates();
    } else if (result && getProgramId(result) === selectedProgramId) {
      await loadTemplates();
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
  if (!selectedProgramId) {
    setTemplateFormMessage('Select a program before managing templates.', true);
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
  const nameValue = (templateFormNameInput?.value || '').trim();
  if (!nameValue) {
    setTemplateFormMessage('Template name is required.', true);
    if (templateFormSubmit) {
      templateFormSubmit.disabled = false;
      templateFormSubmit.textContent = initialSubmitLabel || (isEdit ? 'Save Changes' : 'Create Template');
    }
    templateFormNameInput?.focus();
    return;
  }
  const categoryValue = (templateFormCategoryInput?.value || '').trim();
  let statusValue = templateFormStatusSelect?.value || 'draft';
  if (statusValue) {
    statusValue = statusValue.toString().toLowerCase();
  }
  const allowedStatuses = new Set(['draft', 'published', 'deprecated', 'archived']);
  if (!allowedStatuses.has(statusValue)) {
    statusValue = 'draft';
  }
  const descriptionValue = (templateFormDescriptionInput?.value || '').trim();
  const payload = {
    name: nameValue,
    category: categoryValue || null,
    status: statusValue || 'draft',
    description: descriptionValue ? descriptionValue : null,
  };
  const encodedProgramId = encodeURIComponent(selectedProgramId);
  const encodedTemplateId = targetId ? encodeURIComponent(targetId) : null;
  const url = isEdit && encodedTemplateId
    ? `${API}/programs/${encodedProgramId}/templates/${encodedTemplateId}`
    : `${API}/programs/${encodedProgramId}/templates`;
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
    await loadTemplates();
    const idToSelect = resultId || targetId || null;
    if (idToSelect) {
      selectedTemplateIds.clear();
      selectedTemplateIds.add(idToSelect);
      selectedTemplateId = idToSelect;
      renderTemplates();
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
      templateFormSubmit.textContent = initialSubmitLabel || (isEdit ? 'Save Changes' : 'Create Template');
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
    await loadTemplates();
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
    await loadTemplates();
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
  if (deleteTemplateModalDescription) {
    const name = getTemplateName(template) || 'this template';
    deleteTemplateModalDescription.textContent = `This will permanently delete “${name}”.`;
  }
  setModalMessage(deleteTemplateModalMessage, '');
  openModal(deleteTemplateModal);
}

function closeDeleteTemplateModal() {
  deleteTargetTemplateId = null;
  if (deleteTemplateModalDescription) {
    deleteTemplateModalDescription.textContent = 'This action cannot be undone.';
  }
  setModalMessage(deleteTemplateModalMessage, '');
  closeModal(deleteTemplateModal);
}

async function confirmDeleteTemplate() {
  if (!CAN_MANAGE_TEMPLATES) return;
  if (!selectedProgramId) {
    templateMessage.textContent = 'Select a program before deleting templates.';
    return;
  }
  if (!deleteTargetTemplateId) return;
  await flushPendingTemplateAssociationChanges();
  const targetId = deleteTargetTemplateId;
  const originalLabel = confirmDeleteTemplateButton ? confirmDeleteTemplateButton.textContent : '';
  if (confirmDeleteTemplateButton) {
    confirmDeleteTemplateButton.disabled = true;
    confirmDeleteTemplateButton.textContent = 'Deleting…';
  }
  setModalMessage(deleteTemplateModalMessage, 'Deleting template…');
  try {
    await fetchJson(`${API}/programs/${encodeURIComponent(selectedProgramId)}/templates/${encodeURIComponent(targetId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    selectedTemplateIds.delete(targetId);
    if (selectedTemplateId === targetId) {
      selectedTemplateId = null;
    }
    setModalMessage(deleteTemplateModalMessage, '');
    closeDeleteTemplateModal();
    if (templateModal && templateModal.classList.contains('is-open')) {
      closeTemplateModal();
    }
    await loadTemplates();
    templateMessage.textContent = 'Template deleted successfully.';
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
    programTemplatePanelDescription.textContent = 'Adjust due offsets, requirements, visibility, and notes for each assignment.';
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
        setTemplatePanelMessage('Use “Add Template” to attach templates to this program.');
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
  const category = getTemplateCategory(template);
  const status = getTemplateStatus(template);
  const dueOffsetRaw = template?.dueOffsetDays ?? template?.due_offset_days ?? null;
  const dueOffsetValue = dueOffsetRaw === null || dueOffsetRaw === undefined ? '' : String(dueOffsetRaw);
  const requiredRaw = template?.required;
  const requiredValue = requiredRaw === null || requiredRaw === undefined ? 'inherit' : (requiredRaw ? 'true' : 'false');
  const visibilityValue = template?.visibility ?? '';
  const notesValue = template?.notes ?? '';
  const disableControls = !CAN_MANAGE_TEMPLATES;
  const disableUp = disableControls || index === 0;
  const disableDown = disableControls || index === total - 1;
  const disableRemove = disableControls;
  const requiredOptions = [
    { value: 'inherit', label: 'Inherit program setting' },
    { value: 'true', label: 'Required' },
    { value: 'false', label: 'Optional' },
  ];
  const requiredSelect = requiredOptions.map(opt => {
    const selected = opt.value === requiredValue ? ' selected' : '';
    return `<option value="${opt.value}"${selected}>${opt.label}</option>`;
  }).join('');
  const metaParts = [];
  if (category) {
    metaParts.push(`<span class="text-xs text-slate-500">${escapeHtml(category)}</span>`);
  }
  if (status) {
    metaParts.push(`<span>${createStatusBadge(status)}</span>`);
  }
  const metaHtml = metaParts.length ? `<div class="flex flex-wrap items-center gap-2">${metaParts.join('')}</div>` : '';
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
          <p class="font-medium truncate" title="${name}">${name}</p>
          ${metaHtml}
        </div>
        <div class="flex items-center gap-1">
          ${dragHandleHtml}
          <button type="button" class="btn btn-outline text-xs" data-assignment-action="move-up" ${disableUp ? 'disabled' : ''} aria-label="Move template up" title="Move up">↑</button>
          <button type="button" class="btn btn-outline text-xs" data-assignment-action="move-down" ${disableDown ? 'disabled' : ''} aria-label="Move template down" title="Move down">↓</button>
          <button type="button" class="btn btn-danger-outline text-xs" data-assignment-action="remove" ${disableRemove ? 'disabled' : ''} aria-label="Remove template from program" title="Remove template">Remove</button>
        </div>
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <label class="space-y-1">
          <span class="label-text">Due offset (days)</span>
          <input type="number" class="input" data-association-field="dueOffsetDays" placeholder="e.g. 7" value="${escapeHtml(dueOffsetValue)}" ${disableControls ? 'disabled' : ''}>
        </label>
        <label class="space-y-1">
          <span class="label-text">Required</span>
          <select class="input" data-association-field="required" ${disableControls ? 'disabled' : ''}>${requiredSelect}</select>
        </label>
        <label class="space-y-1 md:col-span-2">
          <span class="label-text">Visibility</span>
          <input class="input" data-association-field="visibility" list="templateVisibilityOptions" placeholder="inherit" value="${escapeHtml(visibilityValue)}" ${disableControls ? 'disabled' : ''}>
        </label>
      </div>
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
  const template = getTemplateById(templateId);
  if (!template) return;

  const previousValue = field === 'dueOffsetDays'
    ? (template?.dueOffsetDays ?? template?.due_offset_days ?? null)
    : template[field];

  let nextValue;
  if (field === 'dueOffsetDays') {
    const raw = element.value;
    if (raw === '') {
      nextValue = null;
    } else {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        setTemplatePanelMessage('Enter a valid number of days for the due offset.', true);
        element.value = previousValue === null || previousValue === undefined ? '' : String(previousValue);
        return;
      }
      nextValue = parsed;
    }
  } else if (field === 'required') {
    const raw = element.value;
    if (raw === 'inherit') {
      nextValue = null;
    } else if (raw === 'true') {
      nextValue = true;
    } else if (raw === 'false') {
      nextValue = false;
    } else {
      nextValue = toNullableBoolean(raw);
    }
  } else if (field === 'visibility') {
    const raw = element.value.trim();
    nextValue = raw === '' ? null : raw;
  } else if (field === 'notes') {
    const raw = element.value;
    nextValue = raw && raw.trim() !== '' ? raw : '';
  } else {
    return;
  }

  const previousComparable = previousValue === undefined ? null : previousValue;
  const nextComparable = nextValue === undefined ? null : nextValue;
  if (field === 'notes') {
    if ((previousComparable || '') === (nextComparable || '')) {
      return;
    }
  } else if (previousComparable === nextComparable) {
    return;
  }

  if (field === 'dueOffsetDays') {
    template.dueOffsetDays = nextValue;
    template.due_offset_days = nextValue;
  } else if (field === 'notes') {
    template.notes = nextValue || '';
  } else if (field === 'visibility') {
    template.visibility = nextValue === null ? null : String(nextValue);
  } else if (field === 'required') {
    template.required = nextValue;
  }

  const updates = field === 'dueOffsetDays'
    ? { dueOffsetDays: nextValue }
    : { [field]: nextValue };

  const revert = () => {
    if (field === 'dueOffsetDays') {
      template.dueOffsetDays = previousValue;
      template.due_offset_days = previousValue;
      element.value = previousValue === null || previousValue === undefined ? '' : String(previousValue);
    } else if (field === 'required') {
      template.required = previousValue;
      const revertValue = previousValue === null || previousValue === undefined ? 'inherit' : (previousValue ? 'true' : 'false');
      element.value = revertValue;
    } else if (field === 'visibility') {
      template.visibility = previousValue === null || previousValue === undefined ? null : String(previousValue);
      element.value = previousValue === null || previousValue === undefined ? '' : String(previousValue);
    } else if (field === 'notes') {
      template.notes = previousValue ?? '';
      element.value = previousValue ?? '';
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
  const previousOrder = templates.map(getTemplateId);
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
  const { focusTemplateId = null, preserveSelection = false } = options;
  const activeProgramId = selectedProgramId;
  if (!activeProgramId) {
    templates = [];
    selectedTemplateIds.clear();
    selectedTemplateId = null;
    lastLoadedTemplateProgramId = null;
    renderTemplates();
    templateMessage.textContent = programs.length
      ? 'Select a program to view its templates.'
      : 'No programs available.';
    setTemplatePanelMessage('');
    updatePanelAddButtonState();
    return;
  }
  try {
    templateMessage.textContent = 'Loading templates…';
    if (!preserveSelection || activeProgramId !== lastLoadedTemplateProgramId) {
      if (activeProgramId !== lastLoadedTemplateProgramId) {
        selectedTemplateIds.clear();
        selectedTemplateId = null;
      }
    }
    const encodedProgramId = encodeURIComponent(activeProgramId);
    const data = await fetchJson(`${API}/programs/${encodedProgramId}/templates?include_deleted=true`);
    let fetchedTemplates = [];
    if (Array.isArray(data?.data)) {
      fetchedTemplates = data.data;
    } else if (Array.isArray(data)) {
      fetchedTemplates = data;
    }
    const normalized = fetchedTemplates.map((item, index) => normalizeTemplateAssociation(item, index));
    normalized.sort((a, b) => getTemplateSortValue(a) - getTemplateSortValue(b));
    templates = normalized;
    lastLoadedTemplateProgramId = activeProgramId;

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
    templateMessage.textContent = '';
    setTemplatePanelMessage('');
  } catch (error) {
    console.error(error);
    templates = [];
    if (!preserveSelection) {
      selectedTemplateIds.clear();
      selectedTemplateId = null;
    }
    lastLoadedTemplateProgramId = null;
    renderTemplates();
    if (error.status === 403) {
      templateMessage.textContent = 'You do not have permission to load templates for this program.';
      setTemplatePanelMessage('You do not have permission to view assignments for this program.', true);
    } else {
      templateMessage.textContent = 'Unable to load templates. Please try again later.';
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
  await loadTemplates();
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
  if (!selectedProgramId) {
    templateMessage.textContent = 'Select a program first.';
    return;
  }
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
      const res = await fetch(`${API}/programs/${encodeURIComponent(selectedProgramId)}/templates/${encodeURIComponent(id)}`, {
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
  await loadTemplates();
  const existingIds = new Set(templates.map(getTemplateId).filter(Boolean));
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
    loadTemplates();
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
  loadTemplates();
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
      loadTemplates();
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
        openDeleteTemplateModal(templateId);
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

if (btnPanelAddTemplate) {
  btnPanelAddTemplate.addEventListener('click', event => {
    event.preventDefault();
    openTemplateModal('create');
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
      .then(() => loadTemplates())
      .catch(() => {});
  });
}

if (btnRefreshTemplates) {
  btnRefreshTemplates.addEventListener('click', async () => {
    await flushPendingTemplateAssociationChanges();
    loadTemplates();
  });
}

await loadPrograms();
await loadTemplates();
