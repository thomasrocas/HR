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

function normalizeId(value) {
  if (value === undefined || value === null) return null;
  return String(value);
}

function getProgramId(program) {
  return normalizeId(program?.id ?? program?.programId ?? program?.program_id);
}

function getTemplateId(template) {
  return normalizeId(template?.id ?? template?.templateId ?? template?.template_id);
}

function getTemplateName(template) {
  return template?.name ?? template?.title ?? '';
}

function getTemplateCategory(template) {
  return template?.category ?? template?.type ?? '';
}

function getTemplateStatus(template) {
  if (!template) return '';
  const archivedAt = template?.deleted_at ?? template?.deletedAt ?? null;
  if (archivedAt) return 'archived';
  return template?.status ?? template?.state ?? template?.lifecycle ?? 'draft';
}

function getTemplateDescription(template) {
  return template?.description ?? template?.summary ?? '';
}

function getTemplateUpdatedAt(template) {
  return template?.updated_at ?? template?.updatedAt ?? template?.created_at ?? template?.createdAt ?? null;
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
    templateTableBody.innerHTML = '<tr class="empty-row"><td colspan="5">No templates found.</td></tr>';
  } else {
    templateTableBody.innerHTML = displayed.map(template => {
      const templateId = getTemplateId(template);
      const disabledAttr = CAN_MANAGE_TEMPLATES ? '' : 'disabled';
      const checkedAttr = templateId && selectedTemplateIds.has(templateId) ? 'checked' : '';
      const name = getTemplateName(template) || '—';
      const category = getTemplateCategory(template) || '—';
      const status = getTemplateStatus(template);
      const updatedAt = getTemplateUpdatedAt(template);
      return `
        <tr data-template-id="${templateId ?? ''}">
          <td><input type="checkbox" data-template-id="${templateId ?? ''}" ${checkedAttr} ${disabledAttr} class="rounded border-slate-300"></td>
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

async function loadTemplates() {
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
    return;
  }
  try {
    templateMessage.textContent = 'Loading templates…';
    if (activeProgramId !== lastLoadedTemplateProgramId) {
      selectedTemplateIds.clear();
      selectedTemplateId = null;
    }
    const encodedProgramId = encodeURIComponent(activeProgramId);
    const data = await fetchJson(`${API}/programs/${encodedProgramId}/templates?include_deleted=true`);
    if (Array.isArray(data?.data)) {
      templates = data.data;
    } else if (Array.isArray(data)) {
      templates = data;
    } else {
      templates = [];
    }
    selectedTemplateIds.clear();
    lastLoadedTemplateProgramId = activeProgramId;
    renderTemplates();
    templateMessage.textContent = '';
  } catch (error) {
    console.error(error);
    templates = [];
    selectedTemplateIds.clear();
    selectedTemplateId = null;
    lastLoadedTemplateProgramId = null;
    renderTemplates();
    if (error.status === 403) {
      templateMessage.textContent = 'You do not have permission to load templates for this program.';
    } else {
      templateMessage.textContent = 'Unable to load templates. Please try again later.';
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

programTableBody.addEventListener('change', event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const id = target.getAttribute('data-program-id');
  if (!id) return;
  if (!CAN_MANAGE_PROGRAMS) {
    target.checked = false;
    return;
  }
  const previousActiveId = selectedProgramId;
  if (target.checked) {
    selectedProgramIds.add(id);
    selectedProgramId = id;
  } else {
    selectedProgramIds.delete(id);
    if (selectedProgramId === id) {
      const nextSelected = selectedProgramIds.values().next();
      if (!nextSelected.done) {
        selectedProgramId = nextSelected.value;
      } else {
        const fallback = programs.map(getProgramId).find(Boolean) || null;
        selectedProgramId = fallback;
      }
    }
  }
  updateProgramSelectionSummary();
  const displayed = getFilteredPrograms();
  updateProgramActionsState(displayed);
  if (selectedProgramId !== previousActiveId) {
    updateActiveProgramIndicators();
    loadTemplates();
  }
});

programTableBody.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest('input[type="checkbox"]')) return;
  const row = target.closest('tr[data-program-id]');
  if (!row) return;
  const id = row.getAttribute('data-program-id');
  if (!id || selectedProgramId === id) return;
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
  btnRefreshPrograms.addEventListener('click', () => {
    loadPrograms()
      .then(() => loadTemplates())
      .catch(() => {});
  });
}

if (btnRefreshTemplates) {
  btnRefreshTemplates.addEventListener('click', () => {
    loadTemplates();
  });
}

await loadPrograms();
await loadTemplates();
