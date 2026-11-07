-- Read-only catalog checks; does not inspect user messages or change the database.
select 'public_tables' as check_name, count(*)::text as result
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
union all
select 'public_tables_without_rls', coalesce(string_agg(c.relname, ', '), 'none')
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
union all
select 'public_policies', count(*)::text from pg_policies where schemaname='public'
union all
select 'migration_history_table', coalesce(to_regclass('supabase_migrations.schema_migrations')::text, 'absent')
union all
select 'realtime_tables', coalesce(string_agg(tablename, ', '), 'none')
from pg_publication_tables where pubname='supabase_realtime' and schemaname='public';
