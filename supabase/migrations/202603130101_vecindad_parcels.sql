create table if not exists public.vecindad_parcels (
  parcel_id text primary key,
  owner_id uuid not null unique references public.players(id) on delete cascade,
  owner_username text not null,
  build_stage integer not null default 1 check (build_stage between 1 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vecindad_parcels_owner_id on public.vecindad_parcels(owner_id);

drop trigger if exists trg_vecindad_parcels_updated_at on public.vecindad_parcels;
create trigger trg_vecindad_parcels_updated_at
before update on public.vecindad_parcels
for each row
execute function public.set_updated_at();
