-- Local checkpoint only. Both commercial enforcement and checkout start disabled.
begin;
create schema eu_rico_billing;
revoke all on schema eu_rico_billing from public, anon, authenticated, service_role;

create table eu_rico_billing.settings (
  singleton boolean primary key default true check (singleton),
  commercial_enabled boolean not null default false,
  checkout_enabled boolean not null default false,
  environment text not null default 'local' check(environment in ('local','staging','production')),
  product_id text, offer_id text,
  amount_cents integer not null default 999 check(amount_cents=999),
  currency text not null default 'BRL' check(currency='BRL')
);
insert into eu_rico_billing.settings(singleton) values(true);
create table eu_rico_billing.audit (
  id bigint generated always as identity primary key,
  action text not null, actor text not null, subject text,
  details jsonb not null default '{}', created_at timestamptz not null default clock_timestamp()
);
create table eu_rico_billing.intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  environment text not null, product_id text not null, offer_id text not null,
  amount_cents integer not null default 999 check(amount_cents=999), currency text not null default 'BRL' check(currency='BRL'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
  consumed boolean not null default false,
  state text not null default 'pending' check(state in ('pending','verification_pending','refused','confirmed'))
);
create index on eu_rico_billing.intents(user_id,created_at desc);
create table eu_rico_billing.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  intent_id uuid not null references eu_rico_billing.intents(id),
  environment text not null, provider_id text not null,
  product_id text not null, offer_id text not null,
  status text not null check(status in ('active','inactive','canceled','expired','paused','late','trial')),
  blocked boolean not null default false,
  amount_cents integer not null check(amount_cents=999), currency text not null check(currency='BRL'),
  provider_updated_at timestamptz not null, verified_at timestamptz not null default clock_timestamp(),
  unique(environment,provider_id)
);
create index on eu_rico_billing.subscriptions(user_id);
create table eu_rico_billing.cycles (
  environment text not null, provider_id text not null,
  subscription_id uuid not null references eu_rico_billing.subscriptions(id),
  cycle_number integer not null check(cycle_number>0),
  amount_cents integer not null check(amount_cents=999), currency text not null check(currency='BRL'),
  status text not null, starts_at timestamptz not null, ends_at timestamptz not null,
  primary key(environment,provider_id), unique(subscription_id,cycle_number), check(ends_at>starts_at)
);
create table eu_rico_billing.payments (
  environment text not null, provider_id text not null,
  subscription_id uuid not null references eu_rico_billing.subscriptions(id),
  cycle_number integer, amount_cents integer not null check(amount_cents=999), currency text not null check(currency='BRL'),
  status text not null, paid_at timestamptz, primary key(environment,provider_id)
);
create table eu_rico_billing.events (
  id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
  environment text not null, event text not null, order_id text not null, callback uuid,
  state text not null default 'pending' check(state in ('pending','processing','done')),
  attempts integer not null default 0, available_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz, lease_token uuid, error_code text,
  created_at timestamptz not null default clock_timestamp(), processed_at timestamptz
);
create index on eu_rico_billing.events(state,available_at);
create table eu_rico_billing.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  state text not null default 'requested' check(state in ('requested','processing','completed')),
  created_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
  foreach t in array array['settings','audit','intents','subscriptions','cycles','payments','events','deletion_requests'] loop
    execute format('alter table eu_rico_billing.%I enable row level security',t);
    execute format('revoke all on eu_rico_billing.%I from public,anon,authenticated,service_role',t);
  end loop;
end $$;

