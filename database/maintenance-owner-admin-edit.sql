-- Maintenance record editing: only the creator or a verified admin/superadmin.
-- This RPC does not grant table-wide UPDATE and never changes ownership, station,
-- equipment, provenance or import identifiers.
BEGIN;

CREATE OR REPLACE FUNCTION public.maintenance_edit_record(
  p_record_id uuid,
  p_values jsonb,
  p_expected jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_record public.maintenance_records%ROWTYPE;
  v_previous jsonb;
  v_allowed boolean := false;
  v_keys text[] := ARRAY[
    'work_type','frequency','work_date','status','description','notes',
    'cost','spare_parts_cost','workers','hours','materials','spares'
  ];
  v_work_date date;
  v_cost numeric;
  v_spare_parts_cost numeric;
  v_workers numeric;
  v_hours numeric;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'login_required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 OR length(p_reason) > 700 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_record
  FROM public.maintenance_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Admin/superadmin can edit every station; other users only their own record
  -- while still assigned to the same active station.
  SELECT
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.user_id = v_actor AND a.role IN ('admin','superadmin')
    )
    OR (
      v_record.created_by IS NOT NULL
      AND v_record.created_by = v_actor
      AND EXISTS (SELECT 1 FROM public.stations s
                  WHERE s.id = v_record.station_id AND s.active)
      AND (
        EXISTS (SELECT 1 FROM public.maintenance_users mu
                WHERE mu.user_id = v_actor AND mu.station_id = v_record.station_id)
        OR EXISTS (SELECT 1 FROM public.station_users su
                   WHERE su.user_id = v_actor AND su.station_id = v_record.station_id)
      )
    )
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'edit_not_permitted' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_values) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
     OR NOT (p_values ?& v_keys)
     OR (SELECT count(*) FROM jsonb_object_keys(p_values)) <> cardinality(v_keys)
  THEN
    RAISE EXCEPTION 'invalid_edit_fields' USING ERRCODE = '22023';
  END IF;

  -- Reject stale UI state; a second editor must reload before saving.
  v_previous := jsonb_build_object(
    'work_type',v_record.work_type,'frequency',v_record.frequency,
    'work_date',v_record.work_date,'status',v_record.status,
    'description',v_record.description,'notes',v_record.notes,
    'cost',v_record.cost,'spare_parts_cost',v_record.spare_parts_cost,
    'workers',v_record.workers,'hours',v_record.hours,
    'materials',v_record.materials,'spares',v_record.spares
  );
  IF v_previous IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'record_changed_reload' USING ERRCODE = '40001';
  END IF;
  IF v_previous = p_values THEN
    RAISE EXCEPTION 'no_change' USING ERRCODE = '22023';
  END IF;

  IF p_values->>'work_type' NOT IN ('PM','CM','SS')
     OR p_values->>'status' NOT IN
       ('DONE','DONE WITH COMMENT','NOT DONE','UNVERIFIED','NEED CM','OTHERS','NOT IN SERVICE')
  THEN
    RAISE EXCEPTION 'invalid_work_type_or_status' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_values->>'frequency','')) > 100
     OR length(coalesce(p_values->>'description','')) > 3000
     OR length(coalesce(p_values->>'notes','')) > 4000
     OR length(coalesce(p_values->>'materials','')) > 4000
     OR length(coalesce(p_values->>'spares','')) > 4000
  THEN
    RAISE EXCEPTION 'field_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_values->>'status' = 'DONE WITH COMMENT'
     AND length(btrim(coalesce(p_values->>'notes',''))) = 0
  THEN
    RAISE EXCEPTION 'notes_required_for_done_with_comment' USING ERRCODE = '22023';
  END IF;

  IF nullif(p_values->>'work_date','') IS NOT NULL
     AND p_values->>'work_date' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION 'invalid_work_date' USING ERRCODE = '22023';
  END IF;
  v_work_date := nullif(p_values->>'work_date','')::date;
  v_cost := (p_values->>'cost')::numeric;
  v_spare_parts_cost := (p_values->>'spare_parts_cost')::numeric;
  v_workers := (p_values->>'workers')::numeric;
  v_hours := (p_values->>'hours')::numeric;

  IF (v_cost IS NOT NULL AND (v_cost < 0 OR v_cost > 1000000000))
     OR (v_spare_parts_cost IS NOT NULL AND (v_spare_parts_cost < 0 OR v_spare_parts_cost > 1000000000))
     OR (v_workers IS NOT NULL AND (v_workers < 0 OR v_workers > 100000 OR v_workers <> trunc(v_workers)))
     OR (v_hours IS NOT NULL AND (v_hours < 0 OR v_hours > 100000))
  THEN
    RAISE EXCEPTION 'invalid_numeric_values' USING ERRCODE = '22023';
  END IF;

  -- The AFTER UPDATE trigger records old/new values and the signed-in actor.
  PERFORM set_config('app.maintenance_change_reason', btrim(p_reason), true);
  UPDATE public.maintenance_records
  SET work_type = p_values->>'work_type',
      frequency = coalesce(p_values->>'frequency',''),
      work_date = v_work_date,
      period_month = CASE WHEN v_work_date IS NOT NULL
                          THEN date_trunc('month',v_work_date)::date
                          ELSE v_record.period_month END,
      status = p_values->>'status',
      description = coalesce(p_values->>'description',''),
      notes = coalesce(p_values->>'notes',''),
      cost = v_cost,
      spare_parts_cost = v_spare_parts_cost,
      workers = v_workers,
      hours = v_hours,
      materials = coalesce(p_values->>'materials',''),
      spares = coalesce(p_values->>'spares','')
  WHERE id = p_record_id;

  RETURN jsonb_build_object('id',p_record_id,'updated',true,
                            'station_id',v_record.station_id,
                            'changed_by',v_actor);
