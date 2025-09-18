jest.mock('../src/api', () => ({
  getPrograms: jest.fn(),
  publishProgram: jest.fn(),
  deprecateProgram: jest.fn(),
  archiveProgram: jest.fn(),
  restoreProgram: jest.fn(),
  getProgramTemplates: jest.fn(),
  searchTemplates: jest.fn(),
  attachTemplateToProgram: jest.fn(),
  detachTemplateFromProgram: jest.fn(),
}));

import type { Program, Template } from '../src/api';
import type { User } from '../src/rbac';
import type { ReactStubExports } from '../test-utils/reactStub';

type ProgramsLandingComponent = typeof import('../src/programs/ProgramsLanding').default;

const ReactStub = require('../test-utils/reactStub') as ReactStubExports;
const ProgramsLanding = require('../src/programs/ProgramsLanding').default as ProgramsLandingComponent;
const mockedApi = require('../src/api') as jest.Mocked<typeof import('../src/api')>;

const adminUser: User = {
  id: 'admin',
  name: 'Admin User',
  email: 'admin@example.com',
  roles: ['admin'],
  status: 'active',
};

const baseProgram: Program = {
  id: 'program-1',
  name: 'Launch Program',
  version: '1.0',
  status: 'published',
  owner: 'Owner',
  updatedAt: '2024-05-01',
  assignedCount: 5,
};

afterEach(() => {
  ReactStub.__cleanup();
  jest.clearAllMocks();
});

const findButtonByText = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes(text)) ?? null;

const expectTemplateCardPresence = (container: HTMLElement, testId: string, templateName: string) => {
  const cards = Array.from(container.querySelectorAll(`[data-testid="${testId}"]`));
  return cards.some(card => card.textContent?.includes(templateName));
};

const switchToTemplatesTab = async (container: HTMLElement) => {
  const tabButton = findButtonByText(container, 'Templates');
  if (!tabButton) {
    throw new Error('Templates tab button not found');
  }
  tabButton.dispatchEvent({ type: 'click' } as any);
  await ReactStub.__waitForIdle();
};

