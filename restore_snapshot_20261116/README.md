# Water Solutions site — recovery snapshot (16 November 2026)

## Exact website source before refactor
The branch `restore-before-ux-maintenance-refactor-2026-11-16` starts from commit
`8b9d7b71170c6034bd0c1204e74b9dbd5276d300` (last verified live version before this round of changes).

It contains the static website, `index.html`, all assets at that commit, and the historical recovery snapshot.

## Deployed Supabase Edge Function source
The folder `restore_snapshot_20261116/edge_functions/` archives the source of all eight functions
read from the connected Supabase project before the refactor.

## Database row snapshot
The connected Supabase project `vksbjasfoysuwxdyeaed` contains a private,
restricted schema `backup_ux_20261116` holding point-in-time copies of twelve application tables:

- stations
- reports
- station_monthly_reports
- chemical_inventory
- maintenance_assets
- maintenance_records
- maintenance_definitions
- maintenance_imports
- maintenance_historical_imports
- station_users
- admin_users
- audit_logs

At creation: 826 daily reports, 5,020 maintenance records, 3,996 maintenance definitions, 945 audit rows.
These are snapshot copies of rows, not complete table DDL or constraint/policy definitions.

## Recovery limitations
This is **not a full disaster-recovery backup**.
Supabase Auth user credentials, database roles, managed secrets, service settings, RLS policies,
and a separate off-platform PostgreSQL physical or logical dump are not included.
The table snapshot resides in the same Supabase project and would not survive project loss.
Restore requires careful schema/foreign-key planning and must be verified in a separate environment.
Do not overwrite live tables directly.

For full disaster recovery, additionally enable/export official Supabase database backups and
store a secure, encrypted copy outside this project, with Auth and extension configuration.
Do not store credentials or database dumps in this public GitHub repository.

## Deployment and rollback
Re-deploy the snapshot branch as a static website if a **code-only** rollback is required.
Do not roll back the website while leaving an incompatible database schema without reviewing
database changes. Function source is in the folder above; restore only through a controlled deployment.
