-- Non-destructive rollback: freeze new writes; preserve all cloud data and reads.
-- Requires authorization on remote environments. Do not DROP tables with user data.
begin;
revoke execute on function public.eu_rico_save(jsonb,bigint,uuid,boolean) from authenticated;
commit;
-- To resume after a reviewed fix:
-- grant execute on function public.eu_rico_save(jsonb,bigint,uuid,boolean) to authenticated;
