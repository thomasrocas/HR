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

if (!programTableBody || !templateTableBody || !programActionsContainer || !templateActionsContainer) {
  throw new Error('Program & Template Manager: required DOM nodes are missing.');
}

let programs = [];
let templates = [];
const selectedProgramIds = new Set();
const selectedTemplateIds = new Set();

if (!CAN_MANAGE_PROGRAMS) {
  programActionHint.textContent = 'You have read-only access. Only admins or managers can change program lifecycles.';
  if (programSelectAll) programSelectAll.disabled = true;
}
if (!CAN_MANAGE_TEMPLATES) {
  templateActionHint.textContent = 'You have read-only access. Only admins or managers can change template statuses.';
  if (templateSelectAll) templateSelectAll.disabled = true;
}

function getFilteredPrograms() {
  const term = (programSearchInput?.value || '').trim().toLowerCase();
  if (!term) return [...programs];
  return programs.filter(p => {
    return [p.name, p.status, p.owner, p.version]
      .filter(Boolean)
      .some(value => value.toString().toLowerCase().includes(term));
  });
}

function getFilteredTemplates() {
  const term = (templateSearchInput?.value || '').trim().toLowerCase();
  if (!term) return [...templates];
  return templates.filter(t => {
    return [t.name, t.status, t.category]
      .filter(Boolean)
      .some(value => value.toString().toLowerCase().includes(term));
  });
}

function syncProgramSelection() {
  const validIds = new Set(programs.map(p => p.id));
  for (const id of Array.from(selectedProgramIds)) {
    if (!validIds.has(id)) selectedProgramIds.delete(id);
  }
}

function syncTemplateSelection() {
  const validIds = new Set(templates.map(t => t.id));
  for (const id of Array.from(selectedTemplateIds)) {
    if (!validIds.has(id)) selectedTemplateIds.delete(id);
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
    const countDisplayed = displayedPrograms.length;
    const allSelected = countDisplayed > 0 && displayedPrograms.every(p => selectedProgramIds.has(p.id));
    const someSelected = displayedPrograms.some(p => selectedProgramIds.has(p.id));
    programSelectAll.disabled = !CAN_MANAGE_PROGRAMS || countDisplayed === 0;
    programSelectAll.checked = allSelected;
    programSelectAll.indeterminate = !allSelected && someSelected;
  }
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
    const countDisplayed = displayedTemplates.length;
    const allSelected = countDisplayed > 0 && displayedTemplates.every(t => selectedTemplateIds.has(t.id));
    const someSelected = displayedTemplates.some(t => selectedTemplateIds.has(t.id));
    templateSelectAll.disabled = !CAN_MANAGE_TEMPLATES || countDisplayed === 0;
    templateSelectAll.checked = allSelected;
    templateSelectAll.indeterminate = !allSelected && someSelected;
  }
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
      const disabledAttr = CAN_MANAGE_PROGRAMS ? '' : 'disabled';
      const checkedAttr = selectedProgramIds.has(program.id) ? 'checked' : '';
      const assigned = typeof program.assignedCount === 'number' ? program.assignedCount : '—';
      return `
        <tr data-program-id="${program.id}">
          <td><input type="checkbox" data-program-id="${program.id}" ${checkedAttr} ${disabledAttr} class="rounded border-slate-300"></td>
          <td class="font-medium">${program.name || '—'}</td>
          <td>${createStatusBadge(program.status)}</td>
          <td>${program.version || '—'}</td>
          <td>${program.owner || '—'}</td>
          <td>${formatDate(program.updatedAt)}</td>
          <td class="text-right">${assigned}</td>
        </tr>
      `;
    }).join('');
  }
  updateProgramSelectionSummary();
  updateProgramActionsState(displayed);
}

