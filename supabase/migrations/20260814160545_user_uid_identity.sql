-- Make the public numeric UID the only application-level user identity.
-- app_users.id remains an internal row key and is never exposed or referenced
-- by application-owned rows after this migration.

select pg_advisory_xact_lock(hashtextextended('public.app_users:uid-migration', 0));

create temporary table uid_migration_state (
  was_legacy boolean not null
) on commit drop;

insert into uid_migration_state(was_legacy)
select exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and column_name = 'user_id'
    and udt_name = 'uuid'
);

create sequence if not exists public.app_user_uid_sequence
  as bigint
  minvalue 0
  maxvalue 89999999
  start with 0
  increment by 1
  no cycle;

create or replace function public.generate_app_user_uid()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select (
    1000000000::bigint
    + nextval('public.app_user_uid_sequence'::regclass) * 100
    + floor(random() * 100)::bigint
  )::text;
$$;

revoke all on function public.generate_app_user_uid() from public, anon, authenticated;
grant execute on function public.generate_app_user_uid() to service_role;
revoke all on sequence public.app_user_uid_sequence from public, anon, authenticated;
grant usage, select on sequence public.app_user_uid_sequence to service_role;

alter table public.app_users add column if not exists uid text;

do $$
declare
  account_count integer;
  admin_count integer;
  missing_uid_count integer;
begin
  select count(*) into account_count from public.app_users;
  select count(*) into missing_uid_count from public.app_users where uid is null;

  if account_count = 0 then
    return;
  end if;

  if missing_uid_count = 0 then
    if (select count(*) from public.app_users where uid in ('10000', '20000')) <> 2 then
      raise exception 'UID migration expected the two reserved UIDs to remain assigned';
    end if;
    return;
  end if;

  if account_count <> 2 or missing_uid_count <> 2 then
    raise exception 'UID migration expected exactly two unmigrated application accounts';
  end if;

  select count(*) into admin_count
  from public.app_users
  where display_name = '顾飞飞';

  if admin_count <> 1 then
    raise exception 'UID migration could not identify exactly one administrator account';
  end if;

  update public.app_users
  set uid = '10000'
  where display_name = '顾飞飞'
    and uid is distinct from '10000';

  update public.app_users
  set uid = '20000'
  where display_name <> '顾飞飞'
    and uid is distinct from '20000';

  if (select count(*) from public.app_users where uid in ('10000', '20000')) <> 2 then
    raise exception 'UID migration did not assign both reserved UIDs';
  end if;
end
$$;

alter table public.app_users
  alter column uid set default public.generate_app_user_uid();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and conname = 'app_users_uid_format_check'
  ) then
    alter table public.app_users
      add constraint app_users_uid_format_check
      check (uid in ('10000', '20000') or uid ~ '^[1-9][0-9]{9}$') not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and conname = 'app_users_uid_key'
  ) then
    alter table public.app_users
      add constraint app_users_uid_key unique (uid);
  end if;
end
$$;

alter table public.app_users validate constraint app_users_uid_format_check;
alter table public.app_users alter column uid set not null;

create or replace function public.resolve_uid_for_migration(source_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select app_user.uid
  from public.app_users as app_user
  where app_user.id = source_id;
$$;

revoke all on function public.resolve_uid_for_migration(uuid)
  from public, anon, authenticated;

create temporary table uid_saved_foreign_keys on commit drop as
select
  namespace_info.nspname as table_schema,
  table_info.relname as table_name,
  constraint_info.conname as constraint_name,
  pg_get_constraintdef(constraint_info.oid) as definition
from pg_constraint constraint_info
join pg_class table_info on table_info.oid = constraint_info.conrelid
join pg_namespace namespace_info on namespace_info.oid = table_info.relnamespace
where namespace_info.nspname = 'public'
  and constraint_info.contype = 'f'
  and pg_get_constraintdef(constraint_info.oid) ~ '\muser_id\M';

create temporary table uid_saved_functions on commit drop as
select
  namespace_info.nspname as function_schema,
  function_info.proname as function_name,
  pg_get_function_identity_arguments(function_info.oid) as identity_arguments,
  pg_get_functiondef(function_info.oid) as definition,
  pg_get_function_identity_arguments(function_info.oid) ~ '\mp_user_id\M[[:space:]]+uuid'
    as has_uuid_user_parameter
from pg_proc function_info
join pg_namespace namespace_info on namespace_info.oid = function_info.pronamespace
where namespace_info.nspname = 'public'
  and function_info.prokind <> 'a'
  and pg_get_functiondef(function_info.oid) ~ '\m(user_id|p_user_id)\M';

do $$
declare
  item record;
begin
  if (select was_legacy from uid_migration_state) then
    -- Old access and refresh tokens carry the UUID subject. Sessions are
    -- ephemeral and must be reissued with the UID subject after deployment.
    delete from public.app_sessions;
  end if;

  for item in
    select * from uid_saved_foreign_keys
    order by table_schema, table_name, constraint_name
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      item.table_schema,
      item.table_name,
      item.constraint_name
    );
  end loop;

  for item in
    select function_schema, function_name, identity_arguments
    from uid_saved_functions
    where has_uuid_user_parameter
    order by function_schema, function_name, identity_arguments
  loop
    execute format(
      'drop function %I.%I(%s)',
      item.function_schema,
      item.function_name,
      item.identity_arguments
    );
  end loop;
