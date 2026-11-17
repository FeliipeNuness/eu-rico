-- Local preparation only. Apply to a shared database only after explicit approval.
begin;
create table public.eu_rico_notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  content text not null default '' check (char_length(content) <= 20000),
  category text check (category in ('Pessoal','Financeiro','Ideias','Lembretes','Trabalho')),
  is_pinned boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index eu_rico_notes_owner on public.eu_rico_notes(user_id, updated_at desc);
alter table public.eu_rico_notes enable row level security;
revoke all on public.eu_rico_notes from public, anon, authenticated;
grant select, insert, update, delete on public.eu_rico_notes to authenticated;
create policy notes_owner on public.eu_rico_notes for all to authenticated
  using ((select auth.uid()) = user_id and (select eu_rico_private.eu_rico_can_access()))
  with check ((select auth.uid()) = user_id and (select eu_rico_private.eu_rico_can_access()));

create function public.eu_rico_notes_list() returns jsonb
language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(n) order by n.updated_at desc), '[]'::jsonb)
  from public.eu_rico_notes n where n.user_id = (select auth.uid());
$$;
create function public.eu_rico_notes_save(p_id uuid, p_note jsonb, p_expected_updated_at timestamptz default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result public.eu_rico_notes;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if jsonb_typeof(p_note->'title') is distinct from 'string'
    or jsonb_typeof(p_note->'content') is distinct from 'string'
    or jsonb_typeof(p_note->'is_pinned') is distinct from 'boolean'
    or not (p_note ? 'category') then raise exception 'Invalid note' using errcode = '22023'; end if;
  if p_expected_updated_at is null then
    insert into public.eu_rico_notes(id, title, content, category, is_pinned)
    values(p_id, p_note->>'title', p_note->>'content', p_note->>'category', (p_note->>'is_pinned')::boolean)
    on conflict (id) do nothing returning * into result;
    -- An exact retry after a lost response confirms only the owner's original content.
    if result.id is null then
      select * into result from public.eu_rico_notes where id=p_id and user_id=auth.uid()
        and title=p_note->>'title' and content=p_note->>'content'
        and category is not distinct from p_note->>'category' and is_pinned=(p_note->>'is_pinned')::boolean;
    end if;
  else
    update public.eu_rico_notes set title=p_note->>'title', content=p_note->>'content',
      category=p_note->>'category', is_pinned=(p_note->>'is_pinned')::boolean,
      updated_at=clock_timestamp()
    where id=p_id and user_id=auth.uid() and updated_at=p_expected_updated_at returning * into result;
  end if;
  if result.id is null then raise exception 'Note conflict' using errcode = 'PT409'; end if;
  return to_jsonb(result);
end;
$$;
create function public.eu_rico_notes_delete(p_id uuid, p_expected_updated_at timestamptz) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.eu_rico_notes where id=p_id and user_id=auth.uid() and updated_at=p_expected_updated_at;
  if not found then raise exception 'Note conflict' using errcode = 'PT409'; end if;
end;
$$;
revoke all on function public.eu_rico_notes_list(), public.eu_rico_notes_save(uuid,jsonb,timestamptz), public.eu_rico_notes_delete(uuid,timestamptz) from public, anon;
grant execute on function public.eu_rico_notes_list(), public.eu_rico_notes_save(uuid,jsonb,timestamptz), public.eu_rico_notes_delete(uuid,timestamptz) to authenticated;
commit;
