-- Prepared only: never enables billing or grants access. Requires reviewed billing schema.
-- Conservative gate: all accounts present at activation need independently reconciled paid access.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
do $$ begin
  if to_regprocedure('eu_rico_billing.set_activation(boolean,text)') is null then
    raise exception 'BILLING_SCHEMA_REQUIRED';
  end if;
end $$;

create or replace function eu_rico_billing.set_activation(p_enabled boolean,p_reason text) returns void
language plpgsql security invoker set search_path='' set lock_timeout='3s' as $$
declare previous boolean; unresolved bigint;
begin
  if p_enabled is null or p_reason is null or length(trim(p_reason))<10 then
    raise exception 'BILLING_REASON_REQUIRED';
  end if;
  select commercial_enabled into strict previous from eu_rico_billing.settings where singleton for update;
  if p_enabled and not previous then
    -- Freeze account creation and entitlement writes until this short activation transaction ends.
    lock table auth.users,eu_rico_billing.subscriptions,eu_rico_billing.cycles,eu_rico_billing.payments in share mode;
    select count(*) into unresolved from auth.users u where not exists(
      select 1 from eu_rico_billing.subscriptions s
      join eu_rico_billing.cycles c on c.subscription_id=s.id
      join eu_rico_billing.payments p on p.subscription_id=s.id and p.cycle_number=c.cycle_number
      where s.user_id=u.id
        and s.environment=(select environment from eu_rico_billing.settings where singleton)
        and not s.blocked and s.status in ('active','canceled','late')
        and c.status='paid' and c.starts_at<=statement_timestamp() and c.ends_at>statement_timestamp()
        and p.status='paid' and p.paid_at is not null
        and c.amount_cents=s.amount_cents and p.amount_cents=s.amount_cents
        and c.currency='BRL' and p.currency='BRL'
    );
    if unresolved>0 then
      raise exception 'BILLING_CONTINUITY_UNRESOLVED' using detail='Existing accounts require verified continuity before global activation';
    end if;
  end if;
  update eu_rico_billing.settings set commercial_enabled=p_enabled where singleton;
  insert into eu_rico_billing.audit(action,actor,details)
    values('commercial_activation',session_user,jsonb_build_object('before',previous,'after',p_enabled,'reason',p_reason));
end $$;
revoke all on function eu_rico_billing.set_activation(boolean,text) from public,anon,authenticated,service_role;
commit;
