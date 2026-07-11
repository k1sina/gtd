-- Bulk sort_order update for drag-and-drop reordering: one round trip even
-- when a never-ordered list gets renumbered. SECURITY INVOKER, so the tasks
-- RLS update policy decides row by row — ids outside the caller's spaces
-- simply match nothing.

create or replace function public.reorder_tasks(p_ids uuid[], p_orders double precision[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.tasks t
  set sort_order = x.ord
  from unnest(p_ids, p_orders) as x(id, ord)
  where t.id = x.id;
$$;

-- Functions default to EXECUTE for PUBLIC (see 20260707000002).
revoke execute on function public.reorder_tasks(uuid[], double precision[]) from public, anon;
grant execute on function public.reorder_tasks(uuid[], double precision[]) to authenticated;
