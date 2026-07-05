create table public.bot_pending_actions (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.bot_pending_actions enable row level security;
