-- Local preparation only. Requires launch-commercial-expand.sql; never activates a provider.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
alter table eu_rico_billing.settings add column checkout_provider text not null default 'cakto' check(checkout_provider in ('cakto','mercadopago'));
do $$ declare relation text; begin
  foreach relation in array array['intents','subscriptions','cycles','payments','events'] loop
    execute format('alter table eu_rico_billing.%I add column provider text not null default ''cakto'' check(provider in (''cakto'',''mercadopago''))',relation);
    if relation<>'events' then
      execute format('alter table eu_rico_billing.%I add check(provider<>''mercadopago'' or amount_cents=2999)',relation);
    end if;
  end loop;
end $$;
alter table eu_rico_billing.subscriptions drop constraint subscriptions_environment_provider_id_key,
  add unique(provider,environment,provider_id);
alter table eu_rico_billing.cycles drop constraint cycles_pkey, add primary key(provider,environment,provider_id);
alter table eu_rico_billing.payments drop constraint payments_pkey, add primary key(provider,environment,provider_id);
-- A valid subscription UUID must not permit a child row in another provider/environment.
alter table eu_rico_billing.intents add unique(id,provider,environment);
alter table eu_rico_billing.subscriptions add unique(id,provider,environment),
  add foreign key(intent_id,provider,environment) references eu_rico_billing.intents(id,provider,environment);
alter table eu_rico_billing.cycles add foreign key(subscription_id,provider,environment) references eu_rico_billing.subscriptions(id,provider,environment);
alter table eu_rico_billing.payments add foreign key(subscription_id,provider,environment) references eu_rico_billing.subscriptions(id,provider,environment);
alter table eu_rico_billing.payments add column provider_updated_at timestamptz;
alter table eu_rico_billing.payments add column refunded_amount_cents integer not null default 0 check(refunded_amount_cents between 0 and amount_cents);
alter table eu_rico_billing.intents add column provider_subscription_id text,
  add column checkout_url text, add column creation_started_at timestamptz,
  add column recovery_checked_at timestamptz not null default '-infinity';
create unique index mp_intent_subscription on eu_rico_billing.intents(environment,provider_subscription_id)
  where provider='mercadopago' and provider_subscription_id is not null;

