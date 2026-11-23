-- Only an authenticated admin/superadmin may lock or unlock a maintenance record.
-- Locking remains independent per record and is audited; legacy records stay unlocked.
BEGIN;

ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid;

CREATE OR REPLACE FUNCTION public.maintenance_record_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_admin boolean;
  v_reason text;
BEGIN
  -- Newly submitted records cannot forge an administrative lock.
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_locked OR NEW.locked_at IS NOT NULL OR NEW.locked_by IS NOT NULL THEN
      RAISE EXCEPTION 'lock_admin_only' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id = auth.uid() AND a.role IN ('admin','superadmin')
  ) INTO v_admin;

  IF TG_OP = 'DELETE' THEN
    IF OLD.is_locked AND NOT v_admin THEN
      RAISE EXCEPTION 'record_locked_admin_only' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- This guard also runs inside privileged maintenance_edit_record(), not just direct REST writes.
  IF OLD.is_locked AND NOT v_admin THEN
    RAISE EXCEPTION 'record_locked_admin_only' USING ERRCODE = '42501';
  END IF;

  IF (NEW.is_locked, NEW.locked_at, NEW.locked_by)
     IS DISTINCT FROM (OLD.is_locked, OLD.locked_at, OLD.locked_by) THEN
    IF NOT v_admin THEN
      RAISE EXCEPTION 'lock_admin_only' USING ERRCODE = '42501';
    END IF;
    v_reason := current_setting('app.maintenance_change_reason', true);
    IF length(btrim(coalesce(v_reason, ''))) < 5 OR length(v_reason) > 700 THEN
      RAISE EXCEPTION 'lock_change_reason_required' USING ERRCODE = '42501';
    END IF;
    IF NEW.is_locked THEN
      IF NEW.locked_by IS DISTINCT FROM auth.uid() OR NEW.locked_at IS NULL THEN
        RAISE EXCEPTION 'invalid_lock_metadata' USING ERRCODE = '22023';
      END IF;
    ELSIF NEW.locked_at IS NOT NULL OR NEW.locked_by IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_unlock_metadata' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS maintenance_record_lock_guard_trg ON public.maintenance_records;
CREATE TRIGGER maintenance_record_lock_guard_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.maintenance_records
FOR EACH ROW EXECUTE FUNCTION public.maintenance_record_lock_guard();

CREATE OR REPLACE FUNCTION public.maintenance_record_lock_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.maintenance_record_change_log
    (station_id, record_id, old_value, new_value, reason, changed_by)
  VALUES (
    NEW.station_id, NEW.id,
    jsonb_build_object('is_locked', OLD.is_locked, 'locked_at', OLD.locked_at,
                       'locked_by', OLD.locked_by),
    jsonb_build_object('is_locked', NEW.is_locked, 'locked_at', NEW.locked_at,
                       'locked_by', NEW.locked_by),
    current_setting('app.maintenance_change_reason', true), auth.uid()
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS maintenance_record_lock_audit_trg ON public.maintenance_records;
CREATE TRIGGER maintenance_record_lock_audit_trg
AFTER UPDATE OF is_locked, locked_at, locked_by ON public.maintenance_records
FOR EACH ROW WHEN (
  OLD.is_locked IS DISTINCT FROM NEW.is_locked OR
  OLD.locked_at IS DISTINCT FROM NEW.locked_at OR
  OLD.locked_by IS DISTINCT FROM NEW.locked_by
)
EXECUTE FUNCTION public.maintenance_record_lock_audit();

CREATE OR REPLACE FUNCTION public.maintenance_set_lock(
  p_record_id uuid,
  p_locked boolean,
  p_expected_locked boolean,
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
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = v_actor AND role IN ('admin','superadmin')
  ) THEN
    RAISE EXCEPTION 'lock_admin_only' USING ERRCODE = '42501';
  END IF;
  IF p_locked IS NULL OR p_expected_locked IS NULL OR
     length(btrim(coalesce(p_reason,''))) < 5 OR length(p_reason) > 700 THEN
    RAISE EXCEPTION 'invalid_lock_request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_record
  FROM public.maintenance_records
  WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_record.is_locked IS DISTINCT FROM p_expected_locked THEN
    RAISE EXCEPTION 'lock_changed_reload' USING ERRCODE = '40001';
  END IF;
  IF v_record.is_locked = p_locked THEN
    RAISE EXCEPTION 'lock_already_in_requested_state' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.maintenance_change_reason', btrim(p_reason), true);
  UPDATE public.maintenance_records
  SET is_locked = p_locked,
      locked_at = CASE WHEN p_locked THEN clock_timestamp() ELSE NULL END,
      locked_by = CASE WHEN p_locked THEN v_actor ELSE NULL END
  WHERE id = p_record_id;

  RETURN jsonb_build_object(
    'id', p_record_id, 'is_locked', p_locked,
    'changed_by', v_actor, 'station_id', v_record.station_id,
    'updated', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.maintenance_set_lock(uuid,boolean,boolean,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maintenance_set_lock(uuid,boolean,boolean,text)
  TO authenticated;

COMMIT;