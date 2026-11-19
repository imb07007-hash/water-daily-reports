-- Audited, all-or-nothing batch updates. One request = one PostgreSQL transaction.
-- The existing per-record RPCs preserve permissions, field validation, and audit history.
BEGIN;

CREATE OR REPLACE FUNCTION public.maintenance_bulk_edit_records(
  p_items jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_count integer;
  v_item jsonb;
  v_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id = v_actor AND a.role IN ('admin','superadmin')
  ) THEN
    RAISE EXCEPTION 'bulk_edit_admin_only' USING ERRCODE='42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_bulk_items' USING ERRCODE='22023';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 50
     OR length(btrim(coalesce(p_reason,''))) < 5
     OR length(p_reason) > 700 THEN
    RAISE EXCEPTION 'invalid_bulk_edit_request' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(DISTINCT item->>'id') FROM jsonb_array_elements(p_items) AS t(item)) <> v_count THEN
    RAISE EXCEPTION 'duplicate_bulk_record' USING ERRCODE='22023';
  END IF;

  -- Sort IDs consistently to reduce the chance of deadlocks in parallel batches.
  FOR v_item IN
    SELECT item FROM jsonb_array_elements(p_items) AS t(item)
    ORDER BY item->>'id'
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR NOT (v_item ?& ARRAY['id','expected','values']) THEN
      RAISE EXCEPTION 'invalid_bulk_edit_item' USING ERRCODE='22023';
    END IF;
    v_id := (v_item->>'id')::uuid;
    PERFORM public.maintenance_edit_record(
      v_id, v_item->'values', v_item->'expected', p_reason
    );
  END LOOP;
  RETURN jsonb_build_object('updated',true,'changed',v_count,'changed_by',v_actor);
END;
$function$;

CREATE OR REPLACE FUNCTION public.maintenance_bulk_set_lock(
  p_items jsonb,
  p_locked boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_count integer;
  v_item jsonb;
  v_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id = v_actor AND a.role IN ('admin','superadmin')
  ) THEN
    RAISE EXCEPTION 'bulk_lock_admin_only' USING ERRCODE='42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR p_locked IS NULL THEN
    RAISE EXCEPTION 'invalid_bulk_lock_request' USING ERRCODE='22023';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 200
     OR length(btrim(coalesce(p_reason,''))) < 5
     OR length(p_reason) > 700 THEN
    RAISE EXCEPTION 'invalid_bulk_lock_request' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(DISTINCT item->>'id') FROM jsonb_array_elements(p_items) AS t(item)) <> v_count THEN
    RAISE EXCEPTION 'duplicate_bulk_record' USING ERRCODE='22023';
  END IF;
  FOR v_item IN
    SELECT item FROM jsonb_array_elements(p_items) AS t(item)
    ORDER BY item->>'id'
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR NOT (v_item ?& ARRAY['id','expected_locked'])
       OR jsonb_typeof(v_item->'expected_locked') <> 'boolean' THEN
      RAISE EXCEPTION 'invalid_bulk_lock_item' USING ERRCODE='22023';
    END IF;
    v_id := (v_item->>'id')::uuid;
    PERFORM public.maintenance_set_lock(
      v_id, p_locked, (v_item->>'expected_locked')::boolean, p_reason
    );
  END LOOP;
  RETURN jsonb_build_object('updated',true,'changed',v_count,'is_locked',p_locked,'changed_by',v_actor);
END;
$function$;

REVOKE ALL ON FUNCTION public.maintenance_bulk_edit_records(jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maintenance_bulk_set_lock(jsonb,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maintenance_bulk_edit_records(jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_bulk_set_lock(jsonb,boolean,text) TO authenticated;

COMMIT;