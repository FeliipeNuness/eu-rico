-- Additive export API. Does not alter the financial backup/restore protocol or paid-area policies.
-- Apply only after cloud, billing and notes schemas have been inventoried and approved.
begin;
create function eu_rico_private.eu_rico_account_export() returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); result jsonb;
begin
  if owner_id is null or not exists(select 1 from auth.users where id=owner_id) then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  select jsonb_build_object(
    'financial',eu_rico_private.eu_rico_snapshot_unchecked(),
    'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from public.eu_rico_notes n where n.user_id=owner_id),'[]'::jsonb),
    'billing',eu_rico_private.eu_rico_billing_status()
  ) into result;
  return result;
end;
$$;
create function public.eu_rico_account_export() returns jsonb
language sql security invoker set search_path='' as $$ select eu_rico_private.eu_rico_account_export(); $$;
revoke all on function eu_rico_private.eu_rico_account_export(),public.eu_rico_account_export() from public,anon;
grant execute on function eu_rico_private.eu_rico_account_export(),public.eu_rico_account_export() to authenticated;
commit;
