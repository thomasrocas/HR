# Manual & Automated Test Plan

## RBAC
- [ ] Admin sees all toolbar buttons on `/admin/users` and `/programs`.
- [ ] Manager cannot see “Add User”; can see “New Program”.
- [ ] Viewer/Trainee see read-only tables; action buttons hidden/disabled.

## User lifecycle
- [ ] Invite user -> appears with `pending` status.
- [ ] Assign program to user -> chip appears immediately (optimistic UI).
- [ ] Deactivate/Re-activate -> status toggles accordingly.
- [ ] Archive -> user removed from default list.

## Program lifecycle
- [ ] Draft program can be published; cannot be archived until published.
- [ ] Publishing requires at least one task (mock validation).
- [ ] Deprecating removes from new assignments.
- [ ] Archive hides program unless “Include archived” is toggled.

## Error states
- [ ] 403 responses show toast “Not authorized” and button remains disabled.
- [ ] 422 shows inline field errors.
- [ ] 500 shows retry option.

## Accessibility
- [ ] Tab navigation cycles through modals, focus ring visible.
- [ ] All icons/buttons have accessible labels.
- [ ] Tooltips appear on disabled controls describing missing permission.
