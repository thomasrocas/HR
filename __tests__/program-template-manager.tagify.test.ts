import fs from 'fs';
import path from 'path';
import vm from 'vm';

type ManagerContext = {
  [key: string]: any;
};

const managerSource = fs.readFileSync(
  path.resolve(__dirname, '../public/admin/program-template-manager.js'),
  'utf8',
);

const functionsSectionStart = managerSource.indexOf('function withTagifySuppressed');
const functionsSectionEnd = managerSource.indexOf('function schedulePendingTemplateAttachments');
if (functionsSectionStart === -1 || functionsSectionEnd === -1) {
  throw new Error('Unable to locate Tagify helpers in program-template-manager.js');
}

const scheduleSectionStart = functionsSectionEnd;
const scheduleSectionEnd = managerSource.indexOf('function extractAssignmentsFromResponse');
if (scheduleSectionEnd === -1) {
  throw new Error('Unable to locate attachment helpers in program-template-manager.js');
}

const assignmentsSectionStart = scheduleSectionEnd;
const assignmentsSectionEnd = managerSource.indexOf('function getProgramActionRequest');
if (assignmentsSectionEnd === -1) {
  throw new Error('Unable to locate assignment loader in program-template-manager.js');
}

const functionSection = managerSource.slice(functionsSectionStart, functionsSectionEnd);
const scheduleSection = managerSource.slice(scheduleSectionStart, scheduleSectionEnd);
const assignmentsSection = managerSource.slice(assignmentsSectionStart, assignmentsSectionEnd);

class FakeTagify {
  public value: any[] = [];

  public settings: Record<string, unknown> = {};

  public handlers: Record<string, (...args: any[]) => void> = {};

  public destroyed = false;

  constructor(public input: any, public options: Record<string, unknown>) {}

  destroy() {
    this.destroyed = true;
  }

  addTags(tags: any) {
    const values = Array.isArray(tags) ? tags : [tags];
    this.value.push(...values);
  }

  on(event: string, handler: (...args: any[]) => void) {
    this.handlers[event] = handler;
  }

  getAttributes() {
    return '';
  }
}

