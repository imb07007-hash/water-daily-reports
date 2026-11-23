-- Secure full-source workbook archive. Excel is captured independently of active stations.
-- Apply to Supabase SQL editor / migrations; the live schema was installed on 2026-11-22.
create table if not exists public.source_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  report_date date not null,
  captured_at timestamptz not null default now(),
  source_file_id text not null,
  file_sha256 text not null check(file_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique,
  source_sheet text not null,
  row_count integer not null default 0 check(row_count>=0),
  stale_revision boolean not null default false,
  trigger_kind text not null check(trigger_kind in ('manual','scheduled')),
  captured_by uuid null,
  unique(snapshot_date,file_sha256)
);
create table if not exists public.source_daily_rows (
  snapshot_id uuid not null references public.source_daily_snapshots(id) on delete cascade,
  source_row integer not null check(source_row between 1 and 5000),
  report_date date not null,
  source_name text not null,
  source_key text not null,
  plant_code text not null default '',
  source_values jsonb not null default '{}'::jsonb,
  primary key(snapshot_id,source_row)
);
create index if not exists source_daily_rows_match_idx on public.source_daily_rows(source_key,report_date);
create index if not exists source_daily_snapshots_date_idx on public.source_daily_snapshots(snapshot_date desc,captured_at desc);
create table if not exists public.source_station_links (
  station_id text primary key references public.stations(id) on delete cascade,
  source_key text not null unique,
  linked_at timestamptz not null default now(),
  linked_by uuid null
);
alter table public.source_daily_snapshots enable row level security;
alter table public.source_daily_rows enable row level security;
alter table public.source_station_links enable row level security;
-- Only service-role Edge functions access source files, metadata and matching rows.
revoke all on public.source_daily_snapshots,public.source_daily_rows,public.source_station_links from anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('plant-source-excel','plant-source-excel',false,10000000,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do nothing;