describe('ProgramsLanding template associations', () => {
  it('attaches a template and displays success feedback', async () => {
    const attachedTemplate: Template = {
      id: 'tmpl-1',
      programId: baseProgram.id,
      name: 'Existing Template',
      category: 'General',
      updatedAt: '2024-05-10',
      status: 'published',
    };
    const attachableTemplate: Template = {
      id: 'tmpl-2',
      programId: '',
      name: 'New Hire Checklist',
      category: 'Operations',
      updatedAt: '2024-05-12',
      status: 'draft',
    };

    mockedApi.getPrograms.mockResolvedValue({ data: [baseProgram], meta: { total: 1, page: 1 } });
    mockedApi.getProgramTemplates
      .mockResolvedValueOnce({ data: [attachedTemplate] })
      .mockResolvedValueOnce({ data: [attachedTemplate, { ...attachableTemplate, programId: baseProgram.id }] });
    mockedApi.searchTemplates
      .mockResolvedValueOnce({ data: [attachableTemplate] })
      .mockResolvedValueOnce({ data: [{ ...attachableTemplate, programId: baseProgram.id }] });
    mockedApi.attachTemplateToProgram.mockImplementation(async () => ({
      ...attachableTemplate,
      programId: baseProgram.id,
    }));

    const { container } = ReactStub.__render(ProgramsLanding, { currentUser: adminUser });
    await ReactStub.__waitForIdle();

    await switchToTemplatesTab(container);

    expect(mockedApi.getPrograms).toHaveBeenCalled();
    expect(mockedApi.getProgramTemplates).toHaveBeenCalledWith(baseProgram.id);
    expect(mockedApi.searchTemplates).toHaveBeenCalled();
    expect(expectTemplateCardPresence(container, 'attached-template-card', attachedTemplate.name)).toBe(true);
    expect(expectTemplateCardPresence(container, 'available-template-card', attachableTemplate.name)).toBe(true);

    const attachButton = findButtonByText(container, 'Attach');
    expect(attachButton).not.toBeNull();
    attachButton!.dispatchEvent({ type: 'click' } as any);

    await ReactStub.__waitForIdle();

    expect(mockedApi.attachTemplateToProgram).toHaveBeenCalledWith(baseProgram.id, attachableTemplate.id);
    expect(expectTemplateCardPresence(container, 'attached-template-card', attachableTemplate.name)).toBe(true);
    expect(expectTemplateCardPresence(container, 'available-template-card', attachableTemplate.name)).toBe(false);

    const feedback = container.querySelector('[role="status"]');
    expect(feedback?.textContent).toContain('attached');
  });

  it('detaches a template and refreshes the attached list', async () => {
    const primaryTemplate: Template = {
      id: 'tmpl-3',
      programId: baseProgram.id,
      name: 'Orientation Pack',
      category: 'People Ops',
      updatedAt: '2024-05-01',
      status: 'published',
    };
    const secondaryTemplate: Template = {
      id: 'tmpl-4',
      programId: baseProgram.id,
      name: 'Security Briefing',
      category: 'Security',
      updatedAt: '2024-05-03',
      status: 'published',
    };

    mockedApi.getPrograms.mockResolvedValue({ data: [baseProgram], meta: { total: 1, page: 1 } });
    mockedApi.getProgramTemplates
      .mockResolvedValueOnce({ data: [primaryTemplate, secondaryTemplate] })
      .mockResolvedValueOnce({ data: [secondaryTemplate] });
    mockedApi.searchTemplates.mockResolvedValue({ data: [] });
    mockedApi.detachTemplateFromProgram.mockImplementation(async () => ({
      ...primaryTemplate,
      programId: '',
    }));

    const { container } = ReactStub.__render(ProgramsLanding, { currentUser: adminUser });
    await ReactStub.__waitForIdle();

    await switchToTemplatesTab(container);

    const detachButton = findButtonByText(container, 'Detach');
    expect(detachButton).not.toBeNull();
    detachButton!.dispatchEvent({ type: 'click' } as any);

    await ReactStub.__waitForIdle();

    expect(mockedApi.detachTemplateFromProgram).toHaveBeenCalledWith(baseProgram.id, primaryTemplate.id);
    expect(expectTemplateCardPresence(container, 'attached-template-card', primaryTemplate.name)).toBe(false);
    const feedback = container.querySelector('[role="status"]');
    expect(feedback?.textContent).toContain('detached');
  });

  it('shows an error message when detaching fails', async () => {
    const failingTemplate: Template = {
      id: 'tmpl-5',
      programId: baseProgram.id,
      name: 'Critical Template',
      category: 'Compliance',
      updatedAt: '2024-05-06',
      status: 'published',
    };

    mockedApi.getPrograms.mockResolvedValue({ data: [baseProgram], meta: { total: 1, page: 1 } });
    mockedApi.getProgramTemplates.mockResolvedValue({ data: [failingTemplate] });
    mockedApi.searchTemplates.mockResolvedValue({ data: [] });
    mockedApi.detachTemplateFromProgram.mockRejectedValue(new Error('Network error'));

    const { container } = ReactStub.__render(ProgramsLanding, { currentUser: adminUser });
    await ReactStub.__waitForIdle();

    await switchToTemplatesTab(container);

    const detachButton = findButtonByText(container, 'Detach');
    expect(detachButton).not.toBeNull();
    detachButton!.dispatchEvent({ type: 'click' } as any);

    await ReactStub.__waitForIdle();

    expect(mockedApi.detachTemplateFromProgram).toHaveBeenCalledWith(baseProgram.id, failingTemplate.id);
    const errorFeedback = container.querySelector('[role="alert"]');
    expect(errorFeedback?.textContent).toContain('Unable to detach');
    expect(expectTemplateCardPresence(container, 'attached-template-card', failingTemplate.name)).toBe(true);
  });
});
