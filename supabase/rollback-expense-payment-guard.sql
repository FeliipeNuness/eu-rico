-- Rollback payment validation; no row, policy, grant or ownership is changed.
-- Requires the existing cloud schema and PT409 conflict patch. Repeated application fails closed.
begin;
do $patch$
declare definition text;
begin
  select pg_get_functiondef('public.eu_rico_valid_record(text,jsonb)'::regprocedure) into definition;
  if strpos(definition, $needle$(not doc ? 'note' or (jsonb_typeof(doc->'note') = 'string' and length(doc->>'note') <= 1000))
      and ((not doc ? 'paymentStatus' and not doc ? 'paidAt') or
        (doc->>'paymentStatus' in ('pending','paid') and
          case when doc->>'paymentStatus' = 'paid' then jsonb_typeof(doc->'paidAt') = 'string' and public.eu_rico_valid_date(doc->>'paidAt') else not doc ? 'paidAt' end))
      and (not doc ? 'recurrence' or doc->>'recurrence' in ('Única','Mensal'))
      and (not doc ? 'seriesId' or (jsonb_typeof(doc->'seriesId') = 'string' and length(doc->>'seriesId') between 1 and 200))
      and (not doc ? 'recurrenceDay' or (jsonb_typeof(doc->'recurrenceDay') = 'number' and (doc->>'recurrenceDay')::numeric between 1 and 31 and trunc((doc->>'recurrenceDay')::numeric) = (doc->>'recurrenceDay')::numeric))$needle$) = 0 then
    raise exception 'EU_RICO_PAYMENT_GUARD_PRECONDITION_FAILED';
  end if;
  execute replace(definition, $needle$(not doc ? 'note' or (jsonb_typeof(doc->'note') = 'string' and length(doc->>'note') <= 1000))
      and ((not doc ? 'paymentStatus' and not doc ? 'paidAt') or
        (doc->>'paymentStatus' in ('pending','paid') and
          case when doc->>'paymentStatus' = 'paid' then jsonb_typeof(doc->'paidAt') = 'string' and public.eu_rico_valid_date(doc->>'paidAt') else not doc ? 'paidAt' end))
      and (not doc ? 'recurrence' or doc->>'recurrence' in ('Única','Mensal'))
      and (not doc ? 'seriesId' or (jsonb_typeof(doc->'seriesId') = 'string' and length(doc->>'seriesId') between 1 and 200))
      and (not doc ? 'recurrenceDay' or (jsonb_typeof(doc->'recurrenceDay') = 'number' and (doc->>'recurrenceDay')::numeric between 1 and 31 and trunc((doc->>'recurrenceDay')::numeric) = (doc->>'recurrenceDay')::numeric))$needle$, $replacement$(not doc ? 'note' or (jsonb_typeof(doc->'note') = 'string' and length(doc->>'note') <= 1000))$replacement$);
  select pg_get_functiondef('eu_rico_private.eu_rico_save(jsonb,bigint,uuid,boolean)'::regprocedure) into definition;
  if strpos(definition, $needle$if profile.revision <> p_expected_revision then raise exception 'EU_RICO_CONFLICT' using errcode = 'PT409'; end if;
    -- Payment guard: an old editor must not silently discard a confirmed state.
    -- Explicit backup restoration preserves the old snapshot and may restore unknown legacy states.
    if not p_preserve and exists (
      select 1 from jsonb_array_elements(p_data->'expenses') incoming
      join public.eu_rico_expenses previous on previous.user_id = owner_id and previous.source_id = incoming->>'id'
      where previous.payload ? 'paymentStatus' and not incoming ? 'paymentStatus'
    ) then raise exception 'EU_RICO_PAYMENT_CLIENT_OUTDATED' using errcode = 'PT422'; end if;
    -- End payment guard.$needle$) = 0 then
    raise exception 'EU_RICO_PAYMENT_GUARD_PRECONDITION_FAILED';
  end if;
  execute replace(definition, $needle$if profile.revision <> p_expected_revision then raise exception 'EU_RICO_CONFLICT' using errcode = 'PT409'; end if;
    -- Payment guard: an old editor must not silently discard a confirmed state.
    -- Explicit backup restoration preserves the old snapshot and may restore unknown legacy states.
    if not p_preserve and exists (
      select 1 from jsonb_array_elements(p_data->'expenses') incoming
      join public.eu_rico_expenses previous on previous.user_id = owner_id and previous.source_id = incoming->>'id'
      where previous.payload ? 'paymentStatus' and not incoming ? 'paymentStatus'
    ) then raise exception 'EU_RICO_PAYMENT_CLIENT_OUTDATED' using errcode = 'PT422'; end if;
    -- End payment guard.$needle$, $replacement$if profile.revision <> p_expected_revision then raise exception 'EU_RICO_CONFLICT' using errcode = 'PT409'; end if;$replacement$);
end
$patch$;
commit;