-- Preserve the Cakto implementation and scope only its provider-specific keys/queue.
do $patch$ declare body text; begin
  select pg_get_functiondef('eu_rico_billing.admin(text,jsonb)'::regprocedure) into body;
  if strpos(body,'commercial-contract-v2')=0 then raise exception 'COMMERCIAL_EXPANSION_REQUIRED'; end if;
  body:=replace(body,'eu_rico_billing.admin(','eu_rico_billing.cakto_admin_v2(');
  body:=replace(body,'where environment=cfg.environment and provider_id=', 'where provider=''cakto'' and environment=cfg.environment and provider_id=');
  body:=replace(body,'from eu_rico_billing.intents where ', 'from eu_rico_billing.intents where provider=''cakto'' and ');
  body:=replace(body,'where s.user_id is not null and s.environment=cfg.environment','where s.provider=''cakto'' and s.user_id is not null and s.environment=cfg.environment');
  body:=replace(body,'if not cfg.checkout_enabled or cfg.product_id is null', 'if cfg.checkout_provider<>''cakto'' or not cfg.checkout_enabled or cfg.product_id is null');
  body:=replace(body,'perform pg_advisory_xact_lock(hashtextextended(uid::text,0));',
    'perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
     select * into cfg from eu_rico_billing.settings where singleton for share;
     if cfg.checkout_provider<>''cakto'' or not cfg.checkout_enabled then raise exception ''CHECKOUT_DISABLED''; end if;
     if exists(select 1 from eu_rico_billing.intents i where i.user_id=uid and i.environment=cfg.environment and i.provider=''mercadopago''
       and not exists(select 1 from eu_rico_billing.subscriptions s where s.intent_id=i.id and s.status=''canceled'')) then raise exception ''PROVIDER_CHECKOUT_PENDING''; end if;');
  body:=replace(body,'insert into eu_rico_billing.payments values(', 'insert into eu_rico_billing.payments(environment,provider_id,subscription_id,cycle_number,amount_cents,currency,status,paid_at) values(');
  body:=replace(body,'insert into eu_rico_billing.cycles values(', 'insert into eu_rico_billing.cycles(environment,provider_id,subscription_id,cycle_number,amount_cents,currency,status,starts_at,ends_at) values(');
  body:=replace(body,'on conflict(environment,provider_id)', 'on conflict(provider,environment,provider_id)');
  body:=replace(body,'where (state=''pending'' and available_at<=clock_timestamp()) or (state=''processing'' and lease_until<clock_timestamp())', 'where provider=''cakto'' and ((state=''pending'' and available_at<=clock_timestamp()) or (state=''processing'' and lease_until<clock_timestamp()))');
  execute body;
end $patch$;
revoke all on function eu_rico_billing.cakto_admin_v2(text,jsonb) from public,anon,authenticated,service_role;

create function eu_rico_billing.mp_admin(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg eu_rico_billing.settings; intent eu_rico_billing.intents; sub eu_rico_billing.subscriptions;
  uid uuid; item jsonb; ev eu_rico_billing.events; sid uuid; cycle_no integer; result jsonb;
begin
  select * into strict cfg from eu_rico_billing.settings where singleton;
  if p_action='mp_reserve' then
    uid:=(p_data->>'userId')::uuid;
    if not exists(select 1 from auth.users where id=uid) then raise exception 'AUTH_REQUIRED'; end if;
    if not cfg.checkout_enabled or cfg.checkout_provider<>'mercadopago' or cfg.amount_cents<>2999 then raise exception 'CHECKOUT_DISABLED'; end if;
    perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
    select * into cfg from eu_rico_billing.settings where singleton for share;
    if not cfg.checkout_enabled or cfg.checkout_provider<>'mercadopago' or cfg.amount_cents<>2999 then raise exception 'CHECKOUT_DISABLED'; end if;
    if exists(select 1 from eu_rico_billing.subscriptions s join eu_rico_billing.cycles c on c.subscription_id=s.id
      where s.user_id=uid and s.environment=cfg.environment and not s.blocked and s.status in ('active','late','canceled')
      and c.status='paid' and c.starts_at<=statement_timestamp() and c.ends_at>statement_timestamp()) then raise exception 'ALREADY_SUBSCRIBED'; end if;
    -- An unresolved creation never expires into another POST. Recovery is read-only.
    select * into intent from eu_rico_billing.intents i where i.user_id=uid and i.environment=cfg.environment and i.provider='mercadopago'
      and not exists(select 1 from eu_rico_billing.subscriptions s where s.intent_id=i.id and s.status='canceled') order by i.created_at desc limit 1;
    if found then return jsonb_build_object('intent',to_jsonb(intent),'create',false); end if;
    -- An older Cakto checkout may still be payable. Do not open a competing provider checkout.
    if exists(select 1 from eu_rico_billing.intents where user_id=uid and environment=cfg.environment and provider='cakto' and not consumed) then raise exception 'LEGACY_CHECKOUT_PENDING'; end if;
    insert into eu_rico_billing.intents(user_id,environment,provider,product_id,offer_id,amount_cents,creation_started_at)
      values(uid,cfg.environment,'mercadopago','eu-rico-premium','eu-rico-monthly-2999-v1',2999,clock_timestamp()) returning * into intent;
    return jsonb_build_object('intent',to_jsonb(intent),'create',true);
  elsif p_action='mp_created' then
    select * into intent from eu_rico_billing.intents where id=(p_data->>'intentId')::uuid and provider='mercadopago' and environment=cfg.environment for update;
    if not found or (intent.provider_subscription_id is not null and intent.provider_subscription_id<>p_data->>'subscriptionId') then raise exception 'CORRELATION_MISMATCH'; end if;
    update eu_rico_billing.intents set provider_subscription_id=p_data->>'subscriptionId',checkout_url=coalesce(p_data->>'url',checkout_url) where id=intent.id;
    return jsonb_build_object('recorded',true);
  elsif p_action='mp_subscriptions' then
    return coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from eu_rico_billing.subscriptions s where s.provider='mercadopago' and s.environment=cfg.environment and (p_data->>'userId' is null or s.user_id=(p_data->>'userId')::uuid)),'[]');
  elsif p_action='mp_pending' then
    with candidates as (select id from eu_rico_billing.intents where provider='mercadopago' and environment=cfg.environment and not consumed
      and creation_started_at<clock_timestamp()-interval '10 seconds' order by recovery_checked_at,id limit 5 for update skip locked),
    touched as (update eu_rico_billing.intents set recovery_checked_at=clock_timestamp() where id in(select id from candidates) returning *)
    select coalesce(jsonb_agg(to_jsonb(touched)),'[]') into result from touched;
    return result;
  elsif p_action='mp_ingest' then
    if p_data->>'environment' is distinct from cfg.environment then raise exception 'ENVIRONMENT_MISMATCH'; end if;
    insert into eu_rico_billing.events(provider,dedupe_key,environment,event,order_id)
      values('mercadopago',p_data->>'key',cfg.environment,p_data->>'event',p_data->>'resourceId') on conflict(dedupe_key) do nothing;
    return jsonb_build_object('accepted',true);
  elsif p_action='mp_claim' then
    select * into ev from eu_rico_billing.events where provider='mercadopago' and
      ((state='pending' and available_at<=clock_timestamp()) or (state='processing' and lease_until<clock_timestamp())) order by created_at for update skip locked limit 1;
    if not found then return 'null'::jsonb; end if;
    update eu_rico_billing.events set state='processing',lease_until=clock_timestamp()+interval '2 minutes',lease_token=gen_random_uuid(),attempts=attempts+1 where id=ev.id returning * into ev;
    return to_jsonb(ev);
  elsif p_action in ('mp_done','mp_retry') then
    return eu_rico_billing.cakto_admin_v2(case when p_action='mp_done' then 'done' else 'retry' end,p_data);
  elsif p_action='mp_apply' then
    if p_data->>'environment' is distinct from cfg.environment or (p_data->>'amountCents')::int is distinct from 2999 or p_data->>'currency' is distinct from 'BRL' then raise exception 'BILLING_CONTRACT_MISMATCH'; end if;
    perform pg_advisory_xact_lock(hashtextextended('mercadopago:'||(p_data->>'subscriptionId'),1));
    select * into sub from eu_rico_billing.subscriptions where provider='mercadopago' and environment=cfg.environment and provider_id=p_data->>'subscriptionId' for update;
    if found then
      if sub.intent_id is distinct from (p_data->>'callback')::uuid then raise exception 'CORRELATION_MISMATCH'; end if;
      sid:=sub.id;
    else
      select * into intent from eu_rico_billing.intents where id=(p_data->>'callback')::uuid and provider='mercadopago' and environment=cfg.environment for update;
      if not found or intent.user_id is null or intent.consumed or intent.amount_cents<>2999
        or intent.provider_subscription_id is distinct from p_data->>'subscriptionId'
        or (p_data->>'createdAt')::timestamptz<intent.created_at or (p_data->>'createdAt')::timestamptz>intent.expires_at then raise exception 'CORRELATION_REQUIRED'; end if;
      insert into eu_rico_billing.subscriptions(provider,user_id,intent_id,environment,provider_id,product_id,offer_id,status,amount_cents,currency,provider_updated_at)
        values('mercadopago',intent.user_id,intent.id,cfg.environment,p_data->>'subscriptionId',intent.product_id,intent.offer_id,p_data->>'status',2999,'BRL',(p_data->>'updatedAt')::timestamptz) returning id into sid;
      update eu_rico_billing.intents set consumed=true where id=intent.id;
    end if;
    update eu_rico_billing.subscriptions set status=case when status='canceled' then status else p_data->>'status' end,
      provider_updated_at=(p_data->>'updatedAt')::timestamptz,verified_at=clock_timestamp()
      where id=sid and provider_updated_at<=(p_data->>'updatedAt')::timestamptz;
    for item in select value from jsonb_array_elements(p_data->'payments') loop
      if (item->>'amountCents')::int is distinct from 2999 or item->>'currency' is distinct from 'BRL' then raise exception 'BILLING_CONTRACT_MISMATCH'; end if;
      if exists(select 1 from eu_rico_billing.payments where provider='mercadopago' and environment=cfg.environment and provider_id=item->>'id' and subscription_id<>sid) then raise exception 'PAYMENT_OWNER_MISMATCH'; end if;
      select cycle_number into cycle_no from eu_rico_billing.cycles where provider='mercadopago' and environment=cfg.environment and provider_id=item->>'invoiceId';
      if not found then select coalesce(max(cycle_number),0)+1 into cycle_no from eu_rico_billing.cycles where subscription_id=sid; end if;
      if exists(select 1 from eu_rico_billing.payments where provider='mercadopago' and environment=cfg.environment and provider_id=item->>'id' and cycle_number<>cycle_no) then raise exception 'PAYMENT_CYCLE_MISMATCH'; end if;
      insert into eu_rico_billing.cycles(provider,environment,provider_id,subscription_id,cycle_number,amount_cents,currency,status,starts_at,ends_at)
        values('mercadopago',cfg.environment,item->>'invoiceId',sid,cycle_no,2999,'BRL','pending',(item->>'startsAt')::timestamptz,(item->>'endsAt')::timestamptz)
        on conflict(provider,environment,provider_id) do nothing;
      if exists(select 1 from eu_rico_billing.cycles where provider='mercadopago' and environment=cfg.environment and provider_id=item->>'invoiceId' and subscription_id<>sid) then raise exception 'CYCLE_OWNER_MISMATCH'; end if;
      insert into eu_rico_billing.payments(provider,environment,provider_id,subscription_id,cycle_number,amount_cents,currency,status,paid_at,provider_updated_at,refunded_amount_cents)
        values('mercadopago',cfg.environment,item->>'id',sid,cycle_no,2999,'BRL',item->>'status',(item->>'paidAt')::timestamptz,(item->>'updatedAt')::timestamptz,coalesce((item->>'refundedAmountCents')::int,0))
        on conflict(provider,environment,provider_id) do update set
          status=case when eu_rico_billing.payments.status in ('refunded','chargedback') then eu_rico_billing.payments.status else excluded.status end,
          paid_at=excluded.paid_at,provider_updated_at=excluded.provider_updated_at,
          refunded_amount_cents=greatest(eu_rico_billing.payments.refunded_amount_cents,excluded.refunded_amount_cents)
        where eu_rico_billing.payments.provider_updated_at<=excluded.provider_updated_at;
    end loop;
    update eu_rico_billing.cycles c set status=case
      when exists(select 1 from eu_rico_billing.payments p where p.subscription_id=sid and p.cycle_number=c.cycle_number and p.status in ('refunded','chargedback')) then 'revoked'
      when exists(select 1 from eu_rico_billing.payments p where p.subscription_id=sid and p.cycle_number=c.cycle_number and p.status in ('paid','partially_refunded') and p.paid_at is not null) then 'paid' else 'pending' end where c.subscription_id=sid;
    update eu_rico_billing.subscriptions set blocked=blocked or exists(select 1 from eu_rico_billing.payments where subscription_id=sid and status='chargedback') where id=sid;
    update eu_rico_billing.intents set state=case
      when exists(select 1 from eu_rico_billing.cycles where subscription_id=sid and status='paid') then 'confirmed'
      when exists(select 1 from eu_rico_billing.payments where subscription_id=sid and status='refused') then 'refused' else 'verification_pending' end where id=(select intent_id from eu_rico_billing.subscriptions where id=sid);
    insert into eu_rico_billing.audit(action,actor,subject,details) values('provider_reconciled','backend',sid::text,jsonb_build_object('provider','mercadopago','status',p_data->>'status'));
    return jsonb_build_object('applied',true);
  end if;
  raise exception 'UNKNOWN_BILLING_ACTION';
