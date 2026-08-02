create table if not exists public.user_hidden_official_chat_topics (
  user_id uuid not null references public.app_users(id) on delete cascade,
  official_topic_id uuid not null references public.official_chat_topics(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, official_topic_id)
);

create index if not exists user_hidden_official_topics_created_idx
on public.user_hidden_official_chat_topics(user_id, created_at desc);

alter table public.user_hidden_official_chat_topics enable row level security;

grant select, insert, delete
on table public.user_hidden_official_chat_topics
to service_role;
