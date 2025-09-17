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
with seed_data (week_number, label, notes, sort_order, status, program_id) as (
  values
    (1, 'Welcome & Introductions', 'Greet the new hire and review the agenda.', 1, 'published', 'sample_onboarding'),
    (1, 'IT & Accounts Setup', 'Provision laptop, email, and internal tools.', 2, 'published', 'sample_onboarding'),
    (2, 'Meet Your Mentor', 'Schedule a mentor pairing conversation.', 3, 'published', 'sample_onboarding'),
    (1, 'Remote Work Best Practices', 'Share communication norms and meeting cadence.', 1, 'published', 'sample_remote_onboarding'),
    (2, 'Virtual Team Lunch', 'Host a remote-friendly get-to-know-you lunch.', 2, 'published', 'sample_remote_onboarding')
), inserted as (
  insert into public.program_task_templates (week_number, label, notes, sort_order, status)
  select week_number, label, notes, sort_order, status
  from seed_data s
  where not exists (
    select 1
    from public.program_task_templates existing
    where existing.week_number = s.week_number
      and existing.label = s.label
      and coalesce(existing.sort_order, -1) = coalesce(s.sort_order, -1)
  )
  returning template_id, week_number, label, sort_order
)
insert into public.program_template_links (template_id, program_id)
select template_id, program_id
from (
  select i.template_id, s.program_id
  from inserted i
  join seed_data s
    on s.week_number = i.week_number
   and s.label = i.label
   and coalesce(s.sort_order, -1) = coalesce(i.sort_order, -1)
  union all
  select t.template_id, s.program_id
  from seed_data s
  join public.program_task_templates t
    on t.week_number = s.week_number
   and t.label = s.label
   and coalesce(t.sort_order, -1) = coalesce(s.sort_order, -1)
  where not exists (
    select 1
    from inserted i
    where i.template_id = t.template_id
  )
) all_templates
on conflict do nothing;

commit;