function createManagerContext(overrides: ManagerContext = {}) {
  const context: ManagerContext = {
    console,
    normalizeId: (value: any) => {
      if (value === null || value === undefined) return null;
      return String(value);
    },
    getTemplateId: (template: any) => template?.id ?? template?.value ?? null,
    getTemplateName: (template: any) => template?.name ?? template?.label ?? template?.value ?? '',
    getTemplateStatus: () => '',
    escapeHtml: (value: any) => (value === null || value === undefined ? '' : String(value)),
    createStatusBadge: () => '',
    window: { Tagify: FakeTagify },
    document: {
      createElement: () => ({
        classList: { add: jest.fn(), remove: jest.fn() },
        append: jest.fn(),
        setAttribute: jest.fn(),
        innerHTML: '',
        querySelector: jest.fn(),
        querySelectorAll: jest.fn(() => []),
        addEventListener: jest.fn(),
        remove: jest.fn(),
      }),
    },
    setTimeout: (handler: (...args: any[]) => void, _delay?: number, ...args: any[]) => {
      if (typeof handler === 'function') {
        handler(...args);
      }
      return 0;
    },
    clearTimeout: () => {},
  };

  vm.createContext(context);
  const bootstrap = `
    let tagifyInstance = null;
    let suppressTagifyEventsFlag = false;
    const pendingAttach = new Set();
    const pendingAttachState = new Map();
    let pendingAttachProgramId = null;
    let attachSaveTimeout = null;
    let attachInFlightPromise = null;
    let templates = [];
    let templateLibrary = [];
    const templateLibraryIndex = new Map();
    let globalTemplates = [];
    const selectedTemplateIds = new Set();
    let selectedTemplateId = null;
    let selectedProgramId = null;
    let lastLoadedTemplateProgramId = null;
    const programTemplatePanelMessage = { textContent: '' };
    const templateAttachInput = { value: '' };
    const btnAttachTags = { disabled: false };
    const templateVisibilityOptions = { classList: { add() {}, remove() {} } };
    const programTemplatePanel = {};
    const programTemplatePanelTitle = { textContent: '' };
    const programTemplatePanelDescription = { textContent: '' };
    const programTemplatePanelEmpty = { classList: { add() {}, remove() {} } };
    const programTemplateList = { innerHTML: '', querySelectorAll: () => [] };
    const API = 'http://example.test';
    const ATTACH_SAVE_DELAY_MS = 600;
    ${functionSection}
  `;
  vm.runInContext(bootstrap, context);
  vm.runInContext(scheduleSection, context);
  vm.runInContext(assignmentsSection, context);

  const panelMessage = vm.runInContext('programTemplatePanelMessage', context);
  const attachInput = vm.runInContext('templateAttachInput', context);
  const templateList = vm.runInContext('programTemplateList', context);
  const visibilityOptions = vm.runInContext('templateVisibilityOptions', context);
  const attachButton = vm.runInContext('btnAttachTags', context);
  const panel = vm.runInContext('programTemplatePanel', context);
  const panelTitle = vm.runInContext('programTemplatePanelTitle', context);
  const panelDescription = vm.runInContext('programTemplatePanelDescription', context);
  const panelEmpty = vm.runInContext('programTemplatePanelEmpty', context);

  const defaults: ManagerContext = {
    updatePanelAddButtonState: jest.fn(),
    handleTagifyAdd: jest.fn(),
    handleTagifyRemove: jest.fn(),
    setTemplatePanelMessage: jest.fn((message: string) => {
      panelMessage.textContent = message;
    }),
    renderPrograms: jest.fn(),
    renderTemplates: jest.fn(),
    fetchJson: jest.fn(),
    applyTemplateMetadataToCaches: jest.fn(),
    updateCachedProgramTemplateCount: jest.fn(() => false),
    normalizeTemplateAssociation: (template: any) => template,
    getTemplateSortValue: () => 0,
    extractAssignmentsFromResponse: (payload: any) => (Array.isArray(payload) ? payload : []),
    extractTemplateLibraryFromResponse: () => [],
    extractAssignmentTotalFromResponse: () => null,
    templateAttachInput: attachInput,
    programTemplatePanelMessage: panelMessage,
    programTemplatePanel: panel,
    programTemplatePanelTitle: panelTitle,
    programTemplatePanelDescription: panelDescription,
    programTemplatePanelEmpty: panelEmpty,
    programTemplateList: templateList,
    btnAttachTags: attachButton,
    templateVisibilityOptions: visibilityOptions,
    templates: vm.runInContext('templates', context),
    templateLibrary: vm.runInContext('templateLibrary', context),
    templateLibraryIndex: vm.runInContext('templateLibraryIndex', context),
    globalTemplates: vm.runInContext('globalTemplates', context),
    selectedTemplateIds: vm.runInContext('selectedTemplateIds', context),
    API: vm.runInContext('API', context),
    ATTACH_SAVE_DELAY_MS: vm.runInContext('ATTACH_SAVE_DELAY_MS', context),
  };

  Object.entries(defaults).forEach(([key, value]) => {
    context[key] = value;
  });

  Object.entries(overrides).forEach(([key, value]) => {
    context[key] = value;
  });

  return context;
}

