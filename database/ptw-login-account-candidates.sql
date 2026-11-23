-- WS-PTW: login-linked DRAFT CANDIDATES only; no issuing or signatures.
-- SAP candidate: station operator account. AP candidate: maintenance engineer account.
begin;
alter table public.ptw_permits add column if not exists sap_account_user_id uuid references auth.users(id);
alter table public.ptw_receivers add column if not exists ap_account_user_id uuid references auth.users(id);
create unique index if not exists ptw_receiver_unique_login on public.ptw_receivers(permit_id,ap_account_user_id) where ap_account_user_id is not null;
create or replace function ptw_private.can_read(p_station text) returns boolean
language sql stable security definer set search_path=pg_catalog,public
as $$ select (select auth.uid()) is not null and (
 exists(select 1 from public.admin_users where user_id=(select auth.uid()) and role in ('admin','superadmin'))
 or exists(select 1 from public.ptw_role_assignments where user_id=(select auth.uid()) and station_id=p_station and active)
 or exists(select 1 from public.station_users where user_id=(select auth.uid()) and station_id=p_station)
 or exists(select 1 from public.maintenance_users where user_id=(select auth.uid()) and station_id=p_station)
); $$;
create or replace function ptw_private.can_prepare(p_station text) returns boolean
language sql stable security definer set search_path=pg_catalog,public
as $$ select (select auth.uid()) is not null and (
 exists(select 1 from public.admin_users where user_id=(select auth.uid()) and role in ('admin','superadmin'))
 or exists(select 1 from public.ptw_role_assignments where user_id=(select auth.uid()) and station_id=p_station and role in ('preparer','ptw_admin') and active)
 or exists(select 1 from public.station_users where user_id=(select auth.uid()) and station_id=p_station)
 or exists(select 1 from public.maintenance_users where user_id=(select auth.uid()) and station_id=p_station)
); $$;
create or replace function public.ptw_account_candidates(p_station_id text)
returns table(account_user_id uuid,ptw_candidate_role text,display_name text,department text)
language plpgsql security definer set search_path=pg_catalog,public,ptw_private
as $$
begin
 if auth.uid() is null or not ptw_private.can_read(p_station_id) then
  raise exception 'PTW account access denied' using errcode='42501';
 end if;
 return query
 select s.user_id,'SAP'::text,s.username::text,'OPERATIONS'::text from public.station_users s where s.station_id=p_station_id
 union all
 select m.user_id,'AP'::text,m.username::text,'MAINTENANCE'::text from public.maintenance_users m where m.station_id=p_station_id;
end $$;
revoke all on function public.ptw_account_candidates(text) from public,anon;
grant execute on function public.ptw_account_candidates(text) to authenticated;
CREATE OR REPLACE FUNCTION public.ptw_create_draft(p_station_id text)
 RETURNS ptw_permits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'ptw_private'
AS $function$
declare v_permit public.ptw_permits; v_number bigint;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not ptw_private.can_prepare(p_station_id) then raise exception 'PTW prepare access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.stations where id=p_station_id and active=true) then raise exception 'Unknown/inactive station'; end if;
 v_number:=nextval('ptw_private.permit_number_seq'::regclass);
 insert into public.ptw_permits(permit_no,station_id,created_by,updated_by,sap_account_user_id)
 values(lpad(v_number::text,4,'0'),p_station_id,auth.uid(),auth.uid(),
  (select su.user_id from public.station_users su where su.station_id=p_station_id and (select count(*) from public.station_users where station_id=p_station_id)=1)) returning * into v_permit;
 insert into public.ptw_receivers(permit_id,line_no,ap_account_user_id,department,full_name,employee_id)
 select v_permit.id,1,mu.user_id,'MAINTENANCE',mu.username,null
 from public.maintenance_users mu where mu.station_id=p_station_id
 and (select count(*) from public.maintenance_users where station_id=p_station_id)=1;
 insert into public.ptw_events(permit_id,event_type,actor_id,new_version)
 values(v_permit.id,'DRAFT_CREATED',auth.uid(),v_permit.version);
 return v_permit;
end $function$

CREATE OR REPLACE FUNCTION public.ptw_save_draft(p_id uuid, p_expected_version integer, p_patch jsonb)
 RETURNS ptw_permits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'ptw_private'
AS $function$
declare v_old public.ptw_permits; v_updated public.ptw_permits; v_row jsonb; v_i integer;
 v_allowed text[]:=array['area','equipment_id','equipment_name','component_no','wr_no','work_order','lob_no','requesting_department','description','work_condition','activities','risk_flags','planned_start','planned_end','sap_account_user_id','receivers','isolation_items'];
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
   insert into public.ptw_receivers(permit_id,line_no,ap_account_user_id,department,full_name,employee_id)
   select p_id,v_i,mu.user_id,'MAINTENANCE',mu.username,null
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

commit;
