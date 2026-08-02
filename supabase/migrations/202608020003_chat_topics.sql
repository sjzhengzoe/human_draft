create table if not exists public.official_chat_topics (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(btrim(content)) between 1 and 120),
  sort_order bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists official_chat_topics_content_unique
on public.official_chat_topics(lower(btrim(content)));

create index if not exists official_chat_topics_active_sort_idx
on public.official_chat_topics(is_active, sort_order, created_at);

create table if not exists public.user_chat_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  official_topic_id uuid references public.official_chat_topics(id) on delete set null,
  content text not null check (char_length(btrim(content)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_chat_topics_official_unique
on public.user_chat_topics(user_id, official_topic_id)
where official_topic_id is not null;

create index if not exists user_chat_topics_user_created_idx
on public.user_chat_topics(user_id, created_at desc);

drop trigger if exists official_chat_topics_set_updated_at on public.official_chat_topics;
create trigger official_chat_topics_set_updated_at
before update on public.official_chat_topics
for each row execute function public.set_updated_at();

drop trigger if exists user_chat_topics_set_updated_at on public.user_chat_topics;
create trigger user_chat_topics_set_updated_at
before update on public.user_chat_topics
for each row execute function public.set_updated_at();

alter table public.official_chat_topics enable row level security;
alter table public.user_chat_topics enable row level security;

grant select, insert, update, delete
on table public.official_chat_topics, public.user_chat_topics
to service_role;

insert into public.official_chat_topics (id, content, sort_order)
values
  ('20000000-0000-4000-8000-000000000001', '最近有什么小事，让你觉得生活很可爱？', 1000),
  ('20000000-0000-4000-8000-000000000002', '如果可以立刻学会一项技能，你会选什么？', 2000),
  ('20000000-0000-4000-8000-000000000003', '你最近改变了哪个曾经很笃定的想法？', 3000),
  ('20000000-0000-4000-8000-000000000004', '哪一顿饭是你记忆里最温暖的一顿？', 4000),
  ('20000000-0000-4000-8000-000000000005', '小时候的你，会喜欢现在的自己吗？', 5000),
  ('20000000-0000-4000-8000-000000000006', '最近哪一刻让你觉得自己正在进步？', 6000),
  ('20000000-0000-4000-8000-000000000007', '如果明天完全不用工作，你想怎样度过？', 7000),
  ('20000000-0000-4000-8000-000000000008', '你最想和重要的人一起完成哪件小事？', 8000),
  ('20000000-0000-4000-8000-000000000009', '哪一种声音最能让你安心？', 9000),
  ('20000000-0000-4000-8000-000000000010', '最近有什么新发现，想马上分享给别人？', 10000),
  ('20000000-0000-4000-8000-000000000011', '如果能重看人生中的一天，你会选哪一天？', 11000),
  ('20000000-0000-4000-8000-000000000012', '你希望一年后的自己记住现在的什么？', 12000)
on conflict do nothing;