end
$$;

do $$
declare
  item record;
  missing_uid_count bigint;
begin
  for item in
    select column_info.table_schema, column_info.table_name
    from information_schema.columns column_info
    join information_schema.tables table_info
      on table_info.table_schema = column_info.table_schema
     and table_info.table_name = column_info.table_name
    where column_info.table_schema = 'public'
      and table_info.table_type = 'BASE TABLE'
      and column_info.column_name = 'user_id'
      and column_info.udt_name = 'uuid'
    order by column_info.table_name
  loop
    execute format(
      'select count(*) from %I.%I where public.resolve_uid_for_migration(user_id) is null',
      item.table_schema,
      item.table_name
    ) into missing_uid_count;

    if missing_uid_count <> 0 then
      raise exception 'UID migration found % orphan owner rows in %.%',
        missing_uid_count, item.table_schema, item.table_name;
    end if;

    execute format(
      'alter table %I.%I alter column user_id type text using public.resolve_uid_for_migration(user_id)',
      item.table_schema,
      item.table_name
    );
    execute format(
      'alter table %I.%I rename column user_id to uid',
      item.table_schema,
      item.table_name
    );
  end loop;
end
$$;

do $$
declare
  item record;
  next_constraint_name text;
  next_definition text;
begin
  for item in
    select * from uid_saved_foreign_keys
    order by table_schema, table_name, constraint_name
  loop
    next_constraint_name := replace(item.constraint_name, 'user_id', 'uid');
    next_definition := regexp_replace(item.definition, '\muser_id\M', 'uid', 'g');
    next_definition := regexp_replace(
      next_definition,
      'REFERENCES[[:space:]]+(public\.)?app_users\(id\)',
      'REFERENCES public.app_users(uid)',
      'g'
    );
    execute format(
      'alter table %I.%I add constraint %I %s',
      item.table_schema,
      item.table_name,
      next_constraint_name,
      next_definition
    );
  end loop;
end
$$;

do $$
declare
  item record;
  next_name text;
begin
  for item in
    select
      namespace_info.nspname as table_schema,
      table_info.relname as table_name,
      constraint_info.conname as constraint_name
    from pg_constraint constraint_info
    join pg_class table_info on table_info.oid = constraint_info.conrelid
    join pg_namespace namespace_info on namespace_info.oid = table_info.relnamespace
    where namespace_info.nspname = 'public'
      and constraint_info.conname like '%user_id%'
    order by table_info.relname, constraint_info.conname
  loop
    next_name := replace(item.constraint_name, 'user_id', 'uid');
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('%I.%I', item.table_schema, item.table_name)::regclass
        and conname = next_name
    ) then
      execute format(
        'alter table %I.%I rename constraint %I to %I',
        item.table_schema,
        item.table_name,
        item.constraint_name,
        next_name
      );
    end if;
  end loop;

  for item in
    select
      namespace_info.nspname as index_schema,
      index_info.relname as index_name
    from pg_class index_info
    join pg_namespace namespace_info on namespace_info.oid = index_info.relnamespace
    where index_info.relkind = 'i'
      and namespace_info.nspname = 'public'
      and index_info.relname like '%user_id%'
    order by index_info.relname
  loop
    next_name := replace(item.index_name, 'user_id', 'uid');
    if to_regclass(format('%I.%I', item.index_schema, next_name)) is null then
      execute format(
        'alter index %I.%I rename to %I',
        item.index_schema,
        item.index_name,
        next_name
      );
    end if;
  end loop;
end
$$;

do $$
declare
  item record;
  migrated_definition text;
  migrated_arguments text;
