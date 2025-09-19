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

const functionSection = managerSource.slice(functionsSectionStart, functionsSectionEnd);

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
  const templateInput = { value: '' };
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
    templates: [],
    templateLibrary: [],
    templateLibraryIndex: new Map(),
    templateAttachInput: templateInput,
    updatePanelAddButtonState: jest.fn(),
    handleTagifyAdd: jest.fn(),
    handleTagifyRemove: jest.fn(),
    window: { Tagify: FakeTagify },
    ...overrides,
  };

  vm.createContext(context);
  const bootstrap = `
    let tagifyInstance = null;
    let suppressTagifyEventsFlag = false;
    const pendingAttach = new Set();
    const pendingAttachState = new Map();
    let pendingAttachProgramId = null;
    let attachSaveTimeout = null;
    ${functionSection}
  `;
  vm.runInContext(bootstrap, context);
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
});
