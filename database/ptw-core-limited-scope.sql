-- Limited PTW pilot: ST7-1 and ST7-11 only. Other work categories stay blocked until their supplements are implemented.
begin;
CREATE OR REPLACE FUNCTION public.ptw_record_paper_issue(p_id uuid, p_expected_version integer, p_paper_signatures_confirmed boolean)
 RETURNS ptw_permits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'ptw_private'
AS $function$
declare v public.ptw_permits; v_out public.ptw_permits;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into v from public.ptw_permits where id=p_id for update;
 if not found then raise exception 'Permit not found'; end if;
 if v.status<>'draft' then raise exception 'Only draft can be registered as paper issued'; end if;
 if v.version<>p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
 if v.sap_account_user_id is distinct from auth.uid()
  or not exists(select 1 from public.station_users su where su.user_id=auth.uid() and su.station_id=v.station_id)
 then raise exception 'Only the assigned station SAP login can register paper issuance' using errcode='42501'; end if;
 if p_paper_signatures_confirmed is distinct from true then raise exception 'Confirm manually signed SAP and AP sections on paper'; end if;
 if nullif(btrim(v.area),'') is null or (v.equipment_id is null and nullif(btrim(v.component_no),'') is null)
   or nullif(btrim(v.description),'') is null or v.work_condition is null then
  raise exception 'Complete core permit fields before paper issuance'; end if;
 if coalesce(cardinality(v.activities),0)=0 then
  raise exception 'Specify at least one work activity before recording paper issuance'; end if;
 if exists(select 1 from unnest(v.activities) x
    where x not in ('mechanical','electrical','instrumentation')) then
  raise exception 'Supplementary ST-07 work categories remain outside this pilot; do not register paper issuance here'; end if;
 if v.work_condition='undetermined' then
  raise exception 'Determine LIVE/DEAD work condition before paper issuance'; end if;
 if not exists(select 1 from public.ptw_receivers r where r.permit_id=p_id and r.ap_account_user_id is not null)
 then raise exception 'AP account is required'; end if;
 if exists(select 1 from public.ptw_isolation_items i where i.permit_id=p_id and
  (nullif(btrim(i.component_no),'') is null or nullif(btrim(i.tag_position),'') is null))
 then raise exception 'Incomplete ST7-11 isolation point'; end if;
 update public.ptw_permits set status='issued',paper_issued_recorded_at=now(),
 paper_issued_recorded_by=auth.uid(),updated_by=auth.uid(),updated_at=now(),version=version+1
 where id=p_id returning * into v_out;
 insert into public.ptw_events(permit_id,event_type,actor_id,old_version,new_version,detail)
 values(p_id,'PAPER_ISSUANCE_RECORDED',auth.uid(),v.version,v_out.version,
 jsonb_build_object('paper_sections','6 and 7','manual_signatures_confirmed',true,
 'caution','Not an electronic signature or software verification of isolation'));
 return v_out;
end $function$
;
commit;