begin
  for item in
    select * from uid_saved_functions
    order by function_schema, function_name, identity_arguments
  loop
    migrated_definition := regexp_replace(
      item.definition,
      '\mp_user_id\M[[:space:]]+uuid',
      'p_uid text',
      'g'
    );
    migrated_definition := regexp_replace(
      migrated_definition,
      '\mp_user_id\M',
      'p_uid',
      'g'
    );
    migrated_definition := regexp_replace(
      migrated_definition,
      '\muser_id\M',
      'uid',
      'g'
    );
    migrated_definition := regexp_replace(
      migrated_definition,
      '\mid\M([[:space:]]*=[[:space:]]*p_uid)',
      'uid\1',
      'g'
    );
    execute migrated_definition;

    migrated_arguments := regexp_replace(
      item.identity_arguments,
      '\mp_user_id\M[[:space:]]+uuid',
      'p_uid text',
      'g'
    );
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      item.function_schema,
      item.function_name,
      migrated_arguments
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      item.function_schema,
      item.function_name,
      migrated_arguments
    );
  end loop;
end
$$;

do $$
declare
  item record;
begin
  for item in
    select column_info.table_schema, column_info.table_name, column_info.column_name
    from information_schema.columns column_info
    join information_schema.tables table_info
      on table_info.table_schema = column_info.table_schema
     and table_info.table_name = column_info.table_name
    where column_info.table_schema = 'public'
      and table_info.table_type = 'BASE TABLE'
      and column_info.data_type = 'text'
    order by column_info.table_name, column_info.ordinal_position
  loop
    execute format(
      'update %I.%I as record set %I = replace(record.%I, ''users/'' || app_user.id::text || ''/'', ''users/'' || app_user.uid || ''/'') from public.app_users as app_user where record.%I like ''%%users/'' || app_user.id::text || ''/%%''',
      item.table_schema,
      item.table_name,
      item.column_name,
      item.column_name,
      item.column_name
    );
  end loop;
end
$$;

drop function public.resolve_uid_for_migration(uuid);

do $$
declare
  legacy_path_count bigint := 0;
  matched_count bigint;
  item record;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'user_id'
  ) then
    raise exception 'UID migration left legacy user_id columns behind';
  end if;

  if exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname like '%user_id%'
  ) then
    raise exception 'UID migration left legacy user_id constraint names behind';
  end if;

  if exists (
    select 1
    from pg_class index_info
    join pg_namespace namespace_info on namespace_info.oid = index_info.relnamespace
    where namespace_info.nspname = 'public'
      and index_info.relkind = 'i'
      and index_info.relname like '%user_id%'
  ) then
    raise exception 'UID migration left legacy user_id index names behind';
  end if;

  if exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and pg_get_constraintdef(oid) ~ '\muser_id\M'
  ) then
    raise exception 'UID migration left legacy user_id constraints behind';
  end if;

  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexdef ~ '\muser_id\M'
  ) then
    raise exception 'UID migration left legacy user_id indexes behind';
  end if;

  if exists (
    select 1
    from pg_proc function_info
    join pg_namespace namespace_info on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.prokind <> 'a'
      and pg_get_functiondef(function_info.oid) ~ '\m(user_id|p_user_id)\M'
  ) then
    raise exception 'UID migration left legacy user ownership functions behind';
  end if;

  for item in
    select column_info.table_schema, column_info.table_name, column_info.column_name
    from information_schema.columns column_info
    join information_schema.tables table_info
      on table_info.table_schema = column_info.table_schema
     and table_info.table_name = column_info.table_name
    where column_info.table_schema = 'public'
      and table_info.table_type = 'BASE TABLE'
      and column_info.data_type = 'text'
  loop
    execute format(
      'select count(*) from %I.%I as record where exists (select 1 from public.app_users as app_user where record.%I like ''%%users/'' || app_user.id::text || ''/%%'')',
      item.table_schema,
      item.table_name,
      item.column_name
    ) into matched_count;
    legacy_path_count := legacy_path_count + matched_count;
  end loop;

  if legacy_path_count <> 0 then
    raise exception 'UID migration left % UUID-based image paths behind', legacy_path_count;
  end if;

  if exists (
    select 1
    from public.app_users
    where uid is null
       or (uid not in ('10000', '20000') and uid !~ '^[1-9][0-9]{9}$')
  ) then
    raise exception 'UID migration produced an invalid application UID';
  end if;

  if exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and contype = 'f'
      and pg_get_constraintdef(oid) ~ 'REFERENCES[[:space:]]+(public\.)?app_users\(id\)'
  ) then
    raise exception 'UID migration left business rows referencing the internal app_users id';
  end if;
end
$$;
