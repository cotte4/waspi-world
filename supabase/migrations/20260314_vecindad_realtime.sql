-- Enable Realtime for vecindad_parcels so all connected clients receive
-- INSERT/UPDATE/DELETE events when any player buys or upgrades their parcel.

alter publication supabase_realtime add table public.vecindad_parcels;

-- Allow any authenticated or anonymous user to read parcel state.
-- Writes are only done server-side via the service role (existing API routes).
create policy if not exists "vecindad_parcels_select_all"
  on public.vecindad_parcels
  for select
  using (true);

alter table public.vecindad_parcels enable row level security;
