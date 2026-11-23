-- One row per user holding their whole budget as JSON.
create table if not exists public.budgets (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.budgets enable row level security;

-- Each signed-in user can only read and write their own row.
drop policy if exists "Own budget only" on public.budgets;
create policy "read own budget" on public.budgets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "add own budget" on public.budgets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "change own budget" on public.budgets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own budget" on public.budgets
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Signed-in users need table access (row level security still limits them to their own row).
grant select, insert, update, delete on public.budgets to authenticated;
