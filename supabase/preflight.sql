-- Read only. Run in the authorized target before applying any migration.
select current_database(), current_user, version();
select table_schema, table_name from information_schema.tables
where table_schema = 'public' order by table_name;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;
select n.nspname, p.proname, p.prosecdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'eu_rico_%';
