-- Compatible expansion only. No rows, historical amounts, contracts, activation or offers are updated.
-- Requires reviewed billing schema; remote execution needs separate authorization and a restored backup.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
do $expand$
declare relation text; entry record; found_count integer;
begin
  if to_regprocedure('eu_rico_billing.admin(text,jsonb)') is null then raise exception 'BILLING_SCHEMA_REQUIRED'; end if;
  foreach relation in array array['settings','intents','subscriptions','cycles','payments'] loop
    found_count:=0;
    for entry in select conname from pg_constraint where conrelid=('eu_rico_billing.'||relation)::regclass and contype='c' and pg_get_constraintdef(oid) like '%amount_cents%' loop
      found_count:=found_count+1;
      if replace(pg_get_constraintdef((select oid from pg_constraint where conrelid=('eu_rico_billing.'||relation)::regclass and conname=entry.conname)),' ','') <> 'CHECK((amount_cents=999))' then raise exception 'UNEXPECTED_PRICE_CONSTRAINT'; end if;
      execute format('alter table eu_rico_billing.%I drop constraint %I',relation,entry.conname);
    end loop;
    if found_count<>1 then raise exception 'UNEXPECTED_PRICE_SCHEMA'; end if;
    execute format('alter table eu_rico_billing.%I add constraint %I check(amount_cents in (999,2999)) not valid',relation,relation||'_amount_cents_check');
    execute format('alter table eu_rico_billing.%I validate constraint %I',relation,relation||'_amount_cents_check');
  end loop;
end $expand$;

create or replace function eu_rico_billing.admin(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg eu_rico_billing.settings; intent eu_rico_billing.intents; sub eu_rico_billing.subscriptions;
  item jsonb; output jsonb; uid uuid; sid uuid; ev eu_rico_billing.events;
begin
  select * into cfg from eu_rico_billing.settings where singleton;
  -- commercial-contract-v2: look up the immutable price/product/offer already bound to the contract.
  if p_action='contract' then
    select * into sub from eu_rico_billing.subscriptions where environment=cfg.environment and provider_id=p_data->>'subscriptionId';
    if found then return to_jsonb(sub); end if;
    select * into intent from eu_rico_billing.intents where id=nullif(p_data->>'callback','')::uuid and environment=cfg.environment;
    if not found then raise exception 'CONTRACT_NOT_FOUND'; end if;
    return to_jsonb(intent);
  end if;
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
    select * into intent from eu_rico_billing.intents where user_id=uid and not consumed and expires_at>statement_timestamp() and environment=cfg.environment and product_id=cfg.product_id and offer_id=cfg.offer_id and amount_cents=cfg.amount_cents order by created_at desc limit 1;
    if not found then insert into eu_rico_billing.intents(user_id,environment,product_id,offer_id,amount_cents) values(uid,cfg.environment,cfg.product_id,cfg.offer_id,cfg.amount_cents) returning * into intent; end if;
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
    if p_data->>'environment' is distinct from cfg.environment or (p_data->>'amountCents')::int not in (999,2999) or p_data->>'currency' is distinct from 'BRL' then raise exception 'BILLING_CONTRACT_MISMATCH'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_data->>'subscriptionId',1));
    select * into sub from eu_rico_billing.subscriptions where environment=cfg.environment and provider_id=p_data->>'subscriptionId' for update;
    if found then
      if p_data->>'productId' is distinct from sub.product_id or p_data->>'offerId' is distinct from sub.offer_id or (p_data->>'amountCents')::int is distinct from sub.amount_cents then raise exception 'BILLING_CONTRACT_MISMATCH'; end if;
      if (p_data->>'updatedAt')::timestamptz<sub.provider_updated_at then return jsonb_build_object('stale',true); end if;
      sid:=sub.id;
      if p_data->>'callback' is not null and p_data->>'callback'<>sub.intent_id::text then raise exception 'CORRELATION_MISMATCH'; end if;
    else
      select * into intent from eu_rico_billing.intents where id=(p_data->>'callback')::uuid for update;
      if not found or intent.user_id is null or intent.environment<>cfg.environment or intent.product_id is distinct from p_data->>'productId' or intent.offer_id is distinct from p_data->>'offerId' or intent.amount_cents is distinct from (p_data->>'amountCents')::int or intent.consumed or p_data->>'orderCreatedAt' is null or (p_data->>'orderCreatedAt')::timestamptz<intent.created_at or (p_data->>'orderCreatedAt')::timestamptz>intent.expires_at then raise exception 'CORRELATION_REQUIRED'; end if;
      insert into eu_rico_billing.subscriptions(user_id,intent_id,environment,provider_id,product_id,offer_id,status,amount_cents,currency,provider_updated_at)
        values(intent.user_id,intent.id,cfg.environment,p_data->>'subscriptionId',intent.product_id,intent.offer_id,p_data->>'status',intent.amount_cents,'BRL',(p_data->>'updatedAt')::timestamptz) returning id into sid;
      update eu_rico_billing.intents set consumed=true where id=intent.id;
    end if;
    update eu_rico_billing.subscriptions set status=case when status='canceled' then status else p_data->>'status' end,blocked=blocked or coalesce((p_data->>'blocked')::boolean,false),provider_updated_at=(p_data->>'updatedAt')::timestamptz,verified_at=clock_timestamp() where id=sid;
    for item in select value from jsonb_array_elements(p_data->'payments') loop
      if (item->>'amountCents')::int is distinct from (p_data->>'amountCents')::int or item->>'currency' is distinct from 'BRL' then raise exception 'BILLING_CONTRACT_MISMATCH'; end if;
      if exists(select 1 from eu_rico_billing.payments where environment=cfg.environment and provider_id=item->>'id' and subscription_id<>sid) then raise exception 'PAYMENT_OWNER_MISMATCH'; end if;
      insert into eu_rico_billing.payments values(cfg.environment,item->>'id',sid,(item->>'cycleNumber')::int,(item->>'amountCents')::int,item->>'currency',item->>'status',nullif(item->>'paidAt','')::timestamptz)
        on conflict(environment,provider_id) do update set status=case when eu_rico_billing.payments.status in ('refunded','chargedback','prechargeback','MED') then eu_rico_billing.payments.status else excluded.status end,paid_at=excluded.paid_at;
    end loop;
    for item in select value from jsonb_array_elements(p_data->'cycles') loop
      if (item->>'amountCents')::int is distinct from (p_data->>'amountCents')::int or item->>'currency' is distinct from 'BRL' then raise exception 'BILLING_CONTRACT_MISMATCH'; end if;
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

commit;