end $$;
revoke all on function eu_rico_billing.mp_admin(text,jsonb) from public,anon,authenticated,service_role;
create or replace function eu_rico_billing.admin(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  if left(p_action,3)='mp_' then return eu_rico_billing.mp_admin(p_action,p_data); end if;
  return eu_rico_billing.cakto_admin_v2(p_action,p_data);
end $$;
create or replace function public.eu_rico_billing_admin(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select eu_rico_billing.admin(p_action,p_data); $$;
revoke all on function eu_rico_billing.admin(text,jsonb),public.eu_rico_billing_admin(text,jsonb) from public,anon,authenticated;
grant execute on function eu_rico_billing.admin(text,jsonb),public.eu_rico_billing_admin(text,jsonb) to service_role;

do $status$ declare body text; begin
  select pg_get_functiondef('eu_rico_private.eu_rico_billing_status()'::regprocedure) into body;
  body:=replace(body,'''checkoutEnabled'',checkout_enabled,','''checkoutEnabled'',checkout_enabled,''checkoutProvider'',checkout_provider,');
  body:=replace(body,'''id'',id,''status'',status','''id'',id,''status'',status,''provider'',provider');
  body:=replace(body,'''id'',p.provider_id,''status'',p.status','''id'',p.provider_id,''provider'',p.provider,''status'',p.status,''refundedAmountCents'',p.refunded_amount_cents');
  execute body;
end $status$;
commit;