describe('program template Tagify helpers', () => {
  it('preserves pending attachments for the active program when reinitializing Tagify', () => {
    const ctx = createManagerContext();
    vm.runInContext(
      `
        pendingAttach.add('alpha');
        pendingAttachState.set('alpha', { programId: '123', tagData: { value: 'alpha' } });
        pendingAttachProgramId = '123';
      `,
      ctx,
    );

    ctx.initTagifyForProgram('123', { preservePending: false });

    expect(vm.runInContext('Array.from(pendingAttach)', ctx)).toContain('alpha');
    expect(vm.runInContext('pendingAttachProgramId', ctx)).toBe('123');
    const instance = vm.runInContext('tagifyInstance', ctx);
    expect(instance).toBeInstanceOf(FakeTagify);
    expect(instance?.value.map((tag: any) => tag.value)).toContain('alpha');
  });

  it('clears pending attachments when switching to a different program', () => {
    const ctx = createManagerContext();
    vm.runInContext(
      `
        pendingAttach.add('beta');
        pendingAttachState.set('beta', { programId: '999', tagData: { value: 'beta' } });
        pendingAttachProgramId = '999';
      `,
      ctx,
    );

    ctx.initTagifyForProgram('123', { preservePending: false });

    expect(vm.runInContext('pendingAttach.size', ctx)).toBe(0);
    expect(vm.runInContext('pendingAttachProgramId', ctx)).toBeNull();
  });

  it('evaluates preserve callbacks at destruction time', () => {
    const ctx = createManagerContext();
    vm.runInContext(
      `
        pendingAttach.add('gamma');
        pendingAttachState.set('gamma', { programId: '42' });
        pendingAttachProgramId = '42';
      `,
      ctx,
    );

    const preserveFor42 = () => vm.runInContext("pendingAttachProgramId === '42'", ctx);

    ctx.destroyTagifyInstance({ preservePending: preserveFor42 });
    expect(vm.runInContext('pendingAttach.size', ctx)).toBe(1);

    vm.runInContext("pendingAttachProgramId = '7';", ctx);
    ctx.destroyTagifyInstance({ preservePending: preserveFor42 });
    expect(vm.runInContext('pendingAttach.size', ctx)).toBe(0);
  });

  it('restores pending tags that were queued without an explicit program id', () => {
    const ctx = createManagerContext();
    vm.runInContext(
      `
        pendingAttach.add('delta');
        pendingAttachState.set('delta', { tagData: { value: 'delta' } });
        pendingAttachProgramId = null;
      `,
      ctx,
    );

    ctx.initTagifyForProgram('555', { preservePending: false });

    expect(vm.runInContext('Array.from(pendingAttach)', ctx)).toContain('delta');
    const instance = vm.runInContext('tagifyInstance', ctx);
    expect(instance?.value.map((tag: any) => tag.value)).toContain('delta');
  });

  it('flushes sequential template attachments without requiring a reload', async () => {
    const fetchJson = jest.fn(async (url: string, options?: Record<string, any>) => {
      if (options?.method === 'POST') {
        const payload = options?.body ? JSON.parse(options.body) : {};
        return { template: { id: payload.template_id ?? null } };
      }
      return [];
    });

    const ctx = createManagerContext();
    ctx.fetchJson = fetchJson;
    ctx.renderPrograms = jest.fn();
    ctx.renderTemplates = jest.fn();
    ctx.updatePanelAddButtonState = jest.fn();
    ctx.initTagifyForProgram = jest.fn();
    ctx.destroyTagifyInstance = jest.fn();
    ctx.setTemplatePanelMessage = jest.fn();

    vm.runInContext(
      `
        selectedProgramId = 'program-1';
        pendingAttach.add('first');
        pendingAttachState.set('first', { programId: 'program-1' });
        pendingAttachProgramId = 'program-1';
      `,
      ctx,
    );

    await expect(ctx.flushPendingTemplateAttachments({ immediate: true })).resolves.toBe(true);

    expect(vm.runInContext('pendingAttach.size', ctx)).toBe(0);
    expect(vm.runInContext('pendingAttachState.size', ctx)).toBe(0);
    expect(vm.runInContext('pendingAttachProgramId', ctx)).toBeNull();
    expect(vm.runInContext('attachSaveTimeout', ctx)).toBeNull();
    expect(vm.runInContext('attachInFlightPromise', ctx)).toBeNull();

    vm.runInContext(
      `
        pendingAttach.add('second');
        pendingAttachState.set('second', { programId: 'program-1' });
        pendingAttachProgramId = 'program-1';
      `,
      ctx,
    );

    await expect(ctx.flushPendingTemplateAttachments({ immediate: true })).resolves.toBe(true);

    expect(fetchJson).toHaveBeenCalledTimes(4);
  });
});
