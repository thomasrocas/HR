/**
 * Tiny RBAC helper with static policy map.
 * Use `can(user,'create','user')` or `hasRole(user,'admin')`.
 */
export type Role = 'admin' | 'manager' | 'trainee' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: 'active' | 'pending' | 'suspended' | 'archived';
}

const policy: Record<string, Record<string, Role[]>> = {
  user: {
    create: ['admin'],
    read: ['admin', 'manager', 'viewer', 'trainee'],
    update: ['admin'],
    manageRoles: ['admin', 'manager'],
    assignPrograms: ['admin', 'manager'],
    deactivate: ['admin'],
    reactivate: ['admin'],
    archive: ['admin'],
  },
  program: {
    create: ['admin', 'manager'],
    read: ['admin', 'manager', 'viewer', 'trainee'],
    update: ['admin', 'manager'],
    publish: ['admin', 'manager'],
    deprecate: ['admin', 'manager'],
    archive: ['admin'],
    restore: ['admin'],
    delete: ['admin'],
    assignToUser: ['admin', 'manager'],
  },
  template: {
    create: ['admin', 'manager'],
    read: ['admin', 'manager', 'viewer', 'trainee'],
    update: ['admin', 'manager'],
    delete: ['admin', 'manager'],
  },
};

export const hasRole = (user: User, ...roles: Role[]) =>
  roles.some(r => user.roles.includes(r));

export const can = (
  user: User,
  action: string,
  resource: keyof typeof policy,
): boolean =>
  Boolean(policy[resource]?.[action]?.some(role => user.roles.includes(role)));