END;
$function$;

-- A public-schema SECURITY DEFINER RPC must not remain executable by PUBLIC.
REVOKE ALL ON FUNCTION public.maintenance_edit_record(uuid,jsonb,jsonb,text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maintenance_edit_record(uuid,jsonb,jsonb,text)
TO authenticated;

-- Expand the existing mandatory-reason audit to every editable maintenance field.
CREATE OR REPLACE FUNCTION public.maintenance_record_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_reason text;
BEGIN
  v_reason := current_setting('app.maintenance_change_reason',true);
  IF v_reason IS NULL
     OR length(btrim(v_reason)) < 5
     OR length(v_reason) > 700
  THEN
    RAISE EXCEPTION 'maintenance_change_reason_required';
  END IF;

  INSERT INTO public.maintenance_record_change_log(
    station_id,record_id,old_value,new_value,reason,changed_by
  ) VALUES (
    NEW.station_id,NEW.id,
    jsonb_build_object(
      'work_type',OLD.work_type,'frequency',OLD.frequency,'work_date',OLD.work_date,
      'status',OLD.status,'description',OLD.description,'notes',OLD.notes,
      'cost',OLD.cost,'spare_parts_cost',OLD.spare_parts_cost,
      'workers',OLD.workers,'hours',OLD.hours,
      'materials',OLD.materials,'spares',OLD.spares
    ),
    jsonb_build_object(
      'work_type',NEW.work_type,'frequency',NEW.frequency,'work_date',NEW.work_date,
      'status',NEW.status,'description',NEW.description,'notes',NEW.notes,
      'cost',NEW.cost,'spare_parts_cost',NEW.spare_parts_cost,
      'workers',NEW.workers,'hours',NEW.hours,
      'materials',NEW.materials,'spares',NEW.spares
    ),
    v_reason,auth.uid()
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS maintenance_record_audit_update ON public.maintenance_records;
CREATE TRIGGER maintenance_record_audit_update
AFTER UPDATE OF
  work_type,frequency,work_date,status,description,notes,cost,
  spare_parts_cost,workers,hours,materials,spares
ON public.maintenance_records
FOR EACH ROW
WHEN (
  OLD.work_type IS DISTINCT FROM NEW.work_type
  OR OLD.frequency IS DISTINCT FROM NEW.frequency
  OR OLD.work_date IS DISTINCT FROM NEW.work_date
  OR OLD.status IS DISTINCT FROM NEW.status
  OR OLD.description IS DISTINCT FROM NEW.description
  OR OLD.notes IS DISTINCT FROM NEW.notes
  OR OLD.cost IS DISTINCT FROM NEW.cost
  OR OLD.spare_parts_cost IS DISTINCT FROM NEW.spare_parts_cost
  OR OLD.workers IS DISTINCT FROM NEW.workers
  OR OLD.hours IS DISTINCT FROM NEW.hours
  OR OLD.materials IS DISTINCT FROM NEW.materials
  OR OLD.spares IS DISTINCT FROM NEW.spares
)
EXECUTE FUNCTION public.maintenance_record_audit_trigger();

-- Maintenance engineers may read the change history of their own records.
-- Existing station-user/admin policies are left untouched.
DROP POLICY IF EXISTS maintenance_change_log_owner_read
ON public.maintenance_record_change_log;
CREATE POLICY maintenance_change_log_owner_read
ON public.maintenance_record_change_log
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.maintenance_records mr
    JOIN public.maintenance_users mu
      ON mu.station_id = mr.station_id AND mu.user_id = (SELECT auth.uid())
    WHERE mr.id = maintenance_record_change_log.record_id
      AND mr.station_id = maintenance_record_change_log.station_id
      AND mr.created_by = (SELECT auth.uid())
  )
);

COMMIT;