function renderTemplates() {
  syncTemplateSelection();
  const displayed = getFilteredTemplates();
  if (!displayed.length) {
    templateTableBody.innerHTML = '<tr class="empty-row"><td colspan="5">No templates found.</td></tr>';
  } else {
    templateTableBody.innerHTML = displayed.map(template => {
      const disabledAttr = CAN_MANAGE_TEMPLATES ? '' : 'disabled';
      const checkedAttr = selectedTemplateIds.has(template.id) ? 'checked' : '';
      return `
        <tr data-template-id="${template.id}">
          <td><input type="checkbox" data-template-id="${template.id}" ${checkedAttr} ${disabledAttr} class="rounded border-slate-300"></td>
          <td class="font-medium">${template.name || '—'}</td>
          <td>${template.category || '—'}</td>
          <td>${createStatusBadge(template.status)}</td>
          <td>${formatDate(template.updatedAt)}</td>
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
    const data = await fetchJson(`${API}/api/programs?status=all`);
    if (Array.isArray(data?.data)) {
      programs = data.data;
    } else if (Array.isArray(data)) {
      programs = data;
    } else {
      programs = [];
    }
    selectedProgramIds.clear();
    renderPrograms();
    programMessage.textContent = '';
  } catch (error) {
    console.error(error);
    programs = [];
    selectedProgramIds.clear();
    renderPrograms();
    if (error.status === 403) {
      programMessage.textContent = 'You do not have permission to load programs.';
    } else {
      programMessage.textContent = 'Unable to load programs. Please try again later.';
    }
  }
}

async function loadTemplates() {
  try {
    templateMessage.textContent = 'Loading templates…';
    const data = await fetchJson(`${API}/api/templates?scope=all`);
    if (Array.isArray(data?.data)) {
      templates = data.data;
    } else if (Array.isArray(data)) {
      templates = data;
    } else {
      templates = [];
    }
    selectedTemplateIds.clear();
    renderTemplates();
    templateMessage.textContent = '';
  } catch (error) {
    console.error(error);
    templates = [];
    selectedTemplateIds.clear();
    renderTemplates();
    if (error.status === 403) {
      templateMessage.textContent = 'You do not have permission to load templates.';
    } else {
      templateMessage.textContent = 'Unable to load templates. Please try again later.';
    }
  }
}

function getProgramActionRequest(action, id) {
  const encoded = encodeURIComponent(id);
  switch (action) {
    case 'publish':
      return { url: `${API}/api/programs/${encoded}/publish`, options: { method: 'POST', credentials: 'include' } };
    case 'deprecate':
      return { url: `${API}/api/programs/${encoded}/deprecate`, options: { method: 'POST', credentials: 'include' } };
    case 'archive':
      return { url: `${API}/api/programs/${encoded}/archive`, options: { method: 'POST', credentials: 'include' } };
    case 'restore':
      return { url: `${API}/api/programs/${encoded}/restore`, options: { method: 'POST', credentials: 'include' } };
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
  const label = templateActionLabels[action] || 'Update';
  templateMessage.textContent = `${label} in progress…`;
  const ids = Array.from(selectedTemplateIds);
  let success = 0;
  let failure = 0;
  for (const id of ids) {
    try {
      const res = await fetch(`${API}/api/templates/${encodeURIComponent(id)}`, {
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
  if (target.checked) {
    selectedProgramIds.add(id);
  } else {
    selectedProgramIds.delete(id);
  }
  updateProgramSelectionSummary();
  const displayed = getFilteredPrograms();
  updateProgramActionsState(displayed);
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
  } else {
    selectedTemplateIds.delete(id);
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
    const displayed = getFilteredPrograms();
    if (programSelectAll.checked) {
      displayed.forEach(p => selectedProgramIds.add(p.id));
    } else {
      displayed.forEach(p => selectedProgramIds.delete(p.id));
    }
    renderPrograms();
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
      displayed.forEach(t => selectedTemplateIds.add(t.id));
    } else {
      displayed.forEach(t => selectedTemplateIds.delete(t.id));
    }
    renderTemplates();
  });
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
    loadPrograms();
  });
}

if (btnRefreshTemplates) {
  btnRefreshTemplates.addEventListener('click', () => {
    loadTemplates();
  });
}

await loadPrograms();
await loadTemplates();
