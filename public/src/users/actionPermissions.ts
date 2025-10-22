import { can, hasRole, Role, User } from '../rbac';

export const ALL_ROLES: Role[] = ['admin', 'manager', 'viewer', 'trainee'];
export const MANAGER_EDITABLE_ROLES: Role[] = ['viewer', 'trainee'];

export interface UserActionAvailability {
  canInvite: boolean;
  canEdit: boolean;
  canManageRoles: boolean;
  canAssignPrograms: boolean;
  canDeactivate: boolean;
  canReactivate: boolean;
  canArchive: boolean;
  toggleableRoles: Role[];
  lockedRoles: Role[];
  managerOnly: boolean;
}

export const getActionAvailability = (
  currentUser: User,
  targetUser?: User | null,
): UserActionAvailability => {
  const canManage = can(currentUser, 'manageRoles', 'user');
  const isAdmin = hasRole(currentUser, 'admin');
  const isManager = hasRole(currentUser, 'manager');
  const managerOnly = !isAdmin && isManager;

  const toggleableRoles = canManage
    ? managerOnly
      ? MANAGER_EDITABLE_ROLES
      : ALL_ROLES
    : [];

  const lockedRoles = managerOnly && targetUser
    ? targetUser.roles.filter(role => !MANAGER_EDITABLE_ROLES.includes(role))
    : [];

  return {
    canInvite: can(currentUser, 'create', 'user'),
    canEdit: can(currentUser, 'update', 'user'),
    canManageRoles: canManage,
    canAssignPrograms: can(currentUser, 'assignPrograms', 'user'),
    canDeactivate: Boolean(
      targetUser && targetUser.status !== 'suspended' && can(currentUser, 'deactivate', 'user'),
    ),
    canReactivate: Boolean(
      targetUser && targetUser.status === 'suspended' && can(currentUser, 'reactivate', 'user'),
    ),
    canArchive: Boolean(
      targetUser && targetUser.status !== 'archived' && can(currentUser, 'archive', 'user'),
    ),
    toggleableRoles,
    lockedRoles,
    managerOnly,
  };
};