-- Only the database owner may change commercial activation. No public/admin API can call this.
create function eu_rico_billing.set_activation(p_enabled boolean,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare previous boolean;
begin
  if p_enabled is null or length(trim(p_reason))<10 then raise exception 'BILLING_REASON_REQUIRED'; end if;
  select commercial_enabled into previous from eu_rico_billing.settings where singleton for update;
  update eu_rico_billing.settings set commercial_enabled=p_enabled where singleton;
  insert into eu_rico_billing.audit(action,actor,details) values('commercial_activation',session_user,jsonb_build_object('before',previous,'after',p_enabled,'reason',p_reason));
end $$;
revoke all on function eu_rico_billing.set_activation(boolean,text) from public,anon,authenticated,service_role;

create function eu_rico_private.eu_rico_can_access() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid())
  and (not (select commercial_enabled from eu_rico_billing.settings where singleton)
    or exists(select 1 from eu_rico_billing.subscriptions s join eu_rico_billing.cycles c on c.subscription_id=s.id
      where s.user_id=auth.uid() and s.environment=(select environment from eu_rico_billing.settings where singleton) and not s.blocked and s.status in ('active','canceled','late')
      and c.status='paid' and c.starts_at<=statement_timestamp() and c.ends_at>statement_timestamp()));
$$;
revoke all on function eu_rico_private.eu_rico_can_access() from public,anon;
grant execute on function eu_rico_private.eu_rico_can_access() to authenticated;

-- Preserve the exact financial implementations. The unchecked reader is owner-only for export.
alter function eu_rico_private.eu_rico_read() rename to eu_rico_snapshot_unchecked;
revoke all on function eu_rico_private.eu_rico_snapshot_unchecked() from public,anon,authenticated;
create function eu_rico_private.eu_rico_read() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not eu_rico_private.eu_rico_can_access() then raise exception 'EU_RICO_SUBSCRIPTION_REQUIRED' using errcode='PT402'; end if;
  return eu_rico_private.eu_rico_snapshot_unchecked();
end $$;
revoke all on function eu_rico_private.eu_rico_read() from public,anon;
grant execute on function eu_rico_private.eu_rico_read() to authenticated;
-- Rebind the public wrapper after the rename (SQL functions can retain dependencies by OID).
create or replace function public.eu_rico_read() returns jsonb language sql security invoker set search_path='' as $$ select eu_rico_private.eu_rico_read(); $$;
do $patch$ declare body text; begin
  select pg_get_functiondef('eu_rico_private.eu_rico_save(jsonb,bigint,uuid,boolean)'::regprocedure) into body;
  if strpos(body,'EU_RICO_PAYMENT_CLIENT_OUTDATED')=0 or strpos(body,'EU_RICO_SUBSCRIPTION_REQUIRED')>0 then raise exception 'BILLING_SAVE_PRECONDITION'; end if;
  body:=replace(body,'if owner_id is null then', 'if not eu_rico_private.eu_rico_can_access() then raise exception ''EU_RICO_SUBSCRIPTION_REQUIRED'' using errcode=''PT402''; end if; if owner_id is null then');
  if strpos(body,'EU_RICO_SUBSCRIPTION_REQUIRED')=0 then raise exception 'BILLING_SAVE_PATCH_FAILED'; end if;
  execute body;
