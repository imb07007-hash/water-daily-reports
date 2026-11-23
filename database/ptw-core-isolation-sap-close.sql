-- WS-PTW Core + Isolation: PAPER SIGNATURE workflow; no electronic signing.
-- SAP = selected station operations login for this initial pilot; technical authorization is still verified on paper.
-- Existing reports, maintenance tables and application logins are not modified.
begin;
alter table public.ptw_permits add column if not exists paper_issued_recorded_at timestamptz;
alter table public.ptw_permits add column if not exists paper_issued_recorded_by uuid references auth.users(id);
alter table public.ptw_permits add column if not exists cancelled_at timestamptz;
alter table public.ptw_permits add column if not exists cancelled_by uuid references auth.users(id);
alter table public.ptw_permits add column if not exists normalized_at timestamptz;
alter table public.ptw_permits add column if not exists normalized_by uuid references auth.users(id);

create index if not exists ptw_permits_asset_history_idx
on public.ptw_permits(station_id,equipment_id,created_at desc);

-- All lookup results are restricted to the station the requesting account may view.
create or replace function public.ptw_equipment_history(p_permit_id uuid)
returns table(permit_id uuid,permit_no text,permit_status text,created_at timestamptz,is_unresolved boolean)
language plpgsql security definer set search_path=pg_catalog,public,ptw_private
as $$
declare v public.ptw_permits; begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into v from public.ptw_permits where id=p_permit_id;
 if not found then raise exception 'Permit not found'; end if;
 if not ptw_private.can_read(v.station_id) then raise exception 'PTW history access denied' using errcode='42501'; end if;
 if v.equipment_id is null and nullif(btrim(v.equipment_name),'') is null and nullif(btrim(v.component_no),'') is null then return; end if;
 return query
 select q.id,q.permit_no,q.status,q.created_at,
 (q.status not in ('normalized','archived','cancelled')
   or (q.status='cancelled' and exists(select 1 from public.ptw_isolation_items i where i.permit_id=q.id))) as is_unresolved
 from public.ptw_permits q
 where q.station_id=v.station_id and q.id<>v.id
   and (
    (v.equipment_id is not null and q.equipment_id=v.equipment_id)
    or (
      (v.equipment_id is null or q.equipment_id is null)
      and (
        (nullif(btrim(v.equipment_name),'') is not null and
         lower(regexp_replace(btrim(q.equipment_name),'\\s+',' ','g'))=
         lower(regexp_replace(btrim(v.equipment_name),'\\s+',' ','g')))
        or (nullif(btrim(v.component_no),'') is not null and
            lower(btrim(q.component_no))=lower(btrim(v.component_no)) and
            coalesce(lower(btrim(q.area)),'')=coalesce(lower(btrim(v.area)),''))
      )
    )
   )
 order by is_unresolved desc,q.created_at desc limit 20;
end $$;

-- Registration reflects that the signed ORIGINAL PAPER exists; this RPC does NOT sign the permit or verify isolation.
create or replace function public.ptw_record_paper_issue(p_id uuid,p_expected_version integer,p_paper_signatures_confirmed boolean)
returns public.ptw_permits
language plpgsql security definer set search_path=pg_catalog,public,ptw_private
as $$
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
end $$;

-- In ST7-1 section 9 AP clears the signed original; SAP cancels/CL0SES in section 11.
-- Both paper steps must be confirmed. An electronic signature is never produced.
create or replace function public.ptw_cancel_by_sap(p_id uuid,p_expected_version integer,
 p_ap_paper_clearance_confirmed boolean,p_sap_paper_cancellation_confirmed boolean)
returns public.ptw_permits
language plpgsql security definer set search_path=pg_catalog,public,ptw_private
as $$
declare v public.ptw_permits; v_out public.ptw_permits;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into v from public.ptw_permits where id=p_id for update;
 if not found then raise exception 'Permit not found'; end if;
 if v.status<>'issued' then raise exception 'Only paper issued permit can be closed by SAP'; end if;
 if v.version<>p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
 if v.sap_account_user_id is distinct from auth.uid()
  or not exists(select 1 from public.station_users su where su.user_id=auth.uid() and su.station_id=v.station_id)
 then raise exception 'Only the assigned station SAP login can cancel PTW' using errcode='42501'; end if;
 if p_ap_paper_clearance_confirmed is distinct from true or p_sap_paper_cancellation_confirmed is distinct from true
 then raise exception 'AP section 9 and SAP section 11 must be completed on the signed paper'; end if;
 update public.ptw_permits set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
 updated_by=auth.uid(),updated_at=now(),version=version+1
 where id=p_id returning * into v_out;
 insert into public.ptw_events(permit_id,event_type,actor_id,old_version,new_version,detail)
 values(p_id,'SAP_CANCELLED_PAPER_PERMIT',auth.uid(),v.version,v_out.version,
 jsonb_build_object('ap_clearance_section_9_on_paper',true,'sap_cancellation_section_11_on_paper',true,
 'normalization_pending',true,'note','Confirmation records paper steps; no e-signature'));
 return v_out;
end $$;

-- ST7-1 section 12 is recorded separately AFTER SAP cancellation. No electronic physical verification is inferred.
create or replace function public.ptw_record_normalization(p_id uuid,p_expected_version integer,p_paper_normalization_confirmed boolean)
returns public.ptw_permits
language plpgsql security definer set search_path=pg_catalog,public,ptw_private
as $$
declare v public.ptw_permits; v_out public.ptw_permits;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into v from public.ptw_permits where id=p_id for update;
 if not found then raise exception 'Permit not found'; end if;
 if v.status<>'cancelled' then raise exception 'SAP cancellation must precede normalization'; end if;
 if v.version<>p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
 if v.sap_account_user_id is distinct from auth.uid()
  or not exists(select 1 from public.station_users su where su.user_id=auth.uid() and su.station_id=v.station_id)
 then raise exception 'Only the assigned station SAP login can record normalization' using errcode='42501'; end if;
 if p_paper_normalization_confirmed is distinct from true then raise exception 'Confirm section 12 is completed on paper'; end if;
 update public.ptw_permits set status='normalized',normalized_at=now(),normalized_by=auth.uid(),
 updated_by=auth.uid(),updated_at=now(),version=version+1 where id=p_id returning * into v_out;
 insert into public.ptw_events(permit_id,event_type,actor_id,old_version,new_version,detail)
 values(p_id,'SAP_NORMALIZATION_RECORDED',auth.uid(),v.version,v_out.version,
 jsonb_build_object('section_12_confirmed_on_paper',true,'note','No software physical verification or electronic signature'));
 return v_out;
end $$;

revoke all on function public.ptw_equipment_history(uuid) from public,anon;
revoke all on function public.ptw_record_paper_issue(uuid,integer,boolean) from public,anon;
revoke all on function public.ptw_cancel_by_sap(uuid,integer,boolean,boolean) from public,anon;
revoke all on function public.ptw_record_normalization(uuid,integer,boolean) from public,anon;
grant execute on function public.ptw_equipment_history(uuid) to authenticated;
grant execute on function public.ptw_record_paper_issue(uuid,integer,boolean) to authenticated;
grant execute on function public.ptw_cancel_by_sap(uuid,integer,boolean,boolean) to authenticated;
grant execute on function public.ptw_record_normalization(uuid,integer,boolean) to authenticated;
commit;
