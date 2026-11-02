-- Read only post-migration inspection. Run on approved staging, never as a migration.
BEGIN READ ONLY;
SELECT c.relname, c.relrowsecurity,
       has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_has_any_access,
       has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
       has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') AS authenticated_direct_mutation
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('eu_rico_profiles','eu_rico_tasks','eu_rico_income','eu_rico_expenses','eu_rico_goals','eu_rico_recovery')
ORDER BY c.relname;

SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'eu_rico_%'
ORDER BY tablename,policyname;

SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','eu_rico_private') AND p.proname LIKE 'eu_rico_%'
ORDER BY n.nspname,p.proname;

SELECT tablename,indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename LIKE 'eu_rico_%' ORDER BY tablename,indexname;

SELECT c.relname, con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname LIKE 'eu_rico_%' ORDER BY c.relname,con.conname;
ROLLBACK;
