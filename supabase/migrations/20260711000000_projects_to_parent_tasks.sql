-- Fold projects into parent tasks: a task with subtasks IS a project.
-- Each project row becomes a top-level task (reusing the project's uuid as
-- the task id, so re-parenting its tasks is a single UPDATE); the project's
-- area name survives as a context tag; outcome moves to the new
-- tasks.outcome column. Then projects and areas are dropped.
--
-- Ordering is load-bearing: tasks.project_id is ON DELETE CASCADE, so the
-- column must be dropped BEFORE the projects table, or every project task
-- would be deleted with it.

alter table public.tasks add column outcome text;

-- Projects become parent tasks.
insert into public.tasks
  (id, space_id, created_by, title, outcome, status,
   context_tags, sort_order, completed_at, created_at)
select
  p.id,
  p.space_id,
  s.created_by,
  p.name,
  p.outcome,
  case p.status
    when 'active'    then 'next'
    when 'someday'   then 'someday'
    when 'on_hold'   then 'someday'
    when 'completed' then 'done'
    when 'archived'  then 'cancelled'
  end,
  case when a.name is not null then array[lower(a.name)] else '{}' end,
  p.sort_order,
  case when p.status = 'completed' then coalesce(p.completed_at, now()) end,
  p.created_at
from public.projects p
join public.spaces s on s.id = p.space_id
left join public.areas a on a.id = p.area_id;

-- Re-parent each project's top-level tasks under the new parent task. Tasks
-- that already had a parent keep it (they become depth 2 under the project
-- parent via their own parent).
update public.tasks
set parent_task_id = project_id
where project_id is not null
  and parent_task_id is null
  and id <> project_id;

alter table public.tasks drop column project_id;

drop table public.projects;
drop table public.areas;
