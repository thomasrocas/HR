jest.mock('react', () => require('../test-utils/reactStub'));

import UsersLanding from '../src/users/UsersLanding';
import { User } from '../src/rbac';
import ReactStub = require('../test-utils/reactStub');

const apiModule = jest.requireActual('../src/api') as typeof import('../src/api');

type TreeNode = any;

const collectText = (node: TreeNode): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  const children = node.props?.children;
  if (Array.isArray(children)) {
    return children.map(collectText).join('');
  }
  if (children !== undefined) {
    return collectText(children);
  }
  return '';
};

const containsText = (node: TreeNode, text: string): boolean => {
  if (!node) return false;
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node).includes(text);
  }
  if (node.props?.children === undefined) {
    return false;
  }
  const children = node.props.children;
  if (Array.isArray(children)) {
    return children.some(child => containsText(child, text));
  }
  return containsText(children, text);
};

const findButtonByLabel = (node: TreeNode, label: string): TreeNode | null => {
  if (!node) return null;
  if (node.type === 'button') {
    const aria = node.props?.['aria-label'];
    const name = aria || collectText(node);
    if (typeof name === 'string' && name.toLowerCase() === label.toLowerCase()) {
      return node;
    }
  }
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const result = findButtonByLabel(child, label);
      if (result) return result;
    }
  } else if (children !== undefined) {
    return findButtonByLabel(children, label);
  }
  return null;
};

const flushPromises = async () => {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
};

describe('UsersLanding program assignment flow', () => {
  const adminUser: User = {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@example.com',
    roles: ['admin'],
    status: 'active',
  };

  let originalSeedUsers: typeof apiModule.seed.users;

  beforeEach(() => {
    originalSeedUsers = JSON.parse(JSON.stringify(apiModule.seed.users)) as typeof apiModule.seed.users;
    (globalThis as any).window = globalThis as any;
    (globalThis as any).confirm = jest.fn(() => true);
    (globalThis as any).alert = jest.fn();
    jest.useRealTimers();
  });

  afterEach(() => {
    apiModule.seed.users = JSON.parse(JSON.stringify(originalSeedUsers)) as typeof apiModule.seed.users;
    jest.useRealTimers();
  });

  it('removes an assigned program after confirmation', async () => {
    const assignedUser = {
      id: 'user-1',
      name: 'Trainee User',
      email: 'trainee@example.com',
      roles: ['trainee'],
      status: 'active',
      programs: [
        { id: 'orientation', name: 'Orientation Program' },
      ],
    } as unknown as User;

    const refreshedUser = {
      ...assignedUser,
      programs: [],
    } as unknown as User;

    const root = (ReactStub as any).__createRoot(UsersLanding, { currentUser: adminUser });
    root.hooks[0] = [assignedUser];
    root.render();
    await flushPromises();

    expect(containsText(root.tree, 'Orientation Program')).toBe(true);

    const removeButton = findButtonByLabel(root.tree, 'Remove Orientation Program');
    expect(removeButton).not.toBeNull();

    const alertMock = jest.fn();
    (globalThis as any).alert = alertMock;
    apiModule.seed.users = [refreshedUser as unknown as typeof apiModule.seed.users[number]];

    jest.useFakeTimers();
    void removeButton.props.onClick({ preventDefault() {}, stopPropagation() {} });
    jest.runAllTimers();
    await flushPromises();
    jest.useRealTimers();

    root.hooks[0] = [refreshedUser];
    root.render();
    await flushPromises();

    expect((globalThis as any).confirm).toHaveBeenCalledWith('Remove Orientation Program from Trainee User?');
    expect(alertMock).toHaveBeenCalledWith('Orientation Program removed from Trainee User');
    expect(containsText(root.tree, 'Orientation Program')).toBe(false);
  });
});
