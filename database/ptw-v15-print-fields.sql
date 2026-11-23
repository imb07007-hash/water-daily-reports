-- PTW v1.5: printed ST7-1 fields, AP department codes and manual-signature date/time metadata.
-- All fields are descriptive, NOT electronic signatures or authorizations.
begin;
alter table public.ptw_permits add column if not exists form_fields jsonb not null default '{}'::jsonb;
alter table public.ptw_receivers add column if not exists paper_name text;
alter table public.ptw_receivers add column if not exists paper_date date;
alter table public.ptw_receivers add column if not exists paper_time time without time zone;
CREATE OR REPLACE FUNCTION public.ptw_save_draft(p_id uuid, p_expected_version integer, p_patch jsonb)
 RETURNS ptw_permits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'ptw_private'
AS $function$
declare v_old public.ptw_permits; v_updated public.ptw_permits; v_row jsonb; v_i integer;
 v_allowed text[]:=array['area','equipment_id','equipment_name','component_no','wr_no','work_order','lob_no','requesting_department','description','work_condition','activities','risk_flags','planned_start','planned_end','sap_account_user_id','receivers','isolation_items','form_fields'];
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Patch must be object'; end if;
 if exists(select 1 from jsonb_object_keys(p_patch) k where k<>all(v_allowed)) then raise exception 'Unsupported or immutable field in patch'; end if;
 select * into v_old from public.ptw_permits where id=p_id for update;
 if not found then raise exception 'Permit not found'; end if;
 if not ptw_private.can_prepare(v_old.station_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 if v_old.status<>'draft' then raise exception 'Only DRAFT is editable'; end if;
 if p_expected_version<>v_old.version then raise exception 'VERSION_CONFLICT expected %, actual %',p_expected_version,v_old.version using errcode='40001'; end if;
 if p_patch ? 'work_condition' and p_patch->>'work_condition' not in ('live','dead','undetermined') and p_patch->>'work_condition' is not null then raise exception 'Invalid work condition'; end if;
 if p_patch ? 'equipment_id' and nullif(p_patch->>'equipment_id','') is not null and not exists(
  select 1 from public.maintenance_assets ma where ma.id=(p_patch->>'equipment_id')::uuid and ma.station_id=v_old.station_id
 ) then raise exception 'Equipment does not belong to permit station'; end if; if p_patch ? 'sap_account_user_id' and nullif(p_patch->>'sap_account_user_id','') is not null and not exists(
  select 1 from public.station_users su where su.station_id=v_old.station_id
  and su.user_id=(p_patch->>'sap_account_user_id')::uuid
 ) then raise exception 'SAP candidate must be a station operations login' using errcode='42501'; end if;

 if p_patch ? 'form_fields' then
   if jsonb_typeof(p_patch->'form_fields')<>'object' then raise exception 'Invalid ST7 form fields'; end if;
   if exists (select 1 from jsonb_object_keys(p_patch->'form_fields') as x(k)
      where x.k not in ('issuer.name','issuer.date','issuer.time','operationsNote',
        'ipptwNo','icptwNo','ipptwAttached','icptwAttached',
        'protective.yes','protective.no','protective.details',
        'maintProtect.yes','maintProtect.no','maintProtect.details')) then
      raise exception 'Unsupported ST7 field'; end if;
   if exists (select 1 from jsonb_each_text(p_patch->'form_fields') as x(k,v) where length(x.v)>1000)
     then raise exception 'ST7 field is too long'; end if;
 end if;
 if p_patch ? 'receivers' and jsonb_typeof(p_patch->'receivers')<>'array' then raise exception 'Receivers must be array'; end if;
 if p_patch ? 'isolation_items' and jsonb_typeof(p_patch->'isolation_items')<>'array' then raise exception 'Isolation items must be array'; end if;
 if jsonb_array_length(case when jsonb_typeof(p_patch->'receivers')='array' then p_patch->'receivers' else '[]'::jsonb end)>99 then raise exception 'Too many receivers'; end if;
 if jsonb_array_length(case when jsonb_typeof(p_patch->'isolation_items')='array' then p_patch->'isolation_items' else '[]'::jsonb end)>999 then raise exception 'Too many isolation items'; end if;
 update public.ptw_permits set
  area=case when p_patch?'area' then nullif(btrim(p_patch->>'area'),'') else area end,
  equipment_id=case when p_patch?'equipment_id' then nullif(p_patch->>'equipment_id','')::uuid else equipment_id end,
  equipment_name=case when p_patch?'equipment_name' then nullif(btrim(p_patch->>'equipment_name'),'') else equipment_name end,
  component_no=case when p_patch?'component_no' then nullif(btrim(p_patch->>'component_no'),'') else component_no end,
  wr_no=case when p_patch?'wr_no' then nullif(btrim(p_patch->>'wr_no'),'') else wr_no end,
  work_order=case when p_patch?'work_order' then nullif(btrim(p_patch->>'work_order'),'') else work_order end,
  lob_no=case when p_patch?'lob_no' then nullif(btrim(p_patch->>'lob_no'),'') else lob_no end,
  requesting_department=case when p_patch?'requesting_department' then nullif(btrim(p_patch->>'requesting_department'),'') else requesting_department end,
  description=case when p_patch?'description' then nullif(btrim(p_patch->>'description'),'') else description end,
  work_condition=case when p_patch?'work_condition' then p_patch->>'work_condition' else work_condition end,
  activities=case when p_patch?'activities' then array(select jsonb_array_elements_text(p_patch->'activities')) else activities end,
  risk_flags=case when p_patch?'risk_flags' then array(select jsonb_array_elements_text(p_patch->'risk_flags')) else risk_flags end,
  planned_start=case when p_patch?'planned_start' then nullif(p_patch->>'planned_start','')::timestamptz else planned_start end,
  planned_end=case when p_patch?'planned_end' then nullif(p_patch->>'planned_end','')::timestamptz else planned_end end,
 sap_account_user_id=case when p_patch?'sap_account_user_id' then nullif(p_patch->>'sap_account_user_id','')::uuid else sap_account_user_id end,
 form_fields=case when p_patch?'form_fields' then p_patch->'form_fields' else form_fields end,
  updated_at=now(),updated_by=auth.uid(),version=version+1
 where id=p_id returning * into v_updated;
 if p_patch?'receivers' then
  delete from public.ptw_receivers where permit_id=p_id;
  v_i:=0;
  for v_row in select value from jsonb_array_elements(p_patch->'receivers') loop
   v_i:=v_i+1;
   if nullif(v_row->>'ap_account_user_id','') is null then
    raise exception 'Select AP from a maintenance login account' using errcode='42501';
   end if;
   if coalesce(v_row->>'department','') not in ('','OPNS','MMD','EMD','IMD','CMD','OTHERS','MAINTENANCE') then raise exception 'Invalid AP department'; end if;
   if length(coalesce(v_row->>'paper_name',''))>120 or length(coalesce(v_row->>'employee_id',''))>40
   then raise exception 'AP identity field too long'; end if;
   insert into public.ptw_receivers(permit_id,line_no,ap_account_user_id,department,full_name,employee_id,paper_name,paper_date,paper_time)
   select p_id,v_i,mu.user_id,nullif(v_row->>'department',''),mu.username,
     nullif(btrim(v_row->>'employee_id'),''),
     nullif(btrim(v_row->>'paper_name'),''),
     nullif(v_row->>'paper_date','')::date,nullif(v_row->>'paper_time','')::time
   from public.maintenance_users mu
   where mu.station_id=v_old.station_id and mu.user_id=(v_row->>'ap_account_user_id')::uuid;
   if not found then raise exception 'AP account must belong to maintenance team for this station' using errcode='42501'; end if;
  end loop;
 end if;
 if p_patch?'isolation_items' then
  delete from public.ptw_isolation_items where permit_id=p_id;
  v_i:=0;
  for v_row in select value from jsonb_array_elements(p_patch->'isolation_items') loop
   v_i:=v_i+1;
   if coalesce(v_row->>'normal_position','') not in ('','C','O','RI','RO') then raise exception 'Invalid normal position'; end if;
   if coalesce(v_row->>'tag_position','')<>'' and
    (v_row->>'tag_position') !~ '^(C|O|RI|RO)( L)?( T)?$' then raise exception 'Invalid tag position'; end if;
   insert into public.ptw_isolation_items(permit_id,line_no,tag_no,component_no,normal_position,tag_position,component_description,location_description)
   values(p_id,v_i,nullif(btrim(v_row->>'tag_no'),''),coalesce(v_row->>'component_no',''),nullif(v_row->>'normal_position',''),nullif(v_row->>'tag_position',''),nullif(v_row->>'component_description',''),nullif(v_row->>'location_description',''));
  end loop;
 end if;
 insert into public.ptw_events(permit_id,event_type,actor_id,old_version,new_version,detail)
 values(p_id,'DRAFT_SAVED',auth.uid(),v_old.version,v_updated.version,
  jsonb_build_object('changed_fields',(select coalesce(jsonb_agg(k),'[]'::jsonb) from jsonb_object_keys(p_patch) k)));
 return v_updated;
end $function$
;
commit;