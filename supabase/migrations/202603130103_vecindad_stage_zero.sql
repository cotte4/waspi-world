alter table public.vecindad_parcels
  alter column build_stage set default 0;

alter table public.vecindad_parcels
  drop constraint if exists vecindad_parcels_build_stage_check;

alter table public.vecindad_parcels
  add constraint vecindad_parcels_build_stage_check
  check (build_stage between 0 and 4);
