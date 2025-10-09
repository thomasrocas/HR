import ClinicalVisitsLanding from '../src/clinical-visits/ClinicalVisitsLanding';
import { User } from '../src/rbac';
import ReactStub = require('../test-utils/reactStub');

type TreeNode = any;

const collectText = (node: TreeNode): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  const { children } = node.props || {};
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
  const { children } = node.props || {};
  if (Array.isArray(children)) {
    return children.some(child => containsText(child, text));
  }
  if (children !== undefined) {
    return containsText(children, text);
  }
  return false;
};

const findNode = (node: TreeNode, predicate: (candidate: TreeNode) => boolean): TreeNode | null => {
  if (!node) return null;
  if (predicate(node)) return node;
  const { children } = node.props || {};
  if (Array.isArray(children)) {
    for (const child of children) {
      const result = findNode(child, predicate);
      if (result) return result;
    }
  } else if (children !== undefined) {
    return findNode(children, predicate);
  }
  return null;
};

const flushPromises = async () => {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
};

const advanceTimers = async (cycles = 1) => {
  for (let i = 0; i < cycles; i += 1) {
    jest.runOnlyPendingTimers();
    await flushPromises();
  }
};

describe('ClinicalVisitsLanding', () => {
  const adminUser: User = {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@example.com',
    roles: ['admin'],
    status: 'active',
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('supports partial sub-unit filtering in combination with other filters', async () => {
    const root = (ReactStub as any).__createRoot(ClinicalVisitsLanding, { currentUser: adminUser });

    await advanceTimers(2);

    expect(containsText(root.tree, 'Martha Diaz')).toBe(true);
    expect(containsText(root.tree, 'Jordan Mills')).toBe(true);

    const statusSelect = findNode(root.tree, (node: TreeNode) => node?.props?.id === 'visit-status');
    expect(statusSelect).not.toBeNull();
    statusSelect!.props.onChange?.({ target: { value: 'scheduled' } });

    await advanceTimers(2);
    expect(containsText(root.tree, 'Jordan Mills')).toBe(false);

    const orgSelect = findNode(root.tree, (node: TreeNode) => node?.props?.id === 'visit-organization');
    expect(orgSelect).not.toBeNull();
    orgSelect!.props.onChange?.({ target: { value: 'Home Health' } });

    await advanceTimers(2);
    expect(containsText(root.tree, 'Kai Watanabe')).toBe(false);

    const subUnitInput = findNode(root.tree, (node: TreeNode) => node?.props?.id === 'visit-sub-unit');
    expect(subUnitInput).not.toBeNull();
    subUnitInput!.props.onChange?.({ target: { value: 'mate' } });
    subUnitInput!.props.onBlur?.({ target: { value: 'mate' } });

    await advanceTimers(2);

    expect(containsText(root.tree, 'Martha Diaz')).toBe(true);
    expect(containsText(root.tree, 'Amelia Chen')).toBe(false);

    const tbody = findNode(root.tree, (node: TreeNode) => node?.type === 'tbody');
    expect(tbody).not.toBeNull();
    const rows = Array.isArray(tbody!.props?.children)
      ? tbody!.props.children.filter(Boolean)
      : [tbody!.props?.children].filter(Boolean);
    expect(rows).toHaveLength(1);
    expect(collectText(rows[0])).toContain('San Mateo Acute');
  });
});
