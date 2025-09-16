import { getActionAvailability, ALL_ROLES, MANAGER_EDITABLE_ROLES } from '../src/users/actionPermissions';
import { Role, User } from '../src/rbac';

const buildUser = (roles: Role[], status: User['status'] = 'active'): User => ({
  id: 'user-id',
  name: 'Test User',
  email: 'test@example.com',
  roles,
  status,
});

const buildActor = (roles: Role[]): User => ({
  id: 'actor-id',
  name: 'Actor',
  email: 'actor@example.com',
  roles,
  status: 'active',
});

describe('getActionAvailability', () => {
  it('grants admins full lifecycle controls', () => {
    const admin = buildActor(['admin']);
    const targetActive = buildUser(['viewer'], 'active');
    const targetSuspended = buildUser(['viewer'], 'suspended');

    const activeAvailability = getActionAvailability(admin, targetActive);
    const suspendedAvailability = getActionAvailability(admin, targetSuspended);

    expect(activeAvailability.canInvite).toBe(true);
    expect(activeAvailability.canEdit).toBe(true);
    expect(activeAvailability.canManageRoles).toBe(true);
    expect(activeAvailability.canAssignPrograms).toBe(true);
    expect(activeAvailability.canDeactivate).toBe(true);
    expect(activeAvailability.canReactivate).toBe(false);
    expect(activeAvailability.toggleableRoles).toEqual(ALL_ROLES);
    expect(activeAvailability.lockedRoles).toEqual([]);
    expect(activeAvailability.managerOnly).toBe(false);

    expect(suspendedAvailability.canReactivate).toBe(true);
  });

  it('limits managers to viewer/trainee role toggles', () => {
    const manager = buildActor(['manager']);
    const target = buildUser(['manager', 'viewer'], 'active');

    const availability = getActionAvailability(manager, target);

    expect(availability.canInvite).toBe(false);
    expect(availability.canEdit).toBe(false);
    expect(availability.canManageRoles).toBe(true);
    expect(availability.canAssignPrograms).toBe(true);
    expect(availability.canDeactivate).toBe(false);
    expect(availability.canReactivate).toBe(false);
    expect(availability.toggleableRoles).toEqual(MANAGER_EDITABLE_ROLES);
    expect(availability.lockedRoles).toContain('manager');
    expect(availability.managerOnly).toBe(true);
  });

  it('treats viewers as read-only users', () => {
    const viewer = buildActor(['viewer']);
    const targetActive = buildUser(['viewer'], 'active');
    const targetSuspended = buildUser(['viewer'], 'suspended');

    const activeAvailability = getActionAvailability(viewer, targetActive);
    const suspendedAvailability = getActionAvailability(viewer, targetSuspended);

    expect(activeAvailability.canInvite).toBe(false);
    expect(activeAvailability.canEdit).toBe(false);
    expect(activeAvailability.canManageRoles).toBe(false);
    expect(activeAvailability.canAssignPrograms).toBe(false);
    expect(activeAvailability.canDeactivate).toBe(false);
    expect(activeAvailability.canReactivate).toBe(false);
    expect(activeAvailability.toggleableRoles).toEqual([]);
    expect(activeAvailability.lockedRoles).toEqual([]);
    expect(activeAvailability.managerOnly).toBe(false);

    expect(suspendedAvailability.canReactivate).toBe(false);
  });
});
