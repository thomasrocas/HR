/**
 * Lightweight Playwright tests.
 * Run with: npx playwright test
 */
import { test, expect } from '@playwright/test';
import { seed } from '../src/api';
import UsersLanding from '../src/users/UsersLanding';

test.describe('RBAC visibility', () => {
  test('manager cannot see Add User button', async ({ mount }) => {
    const component = await mount(<UsersLanding currentUser={seed.users[1]} />);
    await expect(component.getByText('Add User')).toHaveCount(0);
  });

  test('admin can invite user', async ({ mount }) => {
    const component = await mount(<UsersLanding currentUser={seed.users[0]} />);
    await component.getByText('Add User').click();
    await component.getByPlaceholder('Full name').fill('New Person');
    await component.getByText('Send Invite').click();
    await expect(component.getByText('Invite sent')).toBeVisible();
  });
});

test('publish program disabled for viewer', async ({ mount }) => {
  const ProgramsLanding = (await import('../src/programs/ProgramsLanding')).default;
  const component = await mount(<ProgramsLanding currentUser={seed.users[3]} />);
  await expect(component.getByText('Publish')).toHaveCount(0);
});
