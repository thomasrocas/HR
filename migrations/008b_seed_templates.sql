-- 008b_seed_templates.sql
-- Seed sample templates and attach them to demo programs.

begin;

-- Ensure sample programs exist for attaching templates.
insert into public.programs (program_id, title, total_weeks, description, created_at)
values
  ('sample_onboarding', 'Sample Onboarding Program', 4, 'Baseline orientation flow used for demo accounts.', now()),
  ('sample_remote_onboarding', 'Sample Remote Onboarding', 3, 'Remote-friendly onboarding milestones.', now())
on conflict (program_id) do nothing;

-- Seed template records.
insert into public.program_task_templates (template_id, week_number, label, notes, sort_order, status)
values
  ('11111111-2222-4333-8444-555555555551', 1, 'Welcome & Introductions', 'Greet the new hire and review the agenda.', 1, 'published'),
  ('11111111-2222-4333-8444-555555555552', 1, 'IT & Accounts Setup', 'Provision laptop, email, and internal tools.', 2, 'published'),
  ('11111111-2222-4333-8444-555555555553', 2, 'Meet Your Mentor', 'Schedule a mentor pairing conversation.', 3, 'published'),
  ('11111111-2222-4333-8444-555555555554', 1, 'Remote Work Best Practices', 'Share communication norms and meeting cadence.', 1, 'published'),
  ('11111111-2222-4333-8444-555555555555', 2, 'Virtual Team Lunch', 'Host a remote-friendly get-to-know-you lunch.', 2, 'published')
on conflict (template_id) do nothing;

-- Attach templates to their respective programs.
insert into public.program_template_links (template_id, program_id)
values
  ('11111111-2222-4333-8444-555555555551', 'sample_onboarding'),
  ('11111111-2222-4333-8444-555555555552', 'sample_onboarding'),
  ('11111111-2222-4333-8444-555555555553', 'sample_onboarding'),
  ('11111111-2222-4333-8444-555555555554', 'sample_remote_onboarding'),
  ('11111111-2222-4333-8444-555555555555', 'sample_remote_onboarding')
on conflict do nothing;

commit;