end $patch$;
do $$ declare t text; p record; begin
  foreach t in array array['profiles','tasks','income','expenses','goals','recovery'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename='eu_rico_'||t loop
      execute format('drop policy %I on public.%I',p.policyname,'eu_rico_'||t);
    end loop;
    execute format('create policy paid_owner_select on public.%I for select to authenticated using(user_id=(select auth.uid()) and (select eu_rico_private.eu_rico_can_access()))','eu_rico_'||t);
    -- Direct mutations remain revoked, even for paying users.
  end loop;
end $$;

create function eu_rico_private.eu_rico_billing_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select jsonb_build_object('commercialEnabled',commercial_enabled,'checkoutEnabled',checkout_enabled,
    'allowed',eu_rico_private.eu_rico_can_access(),'serverTime',statement_timestamp(),
    'paidUntil',(select max(c.ends_at) from eu_rico_billing.subscriptions s join eu_rico_billing.cycles c on c.subscription_id=s.id where s.user_id=auth.uid() and s.environment=(select environment from eu_rico_billing.settings where singleton) and not s.blocked and s.status in ('active','canceled','late') and c.status='paid' and c.starts_at<=statement_timestamp() and c.ends_at>statement_timestamp()),
    'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status)) from eu_rico_billing.subscriptions where user_id=auth.uid()),'[]'),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.provider_id,'status',p.status,'amountCents',p.amount_cents,'paidAt',p.paid_at)) from eu_rico_billing.payments p join eu_rico_billing.subscriptions s on s.id=p.subscription_id where s.user_id=auth.uid()),'[]'),
    'deletionRequested',exists(select 1 from eu_rico_billing.deletion_requests where user_id=auth.uid())) into result from eu_rico_billing.settings where singleton;
  result:=result||jsonb_build_object('checkoutState',(select state from eu_rico_billing.intents where user_id=auth.uid() and environment=(select environment from eu_rico_billing.settings where singleton) order by created_at desc limit 1));
  return result;
end $$;
create function eu_rico_private.eu_rico_export() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  return eu_rico_private.eu_rico_snapshot_unchecked();
end $$;
create function eu_rico_private.eu_rico_request_deletion() returns uuid
language plpgsql security definer set search_path='' as $$
declare request_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  insert into eu_rico_billing.deletion_requests(user_id) values(auth.uid()) on conflict(user_id) do update set user_id=excluded.user_id returning id into request_id;
  return request_id;
end $$;
create function public.eu_rico_billing_status() returns jsonb language sql security invoker set search_path='' as $$ select eu_rico_private.eu_rico_billing_status(); $$;
create function public.eu_rico_export() returns jsonb language sql security invoker set search_path='' as $$ select eu_rico_private.eu_rico_export(); $$;
create function public.eu_rico_request_deletion() returns uuid language sql security invoker set search_path='' as $$ select eu_rico_private.eu_rico_request_deletion(); $$;
do $$ declare signature text; begin
  foreach signature in array array['eu_rico_billing_status()','eu_rico_export()','eu_rico_request_deletion()'] loop
    execute 'revoke all on function public.'||signature||' from public,anon';
    execute 'revoke all on function eu_rico_private.'||signature||' from public,anon';
    execute 'grant execute on function public.'||signature||' to authenticated';
    execute 'grant execute on function eu_rico_private.'||signature||' to authenticated';
  end loop;
end $$;

-- Narrow service-only dispatcher; private tables are never exposed through PostgREST.
create function eu_rico_billing.admin(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg eu_rico_billing.settings; intent eu_rico_billing.intents; sub eu_rico_billing.subscriptions;
  item jsonb; output jsonb; uid uuid; sid uuid; ev eu_rico_billing.events;
begin
  select * into cfg from eu_rico_billing.settings where singleton;
  if p_action='config' then return to_jsonb(cfg); end if;
  if p_action='audit_failure' then
    insert into eu_rico_billing.audit(action,actor,subject,details) values('reconciliation_failed','backend',p_data->>'subscriptionId',jsonb_build_object('environment',cfg.environment,'code','PROVIDER_RECONCILIATION_FAILED'));
    return jsonb_build_object('recorded',true);
  end if;
  if p_action='intent' then
    uid:=(p_data->>'userId')::uuid;
    if not cfg.checkout_enabled or cfg.product_id is null or cfg.offer_id is null then raise exception 'CHECKOUT_DISABLED'; end if;
    perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
    if exists(select 1 from eu_rico_billing.subscriptions s join eu_rico_billing.cycles c on c.subscription_id=s.id where s.user_id=uid and s.environment=cfg.environment and not s.blocked and s.status in ('active','late','canceled') and c.status='paid' and c.ends_at>statement_timestamp() and c.starts_at<=statement_timestamp()) then raise exception 'ALREADY_SUBSCRIBED'; end if;
    select * into intent from eu_rico_billing.intents where user_id=uid and not consumed and expires_at>statement_timestamp() and environment=cfg.environment and product_id=cfg.product_id and offer_id=cfg.offer_id order by created_at desc limit 1;
    if not found then insert into eu_rico_billing.intents(user_id,environment,product_id,offer_id) values(uid,cfg.environment,cfg.product_id,cfg.offer_id) returning * into intent; end if;
    return to_jsonb(intent);
  elsif p_action='subscriptions' then
    return coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from eu_rico_billing.subscriptions s where s.user_id is not null and s.environment=cfg.environment and (p_data->>'userId' is null or s.user_id=(p_data->>'userId')::uuid)),'[]');
  elsif p_action='ingest' then
    if p_data->>'environment' is distinct from cfg.environment then raise exception 'ENVIRONMENT_MISMATCH'; end if;
    insert into eu_rico_billing.events(dedupe_key,environment,event,order_id,callback)
      values(p_data->>'key',cfg.environment,p_data->>'event',p_data->>'orderId',nullif(p_data->>'callback','')::uuid)
      on conflict(dedupe_key) do nothing;
    update eu_rico_billing.intents set state=case when p_data->>'event'='purchase_refused' then 'refused' when p_data->>'event'='purchase_approved' then 'verification_pending' else state end where id=nullif(p_data->>'callback','')::uuid and environment=cfg.environment and not consumed;
    return jsonb_build_object('accepted',true);
  elsif p_action='claim' then
    select * into ev from eu_rico_billing.events where (state='pending' and available_at<=clock_timestamp()) or (state='processing' and lease_until<clock_timestamp()) order by created_at for update skip locked limit 1;
    if not found then return 'null'::jsonb; end if;
    update eu_rico_billing.events set state='processing',lease_until=clock_timestamp()+interval '2 minutes',lease_token=gen_random_uuid(),attempts=attempts+1 where id=ev.id returning * into ev;
    return to_jsonb(ev);
  elsif p_action in ('done','retry') then
    update eu_rico_billing.events set state=case when p_action='done' then 'done' else 'pending' end,
      processed_at=case when p_action='done' then clock_timestamp() else null end,
      available_at=clock_timestamp()+interval '1 minute'*least(60,attempts),lease_until=null,
      error_code=case when p_action='retry' then 'PROVIDER_RECONCILIATION_FAILED' else null end
      where id=(p_data->>'id')::uuid and lease_token=(p_data->>'lease_token')::uuid;
    return jsonb_build_object('updated',found);
  elsif p_action='apply' then
    if p_data->>'environment' is distinct from cfg.environment or p_data->>'productId' is distinct from cfg.product_id or p_data->>'offerId' is distinct from cfg.offer_id or (p_data->>'amountCents')::int is distinct from 999 or p_data->>'currency' is distinct from 'BRL' then raise exception 'BILLING_CONTRACT_MISMATCH'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_data->>'subscriptionId',1));
    select * into sub from eu_rico_billing.subscriptions where environment=cfg.environment and provider_id=p_data->>'subscriptionId' for update;
    if found then
      if (p_data->>'updatedAt')::timestamptz<sub.provider_updated_at then return jsonb_build_object('stale',true); end if;
      sid:=sub.id;
      if p_data->>'callback' is not null and p_data->>'callback'<>sub.intent_id::text then raise exception 'CORRELATION_MISMATCH'; end if;
    else
      select * into intent from eu_rico_billing.intents where id=(p_data->>'callback')::uuid for update;
      if not found or intent.user_id is null or intent.environment<>cfg.environment or intent.product_id<>cfg.product_id or intent.offer_id<>cfg.offer_id or intent.consumed or p_data->>'orderCreatedAt' is null or (p_data->>'orderCreatedAt')::timestamptz<intent.created_at or (p_data->>'orderCreatedAt')::timestamptz>intent.expires_at then raise exception 'CORRELATION_REQUIRED'; end if;
      insert into eu_rico_billing.subscriptions(user_id,intent_id,environment,provider_id,product_id,offer_id,status,amount_cents,currency,provider_updated_at)
        values(intent.user_id,intent.id,cfg.environment,p_data->>'subscriptionId',cfg.product_id,cfg.offer_id,p_data->>'status',999,'BRL',(p_data->>'updatedAt')::timestamptz) returning id into sid;
      update eu_rico_billing.intents set consumed=true where id=intent.id;
    end if;
    update eu_rico_billing.subscriptions set status=case when status='canceled' then status else p_data->>'status' end,blocked=blocked or coalesce((p_data->>'blocked')::boolean,false),provider_updated_at=(p_data->>'updatedAt')::timestamptz,verified_at=clock_timestamp() where id=sid;
    for item in select value from jsonb_array_elements(p_data->'payments') loop
      if exists(select 1 from eu_rico_billing.payments where environment=cfg.environment and provider_id=item->>'id' and subscription_id<>sid) then raise exception 'PAYMENT_OWNER_MISMATCH'; end if;
      insert into eu_rico_billing.payments values(cfg.environment,item->>'id',sid,(item->>'cycleNumber')::int,(item->>'amountCents')::int,item->>'currency',item->>'status',nullif(item->>'paidAt','')::timestamptz)
        on conflict(environment,provider_id) do update set status=case when eu_rico_billing.payments.status in ('refunded','chargedback','prechargeback','MED') then eu_rico_billing.payments.status else excluded.status end,paid_at=excluded.paid_at;
    end loop;
    for item in select value from jsonb_array_elements(p_data->'cycles') loop
      if exists(select 1 from eu_rico_billing.cycles where environment=cfg.environment and provider_id=item->>'id' and subscription_id<>sid) then raise exception 'CYCLE_OWNER_MISMATCH'; end if;
      insert into eu_rico_billing.cycles values(cfg.environment,item->>'id',sid,(item->>'number')::int,(item->>'amountCents')::int,item->>'currency',item->>'status',(item->>'startsAt')::timestamptz,(item->>'endsAt')::timestamptz)
        on conflict(environment,provider_id) do update set status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at;
    end loop;
    -- A stale concurrent snapshot must never revive a refunded/disputed cycle.
    update eu_rico_billing.cycles c set status='revoked' where c.subscription_id=sid and exists(select 1 from eu_rico_billing.payments p where p.subscription_id=sid and p.cycle_number=c.cycle_number and p.status in ('refunded','chargedback','prechargeback','MED'));
    update eu_rico_billing.cycles c set status='pending' where c.subscription_id=sid and c.status='paid' and not exists(select 1 from eu_rico_billing.payments p where p.subscription_id=sid and p.cycle_number=c.cycle_number and p.status='paid' and p.paid_at is not null);
    update eu_rico_billing.intents set state=case when exists(select 1 from eu_rico_billing.cycles where subscription_id=sid and status='paid') then 'confirmed' when exists(select 1 from eu_rico_billing.payments where subscription_id=sid and status in ('refused','blocked')) then 'refused' else 'pending' end where id=(select intent_id from eu_rico_billing.subscriptions where id=sid);
    insert into eu_rico_billing.audit(action,actor,subject,details) values('provider_reconciled','backend',sid::text,jsonb_build_object('status',p_data->>'status'));
    return jsonb_build_object('applied',true);
  end if;
  raise exception 'UNKNOWN_BILLING_ACTION';
end $$;
revoke all on function eu_rico_billing.admin(text,jsonb) from public,anon,authenticated;
create function public.eu_rico_billing_admin(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select eu_rico_billing.admin(p_action,p_data); $$;
revoke all on function public.eu_rico_billing_admin(text,jsonb) from public,anon,authenticated;
grant usage on schema eu_rico_billing to service_role;
grant execute on function eu_rico_billing.admin(text,jsonb),public.eu_rico_billing_admin(text,jsonb) to service_role;
commit;
