-- Incremental correction only. Remote execution requires staging approval.
-- CREATE OR REPLACE preserves the existing function identity, owner and ACL.
BEGIN;
DO $migration$
DECLARE
  definition text;
  old_branch constant text := 'raise exception ''EU_RICO_CONFLICT'' using errcode = ''40001''';
  new_branch constant text := 'raise exception ''EU_RICO_CONFLICT'' using errcode = ''PT409''';
BEGIN
  definition := pg_get_functiondef(
    'eu_rico_private.eu_rico_save(jsonb,bigint,uuid,boolean)'::regprocedure
  );
  IF (length(definition) - length(replace(definition, old_branch, ''))) <> length(old_branch)
     OR position(new_branch IN definition) > 0 THEN
    RAISE EXCEPTION 'EU_RICO_CONFLICT_PATCH_PRECONDITION_FAILED';
  END IF;
  EXECUTE replace(definition, old_branch, new_branch);
END
$migration$;
COMMIT;
