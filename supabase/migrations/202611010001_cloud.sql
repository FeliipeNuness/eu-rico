-- Prepared locally. Requires separate authorization for any remote execution.
-- Additive schema; collisions abort instead of adopting unknown existing tables.
begin;
create schema eu_rico_private;
revoke all on schema eu_rico_private from public, anon, authenticated;
grant usage on schema eu_rico_private to authenticated;

create table public.eu_rico_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  last_operation_id uuid,
  updated_at timestamptz not null default now()
);

create function public.eu_rico_valid_date(value text) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  return value ~ '^\d{4}-\d{2}-\d{2}$' and to_char(value::date, 'YYYY-MM-DD') = value;
exception when others then return false;
end $$;

create function public.eu_rico_valid_record(kind text, doc jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(doc) is distinct from 'object' or jsonb_typeof(doc->'id') is distinct from 'string'
    or length(doc->>'id') not between 1 and 200 then return false; end if;
  if kind = 'tasks' then
    return coalesce(jsonb_typeof(doc->'title') = 'string' and length(trim(doc->>'title')) > 0 and length(doc->>'title') <= 300
      and jsonb_typeof(doc->'description') = 'string' and length(doc->>'description') <= 1000
      and public.eu_rico_valid_date(doc->>'date') and jsonb_typeof(doc->'time') = 'string' and length(doc->>'time') <= 20
      and doc->>'priority' in ('Baixa','Média','Alta') and jsonb_typeof(doc->'category') = 'string' and length(doc->>'category') <= 100
      and jsonb_typeof(doc->'done') = 'boolean' and (not doc ? 'completedAt' or public.eu_rico_valid_date(doc->>'completedAt')), false);
  elsif kind = 'income' then
    return coalesce(jsonb_typeof(doc->'name') = 'string' and length(trim(doc->>'name')) > 0 and length(doc->>'name') <= 200
      and jsonb_typeof(doc->'amount') = 'number' and (doc->>'amount')::numeric > 0 and (doc->>'amount')::numeric <= 1000000000000
      and doc->>'recurrence' in ('Mensal','Única') and (not doc ? 'date' or public.eu_rico_valid_date(doc->>'date')), false);
  elsif kind = 'expenses' then
    return coalesce(jsonb_typeof(doc->'description') = 'string' and length(trim(doc->>'description')) > 0 and length(doc->>'description') <= 300
      and jsonb_typeof(doc->'amount') = 'number' and (doc->>'amount')::numeric > 0 and (doc->>'amount')::numeric <= 1000000000000
      and jsonb_typeof(doc->'category') = 'string' and length(trim(doc->>'category')) > 0 and length(doc->>'category') <= 100
      and public.eu_rico_valid_date(doc->>'date') and doc->>'type' in ('Fixo','Variável')
      and (not doc ? 'note' or (jsonb_typeof(doc->'note') = 'string' and length(doc->>'note') <= 1000)), false);
  elsif kind = 'goals' then
    return coalesce(jsonb_typeof(doc->'name') = 'string' and length(trim(doc->>'name')) > 0 and length(doc->>'name') <= 200
      and jsonb_typeof(doc->'description') = 'string' and length(doc->>'description') <= 1000
      and jsonb_typeof(doc->'target') = 'number' and (doc->>'target')::numeric > 0 and (doc->>'target')::numeric <= 1000000000000
      and jsonb_typeof(doc->'saved') = 'number' and (doc->>'saved')::numeric between 0 and 1000000000000
      and (doc->>'deadline' = '' or public.eu_rico_valid_date(doc->>'deadline'))
      and jsonb_typeof(doc->'category') = 'string' and length(doc->>'category') <= 100
      and jsonb_typeof(doc->'priority') = 'string' and length(doc->>'priority') <= 30, false);
  end if;
  return false;
exception when others then return false;
end $$;

do $$
declare kind text;
begin
  foreach kind in array array['tasks','income','expenses','goals'] loop
    execute format('create table public.eu_rico_%I (
      user_id uuid not null references public.eu_rico_profiles(user_id) on delete cascade,
      id uuid not null,
      source_id text not null,
      position integer not null check (position >= 0),
      payload jsonb not null,
      primary key (user_id, id),
      unique (user_id, source_id),
      check (source_id = payload->>''id''),
      check (public.eu_rico_valid_record(%L, payload))
    )', kind, kind);
  end loop;
end $$;

create table public.eu_rico_recovery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  revision bigint not null,
  created_at timestamptz not null default now()
);

create index eu_rico_recovery_user_id_created_at_idx on public.eu_rico_recovery(user_id,created_at desc);

do $$
declare relation text;
begin
  foreach relation in array array['eu_rico_profiles','eu_rico_tasks','eu_rico_income','eu_rico_expenses','eu_rico_goals','eu_rico_recovery'] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('create policy own_select on public.%I for select to authenticated using (user_id = (select auth.uid()))', relation);
    execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', relation);
    execute format('create policy own_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', relation);
    execute format('create policy own_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))', relation);
    -- Direct writes are deliberately revoked: only transactional RPC may mutate records.
    execute format('revoke all on public.%I from public, anon, authenticated', relation);
    execute format('grant select on public.%I to authenticated', relation);
  end loop;
end $$;

