-- One row per user holding their whole budget as JSON.
create table if not exists public.budgets (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.budgets enable row level security;

create policy "Own budget only" on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Signed-in users need table access (row level security still limits them to their own row).
grant select, insert, update, delete on public.budgets to authenticated;