create function eu_rico_private.eu_rico_read() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); profile public.eu_rico_profiles; document jsonb; kind text; items jsonb;
begin
  if owner_id is null then raise exception 'EU_RICO_AUTH_REQUIRED' using errcode = '42501'; end if;
  -- One account lock also makes reads atomic relative to save, across all entity tables.
  select * into profile from public.eu_rico_profiles where user_id = owner_id for share;
  if not found then return jsonb_build_object('revision',0,'data',null); end if;
  document := profile.settings;
  foreach kind in array array['tasks','income','expenses','goals'] loop
    execute format('select coalesce(jsonb_agg(payload order by position), ''[]''::jsonb) from public.eu_rico_%I where user_id = $1',kind) into items using owner_id;
    document := document || jsonb_build_object(kind, items);
  end loop;
  return jsonb_build_object('revision',profile.revision,'data',document);
end $$;

create function eu_rico_private.eu_rico_save(p_data jsonb, p_expected_revision bigint, p_operation_id uuid, p_preserve boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); profile public.eu_rico_profiles; kind text; item jsonb; item_position integer; new_settings jsonb;
begin
  if owner_id is null then raise exception 'EU_RICO_AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_revision is null or p_expected_revision < 0 or p_preserve is null then raise exception 'EU_RICO_INVALID_REQUEST'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 2097152 then raise exception 'EU_RICO_INVALID_DOCUMENT'; end if;
  if jsonb_typeof(p_data->'name') is distinct from 'string' or length(p_data->>'name') > 200
    or jsonb_typeof(p_data->'theme') is distinct from 'string' or p_data->>'theme' not in ('light','dark')
    or jsonb_typeof(p_data->'savingTarget') is distinct from 'number'
    or (p_data->>'savingTarget')::numeric not between 0 and 1000000000000 then raise exception 'EU_RICO_INVALID_SETTINGS'; end if;
  foreach kind in array array['tasks','income','expenses','goals'] loop
    if jsonb_typeof(p_data->kind) is distinct from 'array' or jsonb_array_length(p_data->kind) > 10000 then raise exception 'EU_RICO_INVALID_LIST'; end if;
    if exists(select 1 from jsonb_array_elements(p_data->kind) value where not public.eu_rico_valid_record(kind,value)) then raise exception 'EU_RICO_INVALID_RECORD'; end if;
    if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p_data->kind) value) then raise exception 'EU_RICO_DUPLICATE_ID'; end if;
  end loop;
  new_settings := p_data - array['tasks','income','expenses','goals'];
  insert into public.eu_rico_profiles(user_id,settings) values(owner_id,new_settings) on conflict(user_id) do nothing;
  select * into profile from public.eu_rico_profiles where user_id = owner_id for update;
  if profile.last_operation_id = p_operation_id then return eu_rico_private.eu_rico_read(); end if;
  if profile.revision <> p_expected_revision then raise exception 'EU_RICO_CONFLICT' using errcode = '40001'; end if;
  if p_preserve then
    insert into public.eu_rico_recovery(user_id,data,revision) values(owner_id,eu_rico_private.eu_rico_read()->'data',profile.revision);
  end if;
  foreach kind in array array['tasks','income','expenses','goals'] loop
    execute format('delete from public.eu_rico_%I where user_id = $1',kind) using owner_id;
    item_position := 0;
    for item in select value from jsonb_array_elements(p_data->kind) value loop
      -- Stable UUID across import retries; legacy source_id remains intact in payload.
      execute format('insert into public.eu_rico_%I(user_id,id,source_id,position,payload) values($1,$2,$3,$4,$5)',kind)
        using owner_id, md5(owner_id::text || ':' || kind || ':' || (item->>'id'))::uuid, item->>'id', item_position, item;
      item_position := item_position + 1;
    end loop;
  end loop;
  update public.eu_rico_profiles set settings = new_settings, revision = revision + 1, last_operation_id = p_operation_id, updated_at = now() where user_id = owner_id;
  return eu_rico_private.eu_rico_read();
end $$;

-- Public API stays unprivileged. Definer implementations live in a non-exposed schema.
create function public.eu_rico_read() returns jsonb
language sql security invoker set search_path = '' as $$
  select eu_rico_private.eu_rico_read();
$$;
create function public.eu_rico_save(p_data jsonb, p_expected_revision bigint, p_operation_id uuid, p_preserve boolean default false) returns jsonb
language sql security invoker set search_path = '' as $$
  select eu_rico_private.eu_rico_save(p_data,p_expected_revision,p_operation_id,p_preserve);
$$;

revoke all on function eu_rico_private.eu_rico_read() from public, anon;
revoke all on function eu_rico_private.eu_rico_save(jsonb,bigint,uuid,boolean) from public, anon;
grant execute on function eu_rico_private.eu_rico_read() to authenticated;
grant execute on function eu_rico_private.eu_rico_save(jsonb,bigint,uuid,boolean) to authenticated;

-- Definer functions have no user_id argument and derive ownership exclusively from auth.uid().
revoke all on function public.eu_rico_read() from public, anon;
revoke all on function public.eu_rico_save(jsonb,bigint,uuid,boolean) from public, anon;
grant execute on function public.eu_rico_read() to authenticated;
grant execute on function public.eu_rico_save(jsonb,bigint,uuid,boolean) to authenticated;
revoke all on function public.eu_rico_valid_record(text,jsonb) from public, anon;
revoke all on function public.eu_rico_valid_date(text) from public, anon;
grant execute on function public.eu_rico_valid_record(text,jsonb), public.eu_rico_valid_date(text) to authenticated;
commit;
